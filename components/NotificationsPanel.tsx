'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { getNotificationLink } from '@/lib/notifications/getNotificationLink';

// Este componente muestra las notificaciones en el dashboard principal
// Aparece después de las tarjetas de "Operaciones recientes" y "Documentos Subidos"

type Notification = {
  id: string;
  title?: string | null;
  body?: string | null;
  type?: string | null;
  is_read?: boolean | null;
  created_at?: string | null;
  data?: any;
  kind?: string | null;
};

function formatDateTime(input: string | null | undefined) {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours} h`;
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function NotificationsPanel() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const loadNotifications = useCallback(async (uid: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        setError('No hay sesión activa');
        return;
      }

      const res = await fetch(`/api/notifications/list?limit=20&_t=${Date.now()}`, {
        method: 'GET',
        headers: { authorization: `Bearer ${token}` },
        cache: 'no-store',
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'No se pudieron cargar las notificaciones');
      }

      const rows = (json?.rows ?? []) as Notification[];
      
      console.log('[NotificationsPanel] Notificaciones recibidas del API:', {
        total: rows.length,
        rows: rows.map((n) => ({
          id: n.id,
          title: n.title,
          kind: String((n?.data?.kind ?? n?.type ?? n?.kind) ?? '').trim().toLowerCase(),
          is_read: n.is_read,
          created_at: n.created_at,
        })),
      });
      
      // Filtrar solo notificaciones relevantes NO LEÍDAS
      const relevant = rows
        .filter((n) => {
          // Solo mostrar notificaciones no leídas
          const isUnread = n.is_read === false;
          if (!isUnread) return false;
          
          const kind = String((n?.data?.kind ?? n?.type ?? n?.kind) ?? '').trim().toLowerCase();
          const relevantKinds = [
            'new_sale',
            'sale_paid',
            'payment_approved',
            'payment_rejected',
            'order_shipped',
            'order_completed',
            'listing_question', // Preguntas nuevas para el vendedor
            'listing_answer', // Respuestas para el comprador
            'support_message',
            'support_reply',
            'support_new_message',
            'outbid', // Te ganaron una puja
            'rating_received', // Calificación recibida
            'ratings_complete', // Calificaciones completadas
            'bid_received', // Puja recibida
            'auction_ended', // Subasta finalizada
            'order_message', // Mensaje en orden
            'order_status', // Cambio de estado de orden
            'dispute_opened', // Disputa abierta
            'dispute_message', // Mensaje en disputa
            'dispute_resolved', // Disputa resuelta
            'admin_announcement', // Anuncios del administrador
          ];
          const isRelevant = relevantKinds.includes(kind);
          return isRelevant;
        })
        .slice(0, 10); // Máximo 10 notificaciones

      console.log('[NotificationsPanel] Notificaciones filtradas:', {
        relevant: relevant.length,
        relevantList: relevant.map((n) => ({
          id: n.id,
          title: n.title,
          kind: String((n?.data?.kind ?? n?.type ?? n?.kind) ?? '').trim().toLowerCase(),
          is_read: n.is_read,
        })),
      });

      setNotifications(relevant);
    } catch (err) {
      console.error('[NotificationsPanel] Error:', err);
      setError(err instanceof Error ? err.message : 'Error al cargar notificaciones');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const uid = userData.user.id;
          setUserId(uid);
          console.log('[NotificationsPanel] Iniciando carga de notificaciones para usuario:', uid);
          await loadNotifications(uid);
        } else {
          console.warn('[NotificationsPanel] No hay usuario autenticado');
        }
      } catch (err) {
        console.error('[NotificationsPanel] Boot error:', err);
      }
    };

    void boot();
  }, [loadNotifications]);

  useEffect(() => {
    if (!userId) return;

    // Suscripción a cambios en tiempo real
    const channel = supabase
      .channel(`notifications-panel-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void loadNotifications(userId);
        }
      )
      .subscribe();

    // Polling cada 10 segundos como respaldo
    const interval = setInterval(() => {
      void loadNotifications(userId);
    }, 10000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [userId, loadNotifications]);

  const handleNotificationClick = async (notification: Notification) => {
    const link = getNotificationLink(notification);

    // Marcar como leída (no eliminar, solo marcar como leída)
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (token) {
        // Actualización optimista: remover de la lista inmediatamente
        setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
        
        // Marcar como leída en el servidor (no esperar respuesta para mejor UX)
        fetch('/api/notifications/mark-read', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
          body: JSON.stringify({ ids: [notification.id] }),
        }).catch((err) => {
          console.error('[NotificationsPanel] Error al marcar como leída:', err);
          // Si falla, recargar las notificaciones para restaurar el estado
          if (userId) {
            void loadNotifications(userId);
          }
        });
      }
    } catch (err) {
      console.error('[NotificationsPanel] Error al marcar como leída:', err);
    }

    // Redirigir
    if (link) {
      window.location.href = link;
    }
  };

  const getNotificationIcon = (notification: Notification) => {
    const kind = String((notification?.data?.kind ?? notification?.type ?? notification?.kind) ?? '').trim().toLowerCase();
    
    if (kind === 'new_sale' || kind === 'sale_paid') {
      return '💰';
    }
    if (kind === 'payment_approved' || kind === 'order_completed') {
      return '✅';
    }
    if (kind === 'payment_rejected') {
      return '⚠️';
    }
    if (kind === 'order_shipped') {
      return '📦';
    }
    if (kind === 'listing_question' || kind === 'listing_answer') {
      return '💬';
    }
    if (kind === 'support_message' || kind === 'support_reply') {
      return '🆘';
    }
    return '🔔';
  };

  const getNotificationColor = (notification: Notification) => {
    const kind = String((notification?.data?.kind ?? notification?.type ?? notification?.kind) ?? '').trim().toLowerCase();
    
    if (kind === 'new_sale' || kind === 'sale_paid') {
      return 'bg-green-50 border-green-200 hover:bg-green-100';
    }
    if (kind === 'payment_approved' || kind === 'order_completed') {
      return 'bg-blue-50 border-blue-200 hover:bg-blue-100';
    }
    if (kind === 'payment_rejected') {
      return 'bg-red-50 border-red-200 hover:bg-red-100';
    }
    if (kind === 'order_shipped') {
      return 'bg-purple-50 border-purple-200 hover:bg-purple-100';
    }
    return 'bg-pink-50 border-pink-200 hover:bg-pink-100';
  };

  if (isLoading) {
    return (
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        <div className="text-sm text-gray-600">Cargando notificaciones...</div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      </section>
    );
  }

  // Mostrar siempre el panel, incluso si no hay notificaciones (para que el usuario sepa dónde aparecerán)
  // if (notifications.length === 0) {
  //   return null; // No mostrar nada si no hay notificaciones
  // }

  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 border-2 border-brand-pink/20">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span className="text-2xl">🔔</span>
            Notificaciones Recientes
          </h2>
          <p className="mt-1 text-sm text-gray-600">Tus compras, ventas y mensajes importantes aparecerán aquí</p>
        </div>
        {notifications.length > 0 && (
          <span className="rounded-full bg-brand-pink px-3 py-1 text-xs font-bold text-white">
            {notifications.length} nueva{notifications.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-6 text-center">
          <div className="text-sm text-gray-600">No tienes notificaciones nuevas</div>
          <div className="mt-1 text-xs text-gray-500">Las notificaciones de compras, ventas y mensajes aparecerán aquí</div>
          <div className="mt-3 text-xs text-gray-400">
            💡 Abre la consola del navegador (F12) para ver logs de depuración
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
          const link = getNotificationLink(notification);
          const icon = getNotificationIcon(notification);
          const colorClass = getNotificationColor(notification);

          return (
            <button
              key={notification.id}
              type="button"
              onClick={() => handleNotificationClick(notification)}
              className={`w-full rounded-2xl border-2 px-4 py-3 text-left transition-colors ${colorClass}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-bold text-gray-900">{notification.title || 'Notificación'}</div>
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-extrabold text-brand-pink ring-1 ring-pink-100">
                      Nuevo
                    </span>
                  </div>
                  {notification.body && (
                    <div className="mt-1 text-sm text-gray-700 line-clamp-2">{notification.body}</div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">{formatDateTime(notification.created_at)}</span>
                    {link && (
                      <span className="text-xs font-semibold text-brand-pink">Ver detalle →</span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        </div>
      )}
    </section>
  );
}
