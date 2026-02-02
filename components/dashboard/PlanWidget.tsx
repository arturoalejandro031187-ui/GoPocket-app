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
          const p = data.plan_type;
          setPlan(p === 'pro' ? 'pro' : 'basic');
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

  let planName = 'Básico (Gratis)';
  let planColorClass = 'text-gray-700';
  let containerClass = 'border-gray-200 bg-white';
  let description = 'Estás en el plan gratuito. Actualiza a PRO para vender sin límites y acceder a beneficios exclusivos.';
  let buttonText = 'Cámbiate a PRO';
  let buttonClass = 'bg-gray-900 text-white hover:bg-black';
  let badgeColor = 'bg-gray-500';

  if (isPro) {
    planName = 'PRO';
    planColorClass = 'text-brand-pink';
    containerClass = 'border-brand-pink/20 bg-gradient-to-r from-pink-50 to-white';
    description = 'Disfrutas de beneficios PRO: comisiones reducidas (15%) y publicaciones ilimitadas.';
    buttonText = 'Gestionar Plan';
    buttonClass = 'bg-white text-brand-pink ring-1 ring-brand-pink/20 hover:bg-pink-50';
    badgeColor = 'bg-brand-pink';
  }

  return (
    <div className={`mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-6 py-5 shadow-sm ${containerClass}`}>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-gray-900">
            Tu Plan: <span className={planColorClass}>{planName}</span>
          </h3>
          {isPro && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white shadow-sm ${badgeColor}`}>
              Activo
            </span>
          )}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-gray-600">
          {description}
        </p>
      </div>
      <Link
        href="/dashboard/pro"
        className={`shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm transition ${buttonClass}`}
      >
        {buttonText}
      </Link>
    </div>
  );
}
