'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type NavItem = { label: string; href: string; tone?: 'pink' | 'neutral' };

function classNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function isAbortAuthError(e: unknown) {
  const name = String((e as any)?.name || '').toLowerCase();
  const msg = String((e as any)?.message || '').toLowerCase();
  return name.includes('abort') || msg.includes('abort');
}

export function AdminTopMenu() {
  const pathname = usePathname() || '/admin';
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => setMounted(true), []);

  function displayNameFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown>; id?: string }): string {
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    const full = meta?.full_name ?? meta?.name;
    if (typeof full === 'string' && full.trim()) return full.trim();
    const email = user?.email?.trim();
    if (email) return email;
    const id = user?.id ?? '';
    return id ? `${id.slice(0, 8)}…` : 'Admin';
  }

  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;

    const boot = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!userData.user) {
          setIsAdmin(false);
          setUserDisplayName(null);
          return;
        }
        const { data: adminRow, error: adminErr } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', userData.user.id)
          .maybeSingle();

        console.log('[ADMIN TOP MENU] Verificación de admin:', {
          userId: userData.user.id,
          email: userData.user.email,
          adminRow,
          error: adminErr,
          isAdmin: Boolean(adminRow),
        });

        if (adminErr) {
          console.error('[ADMIN TOP MENU] Error al verificar admin:', adminErr);
        }

        if (!cancelled) {
          setIsAdmin(Boolean(adminRow));
          setUserDisplayName(displayNameFromUser(userData.user));
        }
      } catch (e: unknown) {
        if (isAbortAuthError(e)) return;
        console.error(e);
        if (!cancelled) {
          setIsAdmin(false);
          setUserDisplayName(null);
        }
      }
    };

    void boot();
    const { data: sub } = supabase.auth.onAuthStateChange(() => void boot());
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    if (!pathname.startsWith('/admin')) return;
    if (!isAdmin) return;

    let cancelled = false;
    let timer: any = null;

    const loadUnread = async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          if (!cancelled) setUnreadCount(0);
          return;
        }
        const res = await fetch(`/api/notifications/list?limit=1&t=${Date.now()}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'No se pudieron cargar notificaciones.');
        const c = Number(json?.unread_count ?? 0) || 0;
        if (!cancelled) setUnreadCount(c);
      } catch {
        if (!cancelled) setUnreadCount(0);
      }
    };

    void loadUnread();
    timer = setInterval(() => void loadUnread(), 25000);
    
    // Escuchar eventos de actualización de notificaciones desde otras páginas
    const handleNotificationsUpdated = () => {
      console.log('[AdminTopMenu] Evento de actualización recibido, forzando refresh...');
      void loadUnread();
    };
    
    window.addEventListener('notifications-updated', handleNotificationsUpdated);
    
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      window.removeEventListener('notifications-updated', handleNotificationsUpdated);
    };
  }, [isAdmin, mounted, pathname]);

  useEffect(() => {
    if (!mounted) return;
    const onDown = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      if (el.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [mounted]);

  const items = useMemo<NavItem[]>(
    () => [
      // === DASHBOARD Y ANÁLISIS ===
      { label: 'Inicio', href: '/admin', tone: 'pink' },
      { label: 'Métricas', href: '/admin/metricas' },
      { label: 'Supervisión', href: '/admin/supervision' },

      // === OPERACIONES ===
      { label: 'Pagos', href: '/admin/pagos' },
      { label: 'PocketCash', href: '/admin/pocketcash' },
      { label: 'Retiros', href: '/admin/retiros' },
      { label: 'Logística', href: '/admin/logistica' },
      { label: 'Disputas', href: '/admin/disputas' },
      { label: 'Devoluciones', href: '/admin/devoluciones' },
      { label: 'Soporte', href: '/admin/soporte' },

      // === CONTENIDO Y USUARIOS ===
      { label: 'Usuarios', href: '/admin/usuarios' },
      { label: 'Publicaciones', href: '/admin/listings' },
      { label: 'Tienda Estafeta', href: '/admin/estafeta' },

      // === MARKETING Y COMUNICACIÓN ===
      { label: 'Banners', href: '/admin/banners' },
      { label: 'Avisos', href: '/admin/avisos' },
      { label: 'Mensajes Flotantes', href: '/admin/mensajes-flotantes' },
      { label: 'Publicidad', href: '/admin/publicidad' },
      { label: 'Correo', href: '/admin/correo' },

      // === CONFIGURACIÓN ===
      { label: 'Plantillas', href: '/admin/plantillas' },
      { label: 'Negocio', href: '/admin/negocio' },
      { label: 'Configuración', href: '/admin/settings' },
    ],
    [],
  );

  const currentLabel = useMemo(() => {
    const found = items.find((it) => pathname === it.href);
    if (found) return found.label;
    if (pathname.startsWith('/admin')) return 'Panel Admin';
    return 'Admin';
  }, [items, pathname]);

  if (!mounted) return null;
  if (!pathname.startsWith('/admin')) return null;
  if (!isAdmin) return null;

  const hasAlerts = unreadCount > 0;

  return (
    <div className="sticky top-0 z-[80] border-b border-black/5 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/admin" className="flex items-center gap-3 hover:opacity-95">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 bg-white -mt-1">
            {logoError ? (
              <div className="flex h-full w-full items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 text-white">
                <span className="text-xl font-black">GP</span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/logo.png"
                alt="GoPocket"
                className="h-full w-full object-contain p-1.5"
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-gray-900">Panel Admin</div>
            <div className="text-xs text-gray-500">{currentLabel}</div>
          </div>
        </Link>

        <div className="flex items-center gap-3">
          {userDisplayName ? (
            <span className="hidden text-right text-[12px] text-gray-600 sm:block" title="Conectado como">
              Conectado como <span className="font-semibold text-gray-900">{userDisplayName}</span>
            </span>
          ) : null}

          <div ref={wrapRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-[13px] font-extrabold text-gray-900 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
            aria-haspopup="menu"
            aria-expanded={open}
          >
            Menú Admin
            <span className="text-xs text-gray-500">{open ? '▲' : '▼'}</span>
          </button>

          {open ? (
            <div role="menu" className="absolute right-0 mt-2 w-[260px] rounded-3xl bg-white p-2 shadow-2xl ring-1 ring-black/10">
              {userDisplayName ? (
                <div className="mb-2 rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-600 ring-1 ring-black/5">
                  Conectado como <span className="font-semibold text-gray-900">{userDisplayName}</span>
                </div>
              ) : null}
              <div className="px-2 pb-2 text-[11px] font-semibold text-gray-500">Navegación</div>
              <div className="max-h-[70vh] overflow-auto pr-1">
                <div className="grid gap-2">
                  <Link
                    href="/?view=user"
                    onClick={() => {
                      setOpen(false);
                      // Guardar preferencia en localStorage
                      try {
                        window.localStorage.setItem('admin_view_as_user', 'true');
                      } catch {
                        // noop
                      }
                    }}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-2 text-left text-[13px] font-semibold text-blue-700 shadow-sm transition hover:opacity-90"
                    title="Ver la aplicación como usuario normal"
                  >
                    <span className="truncate">👤 Ver como usuario</span>
                    <span className="text-xs font-bold text-blue-400">→</span>
                  </Link>
                  {items.map((it) => {
                    const active = pathname === it.href;
                    const tone = it.tone ?? 'neutral';
                    const base =
                      'flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 text-left text-[13px] font-semibold shadow-sm transition';
                    const styles =
                      tone === 'pink'
                        ? 'border-pink-200 bg-pink-50 text-brand-pink hover:opacity-90'
                        : 'border-black/5 bg-white text-gray-900 hover:bg-gray-50';
                    const activeStyles = active ? 'ring-2 ring-brand-pink border-transparent' : '';
                    return (
                      <Link
                        key={it.href}
                        href={it.href}
                        onClick={() => setOpen(false)}
                        className={classNames(base, styles, activeStyles)}
                      >
                        <span className="truncate">{it.label}</span>
                        <span className="text-xs font-bold text-gray-400">→</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

