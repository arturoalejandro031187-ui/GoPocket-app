'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  ts: number;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

type FAQ = {
  title: string;
  keywords: string[];
  answer: string;
};

const FAQS: FAQ[] = [
  {
    title: '¿Cómo comprar?',
    keywords: ['comprar', 'checkout', 'pagar', 'mercadopago', 'oxxo', 'deposito', 'transferencia'],
    answer:
      'Para comprar: agrega al carrito → entra a “Carrito” → “Ir a pagar”. En “Checkout” puedes aplicar cupón y elegir método (MercadoPago o métodos offline si están habilitados).',
  },
  {
    title: '¿Cómo usar cupones?',
    keywords: ['cupon', 'cupón', 'codigo', 'descuento', 'aplicar cupon'],
    answer:
      'Puedes escribir tu cupón en “Carrito” o en “Checkout” y dar clic en “Aplicar”. El sistema valida que el cupón esté activo y que aplique a publicaciones del carrito (cupones ligados a publicaciones).',
  },
  {
    title: 'Envío gratis',
    keywords: ['envio gratis', 'envío gratis', 'free shipping', 'envio', 'shipping'],
    answer:
      'Al publicar, el vendedor puede activar “Ofrecer envío gratis”. En ese caso el comprador verá envío $0 para esos artículos. El costo del envío se descuenta de la venta del vendedor (hasta el tope configurado).',
  },
  {
    title: 'Subastas',
    keywords: ['subasta', 'puja', 'pujar', 'ganando', 'tiempo restante'],
    answer:
      'En subastas, los usuarios pujan y gana la mayor oferta. Si ya eres el mayor postor, no puedes pujar otra vez hasta que alguien te supere. Las subastas se ordenan por la hora en que terminan en “Subastas”.',
  },
  {
    title: 'Publicar artículos',
    keywords: ['publicar', 'vender', 'subir', 'fotos', 'imagenes', 'imágenes', 'sell'],
    answer:
      'Para publicar: entra a “Vender”, sube 2–6 fotos, llena título, descripción, categoría, talla, color y precio. También puedes marcar “Destacar” ($25) o convertirlo a subasta.',
  },
  {
    title: 'Publicar similar',
    keywords: ['publicar similar', 'copia', 'clonar', 'precargada', 'borrador'],
    answer:
      '“Publicar similar” crea un borrador con datos precargados para que puedas cambiar fotos, talla, categoría y tipo (venta/subasta) antes de publicar.',
  },
  {
    title: 'Verificación (INE)',
    keywords: ['ine', 'verificacion', 'verificación', 'documentos', 'subir ine'],
    answer:
      'Si vendes, puedes necesitar verificación con INE (frente y reverso). Sube tus documentos y al completar se te redirige al dashboard.',
  },
  {
    title: 'Preguntas al vendedor',
    keywords: ['preguntas', 'preguntar', 'vendedor', 'responder'],
    answer:
      'Cada publicación tiene un apartado de preguntas (visible para todos). Solo usuarios con sesión pueden preguntar (el vendedor no puede preguntarse). El vendedor responde desde “Dashboard → Preguntas”.',
  },
  {
    title: 'Compra protegida',
    keywords: ['compra protegida', 'protegida', 'seguridad', 'retenemos', 'retencion', 'retención'],
    answer:
      '“Compra protegida” explica el flujo: el pago queda retenido mientras el envío está en camino y se libera al vendedor cuando se confirma la entrega.',
  },
];

function scoreFAQ(q: string, faq: FAQ) {
  const n = norm(q);
  let score = 0;
  for (const k of faq.keywords) {
    const kk = norm(k);
    if (!kk) continue;
    if (n.includes(kk)) score += kk.length >= 6 ? 3 : 2;
  }
  // bonus si menciona la palabra del título
  const title = norm(faq.title);
  if (title && n.includes(title.split(' ')[0])) score += 1;
  return score;
}

function getReply(userText: string) {
  const n = norm(userText);
  if (!n) {
    return 'Cuéntame qué necesitas y te ayudo. Por ejemplo: “¿Cómo aplico un cupón?” o “¿Cómo publico una subasta?”';
  }

  // Respuestas rápidas “inteligentes”
  if (n === 'hola' || n.startsWith('hola ') || n.includes('buenas')) {
    return 'Hola, soy GoPocketsito IA. ¿En qué puedo ayudarte hoy?';
  }
  if (n.includes('soporte') || n.includes('humano') || n.includes('asesor')) {
    return 'Si necesitas soporte humano: entra a “Ayuda” o escríbenos desde el Dashboard. Si quieres, dime el problema y lo intentamos resolver aquí primero.';
  }

  let best: { faq: FAQ; score: number } | null = null;
  for (const faq of FAQS) {
    const s = scoreFAQ(userText, faq);
    if (!best || s > best.score) best = { faq, score: s };
  }

  if (!best || best.score <= 0) {
    return (
      'Te puedo ayudar con: comprar, cupones, envío gratis, subastas, publicar, publicar similar, verificación INE, preguntas al vendedor y compra protegida.\n\n' +
      'Dime tu duda con un poco más de detalle.'
    );
  }

  return best.faq.answer;
}

export function SupportBot() {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>(() => [
    {
      id: uid(),
      role: 'assistant',
      text: 'Hola, soy GoPocketsito IA.\n¿En qué puedo ayudarte hoy?',
      ts: Date.now(),
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('pocket_support_bot_state');
      if (!saved) return;
      const parsed = JSON.parse(saved) as { open?: boolean; minimized?: boolean; messages?: Msg[] };
      if (typeof parsed.open === 'boolean') setOpen(parsed.open);
      if (typeof parsed.minimized === 'boolean') setMinimized(parsed.minimized);
      if (Array.isArray(parsed.messages) && parsed.messages.length > 0) setMessages(parsed.messages);
    } catch {
      // noop
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem('pocket_support_bot_state', JSON.stringify({ open, minimized, messages }));
    } catch {
      // noop
    }
  }, [open, minimized, messages]);

  useEffect(() => {
    if (!open || minimized) return;
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [open, minimized, messages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    const userMsg: Msg = { id: uid(), role: 'user', text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    // Simular “pensando”
    const replyText = getReply(text);
    const botMsg: Msg = { id: uid(), role: 'assistant', text: replyText, ts: Date.now() + 1 };
    setTimeout(() => setMessages((prev) => [...prev, botMsg]), 350);
  };

  const hasUnreadHint = useMemo(() => {
    // badge simple cuando está cerrado
    return !open;
  }, [open]);

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setMinimized(false);
          }}
          className="group relative flex items-center gap-3 rounded-full bg-brand-pink px-4 py-3 text-sm font-extrabold text-white shadow-xl hover:opacity-95"
          aria-label="Abrir soporte Pocketsito IA"
        >
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/20">
            IA
          </span>
          <span className="hidden sm:block">GoPocketsito IA</span>
          {hasUnreadHint ? (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-white ring-2 ring-brand-pink" />
          ) : null}
        </button>
      ) : (
        <div className="w-[330px] overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/10 sm:w-[380px]">
          <div className="flex items-center justify-between bg-gradient-to-r from-brand-pink to-liverpool-700 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
                IA
              </div>
              <div className="leading-tight">
                <div className="text-sm font-extrabold">Pocketsito IA</div>
                <div className="text-[11px] font-semibold text-white/85">Soporte y preguntas frecuentes</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMinimized((v) => !v)}
                className="rounded-xl bg-white/15 px-3 py-2 text-xs font-bold ring-1 ring-white/20 hover:bg-white/20"
              >
                {minimized ? 'Abrir' : 'Minimizar'}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-white/15 px-3 py-2 text-xs font-bold ring-1 ring-white/20 hover:bg-white/20"
              >
                Cerrar
              </button>
            </div>
          </div>

          {minimized ? (
            <div className="p-4">
              <div className="text-sm font-semibold text-gray-900">¿En qué te ayudo hoy?</div>
              <div className="mt-2 text-xs text-gray-600">
                Tip: pregunta por <span className="font-semibold">cupones</span>, <span className="font-semibold">envío gratis</span> o{' '}
                <span className="font-semibold">subastas</span>.
              </div>
            </div>
          ) : (
            <>
              <div ref={listRef} className="max-h-[420px] overflow-auto px-4 py-4">
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                      <div
                        className={
                          m.role === 'user'
                            ? 'max-w-[85%] rounded-2xl bg-brand-pink px-4 py-3 text-sm text-white shadow-sm'
                            : 'max-w-[85%] rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-900 ring-1 ring-black/5'
                        }
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-2xl border border-black/5 bg-white p-3 text-xs text-gray-600">
                  <div className="font-semibold text-gray-900">Atajos</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {['Cupones', 'Envío gratis', 'Subastas', 'Publicar', 'Compra protegida'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setInput(t)}
                        className="rounded-full bg-gray-100 px-3 py-1 font-semibold text-gray-800 hover:bg-gray-200"
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="mt-3">
                    ¿Necesitas más ayuda? Visita{' '}
                    <Link href="/dashboard/ayuda" className="font-semibold text-brand-pink hover:opacity-90">
                      Ayuda
                    </Link>
                    .
                  </div>
                </div>
              </div>

              <div className="border-t border-black/5 p-3">
                <div className="flex gap-2">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                    placeholder="Escribe tu pregunta…"
                    className="w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  />
                  <button
                    type="button"
                    onClick={() => void send()}
                    disabled={!input.trim()}
                    className="rounded-2xl bg-gray-900 px-4 py-3 text-sm font-extrabold text-white hover:bg-black disabled:opacity-60"
                  >
                    Enviar
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-gray-500">GoPocketsito IA responde preguntas frecuentes de GoPocket.</div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

