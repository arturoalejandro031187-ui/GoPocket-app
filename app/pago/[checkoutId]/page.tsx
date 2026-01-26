'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatMoney(v: number) {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function toNumber(v: any) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function PagoOfflinePage() {
  const params = useParams<{ checkoutId: string }>();
  const checkoutId = String((params as any)?.checkoutId || '').trim();

  const [isBooting, setIsBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [viewerId, setViewerId] = useState<string>('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [proofSuccess, setProofSuccess] = useState<string | null>(null);

  const session = data?.session ?? null;
  const orders = (data?.orders ?? []) as any[];
  const items = data?.items ?? null;

  const method = String(session?.payment_method || '');
  const reference = String(session?.reference_code || '');
  const amount = toNumber(session?.amount);
  const createdAt = session?.created_at ? new Date(session.created_at).toLocaleString('es-MX') : '—';
  const proofUrl = String(session?.payment_proof_url || '').trim();
  const proofUploadedAt = session?.payment_proof_uploaded_at ? new Date(session.payment_proof_uploaded_at).toLocaleString('es-MX') : '';
  const canUploadProof = !!viewerId && !!session && String(session?.buyer_id || '') === viewerId;

  // Calcular tiempo restante para el pago (48 horas) - actualizado cada segundo
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    if (!session?.created_at) return;
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [session?.created_at]);

  const timeRemaining = useMemo(() => {
    if (!session?.created_at) return null;
    const created = new Date(session.created_at);
    const deadline = new Date(created.getTime() + 48 * 60 * 60 * 1000); // 48 horas
    const diff = deadline.getTime() - currentTime.getTime();
    if (diff <= 0) return { expired: true, hours: 0, minutes: 0, seconds: 0 };
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    return { expired: false, hours, minutes, seconds };
  }, [session?.created_at, currentTime]);

  const instructions = useMemo(() => {
    const snap = session?.offline_instructions ?? null;
    if (snap) return snap;
    const pm = data?.payment_methods ?? {};
    if (method === 'bank_transfer') return pm?.bank_transfer ?? {};
    if (method === 'bank_deposit') return pm?.bank_deposit ?? {};
    if (method === 'oxxo') return pm?.oxxo ?? {};
    return {};
  }, [data, method, session?.offline_instructions]);

  const labelMethod = useMemo(() => {
    if (method === 'bank_transfer') return 'Transferencia bancaria';
    if (method === 'bank_deposit') return 'Depósito bancario';
    if (method === 'oxxo') return 'OXXO';
    return method || 'Pago offline';
  }, [method]);

  const grouped = useMemo(() => {
    const list = (items ?? []) as any[];
    const by: Record<string, any[]> = {};
    for (const it of list) {
      const oid = String(it?.order_id || '');
      if (!oid) continue;
      if (!by[oid]) by[oid] = [];
      by[oid].push(it);
    }
    return by;
  }, [items]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);
        if (!checkoutId) throw new Error('checkoutId inválido.');

        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          window.location.href = `/login?returnTo=${encodeURIComponent(`/pago/${checkoutId}`)}`;
          return;
        }

        try {
          const u = await supabase.auth.getUser();
          const id = String(u?.data?.user?.id || '').trim();
          if (!cancelled) setViewerId(id);
        } catch {
          if (!cancelled) setViewerId('');
        }

        const res = await fetch(`/api/offline-payment/details?checkoutId=${encodeURIComponent(checkoutId)}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'No se pudo cargar la hoja de pago.');
        if (!cancelled) setData(json);
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar la hoja de pago.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [checkoutId]);

  const uploadProof = async (file: File) => {
    setProofError(null);
    setProofSuccess(null);
    setIsUploadingProof(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = `/login?returnTo=${encodeURIComponent(`/pago/${checkoutId}`)}`;
        return;
      }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('kind', 'payment_proof');

      const up = await fetch('/api/upload', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      });
      const upJson = await up.json().catch(() => ({}));
      if (!up.ok) throw new Error(upJson?.error || 'No se pudo subir el comprobante.');
      const url = String(upJson?.url || '').trim();
      if (!url) throw new Error('No se pudo obtener la URL del comprobante.');

      const save = await fetch('/api/offline-payment/proof', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ checkoutId, proofUrl: url }),
      });
      const saveJson = await save.json().catch(() => ({}));
      if (!save.ok) throw new Error(saveJson?.error || 'No se pudo guardar el comprobante.');

      setProofSuccess('Comprobante subido. El admin lo revisará para validar tu pago.');

      // Refrescar detalles (para que aparezca la imagen/fecha sin recargar la página)
      const res = await fetch(`/api/offline-payment/details?checkoutId=${encodeURIComponent(checkoutId)}&t=${Date.now()}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) setData(json);
    } catch (e: unknown) {
      console.error(e);
      setProofError(e instanceof Error ? e.message : 'No se pudo subir el comprobante.');
    } finally {
      setIsUploadingProof(false);
    }
  };

  const downloadPdf = () => {
    if (!session) return;
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });

      // Header
      doc.setFillColor(227, 18, 125);
      doc.rect(0, 0, 595, 70, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.text('GoPocket', 40, 42);
      doc.setFontSize(12);
      doc.text('Hoja de pago (offline)', 120, 42);

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text(`Método: ${labelMethod}`, 40, 95);
      doc.text(`Fecha: ${createdAt}`, 40, 113);
      doc.setTextColor(227, 18, 125);
      doc.setFontSize(14);
      doc.text(`Concepto / Referencia: ${reference || '—'}`, 40, 138);
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text(`Total a pagar: ${formatMoney(amount)}`, 40, 160);

      // Instrucciones / Datos
      const lines: string[] = [];
      if (method === 'bank_transfer') {
        if (instructions?.bank_name) lines.push(`Banco: ${instructions.bank_name}`);
        if (instructions?.account_holder) lines.push(`Titular: ${instructions.account_holder}`);
        if (instructions?.clabe) lines.push(`CLABE: ${instructions.clabe}`);
      } else if (method === 'bank_deposit') {
        if (instructions?.bank_name) lines.push(`Banco: ${instructions.bank_name}`);
        if (instructions?.account_holder) lines.push(`Titular: ${instructions.account_holder}`);
        if (instructions?.account_number) lines.push(`Cuenta: ${instructions.account_number}`);
      }
      if (instructions?.instructions) lines.push(String(instructions.instructions));

      doc.setTextColor(0, 0, 0);
      doc.setFontSize(11);
      doc.text('Datos de pago:', 40, 190);
      doc.setTextColor(80, 80, 80);
      const wrapped = doc.splitTextToSize(lines.length ? lines.join('\n') : 'Consulta las instrucciones en esta hoja.', 515);
      doc.text(wrapped, 40, 208);

      // Tabla de artículos
      const tableBody: any[] = [];
      for (const o of orders) {
        const oid = String(o?.id || '');
        const its = grouped[oid] ?? [];
        for (const it of its) {
          tableBody.push([
            String(it?.title || 'Artículo'),
            String(it?.quantity ?? 1),
            formatMoney(toNumber(it?.unit_price)),
            formatMoney(toNumber(it?.line_total)),
          ]);
        }
      }

      autoTable(doc, {
        startY: 290,
        head: [['Artículo', 'Cant.', 'Precio', 'Importe']],
        body: tableBody.length ? tableBody : [['(Sin items)', '', '', '']],
        styles: { fontSize: 10, cellPadding: 6 },
        headStyles: { fillColor: [227, 18, 125], textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: [250, 250, 250] },
      });

      const y = (doc as any).lastAutoTable?.finalY ? Number((doc as any).lastAutoTable.finalY) + 18 : 520;
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.text(`Total a pagar: ${formatMoney(amount)}`, 40, y);
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(9);
      doc.text(`ID de sesión: ${checkoutId}`, 40, y + 16);
      doc.text('GoPocket · Guarda tu comprobante. Si necesitas ayuda, contacta soporte desde “Mi cuenta”.', 40, y + 32);

      doc.save(`GoPocket-PAGO-${reference || checkoutId}.pdf`);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    }
  };

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="h-12 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-72 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
              Pago offline
            </div>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">Hoja de pago</h1>
            <p className="mt-2 text-sm text-gray-600">Descarga tu comprobante PDF y paga con el concepto indicado.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              className="rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-90"
            >
              Descargar PDF
            </button>
            <Link href="/dashboard" className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Ir a mi dashboard
            </Link>
          </div>
        </div>

        {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

        {/* Advertencia de 48 horas */}
        {!error && timeRemaining && (
          <div
            className={`mt-6 rounded-2xl border px-4 py-4 shadow-sm ${
              timeRemaining.expired
                ? 'border-red-300 bg-red-50'
                : timeRemaining.hours < 12
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-orange-300 bg-orange-50'
            }`}
          >
            <div className="flex items-start gap-3">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={timeRemaining.expired ? '#dc2626' : timeRemaining.hours < 12 ? '#d97706' : '#ea580c'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <div className="flex-1">
                <div className={`text-sm font-extrabold ${timeRemaining.expired ? 'text-red-900' : timeRemaining.hours < 12 ? 'text-amber-900' : 'text-orange-900'}`}>
                  {timeRemaining.expired
                    ? '⚠️ Tiempo de pago vencido'
                    : `⚠️ Tiempo restante: ${timeRemaining.hours}h ${timeRemaining.minutes}m ${timeRemaining.seconds}s`}
                </div>
                <div className={`mt-1 text-xs ${timeRemaining.expired ? 'text-red-800' : timeRemaining.hours < 12 ? 'text-amber-800' : 'text-orange-800'}`}>
                  {timeRemaining.expired
                    ? 'El plazo de 48 horas ha expirado. Tu reputación como comprador se verá afectada negativamente.'
                    : 'Tienes 48 horas para realizar tu pago. Si no pagas a tiempo, tu reputación como comprador se verá afectada negativamente.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {!error ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-bold text-gray-900">Datos del pago</div>
                    <div className="mt-1 text-sm text-gray-600">{labelMethod}</div>
                  </div>
                  <div className="text-xs text-gray-500">{createdAt}</div>
                </div>

                <div className="mt-5 rounded-3xl bg-pink-50 p-5 ring-1 ring-pink-100">
                  <div className="text-xs font-semibold text-pink-900">Concepto / Referencia</div>
                  <div className="mt-1 text-lg font-extrabold text-brand-pink">{reference || '—'}</div>
                  <div className="mt-2 text-xs text-pink-900">
                    Usa este concepto para identificar tu pago. Guarda tu comprobante.
                  </div>
                </div>

                <div className="mt-5 rounded-3xl bg-white p-5 ring-1 ring-black/10">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-extrabold text-gray-900">Comprobante (ticket / baúcher)</div>
                      <div className="mt-1 text-xs text-gray-600">
                        Súbelo para que el admin valide tu pago offline más rápido.
                      </div>
                    </div>
                    {proofUploadedAt ? (
                      <div className="text-xs font-semibold text-gray-500">Subido: {proofUploadedAt}</div>
                    ) : (
                      <div className="text-xs font-semibold text-gray-400">Aún no subido</div>
                    )}
                  </div>

                  {proofError ? <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{proofError}</div> : null}
                  {proofSuccess ? (
                    <div className="mt-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{proofSuccess}</div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    {proofUrl ? (
                      <a
                        href={proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-pink shadow-sm ring-1 ring-pink-200 hover:bg-pink-50"
                      >
                        Ver comprobante
                      </a>
                    ) : null}

                    {canUploadProof ? (
                      <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60">
                        {isUploadingProof ? 'Subiendo…' : proofUrl ? 'Reemplazar foto' : 'Subir foto'}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isUploadingProof}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (!f) return;
                            void uploadProof(f);
                          }}
                        />
                      </label>
                    ) : (
                      <div className="text-xs text-gray-500">Solo el comprador puede subir el comprobante.</div>
                    )}
                  </div>

                  {proofUrl ? (
                    <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={proofUrl} alt="Comprobante de pago" className="h-auto w-full bg-white object-contain" />
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
                    <div className="text-xs font-semibold text-gray-600">Total a pagar</div>
                    <div className="mt-1 text-sm font-extrabold text-gray-900">{formatMoney(amount)}</div>
                  </div>
                  <div className="rounded-2xl bg-gray-50 px-4 py-3 ring-1 ring-black/5">
                    <div className="text-xs font-semibold text-gray-600">Sesión</div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">{checkoutId.slice(0, 8)}…</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-sm font-semibold text-gray-900">Instrucciones / Datos</div>
                  <div className="mt-2 rounded-2xl bg-white px-4 py-3 text-sm text-gray-800 ring-1 ring-black/10 whitespace-pre-wrap">
                    {method === 'bank_transfer' ? (
                      <>
                        {instructions?.bank_name ? `Banco: ${instructions.bank_name}\n` : ''}
                        {instructions?.account_holder ? `Titular: ${instructions.account_holder}\n` : ''}
                        {instructions?.clabe ? `CLABE: ${instructions.clabe}\n` : ''}
                      </>
                    ) : method === 'bank_deposit' ? (
                      <>
                        {instructions?.bank_name ? `Banco: ${instructions.bank_name}\n` : ''}
                        {instructions?.account_holder ? `Titular: ${instructions.account_holder}\n` : ''}
                        {instructions?.account_number ? `Cuenta: ${instructions.account_number}\n` : ''}
                      </>
                    ) : null}
                    {instructions?.instructions ? String(instructions.instructions) : 'Consulta estas instrucciones con el administrador.'}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
                <div className="text-lg font-bold text-gray-900">Artículos</div>
                <div className="mt-4 space-y-3">
                  {orders.length === 0 ? (
                    <div className="text-sm text-gray-600">Sin órdenes.</div>
                  ) : (
                    orders.map((o) => {
                      const oid = String(o?.id || '');
                      const its = grouped[oid] ?? [];
                      return (
                        <div key={oid} className="rounded-3xl bg-gray-50 p-5 ring-1 ring-black/5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-gray-900">Orden: {oid.slice(0, 8)}…</div>
                            <div className="text-sm font-extrabold text-gray-900">{formatMoney(toNumber(o?.total))}</div>
                          </div>
                          <div className="mt-3 space-y-2">
                            {its.length === 0 ? (
                              <div className="text-sm text-gray-600">Sin items.</div>
                            ) : (
                              its.map((it, idx) => (
                                <div key={`${oid}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
                                  <div className="min-w-0 truncate text-gray-900">
                                    {String(it?.title || 'Artículo')} <span className="text-gray-500">× {String(it?.quantity ?? 1)}</span>
                                  </div>
                                  <div className="font-semibold text-gray-900">{formatMoney(toNumber(it?.line_total))}</div>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-6">
              <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5">
                <div className="text-sm font-bold text-gray-900">Resumen</div>
                <div className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-gray-600">Total</div>
                    <div className="font-extrabold text-gray-900">{formatMoney(amount)}</div>
                  </div>
                  <div className="text-xs text-gray-600">
                    Si tu pago tarda en reflejarse, el admin lo validará usando tu referencia.
                  </div>
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}

