import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const listingId = params.id;
    if (!listingId) return NextResponse.json({ error: 'Listing ID required' }, { status: 400 });

    const cookieStore = cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            cookie: (await cookieStore).getAll().map(c => `${c.name}=${c.value}`).join('; ')
          }
        }
      }
    );

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    const sort = searchParams.get('sort') || 'recent'; // recent, helpful, highest, lowest
    const offset = (page - 1) * limit;

    // 1. Fetch reviews with user data
    let query = supabase
      .from('product_reviews')
      .select(`
        *,
        user:profiles(id, full_name, avatar_url, city, state)
      `, { count: 'exact' })
      .eq('listing_id', listingId)
      .eq('status', 'active');

    // Sorting
    switch (sort) {
      case 'helpful':
        query = query.order('helpful_count', { ascending: false });
        break;
      case 'highest':
        query = query.order('rating', { ascending: false });
        break;
      case 'lowest':
        query = query.order('rating', { ascending: true });
        break;
      case 'recent':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    const { data: reviews, count, error } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    // 2. Calculate aggregates (cached or live)
    // For now, live calculation for simplicity. For high traffic, use a materialized view.
    const { data: allReviews, error: statsError } = await supabase
      .from('product_reviews')
      .select('rating, feature_ratings')
      .eq('listing_id', listingId)
      .eq('status', 'active');

    if (statsError) throw statsError;

    const totalReviews = allReviews.length;
    const avgRating = totalReviews > 0
      ? allReviews.reduce((sum, r) => sum + Number(r.rating), 0) / totalReviews
      : 0;

    // Rating breakdown (1-5 stars)
    const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    // Feature ratings breakdown
    const featureStats: Record<string, { sum: number; count: number }> = {};

    allReviews.forEach(r => {
      const rounded = Math.round(Number(r.rating));
      if (rounded >= 1 && rounded <= 5) {
        breakdown[rounded as keyof typeof breakdown]++;
      }

      if (r.feature_ratings) {
        Object.entries(r.feature_ratings as Record<string, number>).forEach(([key, val]) => {
          if (!featureStats[key]) featureStats[key] = { sum: 0, count: 0 };
          featureStats[key].sum += Number(val);
          featureStats[key].count++;
        });
      }
    });

    const features = Object.entries(featureStats).map(([key, data]) => ({
      name: key,
      rating: data.count > 0 ? data.sum / data.count : 0
    }));

    // Check if current user has voted on these reviews (if logged in)
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;
    let userVotes: Record<string, number> = {};

    if (userId && reviews.length > 0) {
      const { data: votes } = await supabase
        .from('product_review_votes')
        .select('review_id, vote_type')
        .eq('user_id', userId)
        .in('review_id', reviews.map(r => r.id));
      
      if (votes) {
        votes.forEach(v => {
          userVotes[v.review_id] = v.vote_type;
        });
      }
    }

    return NextResponse.json({
      reviews: reviews.map(r => ({
        ...r,
        user_vote: userVotes[r.id] || 0
      })),
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit)
      },
      stats: {
        average: avgRating,
        total: totalReviews,
        breakdown,
        features
      }
    });

  } catch (error: any) {
    console.error('Error fetching reviews:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const listingId = params.id;
    if (!listingId) return NextResponse.json({ error: 'Listing ID required' }, { status: 400 });

    const cookieStore = cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            cookie: (await cookieStore).getAll().map(c => `${c.name}=${c.value}`).join('; ')
          }
        }
      }
    );

    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { rating, title, content, images, feature_ratings } = body;

    // Validation
    if (!rating || rating < 0.5 || rating > 5) {
      return NextResponse.json({ error: 'Invalid rating' }, { status: 400 });
    }

    // Check Verified Purchase
    // Find delivered orders for this user containing this listing
    // We assume 'order_items' links to 'orders' and has 'listing_id'
    // And 'orders' has 'buyer_id' and 'status'
    
    // First find orders by this buyer
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, status')
      .eq('buyer_id', userId)
      .in('status', ['delivered', 'completed', 'rated']); // Adjust statuses as needed

    let isVerified = false;

    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: items } = await supabase
        .from('order_items')
        .select('id')
        .eq('listing_id', listingId)
        .in('order_id', orderIds)
        .limit(1);
      
      if (items && items.length > 0) {
        isVerified = true;
      }
    }

    // Insert Review
    const { data: review, error: insertError } = await supabase
      .from('product_reviews')
      .insert({
        listing_id: listingId,
        user_id: userId,
        rating,
        title,
        content,
        images: images || [],
        feature_ratings: feature_ratings || {},
        is_verified_purchase: isVerified,
        status: 'active' // Auto-approve for now, or use 'pending' if moderation needed
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({ success: true, review });

  } catch (error: any) {
    console.error('Error creating review:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
