import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase/admin';

function getBearerToken(req: NextRequest): string | null {
  const auth = req.headers.get('authorization') || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

    if (!supabaseUrl || !supabaseAnon) {
      return NextResponse.json({ error: 'Supabase env vars missing on server' }, { status: 500 });
    }

    // Validate token -> user
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    
    if (userErr || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { plan } = body;

    if (!plan || !['basic', 'pro'].includes(plan)) {
      return NextResponse.json({ error: 'Invalid plan type' }, { status: 400 });
    }

    // Use admin client to bypass RLS
    const admin = supabaseAdmin();
    
    // First check if profile exists
    const { data: profile, error: fetchError } = await admin
      .from('profiles')
      .select('id, plan_type')
      .eq('id', userData.user.id)
      .single();

    if (fetchError) {
      console.error('Error fetching profile:', fetchError);
      // If profile doesn't exist or other error
      if (fetchError.code === 'PGRST116') { // JSON object requested, multiple (or no) rows returned
         // Profile missing, try to create it
         const { error: insertError } = await admin
           .from('profiles')
           .insert({
             id: userData.user.id,
             email: userData.user.email,
             plan_type: plan
           });
           
         if (insertError) {
            console.error('Error creating profile:', insertError);
            return NextResponse.json({ error: `Failed to create profile: ${insertError.message}` }, { status: 500 });
         }
         return NextResponse.json({ success: true, message: 'Profile created and plan updated' });
      }
      
      return NextResponse.json({ error: `Failed to fetch profile: ${fetchError.message}` }, { status: 500 });
    }

    // Profile exists, update it
    const { error: updateError } = await admin
      .from('profiles')
      .update({ plan_type: plan })
      .eq('id', userData.user.id);

    if (updateError) {
      console.error('Error updating plan:', updateError);
      return NextResponse.json({ error: `Failed to update plan: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Plan update error:', error);
    return NextResponse.json({ error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
}
