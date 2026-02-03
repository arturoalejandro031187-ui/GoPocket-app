'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import { Wallet, WalletTransaction } from '@/lib/types/wallet.types';
import { calculateMercadoPagoFee } from '@/lib/fees';

function formatMoney(amount: number) {
  return amount.toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN',
  });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MonederoPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [pendingTopups, setPendingTopups] = useState<any[]>([]); // Recargas pendientes (Offline)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userName, setUserName] = useState('Miembro GoPocket');

  // Topup State
  const [topupAmount, setTopupAmount] = useState('');
  const [isTopupLoading, setIsTopupLoading] = useState(false);
  const [calculatedTotal, setCalculatedTotal] = useState<{ fee: number; total: number } | null>(null);

  // New States
  const [paymentMethod, setPaymentMethod] = useState<'mercadopago' | 'bank_transfer' | 'bank_deposit' | 'oxxo'>('bank_transfer');
  const [offlineSuccessId, setOfflineSuccessId] = useState<string | null>(null);
  const [banner, setBanner] = useState<any>(null);
  const [settings, setSettings] = useState<any>(null);

  // Withdraw State
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [isWithdrawLoading, setIsWithdrawLoading] = useState(false);

  // Force all methods to be enabled for Topups as per user request
  // EXCLUDING MercadoPago to avoid commissions (User Request)
  const enabledMethods = ['bank_transfer', 'bank_deposit', 'oxxo'];

  const currentInstruction = useMemo(() => {
    if (!settings?.payment_methods) return '';
    const pm = settings.payment_methods;
    let config = null;
    
    if (paymentMethod === 'bank_transfer') config = pm.bank_transfer;
    else if (paymentMethod === 'bank_deposit') config = pm.bank_deposit;
    else if (paymentMethod === 'oxxo') config = pm.oxxo;
    
    if (!config) return '';

    const parts = [];
    if (config.bank_name) parts.push(`Banco: ${config.bank_name}`);
    if (config.account_holder) parts.push(`Beneficiario: ${config.account_holder}`);
    if (config.clabe) parts.push(`CLABE: ${config.clabe}`);
    if (config.account_number) parts.push(`Cuenta: ${config.account_number}`);
    
    const details = parts.join('\n');
    const text = config.instructions || '';
    
    // Evitar duplicados si el texto ya contiene los detalles
    if (text.includes('Banco:') && text.includes(config.bank_name)) {
        return text;
    }

    return [details, text].filter(Boolean).join('\n\n');
  }, [settings, paymentMethod]);

  useEffect(() => {
    // Fetch Monedero Banner
    const fetchBanner = async () => {
      try {
        const { data } = await supabase
          .from('home_banners')
          .select('*')
          .eq('placement', 'monedero')
          .eq('is_active', true)
          .single();
        if (data) setBanner(data);
      } catch (err) {
        console.error('Error fetching banner:', err);
      }
    };
    fetchBanner();
  }, []);

  useEffect(() => {
    const amount = Number(topupAmount);
    if (!isNaN(amount) && amount > 0) {
      const { fee, total } = calculateMercadoPagoFee(amount);
      setCalculatedTotal({ fee, total });
    } else {
      setCalculatedTotal(null);
    }
  }, [topupAmount]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }

      const token = session.access_token;

      // Fetch Wallet Balance
      const walletRes = await fetch('/api/wallet/balance', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!walletRes.ok) throw new Error('Error al cargar el monedero');
      const walletData = await walletRes.json();
      setWallet(walletData);

      // Fetch Transactions
      const txRes = await fetch('/api/wallet/transactions', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!txRes.ok) throw new Error('Error al cargar las transacciones');
      const txData = await txRes.json();
      setTransactions(txData.transactions || []);

      // Fetch Pending Topups (Offline)
      const { data: pending } = await supabase
        .from('wallet_topups')
        .select('*')
        .eq('user_id', session.user.id)
        .in('status', ['pending_proof', 'pending_approval'])
        .order('created_at', { ascending: false });
      setPendingTopups(pending || []);

      // Fetch App Settings for payment methods
      const { data: settingsData } = await supabase
        .from('app_settings')
        .select('payment_methods')
        .eq('id', 1)
        .single();
      if (settingsData) {
        setSettings(settingsData);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function generateOfflinePaymentNote(topupId: string, amount: number, method: string, instructions: string) {
    const w = window.open('', '_blank');
    if (!w) return;

    let methodName = 'Transferencia SPEI';
    if (method === 'oxxo') methodName = 'Pago en OXXO';
    if (method === 'bank_deposit') methodName = 'Depósito Bancario';

    w.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Orden de Pago #${topupId.slice(0, 8)}</title>
          <style>
            body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #333; max-width: 600px; margin: 0 auto; background: #fff; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f0f0f0; padding-bottom: 30px; margin-bottom: 40px; }
            .logo { font-size: 24px; font-weight: 900; color: #E91E63; letter-spacing: -1px; }
            .invoice-title { font-size: 20px; font-weight: 300; color: #888; text-transform: uppercase; letter-spacing: 2px; }
            
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 40px; }
            .info-col h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #aaa; margin-bottom: 8px; font-weight: 600; }
            .info-col p { font-size: 15px; font-weight: 500; margin: 0; color: #111; }
            
            .box { background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 40px; border: 1px solid #eee; }
            .box-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
            .box-row:last-child { margin-bottom: 0; }
            .box-label { font-size: 12px; color: #777; text-transform: uppercase; letter-spacing: 1px; }
            .box-value { font-size: 18px; font-weight: bold; color: #111; }
            
            .instructions { white-space: pre-wrap; font-size: 14px; line-height: 1.6; color: #444; background: #fff; border: 1px dashed #ccc; padding: 20px; border-radius: 8px; }
            
            .footer { margin-top: 60px; padding-top: 30px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #aaa; }
            
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">POCKET</div>
            <div class="invoice-title">Orden de Pago</div>
          </div>

          <div class="info-grid">
            <div class="info-col">
              <h3>ID Operación</h3>
              <p>#${topupId}</p>
            </div>
            <div class="info-col" style="text-align: right;">
              <h3>Fecha</h3>
              <p>${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>

          <div class="box">
            <div class="box-row">
              <span class="box-label">Método</span>
              <span class="box-value">${methodName}</span>
            </div>
            <div class="box-row" style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
              <span class="box-label">Total a Pagar</span>
              <span class="box-value" style="color: #E91E63;">${amount.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</span>
            </div>
          </div>

          <div style="margin-bottom: 10px; font-weight: bold; font-size: 14px; color: #333;">INSTRUCCIONES DE PAGO</div>
          <div class="instructions">${instructions}</div>

          <div class="footer">
            <p>1. Esta orden de pago es válida únicamente para el monto especificado.</p>
            <p>2. Conserva este comprobante hasta que tu saldo sea acreditado.</p>
            <p>3. Sube tu comprobante en la sección "Mis Compras" o "Monedero".</p>
          </div>

          <script>window.print();</script>
        </body>
      </html>
    `);
    w.document.close();
  }

  async function handleTopup() {
    try {
      setIsTopupLoading(true);
      setError(null);

      const amount = parseFloat(topupAmount);
      if (isNaN(amount) || amount < 10) {
        throw new Error('El monto mínimo es $10.00');
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }

      const res = await fetch('/api/wallet/topup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          amount,
          payment_method: paymentMethod,
          instruction: currentInstruction // Enviar instrucciones al backend
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al iniciar recarga');
      }

      if (data.init_point) {
        window.location.href = data.init_point;
      } else if (data.topup_id) {
        // Generar PDF automáticamente para métodos offline
        if (paymentMethod !== 'mercadopago') {
            generateOfflinePaymentNote(data.topup_id, amount, paymentMethod, currentInstruction);
        }

        setOfflineSuccessId(data.topup_id);
        setTopupAmount('');
        // Refresh pending list
        fetchData();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsTopupLoading(false);
    }
  }

  async function handleWithdraw() {
    try {
      setIsWithdrawLoading(true);
      setError(null);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        window.location.href = '/login';
        return;
      }

      const res = await fetch('/api/payouts/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          source: 'wallet',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al solicitar retiro');
      }

      // Success
      setIsWithdrawModalOpen(false);
      alert('Solicitud de retiro recibida exitosamente.');
      
      // Refresh data
      fetchData();

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setIsWithdrawModalOpen(false); 
    } finally {
      setIsWithdrawLoading(false);
    }
  }

  // Helper para extraer instrucciones de metadata string
  function getInstructionFromMetadata(metadata: any): string {
    try {
      if (typeof metadata === 'string') {
        const parsed = JSON.parse(metadata);
        return parsed.instruction || '';
      }
      return '';
    } catch {
      return '';
    }
  }
  
  function getMethodFromMetadata(metadata: any): string {
    try {
      if (typeof metadata === 'string') {
        const parsed = JSON.parse(metadata);
        return parsed.payment_method || 'offline';
      }
      return 'offline';
    } catch {
      return 'offline';
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mi PocketCash</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona tu saldo, recargas y historial de movimientos.
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-xl bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
        >
          ← Volver
        </Link>
      </div>

      {/* Banner Promocional */}
      {banner ? (
        <div className="mb-8 overflow-hidden rounded-3xl bg-gray-900 shadow-lg ring-1 ring-white/10 relative">
          {banner.image_url && (
             <div className="absolute inset-0">
               <img src={banner.image_url} alt="" className="h-full w-full object-cover opacity-60" />
               <div className="absolute inset-0 bg-gradient-to-r from-gray-900/90 to-transparent"></div>
             </div>
          )}
          {!banner.image_url && (
             <div className="absolute inset-0 bg-gradient-to-r from-gray-900 to-gray-800">
               <div className="absolute right-0 top-0 h-full w-1/2 translate-x-1/3 transform bg-gradient-to-l from-brand-pink/20 to-transparent blur-3xl"></div>
             </div>
          )}
          
          <div className="relative z-10 px-6 py-8 sm:px-12 sm:py-10 max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {banner.title}
            </h2>
            {banner.subtitle && (
              <p className="mt-3 text-lg text-gray-300">
                {banner.subtitle}
              </p>
            )}
            {banner.cta_text && banner.cta_href && (
               <Link href={banner.cta_href} className="mt-6 inline-block rounded-xl bg-white px-5 py-2 text-sm font-bold text-gray-900 transition hover:bg-gray-100">
                 {banner.cta_text}
               </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-8 overflow-hidden rounded-3xl bg-gradient-to-r from-gray-900 to-gray-800 shadow-lg ring-1 ring-white/10">
          <div className="relative px-6 py-8 sm:px-12 sm:py-10">
            <div className="absolute right-0 top-0 h-full w-1/2 translate-x-1/3 transform bg-gradient-to-l from-brand-pink/20 to-transparent blur-3xl"></div>
            <div className="relative z-10 max-w-2xl">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                ¡Tu dinero, más seguro y rápido!
              </h2>
              <p className="mt-3 text-lg text-gray-300">
                Usa tu tarjeta PocketCash para comprar y vender sin comisiones bancarias extras.
                Obtén cashback en compras seleccionadas.
              </p>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-pink border-t-transparent"></div>
        </div>
      ) : error ? (
        <div className="rounded-xl bg-red-50 p-4 text-red-600">
          Error: {error}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Balance Card */}
          <div className="lg:col-span-1">
            <div className="group relative h-56 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-pink to-pink-600 p-6 text-white shadow-xl transition-all hover:scale-[1.02] hover:shadow-2xl">
              {/* Decorative Elements */}
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
              <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-pink-900/20 blur-3xl"></div>
              
              {/* Card Header */}
              <div className="relative z-10 flex items-start justify-between">
                <div className="h-9 w-12 rounded-lg bg-yellow-200/90 shadow-inner ring-1 ring-yellow-400/50 backdrop-blur-sm">
                  <div className="grid h-full w-full grid-cols-2 gap-1 p-2 opacity-60">
                    <div className="rounded-[1px] border border-yellow-700/40"></div>
                    <div className="rounded-[1px] border border-yellow-700/40"></div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold italic tracking-wider">PocketCash</div>
                  <div className="text-[10px] font-medium opacity-80">DEBIT</div>
                </div>
              </div>

              {/* Balance Section */}
              <div className="relative z-10 mt-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium opacity-80">Saldo Disponible</span>
                  {wallet?.balance !== undefined && (
                    <span className="inline-flex items-center rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm backdrop-blur-md">
                      MXN
                    </span>
                  )}
                </div>
                <div className="mt-1 font-mono text-3xl font-bold tracking-tight text-white drop-shadow-sm">
                  {formatMoney(wallet?.balance || 0)}
                </div>
              </div>

              {/* Card Footer */}
              <div className="relative z-10 mt-8 flex items-end justify-between">
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-widest opacity-60">TITULAR</div>
                  <div className="max-w-[180px] truncate font-medium uppercase tracking-wide text-white/90">
                    {userName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-bold uppercase tracking-widest opacity-60">EXPIRA</div>
                  <div className="font-mono text-sm font-medium text-white/90">12/30</div>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="font-semibold text-gray-900">Recargar Saldo</h3>
              <p className="mt-2 text-sm text-gray-500">
                Agrega saldo a tu cuenta para futuras compras.
              </p>

              {offlineSuccessId ? (
                <div className="mt-4 rounded-xl bg-green-50 p-4 border border-green-200">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 text-green-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-green-900">Solicitud creada con éxito</h4>
                      <p className="mt-1 text-sm text-green-700">
                        Tu solicitud de recarga por transferencia ha sido registrada.
                        Por favor ve a "Mis Compras" para subir tu comprobante de pago y completar el proceso.
                      </p>
                      <Link href="/dashboard/compras" className="mt-3 inline-flex items-center text-sm font-bold text-green-800 underline">
                        Ir a Mis Compras →
                      </Link>
                      <button 
                        onClick={() => setOfflineSuccessId(null)}
                        className="ml-4 text-sm text-green-600 hover:text-green-800"
                      >
                        Nueva recarga
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {enabledMethods.includes('mercadopago') && (
                      <button
                        onClick={() => setPaymentMethod('mercadopago')}
                        className={`rounded-xl px-3 py-3 text-sm font-medium transition flex flex-col items-center justify-center gap-2 border ${
                          paymentMethod === 'mercadopago'
                            ? 'bg-brand-pink/10 border-brand-pink text-brand-pink ring-1 ring-brand-pink'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-brand-pink/50 hover:bg-brand-pink/5'
                        }`}
                      >
                        <span className="text-xl">💳</span>
                        <span>Tarjeta</span>
                      </button>
                    )}
                    {enabledMethods.includes('bank_transfer') && (
                      <button
                        onClick={() => setPaymentMethod('bank_transfer')}
                        className={`rounded-xl px-3 py-3 text-sm font-medium transition flex flex-col items-center justify-center gap-2 border ${
                          paymentMethod === 'bank_transfer'
                            ? 'bg-blue-50 border-blue-500 text-blue-700 ring-1 ring-blue-500'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <span className="text-xl">🏦</span>
                        <span>Transferencia</span>
                      </button>
                    )}
                    {enabledMethods.includes('bank_deposit') && (
                      <button
                        onClick={() => setPaymentMethod('bank_deposit')}
                        className={`rounded-xl px-3 py-3 text-sm font-medium transition flex flex-col items-center justify-center gap-2 border ${
                          paymentMethod === 'bank_deposit'
                            ? 'bg-purple-50 border-purple-500 text-purple-700 ring-1 ring-purple-500'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50'
                        }`}
                      >
                        <span className="text-xl">📍</span>
                        <span>Depósito</span>
                      </button>
                    )}
                    {enabledMethods.includes('oxxo') && (
                      <button
                        onClick={() => setPaymentMethod('oxxo')}
                        className={`rounded-xl px-3 py-3 text-sm font-medium transition flex flex-col items-center justify-center gap-2 border ${
                          paymentMethod === 'oxxo'
                            ? 'bg-red-50 border-red-500 text-red-700 ring-1 ring-red-500'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:bg-red-50'
                        }`}
                      >
                        <span className="text-xl">🏪</span>
                        <span>OXXO</span>
                      </button>
                    )}
                  </div>

                  {paymentMethod !== 'mercadopago' && (
                    <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm border border-blue-200">
                      <p className="font-bold text-blue-900 mb-2">Instrucciones de Pago</p>
                      <p className="text-blue-800 mb-3">
                        Para obtener los datos de pago ({paymentMethod === 'oxxo' ? 'Código OXXO' : paymentMethod === 'bank_deposit' ? 'Cuenta Depósito' : 'Cuenta CLABE'}), 
                        haz clic en "Generar Orden de Pago". Se descargará una ficha con la información necesaria.
                      </p>
                      <div className="text-xs text-blue-600 bg-white/50 p-2 rounded">
                        <strong>Nota:</strong> Sube tu comprobante después de realizar el pago para acreditar tu saldo.
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-4">
                    <label htmlFor="amount" className="block text-xs font-medium text-gray-700">
                      Monto a recargar (MXN)
                    </label>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="relative flex-1 rounded-md shadow-sm">
                        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                          <span className="text-gray-500 sm:text-sm">$</span>
                        </div>
                        <input
                          type="number"
                          name="amount"
                          id="amount"
                          className="block w-full rounded-xl border-gray-300 pl-7 focus:border-brand-pink focus:ring-brand-pink sm:text-sm"
                          placeholder="0.00"
                          min="10"
                          value={topupAmount}
                          onChange={(e) => setTopupAmount(e.target.value)}
                        />
                      </div>
                      <button
                        onClick={handleTopup}
                        disabled={isTopupLoading || !topupAmount}
                        className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isTopupLoading ? '...' : (paymentMethod !== 'mercadopago' ? 'Generar Orden de Pago' : 'Recargar')}
                      </button>
                    </div>

                    {/* Desglose de Comisión (Solo MercadoPago) */}
                    {paymentMethod === 'mercadopago' && calculatedTotal && (
                      <div className="mt-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 border border-gray-100">
                         <div className="flex justify-between mb-1">
                           <span>Monto a recargar:</span>
                           <span className="font-medium">{formatMoney(Number(topupAmount))}</span>
                         </div>
                         <div className="flex justify-between mb-1 text-orange-600">
                           <span>Comisión MercadoPago:</span>
                           <span className="font-medium">+{formatMoney(calculatedTotal.fee)}</span>
                         </div>
                         <div className="flex justify-between pt-2 border-t border-gray-200 text-sm font-bold text-gray-900">
                           <span>Total a pagar:</span>
                           <span>{formatMoney(calculatedTotal.total)}</span>
                         </div>
                         <p className="mt-2 text-[10px] text-gray-500 text-center">
                           * La comisión es cobrada por la pasarela de pagos.
                         </p>
                      </div>
                    )}

                    <p className="mt-2 text-xs text-gray-500">
                      {paymentMethod === 'mercadopago' 
                        ? '' 
                        : '* Tu saldo se acreditará una vez validado el comprobante (1-24 hrs).'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
              <h3 className="font-semibold text-gray-900">Información Importante</h3>
              <ul className="mt-4 space-y-3 text-sm text-gray-600">
                <li className="flex gap-2">
                  <span className="text-brand-pink font-bold">!</span>
                  <span className="font-medium text-gray-900">
                    No se permiten pagos mixtos.
                  </span>
                </li>
                <li className="ml-4 text-xs text-gray-500 mb-2">
                  Debes cubrir el 100% del costo con PocketCash o el 100% con otro método (depósito/tarjeta).
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-pink">•</span>
                  Gana PocketCash con cada compra completada.
                </li>
                <li className="flex gap-2">
                  <span className="text-brand-pink">•</span>
                  Tu PocketCash no vence mientras tu cuenta esté activa.
                </li>
              </ul>
            </div>
          </div>

          {/* Transactions List */}
          <div className="lg:col-span-2 space-y-8">
            {/* Pending Topups List */}
            {pendingTopups.length > 0 && (
              <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="border-b border-gray-100 px-6 py-4 bg-yellow-50/50">
                  <h3 className="font-bold text-gray-900 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-yellow-500"></span>
                    </span>
                    Recargas Pendientes
                  </h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {pendingTopups.map((topup) => (
                    <div key={topup.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-6 gap-4 hover:bg-gray-50 transition">
                      <div className="flex items-center gap-4">
                        <div className="rounded-full p-2 bg-yellow-100 text-yellow-600">
                          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            Recarga por {getMethodFromMetadata(topup.mercadopago_preference_id) === 'oxxo' ? 'OXXO' : 'Transferencia/Depósito'}
                          </p>
                          <p className="text-xs text-gray-500">
                            ID: {topup.id.slice(0, 8)} • {formatDate(topup.created_at)}
                          </p>
                          {topup.status === 'pending_proof' && (
                             <span className="mt-1 inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                               Esperando Comprobante
                             </span>
                          )}
                          {topup.status === 'pending_approval' && (
                             <span className="mt-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                               Revisando Comprobante
                             </span>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-right">
                          <div className="font-bold text-gray-900">+{formatMoney(topup.amount)}</div>
                          <button
                            onClick={() => generateOfflinePaymentNote(topup.id, topup.amount, getMethodFromMetadata(topup.mercadopago_preference_id), getInstructionFromMetadata(topup.mercadopago_preference_id))}
                            className="text-xs font-medium text-brand-pink hover:text-pink-700 underline"
                          >
                            Descargar Ficha
                          </button>
                        </div>
                        <Link
                          href="/dashboard/compras"
                          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                        >
                          Subir Comprobante
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
              <div className="border-b border-gray-100 px-6 py-4">
                <h3 className="font-bold text-gray-900">Historial de Movimientos</h3>
              </div>
              
              {transactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="rounded-full bg-gray-50 p-4">
                    <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="mt-4 text-gray-500">No tienes movimientos recientes.</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {transactions.map((tx) => (
                    <div key={tx.id} className="flex items-center justify-between p-6 transition hover:bg-gray-50">
                      <div className="flex items-center gap-4">
                        <div className={`rounded-full p-2 ${
                          tx.type === 'credit' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                        }`}>
                          {tx.type === 'credit' ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{tx.concept}</p>
                          <p className="text-xs text-gray-500">{formatDate(tx.created_at)}</p>
                        </div>
                      </div>
                      <div className={`text-right font-bold ${
                        tx.type === 'credit' ? 'text-green-600' : 'text-gray-900'
                      }`}>
                        {tx.type === 'credit' ? '+' : '-'}{formatMoney(tx.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Withdraw Modal */}
      {isWithdrawModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
            <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4">
              <h3 className="text-lg font-bold text-gray-900">Retirar Fondos</h3>
            </div>
            
            <div className="p-6">
              <div className="mb-6 flex flex-col items-center justify-center rounded-xl bg-brand-pink/5 p-6 border border-brand-pink/10">
                <span className="text-sm font-medium text-gray-500">Saldo Disponible</span>
                <span className="mt-1 text-3xl font-bold text-brand-pink">
                  {formatMoney(wallet?.balance || 0)}
                </span>
              </div>

              <p className="text-sm text-gray-600 mb-6 text-center">
                Se solicitará el retiro del <strong>100%</strong> de tu saldo disponible en PocketCash. 
                Los fondos serán transferidos a tu cuenta configurada.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setIsWithdrawModalOpen(false)}
                  disabled={isWithdrawLoading}
                  className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleWithdraw}
                  disabled={isWithdrawLoading || (wallet?.balance || 0) < 0.01}
                  className="flex-1 rounded-xl bg-brand-pink px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-pink/20 transition hover:bg-pink-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isWithdrawLoading ? 'Procesando...' : 'Confirmar Retiro'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Force deploy update