import { NextRequest, NextResponse } from 'next/server';
import { FeaturedService } from '@/lib/services/featured/featured.service';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '12', 10);

    const listings = await FeaturedService.getRotatedListings(limit);

    return NextResponse.json({ data: listings });
  } catch (error: any) {
    console.error('Error fetching rotated listings:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
