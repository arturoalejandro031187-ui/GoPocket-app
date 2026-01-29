'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type PlanType = 'basic' | 'pro';

export function PlanWidget({ userId }: { userId: string }) {
  const [plan, setPlan] = useState<PlanType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { data } = await supabase.from('profiles').select('plan_type').eq('id', userId).single();
        if (!cancelled && data) {
          setPlan(data.plan_type === 'pro' ? 'pro' : 'basic');
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId]);

  if (loading) return null;

  const isPro = plan === 'pro';

  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-6 py-5 shadow-sm ${
      isPro 
        ? 'border-brand-pink/20 bg-gradient-to-r from-pink-50 to-white' 
        : 'border-gray-200 bg-white'
    }`}>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900">
            Tu Plan: <span className={isPro ? 'text-brand-pink' : 'text-gray-700'}>{isPro ? 'PRO' : 'Básico (Gratis)'}</span>
          </h3>
          {isPro && (
            <span className="inline-flex items-center rounded-full bg-brand-pink px-2.5 py-0.5 text-xs font-medium text-white shadow-sm">
              Activo
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          {isPro 
            ? 'Disfrutas de publicaciones ilimitadas, comisiones reducidas (15%) y retiros express (48h).' 
            : 'Estás en el plan gratuito. Actualiza a PRO para vender sin límites y acceder a beneficios exclusivos.'}
        </p>
      </div>
      <Link
        href="/dashboard/pro"
        className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm transition ${
          isPro
            ? 'bg-white text-brand-pink ring-1 ring-brand-pink/20 hover:bg-gray-50'
            : 'bg-gray-900 text-white hover:bg-black'
        }`}
      >
        {isPro ? 'Gestionar Plan' : 'Cámbiate a PRO'}
      </Link>
    </div>
  );
}
