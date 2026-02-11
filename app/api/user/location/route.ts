import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { latitude, longitude } = await req.json();

    if (!latitude || !longitude) {
      return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
    }

    // 1. Get IP from request
    let ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '127.0.0.1';
    if (ip.includes(',')) ip = ip.split(',')[0].trim();

    // 2. Find the latest IP record for this user
    const { data: latestIp } = await supabase
      .from('user_ips')
      .select('id, ip_address')
      .eq('user_id', user.id)
      .order('detected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Update or Insert
    if (latestIp && latestIp.ip_address === ip) {
      // Update existing record if it matches current IP (session continuity)
      const { error } = await supabase
        .from('user_ips')
        .update({ 
          latitude, 
          longitude, 
          is_approximate: false,
          detected_at: new Date().toISOString(), // CRITICAL: Update timestamp so it shows in "Last 15 mins" view
          metadata: { 
            source: 'browser_geolocation', 
            updated_at: new Date().toISOString() 
          }
        })
        .eq('id', latestIp.id);
        
      if (error) throw error;
    } else {
      // Create new record if IP changed or no record exists
      // We'll let the background IP service fill in the city/country details later if needed,
      // or we can try to fetch them now if we want perfection. 
      // For now, just saving the GPS is the priority.
      const { error } = await supabase
        .from('user_ips')
        .insert({
          user_id: user.id,
          ip_address: ip,
          latitude,
          longitude,
          is_approximate: false, // Flag as precise
          detected_at: new Date().toISOString(),
          metadata: { 
            source: 'browser_geolocation_new', 
            created_at: new Date().toISOString() 
          }
        });

      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Location API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
