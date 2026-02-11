'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function LocationTracker() {
  useEffect(() => {
    // Function to handle location tracking
    const trackLocation = async (user: any) => {
      if (!user) return;

      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords;
            
            try {
              await fetch('/api/user/location', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ latitude, longitude })
              });
              // console.log('📍 Location tracked securely');
            } catch (err) {
              console.error('Failed to send location:', err);
            }
          },
          (error) => {
            console.warn('Location permission denied or error:', error.message);
          },
          { 
            enableHighAccuracy: true, 
            timeout: 15000, // Increased timeout
            maximumAge: 0 
          }
        );
      }
    };

    // 1. Initial check
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) trackLocation(user);
    });

    // 2. Listen for auth changes (login/restore)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        trackLocation(session.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
