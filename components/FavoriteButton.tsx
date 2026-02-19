'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { redirectToLogin } from '@/lib/auth/redirect';

type Props = {
  listingId: string;
  onLoginRequired?: () => void;
  className?: string;
};

export function FavoriteButton({ listingId, onLoginRequired, className = '' }: Props) {
  const [isFav, setIsFav] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const user = data.user;
        if (!user) {
          if (!cancelled) setIsFav(false);
          return;
        }
        const { data: row } = await supabase
          .from('favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('listing_id', listingId)
          .maybeSingle();
        if (!cancelled) setIsFav(Boolean(row));
      } catch {
        if (!cancelled) setIsFav(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [listingId]);

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsLoading(true);
    try {
      const { data, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = data.user;
      if (!user) {
        if (onLoginRequired) onLoginRequired();
        else redirectToLogin();
        return;
      }
      if (isFav) {
        const { error } = await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('listing_id', listingId);
        if (error) throw error;
        setIsFav(false);
      } else {
        const { error } = await supabase
          .from('favorites')
          .upsert(
            { user_id: user.id, listing_id: listingId },
            { onConflict: 'user_id,listing_id' }
          );
        if (error) throw error;
        setIsFav(true);
      }
    } catch {
      // silencioso; opcional: toast
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm ring-1 ring-black/10 hover:bg-white disabled:opacity-60 transition-colors ${className}`}
      aria-label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      title={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill={isFav ? '#E3127D' : 'none'}
        stroke={isFav ? '#E3127D' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="transition-all"
        aria-hidden
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  );
}
