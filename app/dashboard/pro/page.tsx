'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

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
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from('profiles').update({ plan_type: newPlan }).eq('id', user.id);
      if (error) throw error;
      
      setPlan(newPlan);
      router.refresh();
      
      // Force reload to update permissions in other components if needed
      window.location.reload();
    } catch (err) {
      alert('Error al cambiar de plan');
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando información de tu plan...</div>;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <div className="mb-8 text-center sm:text-left">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Planes y Suscripciones</h1>
        <p className="text-gray-600 text-lg">Elige el plan que mejor se adapte a tus necesidades de venta y desbloquea todo tu potencial.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-8 items-start">
        {/* Basic Plan */}
        <div className={`rounded-3xl border p-8 relative transition-all duration-200 ${plan === 'basic' ? 'border-gray-300 bg-white ring-4 ring-gray-100 shadow-xl' : 'border-gray-200 bg-white hover:shadow-lg'}`}>
          {plan === 'basic' && (
            <div className="absolute top-0 right-0 -mt-3 mr-4 bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Plan Actual
            </div>
          )}
          <h2 className="text-2xl font-bold text-gray-900">Plan Básico</h2>
          <div className="mt-4 flex items-baseline">
            <span className="text-4xl font-extrabold text-gray-900">$0.00</span>
            <span className="ml-1 text-xl font-medium text-gray-500">/ mes</span>
          </div>
          <p className="text-brand-pink font-bold mt-1 text-sm uppercase tracking-wide">GRATIS SIEMPRE</p>

          <ul className="mt-8 space-y-4 text-sm text-gray-600">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 font-bold text-xs">15</span>
              <span><strong className="text-gray-900">Subastas</strong> al mes</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 font-bold text-xs">50</span>
              <span><strong className="text-gray-900">Publicaciones</strong> al mes</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 font-bold text-xs">3</span>
              <span><strong className="text-gray-900">Artículos destacados</strong> al mes gratis</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 font-bold text-xs">25</span>
              <span><strong className="text-gray-900">Cupones</strong> al mes gratis</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span>Envíos solo con nuestras guías</span>
            </li>
            <li className="flex items-start gap-3 opacity-60">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              <span>No incluye entregas personales</span>
            </li>
            <li className="flex items-start gap-3 opacity-60">
              <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              <span>No incluye envíos por su propia cuenta</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Retiros semanales (Sábados)</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Comisión por venta del <strong>20%</strong></span>
            </li>
          </ul>

          <button
            onClick={() => handleSwitch('basic')}
            disabled={plan === 'basic' || updating}
            className={`mt-8 w-full rounded-2xl py-4 font-bold text-sm transition-all ${
              plan === 'basic' 
                ? 'bg-gray-100 text-gray-400 cursor-default' 
                : 'bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-50 hover:scale-[1.02] active:scale-[0.98]'
            }`}
          >
            {plan === 'basic' ? 'Tu plan actual' : 'Cambiar a Plan Básico'}
          </button>
        </div>

        {/* Pro Plan */}
        <div className={`rounded-3xl border p-8 relative transition-all duration-200 ${plan === 'pro' ? 'border-brand-pink bg-white ring-4 ring-pink-100 shadow-xl' : 'border-gray-200 bg-white hover:shadow-lg'}`}>
           {plan === 'pro' && (
            <div className="absolute top-0 right-0 -mt-3 mr-4 bg-brand-pink text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
              Plan Actual
            </div>
          )}
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Plan PRO
            <span className="bg-gradient-to-r from-brand-pink to-pink-600 text-white text-xs px-2 py-1 rounded-lg font-bold uppercase tracking-wider">Recomendado</span>
          </h2>
          <div className="mt-4 flex items-baseline">
            <span className="text-4xl font-extrabold text-gray-900">$699.00</span>
            <span className="ml-1 text-xl font-medium text-gray-500">/ mes</span>
          </div>
          <p className="text-brand-pink font-bold mt-1 text-sm uppercase tracking-wide">GRATIS (Por tiempo limitado)</p>

          <ul className="mt-8 space-y-4 text-sm text-gray-600">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">∞</span>
              <span><strong className="text-gray-900">Subastas ILIMITADAS</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">∞</span>
              <span><strong className="text-gray-900">Publicaciones ILIMITADAS</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">15</span>
              <span><strong className="text-gray-900">Artículos destacados</strong> al mes</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-brand-pink text-white font-bold text-xs">∞</span>
              <span>Creación de <strong className="text-gray-900">Cupones ILIMITADA</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-brand-pink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span>Permite <strong>entregas personales</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-brand-pink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              <span>Permite <strong>envío por tu propia cuenta</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-brand-pink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              <span>Permite agregar <strong>Logo en su tienda</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-brand-pink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span>Retiros en máx <strong>48 horas</strong></span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
              <span>Verificación <strong>Insignia Azul</strong> de confianza</span>
            </li>
            <li className="flex items-start gap-3">
              <svg className="w-5 h-5 text-brand-pink flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>Comisión por venta del <strong>15%</strong></span>
            </li>
          </ul>

          <button
            onClick={() => handleSwitch('pro')}
            disabled={plan === 'pro' || updating}
            className={`mt-8 w-full rounded-2xl py-4 font-bold text-sm transition-all ${
              plan === 'pro' 
                ? 'bg-brand-pink/10 text-brand-pink cursor-default' 
                : 'bg-brand-pink text-white hover:bg-brand-pink/90 hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-brand-pink/25'
            }`}
          >
            {plan === 'pro' ? 'Tu plan actual' : 'Obtener Plan PRO'}
          </button>
        </div>
      </div>
    </div>
  );
}
