import { supabaseAdmin } from '@/lib/supabase/admin';
import { GeoLocation, UserIP } from './types';
import { UAParser } from 'ua-parser-js';

const GEO_API_URL = 'http://ip-api.com/json/';

// Helper: Haversine distance in km
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export class IPService {
  /**
   * Get geolocation for an IP address
   */
  async getGeoLocation(ip: string): Promise<GeoLocation | null> {
    if (!ip || ip === '::1' || ip === '127.0.0.1') return null;

    try {
      const res = await fetch(`${GEO_API_URL}${ip}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.status !== 'success') return null;

      return {
        ip,
        country: data.country,
        city: data.city,
        region: data.regionName,
        lat: data.lat,
        lon: data.lon,
        isp: data.isp
      };
    } catch (error) {
      console.error('Error fetching geolocation:', error);
      return null;
    }
  }

  /**
   * Record a user's IP address and check for anomalies
   */
  async recordUserIP(userId: string, ip: string, userAgent?: string): Promise<void> {
    const admin = supabaseAdmin();

    // 1. Check if this specific IP was already recorded recently (last 5 minutes)
    // This maintains a "heartbeat" of active users without flooding the DB
    const { data: recent } = await admin
      .from('user_ips')
      .select('id, detected_at')
      .eq('user_id', userId)
      .eq('ip_address', ip)
      .gt('detected_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .limit(1);

    if (recent && recent.length > 0) {
      // Update the existing record's detected_at to keep it fresh (optional, but good for "last seen")
      // actually, let's just skip to avoid DB writes every request if we want to keep history segments
      // Or we could update the 'detected_at' if we want exact real-time precision.
      // For now, inserting every 5 mins is a good balance between history and activity tracking.
      return;
    }

    // 2. Fetch Geolocation
    const geo = await this.getGeoLocation(ip);

    // 3. IMPOSSIBLE TRAVEL CHECK
    // Get the *latest* recorded IP for this user (different from current if possible)
    const { data: lastIpEntry } = await admin
      .from('user_ips')
      .select('*')
      .eq('user_id', userId)
      .neq('ip_address', ip) // Compare with a different IP
      .order('detected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastIpEntry && geo && lastIpEntry.latitude && lastIpEntry.longitude) {
      const distKm = getDistanceFromLatLonInKm(
        lastIpEntry.latitude,
        lastIpEntry.longitude,
        geo.lat,
        geo.lon
      );

      const timeDiffHours = (Date.now() - new Date(lastIpEntry.detected_at).getTime()) / (1000 * 60 * 60);
      
      // If timeDiff is very small, use a minimum to avoid division by zero or extreme speeds
      const effectiveTime = Math.max(timeDiffHours, 0.1); 
      const speed = distKm / effectiveTime;

      // Threshold: > 800 km/h (typical commercial flight speed)
      // Also ensure distance is significant (> 100km) to avoid GPS jitter noise
      if (speed > 800 && distKm > 100) {
        await admin.from('security_alerts').insert({
          type: 'IMPOSSIBLE_TRAVEL',
          user_id: userId,
          ip_address: ip,
          severity: 'high',
          status: 'new',
          details: {
            prev_ip: lastIpEntry.ip_address,
            prev_loc: `${lastIpEntry.city}, ${lastIpEntry.country}`,
            curr_loc: `${geo.city}, ${geo.country}`,
            distance_km: Math.round(distKm),
            time_diff_hours: timeDiffHours.toFixed(2),
            speed_kmh: Math.round(speed)
          }
        });
      }
    }

    // 4. Parse User Agent
    let deviceMetadata = {};
    if (userAgent) {
      try {
        const parser = new UAParser(userAgent);
        deviceMetadata = parser.getResult();
      } catch (e) {
        console.error('Error parsing User Agent:', e);
      }
    }

    // 5. Insert new IP record
    await admin.from('user_ips').insert({
      user_id: userId,
      ip_address: ip,
      country: geo?.country,
      city: geo?.city,
      region: geo?.region,
      isp: geo?.isp,
      latitude: geo?.lat,
      longitude: geo?.lon,
      user_agent: userAgent,
      metadata: { 
        ...(geo ? { raw: geo } : {}),
        ...deviceMetadata
      }
    });
  }

  /**
   * Get User's recent IPs
   */
  async getUserIPs(userId: string, limit = 5): Promise<UserIP[]> {
    const admin = supabaseAdmin();
    const { data } = await admin
      .from('user_ips')
      .select('*')
      .eq('user_id', userId)
      .order('detected_at', { ascending: false })
      .limit(limit);
    return (data as UserIP[]) || [];
  }
}

export const ipService = new IPService();
