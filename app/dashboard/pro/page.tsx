'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Check, X, Info } from 'lucide-react';
import { PLAN_LIMITS } from '@/lib/plans/limits';

export default function ProPage() {
  const [plan, setPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase.from('profiles').select('plan_type').eq('id', user.id).single();
      setPlan(data?.plan_type || 'basic');
      setLoading(false);
    };
    load();
  }, []);

  const handleSwitch = async (newPlan: string) => {
    if (newPlan === plan) return;
    if (!confirm(`¿Estás seguro que deseas cambiar al plan ${newPlan.toUpperCase()}?`)) return;

    setUpdating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/user/update-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: newPlan }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al actualizar el plan');
      }
      
      setPlan(newPlan);
      router.refresh();
      window.location.reload();
    } catch (err) {
      alert('Error al cambiar de plan: ' + (err instanceof Error ? err.message : 'Error desconocido'));
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando información de tu plan...</div>;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Planes y Suscripciones</h1>
        <p className="text-gray-600 text-lg">Elige el plan que mejor se adapte a tus necesidades de venta y desbloquea todo tu potencial.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        
        {/* Plan Básico */}
        <div className="rounded-3xl border border-gray-200 bg-white p-8 relative hover:shadow-lg transition-shadow">
          <h2 className="text-2xl font-bold text-gray-900">Plan Básico</h2>
          <div className="mt-4 flex items-baseline">
            <span className="text-5xl font-extrabold text-gray-900">$0.00</span>
            <span className="ml-1 text-xl font-medium text-gray-500">/ mes</span>
          </div>
          <p className="text-brand-pink font-bold mt-2 text-sm uppercase tracking-wide">GRATIS SIEMPRE</p>

          <ul className="mt-8 space-y-4 text-sm text-gray-600 mb-8">
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-gray-100 text-gray-600 font-bold text-xs">{PLAN_LIMITS.basic.auctions}</span>
              <span><strong>Subastas</strong> al mes</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-gray-100 text-gray-600 font-bold text-xs">{PLAN_LIMITS.basic.listings}</span>
              <span><strong>Publicaciones</strong> al mes</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-gray-100 text-gray-600 font-bold text-xs">{PLAN_LIMITS.basic.featured}</span>
              <span><strong>Artículos destacados</strong> al mes gratis</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-gray-100 text-gray-600 font-bold text-xs">{PLAN_LIMITS.basic.coupons}</span>
              <span><strong>Cupones</strong> al mes gratis</span>
            </li>
            
            <li className="flex items-center gap-3 text-green-600">
              <Check className="w-5 h-5 shrink-0" />
              <span>Envíos solo con nuestras guías</span>
            </li>
            <li className="flex items-center gap-3 text-gray-400">
              <X className="w-5 h-5 shrink-0" />
              <span>No incluye entregas personales</span>
            </li>
            <li className="flex items-center gap-3 text-gray-400">
              <X className="w-5 h-5 shrink-0" />
              <span>No incluye envíos por su propia cuenta</span>
            </li>
            <li className="flex items-center gap-3 text-green-600">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Retiros semanales (Sábados)</span>
            </li>
            <li className="flex items-center gap-3 text-green-600">
              <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Comisión por venta del <strong>{PLAN_LIMITS.basic.commission_percent}%</strong></span>
            </li>
          </ul>

          <button
            onClick={() => handleSwitch('basic')}
            disabled={plan === 'basic' || updating}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-colors border-2 ${
              plan === 'basic' 
                ? 'bg-white border-gray-900 text-gray-900 cursor-default opacity-50' 
                : 'bg-white border-gray-900 text-gray-900 hover:bg-gray-50'
            }`}
          >
            {plan === 'basic' ? 'Plan Actual' : 'Cambiar a Plan Básico'}
          </button>
        </div>

        {/* Plan PRO */}
        <div className="rounded-3xl border border-brand-pink bg-white p-8 relative shadow-xl ring-1 ring-brand-pink/50">
           {plan === 'pro' && (
            <div className="absolute top-0 right-0 -mt-4 mr-6 bg-brand-pink text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm">
              Plan Actual
            </div>
          )}
          
          <div className="flex items-center gap-3">
             <h2 className="text-2xl font-bold text-gray-900">Plan PRO</h2>
             <span className="bg-brand-pink text-white text-xs font-bold px-2 py-0.5 rounded uppercase">Recomendado</span>
          </div>
         
          <div className="mt-4 flex items-baseline">
            <span className="text-5xl font-extrabold text-gray-900">$699.00</span>
            <span className="ml-1 text-xl font-medium text-gray-500">/ mes</span>
          </div>
          <p className="text-brand-pink font-bold mt-2 text-sm uppercase tracking-wide">GRATIS (POR TIEMPO LIMITADO)</p>

          <ul className="mt-8 space-y-4 text-sm text-gray-600 mb-8">
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">∞</span>
              <span>Subastas <strong>ILIMITADAS</strong></span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">∞</span>
              <span>Publicaciones <strong>ILIMITADAS</strong></span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">{PLAN_LIMITS.pro.featured}</span>
              <span><strong>Artículos destacados</strong> al mes</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">∞</span>
              <span>Creación de <strong>Cupones ILIMITADA</strong></span>
            </li>
            
            <li className="flex items-center gap-3 text-gray-900">
              <Check className="w-5 h-5 shrink-0 text-brand-pink" />
              <span>Permite <strong>entregas personales</strong></span>
            </li>
            <li className="flex items-center gap-3 text-gray-900">
              <Check className="w-5 h-5 shrink-0 text-brand-pink" />
              <span>Permite <strong>envío por tu propia cuenta</strong></span>
            </li>
            <li className="flex items-center gap-3 text-gray-900">
              <svg className="w-5 h-5 shrink-0 text-brand-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Permite agregar <strong>Logo en su tienda</strong></span>
            </li>
            <li className="flex items-center gap-3 text-gray-900">
               <svg className="w-5 h-5 shrink-0 text-brand-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span>Retiros en máx <strong>48 horas</strong></span>
            </li>
             <li className="flex items-center gap-3 text-gray-900">
              <svg className="w-5 h-5 shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              <span>Verificación <strong>Insignia Azul</strong> de confianza</span>
            </li>
            <li className="flex items-center gap-3 text-gray-900">
              <svg className="w-5 h-5 shrink-0 text-brand-pink" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Comisión por venta del <strong>{PLAN_LIMITS.pro.commission_percent}%</strong></span>
            </li>
          </ul>

          <button
            onClick={() => handleSwitch('pro')}
            disabled={plan === 'pro' || updating}
            className={`w-full py-3.5 px-4 rounded-xl font-bold text-sm transition-colors ${
              plan === 'pro'
                ? 'bg-pink-100 text-brand-pink cursor-default'
                : 'bg-brand-pink text-white hover:bg-pink-600 shadow-md'
            }`}
          >
            {plan === 'pro' ? 'Tu plan actual' : 'Obtener Plan PRO'}
          </button>
        </div>

      </div>
    </div>
  );
}
