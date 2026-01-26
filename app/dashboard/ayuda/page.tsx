'use client';

import Link from 'next/link';
import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type Section = {
  id: string;
  title: string;
  icon: string;
  content: React.ReactNode;
};

export default function DashboardAyudaPage() {
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const startSupportChat = async () => {
    setStartError(null);
    setIsStarting(true);
    try {
      const { data: sess, error: sErr } = await supabase.auth.getSession();
      if (sErr) throw sErr;
      const token = sess.session?.access_token;
      if (!token) {
        window.location.href = '/login?returnTo=/dashboard/ayuda';
        return;
      }

      const listRes = await fetch(`/api/support/conversations?t=${Date.now()}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      const listJson = await listRes.json().catch(() => ({} as any));
      if (listRes.ok) {
        const convs = (listJson?.conversations ?? []) as any[];
        const open = convs.find((c) => String(c?.status || '').toLowerCase() === 'open');
        const openId = String(open?.id || '').trim();
        if (openId) {
          window.location.href = `/dashboard/soporte/${openId}`;
          return;
        }
      }

      const createRes = await fetch('/api/support/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        cache: 'no-store',
        body: JSON.stringify({ subject: 'Ayuda · Iniciar chat con soporte' }),
      });
      const createJson = await createRes.json().catch(() => ({} as any));
      if (!createRes.ok) throw new Error(createJson?.error || 'No se pudo iniciar el chat de soporte.');
      const id = String(createJson?.conversation?.id || '').trim();
      if (!id) throw new Error('No se recibió conversationId.');
      window.location.href = `/dashboard/soporte/${id}`;
    } catch (e: unknown) {
      console.error(e);
      setStartError(e instanceof Error ? e.message : 'No se pudo iniciar el chat de soporte.');
    } finally {
      setIsStarting(false);
    }
  };

  const toggleSection = (id: string) => {
    setExpandedSection(expandedSection === id ? null : id);
  };

  const sections: Section[] = [
    {
      id: 'inicio',
      title: '1. Inicio y Exploración',
      icon: '🏠',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Explorar productos</h3>
            <p className="mt-1 text-gray-600">
              En la página principal encontrarás productos destacados y puedes usar el buscador para encontrar artículos específicos.
            </p>
            <div className="mt-2 rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
              <strong>💡 Tip:</strong> Usa filtros por categoría, precio y condición para encontrar exactamente lo que buscas.
            </div>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Página principal con productos destacados]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Ver detalles de un producto</h3>
            <p className="mt-1 text-gray-600">
              Haz clic en cualquier producto para ver fotos, descripción, precio, información del vendedor y hacer preguntas.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Página de detalle de producto]</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'vender',
      title: '2. Publicar y Vender',
      icon: '💰',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Crear una publicación</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Ve a <strong>Vender</strong> en el menú superior</li>
              <li>Sube entre 2 y 6 fotos del producto (mínimo 2 obligatorias)</li>
              <li>Completa la información: título, descripción, precio, categoría, condición, género, talla, color</li>
              <li>Elige el tipo de venta: <strong>Precio fijo</strong> o <strong>Subasta</strong></li>
              <li>Si es subasta, define fecha/hora de inicio y fin, precio inicial e incremento mínimo</li>
              <li>Revisa y publica</li>
            </ol>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Formulario de publicación]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Gestionar tus publicaciones</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Mis publicaciones</strong> puedes ver todas tus publicaciones activas, pausarlas, editarlas o eliminarlas.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Lista de publicaciones del vendedor]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Cupones de descuento</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Cupones</strong> puedes crear códigos de descuento para tus productos. Define el tipo (porcentaje o monto fijo), valor, fechas de vigencia y límite de usos.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Panel de cupones]</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'comprar',
      title: '3. Comprar Productos',
      icon: '🛒',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Agregar al carrito</h3>
            <p className="mt-1 text-gray-600">
              En la página del producto, selecciona cantidad, color y talla (si aplica), luego haz clic en <strong>Agregar al carrito</strong>.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Botón agregar al carrito]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Proceso de compra</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Ve a <strong>Carrito</strong> y revisa tus artículos</li>
              <li>Haz clic en <strong>Proceder al pago</strong></li>
              <li>Elige método de pago: Mercado Pago (tarjeta), transferencia bancaria, depósito o OXXO</li>
              <li>Completa el pago según el método elegido</li>
              <li>Recibirás confirmación y podrás dar seguimiento en <strong>Compras</strong></li>
            </ol>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Proceso de checkout]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Hacer preguntas al vendedor</h3>
            <p className="mt-1 text-gray-600">
              En la página del producto, desplázate hasta la sección <strong>Preguntas y respuestas</strong>, escribe tu pregunta y envía. El vendedor recibirá una notificación y podrás ver la respuesta en <strong>Respuestas</strong>.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Sección de preguntas en producto]</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'subastas',
      title: '4. Subastas',
      icon: '🔨',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Participar en una subasta</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Encuentra un producto en subasta (marcado con etiqueta &ldquo;Subasta&rdquo;)</li>
              <li>Revisa la puja actual y el tiempo restante</li>
              <li>Haz clic en <strong>Pujar</strong> e ingresa tu oferta (debe ser mayor al incremento mínimo)</li>
              <li>Si alguien puja más, recibirás una notificación</li>
              <li>Al terminar la subasta, el ganador recibirá instrucciones para pagar</li>
            </ol>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Página de subasta con contador]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Seguir subastas</h3>
            <p className="mt-1 text-gray-600">
              Agrega subastas a <strong>Favoritos</strong> para recibir alertas cuando estén por terminar. El punto rosa en el menú te avisará.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'ventas',
      title: '5. Gestionar Ventas (Vendedor)',
      icon: '📦',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Ver tus ventas</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Ventas</strong> verás todas tus órdenes. Cada orden muestra: estado, comprador, artículos, total y acciones disponibles.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Panel de ventas con órdenes]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Proceso de envío</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Cuando recibas una orden <strong>Pagada</strong>, prepara el producto</li>
              <li>Descarga la guía de envío (botón <strong>Descargar guía</strong>)</li>
              <li>Tienes 72 horas para descargar la guía y registrar el envío</li>
              <li>Empaqueta el producto y adjunta la guía</li>
              <li>En <strong>Ventas</strong>, marca la orden como <strong>Enviado</strong> e ingresa el número de rastreo</li>
              <li>El comprador recibirá una notificación</li>
            </ol>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Botón descargar guía y marcar como enviado]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Responder preguntas</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Preguntas</strong> verás las preguntas que te hacen sobre tus productos. Responde de forma clara y amable. El comprador recibirá una notificación.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Panel de preguntas recibidas]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Calificar al comprador</h3>
            <p className="mt-1 text-gray-600">
              Una vez que el comprador confirme recepción, podrás calificarlo (1-10 estrellas) y dejar un comentario. Esto ayuda a construir confianza en la plataforma.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'compras',
      title: '6. Seguimiento de Compras',
      icon: '📥',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Ver estado de tus compras</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Compras</strong> verás todas tus órdenes con su estado: Pendiente de pago, Pagado, Enviado, Entregado, Completado.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Panel de compras con estados]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Confirmar recepción</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Cuando recibas el producto, ve a <strong>Compras</strong></li>
              <li>Busca la orden con estado <strong>Enviado</strong></li>
              <li>Haz clic en <strong>Confirmar recepción</strong></li>
              <li>Califica al vendedor (1-10 estrellas) y opcionalmente deja un comentario</li>
              <li>Al confirmar, el dinero se libera al vendedor y ambos pueden ver las calificaciones</li>
            </ol>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Botón confirmar recepción y calificar]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Chat con vendedor</h3>
            <p className="mt-1 text-gray-600">
              Puedes chatear con el vendedor desde la orden para coordinar detalles del envío o resolver dudas. El chat aparece como un botón flotante en la orden.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'pagos',
      title: '7. Pagos y Retiros (Vendedor)',
      icon: '💳',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Panel de pagos</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Pagos</strong> verás un resumen de tus ventas, dinero liberado y por liberar. El dinero se libera cuando el comprador confirma recepción.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Panel de pagos con resumen]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Configurar cuenta de Mercado Pago</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Ve a <strong>Mi perfil</strong> → <strong>Datos de cobro</strong></li>
              <li>En <strong>Cuenta Mercado Pago</strong>, ingresa tu email o ID de cuenta de Mercado Pago</li>
              <li>Guarda los cambios</li>
            </ol>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Formulario de datos de cobro]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Retirar dinero</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Ve a <strong>Pagos</strong></li>
              <li>Verifica que tengas <strong>Saldo liberado</strong> (dinero de órdenes donde el comprador confirmó recepción)</li>
              <li>Haz clic en <strong>Retirar a Mercado Pago</strong></li>
              <li>El dinero se transferirá automáticamente a tu cuenta de Mercado Pago</li>
              <li>Recibirás confirmación cuando se complete la transferencia</li>
            </ol>
            <div className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
              <strong>⚠️ Importante:</strong> El dinero se libera cuando el comprador confirma recepción. Si hay disputas abiertas, ese dinero se retiene hasta que se resuelvan.
            </div>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Botón Retirar a Mercado Pago]</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'disputas',
      title: '8. Disputas y Devoluciones',
      icon: '⚖️',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Abrir una disputa (Comprador)</h3>
            <ol className="mt-2 ml-4 list-decimal space-y-2 text-gray-600">
              <li>Ve a <strong>Compras</strong> y encuentra la orden con estado <strong>Enviado</strong></li>
              <li>Haz clic en <strong>Abrir disputa</strong></li>
              <li>Selecciona el motivo (No recibido, No es como se describía, etc.) y describe el problema</li>
              <li>Opcionalmente adjunta fotos o documentos como evidencia</li>
              <li>Se abrirá un chat con el vendedor y soporte técnico</li>
            </ol>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Botón abrir disputa y formulario]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Resolver una disputa</h3>
            <p className="mt-1 text-gray-600">
              Tienes 72 horas para resolver la disputa directamente con el comprador o vendedor. Puedes chatear en el panel de la disputa. Si no se resuelve, soporte técnico intervendrá y tomará una decisión.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Chat de disputa con countdown de 72h]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Resolución de soporte técnico</h3>
            <p className="mt-1 text-gray-600">
              Cuando soporte técnico resuelve la disputa, recibirás una notificación con la decisión. La disputa se cierra y se ejecuta la decisión (reembolso, liberación de pago, etc.). Ya no podrás enviar más mensajes en la disputa resuelta.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Disputa resuelta con banner verde]</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'notificaciones',
      title: '9. Notificaciones y Alertas',
      icon: '🔔',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Punto rosa de alertas</h3>
            <p className="mt-1 text-gray-600">
              El punto rosa en el menú superior parpadea cuando tienes alertas nuevas. Haz clic para ver un resumen.
            </p>
            <div className="mt-2 rounded-xl bg-pink-50 p-3 text-xs text-gray-700">
              <strong>Alertas que activan el punto:</strong>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li>Nuevas ventas</li>
                <li>Respuestas a tus preguntas</li>
                <li>Preguntas en tus publicaciones</li>
                <li>Calificaciones recibidas</li>
                <li>Pujas perdidas en subastas</li>
                <li>Subastas favoritas por terminar</li>
                <li>Mensajes de soporte</li>
                <li>Disputas resueltas</li>
              </ul>
            </div>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Menú con punto rosa parpadeando]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Ver todas las notificaciones</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Notificaciones</strong> verás el historial completo. Puedes marcar como leídas o eliminarlas.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'perfil',
      title: '10. Mi Perfil',
      icon: '👤',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Editar perfil</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Mi perfil</strong> puedes actualizar tu nombre, teléfono, dirección de envío y datos de cobro.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Formulario de perfil]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Verificación con INE</h3>
            <p className="mt-1 text-gray-600">
              Si vendes productos, es posible que necesites verificación. Sube fotos del frente y reverso de tu INE en <strong>Subir INE</strong>. Una vez aprobada, podrás vender sin restricciones.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Formulario de subida de INE]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Datos de cobro</h3>
            <p className="mt-1 text-gray-600">
              Configura tu cuenta de Mercado Pago (email o ID) para recibir retiros automáticos. También puedes agregar datos bancarios para otros métodos de pago.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'favoritos',
      title: '11. Favoritos',
      icon: '⭐',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Agregar a favoritos</h3>
            <p className="mt-1 text-gray-600">
              En cualquier producto, haz clic en el ícono de estrella para agregarlo a favoritos. Útil para guardar productos que te interesan o seguir subastas.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Botón de favoritos en producto]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Ver tus favoritos</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Favoritos</strong> verás todos los productos guardados. Recibirás alertas cuando subastas favoritas estén por terminar.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'reputacion',
      title: '12. Reputación',
      icon: '⭐',
      content: (
        <div className="space-y-4 text-sm text-gray-700">
          <div>
            <h3 className="font-extrabold text-gray-900">Ver tu reputación</h3>
            <p className="mt-1 text-gray-600">
              En <strong>Reputación</strong> verás todas las calificaciones que has recibido como comprador y vendedor, con comentarios y estrellas.
            </p>
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-xs font-semibold text-gray-500">📸 Captura: [Panel de reputación]</p>
            </div>
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">Cómo mejorar tu reputación</h3>
            <ul className="mt-2 ml-4 list-disc space-y-1 text-gray-600">
              <li>Responde preguntas rápidamente</li>
              <li>Envía productos a tiempo</li>
              <li>Empaqueta bien los productos</li>
              <li>Sé amable en el chat</li>
              <li>Confirma recepción cuando recibas productos</li>
            </ul>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Manual de Usuario</div>
              <div className="text-xs text-gray-500">Guía completa de la plataforma</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link href="/dashboard" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Volver
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <h1 className="text-2xl font-extrabold text-gray-900">Manual de Usuario - GoPocket</h1>
          <p className="mt-2 text-sm text-gray-600">
            Guía completa para usar la plataforma. Navega por las secciones para aprender a comprar, vender y gestionar tus transacciones.
          </p>
        </div>

        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.id} className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{section.icon}</span>
                  <span className="text-base font-extrabold text-gray-900">{section.title}</span>
                </div>
                <span className="text-xl text-gray-400">{expandedSection === section.id ? '▲' : '▼'}</span>
              </button>
              {expandedSection === section.id && <div className="border-t border-black/5 p-5">{section.content}</div>}
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <h2 className="text-lg font-extrabold text-gray-900">Preguntas Frecuentes Rápidas</h2>
          <div className="mt-4 space-y-4 text-sm text-gray-700">
            <div>
              <div className="font-semibold text-gray-900">¿Cuánto tiempo tengo para enviar un producto?</div>
              <div className="mt-1 text-gray-600">Tienes 72 horas desde que descargas la guía de envío para registrar el envío con número de rastreo.</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">¿Cuándo se libera el dinero al vendedor?</div>
              <div className="mt-1 text-gray-600">El dinero se libera automáticamente cuando el comprador confirma recepción del producto.</div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">¿Cómo retiro mi dinero?</div>
              <div className="mt-1 text-gray-600">
                Configura tu cuenta de Mercado Pago en Mi perfil → Datos de cobro, luego ve a Pagos y usa el botón &ldquo;Retirar a Mercado Pago&rdquo;.
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">¿Qué pasa si tengo un problema con mi compra?</div>
              <div className="mt-1 text-gray-600">
                Abre una disputa desde Compras. Tienes 72 horas para resolverla con el vendedor, luego soporte técnico intervendrá.
              </div>
            </div>
            <div>
              <div className="font-semibold text-gray-900">¿Puedo cancelar una compra?</div>
              <div className="mt-1 text-gray-600">
                Depende del estado. Si aún no se ha enviado, contacta al vendedor. Si ya se envió, puedes abrir una disputa.
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-black/5">
          <div className="text-sm font-semibold text-gray-900">¿Necesitas ayuda adicional?</div>
          <div className="mt-1 text-sm text-gray-600">Abre un chat de soporte para que te atendamos personalmente.</div>
          {startError ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{startError}</div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void startSupportChat()}
              disabled={isStarting}
              className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              {isStarting ? 'Iniciando…' : 'Iniciar chat con soporte'}
            </button>
            <Link
              href="/dashboard/soporte"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Ver mis chats
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
