'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Check, X, Info } from 'lucide-react';
import { PLAN_LIMITS } from '@/lib/plans/limits';

export default function ProPage() {
  const [plan, setPlan] = useState<string | null>(null);
  const [dates, setDates] = useState<{ start: string | null; end: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('plan_type, pro_subscription_start, pro_subscription_end')
        .eq('id', user.id)
        .single();
        
      setPlan(data?.plan_type || 'basic');
      setDates({
        start: data?.pro_subscription_start || null,
        end: data?.pro_subscription_end || null
      });
      setLoading(false);
    };
    load();
  }, []);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentStep, setPaymentStep] = useState<'idle' | 'processing' | 'success'>('idle');

  // --- Payment Simulation ---
  const simulatePayment = async () => {
    setPaymentStep('processing');
    
    // Simulate API delay/Processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Call the actual update API
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No session');

      const res = await fetch('/api/user/update-plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plan: 'pro' }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al actualizar el plan');
      }

      setPaymentStep('success');
      
      // Close modal after delay and refresh
      setTimeout(() => {
        setShowPaymentModal(false);
        setPlan('pro');
        router.refresh();
        window.location.reload();
      }, 2000);

    } catch (err) {
      alert('Error en el pago: ' + (err instanceof Error ? err.message : 'Error desconocido'));
      setPaymentStep('idle');
      setShowPaymentModal(false);
    }
  };

  const handleSwitch = async (newPlan: string) => {
    if (newPlan === plan) return;
    
    if (newPlan === 'pro') {
      setShowPaymentModal(true);
      return;
    }

    if (!confirm(`¿Estás seguro que deseas cambiar al plan ${newPlan.toUpperCase()}? Perderás tus beneficios PRO.`)) return;

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

      {/* Expiration Warning Banner */}
      {plan === 'pro' && dates?.end && (
        (() => {
          const daysLeft = Math.ceil((new Date(dates.end).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 5 && daysLeft > 0) {
            return (
              <div className="mb-8 flex items-start gap-4 rounded-2xl border border-yellow-200 bg-yellow-50 p-4 text-yellow-800 shadow-sm animate-pulse">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-yellow-600" />
                <div>
                  <h3 className="font-bold text-yellow-900">Tu suscripción PRO vence pronto</h3>
                  <p className="text-sm">
                    Te quedan <strong>{daysLeft} días</strong> de beneficios exclusivos. Renueva ahora para evitar interrupciones en tus ventas ilimitadas.
                  </p>
                </div>
                <button 
                  onClick={() => setShowPaymentModal(true)}
                  className="ml-auto shrink-0 whitespace-nowrap rounded-lg bg-yellow-100 px-3 py-1.5 text-xs font-bold text-yellow-800 hover:bg-yellow-200"
                >
                  Renovar Ahora
                </button>
              </div>
            );
          }
          if (daysLeft <= 0) {
             return (
              <div className="mb-8 flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 shadow-sm">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div>
                  <h3 className="font-bold text-red-900">Tu suscripción ha vencido</h3>
                  <p className="text-sm">
                    Tus beneficios PRO están pausados. Tus publicaciones activas podrían ocultarse si exceden el límite básico.
                  </p>
                </div>
              </div>
            );
          }
          return null;
        })()
      )}

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
            <div className="absolute top-0 right-0 -mt-4 mr-6 bg-brand-pink text-white text-xs font-bold px-4 py-1.5 rounded-full uppercase tracking-wider shadow-sm flex flex-col items-end">
              <span>Plan Actual</span>
              {dates?.end && (
                <span className="text-[10px] opacity-90 normal-case font-normal">
                  Vence: {new Date(dates.end).toLocaleDateString('es-MX')}
                </span>
              )}
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

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl transform transition-all scale-100">
            {paymentStep === 'idle' && (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-gray-900">Suscripción PRO</h3>
                  <button onClick={() => setShowPaymentModal(false)} className="rounded-full p-1 hover:bg-gray-100">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                
                <div className="mb-6 space-y-4">
                  <div className="rounded-xl bg-pink-50 p-4 border border-pink-100">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-semibold text-gray-900">Plan PRO Mensual</span>
                      <span className="font-bold text-brand-pink">$699.00 MXN</span>
                    </div>
                    <p className="text-sm text-gray-600">Acceso ilimitado por 30 días.</p>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 cursor-pointer hover:border-brand-pink transition-colors">
                      <input type="radio" name="payment" defaultChecked className="text-brand-pink focus:ring-brand-pink" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Tarjeta de Crédito/Débito</div>
                        <div className="text-xs text-gray-500">Procesado seguro por MercadoPago</div>
                      </div>
                      <img src="/payment-logos/mercadopago.png" alt="MP" className="h-6 opacity-80" onError={(e) => e.currentTarget.style.display = 'none'} />
                    </label>
                    
                    <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 cursor-pointer hover:border-brand-pink transition-colors opacity-60">
                      <input type="radio" name="payment" disabled className="text-brand-pink focus:ring-brand-pink" />
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">Pocket Cash</div>
                        <div className="text-xs text-gray-500">Saldo insuficiente</div>
                      </div>
                    </label>
                  </div>
                </div>

                <button
                  onClick={simulatePayment}
                  className="w-full rounded-xl bg-brand-pink py-3.5 text-center font-bold text-white shadow-lg shadow-pink-200 hover:bg-pink-600 hover:shadow-xl transition-all active:scale-[0.98]"
                >
                  Pagar $699.00 y Activar
                </button>
                <p className="mt-3 text-center text-xs text-gray-400">
                  Transacción segura encriptada de extremo a extremo.
                </p>
              </>
            )}

            {paymentStep === 'processing' && (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-pink border-t-transparent mb-4"></div>
                <h3 className="text-lg font-bold text-gray-900">Procesando pago...</h3>
                <p className="text-sm text-gray-500">No cierres esta ventana.</p>
              </div>
            )}

            {paymentStep === 'success' && (
              <div className="flex flex-col items-center justify-center py-8 text-center animate-in zoom-in duration-300">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                  <Check className="h-8 w-8" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900">¡Bienvenido a PRO!</h3>
                <p className="mt-2 text-gray-600">Tu suscripción ha sido activada correctamente.</p>
                <p className="mt-4 text-sm text-gray-400">Redirigiendo...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}