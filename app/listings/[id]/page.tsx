'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { redirectToLogin } from '@/lib/auth/redirect';
import { BlocksRenderer } from '@/components/templates/BlocksRenderer';
import type { TemplateBlock } from '@/lib/templates/blocks';
import { EmojiPicker } from '@/components/EmojiPicker';
import { SellerDisplay } from '@/components/SellerDisplay';

type ListingRow = {
  id: string;
  public_id?: string | null;
  title: string;
  description: string | null;
  description_blocks?: any[] | null;
  price: number | string;
  currency: string;
  images: string[] | null;
  status: 'draft' | 'active' | 'sold' | 'paused' | 'blocked';
  seller_id: string;
  sale_type?: 'direct' | 'auction' | null;
  gender?: 'Mujer' | 'Hombre' | 'Unisex' | null;
  size?: string | null;
  color?: string | null;
  color_variants?: string[] | null;
  size_variants?: string[] | null;
  category?: string | null;
  auction_start_at?: string | null;
  auction_end_at?: string | null;
  auction_bid_increment?: number | string | null;
  auction_highest_bid?: number | string | null;
  auction_highest_bidder_id?: string | null;
  created_at: string;
};

type ListingQuestionRow = {
  id: string;
  listing_id: string;
  seller_id: string;
  asker_id: string;
  question_text: string;
  answer_text: string | null;
  created_at: string;
  answered_at: string | null;
};

type SellerListingRow = {
  id: string;
  public_id?: string | null;
  title: string;
  price: number | string;
  currency: string;
  images: string[] | null;
  status?: string | null;
  created_at?: string | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

function getPrice(row: ListingRow) {
  const p = typeof row.price === 'number' ? row.price : Number(row.price ?? 0);
  return Number.isFinite(p) ? p : 0;
}

// Función auxiliar para normalizar arrays que pueden venir como strings JSON o arrays reales
function normalizeArray(value: any): string[] | null {
  console.log('[normalizeArray] Input:', { value, type: typeof value, isArray: Array.isArray(value) });
  
  if (!value) {
    console.log('[normalizeArray] Value is null/undefined/empty');
    return null;
  }
  
  // Si ya es un array
  if (Array.isArray(value)) {
    const filtered = value.filter((v) => {
      const isValid = typeof v === 'string' && v.trim().length > 0;
      if (!isValid) {
        console.log('[normalizeArray] Filtering out invalid value:', v, typeof v);
      }
      return isValid;
    });
    console.log('[normalizeArray] Array input - filtered:', { originalLength: value.length, filteredLength: filtered.length, filtered });
    return filtered.length > 0 ? filtered : null;
  }
  
  // Si es string, intentar parsear como JSON
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      console.log('[normalizeArray] String is empty after trim');
      return null;
    }
    
    // Intentar parsear como JSON
    try {
      const parsed = JSON.parse(trimmed);
      console.log('[normalizeArray] Parsed JSON:', parsed);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((v: any) => {
          const str = String(v).trim();
          const isValid = str.length > 0;
          if (!isValid) {
            console.log('[normalizeArray] Filtering out invalid parsed value:', v);
          }
          return isValid;
        });
        console.log('[normalizeArray] Parsed array - filtered:', { originalLength: parsed.length, filteredLength: filtered.length, filtered });
        return filtered.length > 0 ? filtered : null;
      }
      // Si es un objeto, intentar extraer valores
      if (typeof parsed === 'object' && parsed !== null) {
        const values = Object.values(parsed).filter((v: any) => String(v).trim().length > 0);
        console.log('[normalizeArray] Extracted from object:', values);
        return values.length > 0 ? values.map(v => String(v).trim()) : null;
      }
    } catch (e) {
      // Si no es JSON válido, tratar como string simple
      console.log('[normalizeArray] Not valid JSON, treating as single string:', trimmed);
      return [trimmed];
    }
  }
  
  // Si es un objeto, intentar extraer valores
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const values = Object.values(value).filter((v: any) => String(v).trim().length > 0);
    console.log('[normalizeArray] Extracted from object:', values);
    return values.length > 0 ? values.map(v => String(v).trim()) : null;
  }
  
  console.log('[normalizeArray] Unknown type, returning null');
  return null;
}

export default function ListingDetailPage() {
  const p = useParams<{ id: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isBidding, setIsBidding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [listing, setListing] = useState<ListingRow | null>(null);
  const [activeImg, setActiveImg] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState<number>(0);
  const [sellerName, setSellerName] = useState<string>('Vendedor');
  const [sellerState, setSellerState] = useState<string | null>(null);
  const [sellerCity, setSellerCity] = useState<string | null>(null);
  const [sellerRatingPercent, setSellerRatingPercent] = useState<number>(100);
  const [sellerBadge, setSellerBadge] = useState<'plata' | 'gold' | 'platinum' | null>(null);
  const [sellerIsVerified, setSellerIsVerified] = useState<boolean>(false);
  const [sellerOperationsCount, setSellerOperationsCount] = useState<number | null>(null);
  const [coupon, setCoupon] = useState<
    | null
    | {
        code: string;
        discount_type: 'percent' | 'fixed';
        discount_value: number;
        estimated_discount: number;
      }
  >(null);
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const [zoomScale, setZoomScale] = useState<1 | 2>(1);
  const [isFav, setIsFav] = useState(false);
  const [isFavLoading, setIsFavLoading] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);

  const [questions, setQuestions] = useState<ListingQuestionRow[]>([]);
  const [questionsError, setQuestionsError] = useState<string | null>(null);
  const [isQuestionsLoading, setIsQuestionsLoading] = useState(false);
  const [questionInput, setQuestionInput] = useState('');
  const [isAsking, setIsAsking] = useState(false);

  const [moreFromSeller, setMoreFromSeller] = useState<SellerListingRow[]>([]);
  const [isMoreLoading, setIsMoreLoading] = useState(false);

  // Cargar viewerId inmediatamente al montar el componente (antes de cargar el listing)
  // Esto previene el delay donde arriba muestra "Hola, usuario" pero abajo pide iniciar sesión
  useEffect(() => {
    let cancelled = false;
    const loadAuth = async () => {
      try {
        // Usar getSession() que es más rápido que getUser() para verificar sesión
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          if (!cancelled) setViewerId(sessionData.session.user.id);
        } else {
          // Si no hay sesión, verificar con getUser() por si acaso (más lento pero más confiable)
          const { data: userData } = await supabase.auth.getUser();
          if (userData?.user && !cancelled) {
            setViewerId(userData.user.id);
          } else if (!cancelled) {
            setViewerId(null);
          }
        }
      } catch {
        if (!cancelled) setViewerId(null);
      }
    };
    void loadAuth();
    return () => {
      cancelled = true;
    };
  }, []); // Ejecutar solo una vez al montar

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);
        setSuccess(null);

        const rawId = String(p?.id || '').trim();
        // Aceptar UUID o public_id (ej: PCK-XXXX...). Si viene public_id, resolvemos al UUID y redirigimos.
        if (!rawId || rawId === '[id]') {
          setListing(null);
          setActiveImg(null);
          setError('Ruta inválida. Abre una publicación desde “Explorar” (/listings).');
          return;
        }
        if (!isUuid(rawId)) {
          // Resolver por public_id (best-effort; si no existe columna, no rompe)
          try {
            const byPublic: any = await supabase.from('listings').select('id').eq('public_id', rawId).maybeSingle();
            const realId = String(byPublic?.data?.id || '').trim();
            if (realId && isUuid(realId)) {
              window.location.href = `/listings/${realId}`;
              return;
            }
          } catch {
            // noop
          }
          setListing(null);
          setActiveImg(null);
          setError('Publicación no encontrada. Abre una publicación desde “Explorar” (/listings).');
          return;
        }

        console.log('[LISTING DETAIL] Buscando publicación con ID:', rawId);
        const { data, error: fetchErr } = await supabase
          .from('listings')
          .select(
            'id,public_id,title,description,description_blocks,price,currency,images,status,seller_id,created_at,sale_type,gender,size,color,color_variants,size_variants,category,auction_start_at,auction_end_at,auction_bid_increment,auction_highest_bid,auction_highest_bidder_id',
          )
          .eq('id', rawId)
          .maybeSingle();

        console.log('[LISTING DETAIL] Resultado de la consulta:', {
          hasData: !!data,
          hasError: !!fetchErr,
          errorCode: fetchErr ? String((fetchErr as any)?.code || '') : null,
          errorMessage: fetchErr ? String((fetchErr as any)?.message || '') : null,
          status: data ? (data as any).status : null,
        });

        // Fallback si la columna aún no existe (migración incompleta)
        if (fetchErr) {
          const code = String((fetchErr as any)?.code || '');
          const msg = String((fetchErr as any)?.message || '').toLowerCase();
          console.log('[LISTING DETAIL] Error al buscar publicación:', { code, msg });
          if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
            const res2: any = await supabase
              .from('listings')
              .select(
                'id,public_id,title,description,price,currency,images,status,seller_id,created_at,sale_type,gender,size,color,color_variants,size_variants,category,auction_start_at,auction_end_at,auction_bid_increment,auction_highest_bid,auction_highest_bidder_id',
              )
              .eq('id', rawId)
              .maybeSingle();
            if (res2?.error) throw res2.error;
            if (!res2?.data) {
              setListing(null);
              return;
            }
            const row2 = res2.data as ListingRow;
            if (!cancelled) {
              setListing(row2);
              const first = ((row2 as any).images ?? []).filter(Boolean)[0] ?? null;
              setActiveImg(first);
              const hb = typeof row2.auction_highest_bid === 'number' ? row2.auction_highest_bid : Number(row2.auction_highest_bid ?? 0);
              const inc = typeof row2.auction_bid_increment === 'number' ? row2.auction_bid_increment : Number(row2.auction_bid_increment ?? 0);
              if (row2.sale_type === 'auction') {
                setBidAmount(Math.max(0, hb + Math.max(inc, 1)));
              }
              // Inicializar color seleccionado (fallback)
              const variants2 = normalizeArray((row2 as any).color_variants);
              if (variants2 && variants2.length > 0) {
                setSelectedColor(variants2[0]);
              } else if (row2.color) {
                setSelectedColor(row2.color);
              } else {
                setSelectedColor(null);
              }
              // Inicializar talla seleccionada (fallback)
              const sizeVariants2 = normalizeArray((row2 as any).size_variants);
              if (sizeVariants2 && sizeVariants2.length > 0) {
                setSelectedSize(sizeVariants2[0]);
              } else if (row2.size) {
                setSelectedSize(row2.size);
              } else {
                setSelectedSize(null);
              }
            }
            return;
          }
          throw fetchErr;
        }
        if (!data) {
          console.log('[LISTING DETAIL] No se encontró la publicación. Posibles causas:');
          console.log('1. La publicación no existe en la base de datos');
          console.log('2. Las políticas RLS están bloqueando el acceso');
          console.log('3. La publicación tiene un estado que la oculta (draft, paused, blocked, sold)');
          console.log('4. El ID proporcionado es incorrecto');
          
          // Intentar verificar si existe pero está bloqueada por RLS o estado
          try {
            const { data: checkData, error: checkErr } = await supabase
              .from('listings')
              .select('id,status')
              .eq('id', rawId)
              .maybeSingle();
            
            if (checkData) {
              console.log('[LISTING DETAIL] La publicación existe pero no es accesible:', {
                id: checkData.id,
                status: (checkData as any).status,
                reason: (checkData as any).status !== 'active' ? 'Estado no activo' : 'RLS bloqueando',
              });
              setError(`La publicación existe pero está en estado "${(checkData as any).status}". Solo las publicaciones "active" son visibles.`);
            } else if (checkErr) {
              console.log('[LISTING DETAIL] Error al verificar existencia:', checkErr);
              setError('No se pudo verificar la publicación. Puede que no exista o que no tengas permisos para verla.');
            } else {
              setError('Publicación no encontrada. Es posible que ya no esté disponible.');
            }
          } catch (checkEx) {
            console.error('[LISTING DETAIL] Error al verificar:', checkEx);
            setError('Publicación no encontrada. Es posible que ya no esté disponible.');
          }
          
          setListing(null);
          return;
        }
        const row = data as ListingRow;
        
        // Verificar si el usuario es el vendedor para permitir ver publicaciones no activas
        // Usar getSession() primero (más rápido) y luego getUser() si es necesario
        let user: { id: string } | null = null;
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          if (sessionData?.session?.user) {
            user = sessionData.session.user;
          } else {
            const { data: userData } = await supabase.auth.getUser();
            user = userData?.user || null;
          }
        } catch {
          // Si falla, intentar con getUser()
          try {
            const { data: userData } = await supabase.auth.getUser();
            user = userData?.user || null;
          } catch {
            user = null;
          }
        }
        
        // Actualizar viewerId si se obtuvo el usuario aquí
        if (user && !cancelled) {
          setViewerId(user.id);
        }
        
        const isOwner = user && user.id === row.seller_id;
        
        console.log('[LISTING DETAIL] Publicación encontrada:', {
          id: row.id,
          title: row.title,
          status: row.status,
          seller_id: row.seller_id,
          viewer_id: user?.id,
          isOwner,
          canView: row.status === 'active' || isOwner,
        });
        
        // Si la publicación no está activa y el usuario no es el dueño, no permitir verla
        if (row.status !== 'active' && !isOwner) {
          console.log('[LISTING DETAIL] Publicación no activa y usuario no es dueño');
          setError(`Esta publicación está en estado "${row.status}" y solo es visible para el vendedor.`);
          setListing(null);
          return;
        }
        
        if (!cancelled) {
          setListing(row);
          const first = (row.images ?? []).filter(Boolean)[0] ?? null;
          setActiveImg(first);
          const hb = typeof row.auction_highest_bid === 'number' ? row.auction_highest_bid : Number(row.auction_highest_bid ?? 0);
          const inc = typeof row.auction_bid_increment === 'number' ? row.auction_bid_increment : Number(row.auction_bid_increment ?? 0);
          if (row.sale_type === 'auction') {
            setBidAmount(Math.max(0, hb + Math.max(inc, 1)));
          }
          // Normalizar y inicializar color seleccionado: si hay variantes, usar el primero; si no, usar el color principal
          const normalizedColorVariants = normalizeArray(row.color_variants);
          console.log('[LISTING DETAIL] Color variants:', {
            raw: row.color_variants,
            type: typeof row.color_variants,
            isArray: Array.isArray(row.color_variants),
            normalized: normalizedColorVariants,
            normalizedLength: normalizedColorVariants ? normalizedColorVariants.length : 0,
            selected: normalizedColorVariants && normalizedColorVariants.length > 0 ? normalizedColorVariants[0] : row.color,
            willShowDropdown: normalizedColorVariants && normalizedColorVariants.length > 0,
          });
          if (normalizedColorVariants && normalizedColorVariants.length > 0) {
            setSelectedColor(normalizedColorVariants[0]);
            console.log('[LISTING DETAIL] ✅ Color variants encontradas, dropdown debería aparecer');
          } else if (row.color) {
            setSelectedColor(row.color);
            console.log('[LISTING DETAIL] ⚠️ No hay color variants, usando color único:', row.color);
          } else {
            setSelectedColor(null);
            console.log('[LISTING DETAIL] ⚠️ No hay color ni color variants');
          }
          // Normalizar y inicializar talla seleccionada: si hay variantes, usar la primera; si no, usar la talla principal
          const normalizedSizeVariants = normalizeArray(row.size_variants);
          console.log('[LISTING DETAIL] Size variants:', {
            raw: row.size_variants,
            type: typeof row.size_variants,
            isArray: Array.isArray(row.size_variants),
            normalized: normalizedSizeVariants,
            normalizedLength: normalizedSizeVariants ? normalizedSizeVariants.length : 0,
            selected: normalizedSizeVariants && normalizedSizeVariants.length > 0 ? normalizedSizeVariants[0] : row.size,
            willShowDropdown: normalizedSizeVariants && normalizedSizeVariants.length > 0,
          });
          if (normalizedSizeVariants && normalizedSizeVariants.length > 0) {
            setSelectedSize(normalizedSizeVariants[0]);
            console.log('[LISTING DETAIL] ✅ Size variants encontradas, dropdown debería aparecer');
          } else if (row.size) {
            setSelectedSize(row.size);
            console.log('[LISTING DETAIL] ⚠️ No hay size variants, usando talla única:', row.size);
          } else {
            setSelectedSize(null);
            console.log('[LISTING DETAIL] ⚠️ No hay talla ni size variants');
          }
        }
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setError(err instanceof Error ? err.message : 'No se pudo cargar la publicación.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [p?.id]);

  useEffect(() => {
    // Contabilizar vista (y autopausar si expiró) vía server-side
    const rawId = String(p?.id || '').trim();
    if (!rawId || rawId === '[id]' || !isUuid(rawId)) return;
    void fetch('/api/listings/view', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ listingId: rawId }),
    }).catch(() => null);
  }, [p?.id]);

  useEffect(() => {
    let cancelled = false;
    const loadExtras = async () => {
      if (!listing) return;
      try {
        const [sellerRes, couponRes] = await Promise.all([
          fetch(`/api/sellers/${encodeURIComponent(listing.seller_id)}`).then((r) => r.json().catch(() => ({}))),
          fetch(`/api/coupons/for-listing?listingId=${encodeURIComponent(listing.id)}`).then((r) => r.json().catch(() => ({}))),
        ]);

        if (!cancelled) {
          if (sellerRes?.name) setSellerName(String(sellerRes.name));
          if (sellerRes?.state) setSellerState(String(sellerRes.state).trim() || null);
          else setSellerState(null);
          if (sellerRes?.city) setSellerCity(String(sellerRes.city).trim() || null);
          else setSellerCity(null);
          if (typeof sellerRes?.rating_percent === 'number') setSellerRatingPercent(sellerRes.rating_percent);
          else if (typeof sellerRes?.rating_percent === 'string') setSellerRatingPercent(Number(sellerRes.rating_percent) || 100);
          setSellerBadge((sellerRes?.badge as any) ?? null);
          setSellerIsVerified(Boolean(sellerRes?.is_verified ?? false));
          setSellerOperationsCount(typeof sellerRes?.operations_count === 'number' ? sellerRes.operations_count : null);
          if (couponRes?.available && couponRes?.best) setCoupon(couponRes.best);
          else setCoupon(null);
        }
      } catch {
        // opcional: silencioso para no romper el detalle si falla el server
      }
    };
    void loadExtras();
    return () => {
      cancelled = true;
    };
  }, [listing]);

  // Más publicaciones del mismo vendedor (para "similares del vendedor")
  useEffect(() => {
    let cancelled = false;
    const loadMore = async () => {
      if (!listing?.id || !listing?.seller_id) return;
      try {
        setIsMoreLoading(true);

        const sellerId = String(listing.seller_id || '').trim();
        const listingId = String(listing.id || '').trim();

        const run = async (selectCols: string, useStatusFilter: boolean, useSellerIdCol: 'seller_id' | 'user_id') => {
          let q: any = supabase
            .from('listings')
            .select(selectCols)
            .eq(useSellerIdCol, sellerId)
            .neq('id', listingId)
            .order('created_at', { ascending: false })
            .limit(8);
          if (useStatusFilter) q = q.eq('status', 'active');
          return await q;
        };

        // Intento 1: schema esperado
        let res: any = await run('id,public_id,title,price,currency,images,status,created_at,seller_id', true, 'seller_id');

        if (res?.error) {
          const code = String((res.error as any)?.code || '');
          const msg = String((res.error as any)?.message || '').toLowerCase();

          // Columnas faltantes (public_id, seller_id, etc)
          if (code === '42703' || msg.includes('column') || msg.includes('does not exist')) {
            // 1) sin public_id
            res = await run('id,title,price,currency,images,status,created_at', true, 'seller_id');
            if (res?.error) {
              const msg2 = String((res.error as any)?.message || '').toLowerCase();
              // 2) seller_id no existe → user_id
              if (String((res.error as any)?.code || '') === '42703' || msg2.includes('seller_id') || msg2.includes('column')) {
                res = await run('id,title,price,currency,images,status,created_at', true, 'user_id');
              }
            }
          }

          // ENUM inválido para status 'active' → reintentar sin filtro status (RLS suele filtrar igual)
          if (res?.error) {
            const code2 = String((res.error as any)?.code || '');
            const msg2 = String((res.error as any)?.message || '').toLowerCase();
            if (code2 === '22P02' && msg2.includes('enum') && msg2.includes('active')) {
              res = await run('id,title,price,currency,images,status,created_at', false, 'seller_id');
              if (res?.error) res = await run('id,title,price,currency,images,status,created_at', false, 'user_id');
            }
          }
        }

        if (res?.error) throw res.error;
        if (!cancelled) setMoreFromSeller((((res.data as any[]) ?? []) as SellerListingRow[]) ?? []);
      } catch {
        if (!cancelled) setMoreFromSeller([]);
      } finally {
        if (!cancelled) setIsMoreLoading(false);
      }
    };

    void loadMore();
    return () => {
      cancelled = true;
    };
  }, [listing?.id, listing?.seller_id]);

  useEffect(() => {
    let cancelled = false;
    const loadFavorite = async () => {
      if (!listing) return;
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        if (!user) {
          if (!cancelled) setIsFav(false);
          if (!cancelled) setViewerId(null);
          return;
        }
        if (!cancelled) setViewerId(user.id);
        const { data, error } = await supabase
          .from('favorites')
          .select('id')
          .eq('user_id', user.id)
          .eq('listing_id', listing.id)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setIsFav(Boolean(data));
      } catch {
        if (!cancelled) setIsFav(false);
      }
    };
    void loadFavorite();
    return () => {
      cancelled = true;
    };
  }, [listing]);

  useEffect(() => {
    const listingId = listing?.id || null;
    let cancelled = false;
    const loadQs = async () => {
      if (!listingId) return;
      try {
        setIsQuestionsLoading(true);
        setQuestionsError(null);
        let res: any = await supabase
          .from('listing_questions')
          .select('id,listing_id,seller_id,asker_id,question_text,answer_text,created_at,answered_at,is_deleted')
          .eq('listing_id', listingId)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(50);

        if (res?.error) {
          const code = String(res.error?.code || '');
          const msg = String(res.error?.message || '');
          const low = msg.toLowerCase();
          if (code === '42P01' || low.includes('does not exist') || low.includes('schema cache') || code === 'PGRST106') {
            if (!cancelled) {
              setQuestions([]);
              setQuestionsError('Falta configurar la tabla de preguntas. Ejecuta `supabase_listing_questions.sql` en Supabase.');
            }
            return;
          }
          throw res.error;
        }

        if (!cancelled) setQuestions(((res.data as any[]) ?? []) as ListingQuestionRow[]);
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setQuestionsError(e instanceof Error ? e.message : 'No se pudieron cargar las preguntas.');
      } finally {
        if (!cancelled) setIsQuestionsLoading(false);
      }
    };
    void loadQs();
    return () => {
      cancelled = true;
    };
  }, [listing?.id]);

  const askQuestion = async () => {
    if (!listing) return;
    setError(null);
    setSuccess(null);
    setQuestionsError(null);
    try {
      setIsAsking(true);
      const text = questionInput.trim();
      if (text.length < 3) {
        setQuestionsError('Escribe una pregunta más clara (mínimo 3 caracteres).');
        return;
      }
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) {
        redirectToLogin();
        return;
      }
      const res = await fetch('/api/questions/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: listing.id, question: text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo enviar tu pregunta.');

      setQuestionInput('');
      if (json?.notified === false) {
        const ne = json?.notify_error;
        const detail =
          ne && (ne.code || ne.message)
            ? ` Motivo: ${String(ne.code || '').trim()} ${String(ne.message || '').trim()}`.trim()
            : '';
        setSuccess(`Pregunta enviada (nota: no se pudo notificar al vendedor).${detail ? `\n${detail}` : ''}`);
      } else {
        setSuccess('Pregunta enviada. El vendedor será notificado.');
      }

      // refrescar preguntas
      const qres: any = await supabase
        .from('listing_questions')
        .select('id,listing_id,seller_id,asker_id,question_text,answer_text,created_at,answered_at,is_deleted')
        .eq('listing_id', listing.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(50);
      if (!qres.error) setQuestions(((qres.data as any[]) ?? []) as ListingQuestionRow[]);
    } catch (e: unknown) {
      console.error(e);
      setQuestionsError(e instanceof Error ? e.message : 'No se pudo enviar tu pregunta.');
    } finally {
      setIsAsking(false);
    }
  };

  const toggleFavorite = async () => {
    if (!listing) return;
    setError(null);
    setSuccess(null);
    setIsFavLoading(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        redirectToLogin();
        return;
      }

      if (isFav) {
        const { error } = await supabase.from('favorites').delete().eq('user_id', user.id).eq('listing_id', listing.id);
        if (error) throw error;
        setIsFav(false);
        setSuccess('Quitado de favoritos.');
      } else {
        const { error } = await supabase
          .from('favorites')
          .upsert({ user_id: user.id, listing_id: listing.id }, { onConflict: 'user_id,listing_id' });
        if (error) throw error;
        setIsFav(true);
        setSuccess('Guardado en favoritos.');
      }
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo actualizar favoritos.');
    } finally {
      setIsFavLoading(false);
    }
  };

  const shareListing = async () => {
    if (!listing) return;
    // Importante: el comprador SOLO puede ver publicaciones "active" por RLS.
    // Si el vendedor comparte una publicación en draft/paused, al comprador le saldrá "Publicación no encontrada".
    if (String((listing as any).status || '').trim() !== 'active') {
      setError('Esta publicación no está pública (no está Activa). Actívala en Dashboard → Mis publicaciones y vuelve a compartir.');
      return;
    }

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareId = String((listing as any).public_id || '').trim() || String(listing.id || '').trim();
    const url = origin && shareId ? `${origin}/listings/${encodeURIComponent(shareId)}` : '';
    
    if (!url) {
      setError('No se pudo obtener el link.');
      return;
    }

    try {
      // Copiar al portapapeles
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        // best-effort: contabilizar "compartido"
        void fetch('/api/listings/share', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ listingId: listing.id }),
        }).catch(() => null);
        setSuccess('Link copiado al portapapeles.');
        return;
      }
      // Fallback para navegadores antiguos
      const textArea = document.createElement('textarea');
      textArea.value = url;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        void fetch('/api/listings/share', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ listingId: listing.id }),
        }).catch(() => null);
        setSuccess('Link copiado al portapapeles.');
      } finally {
        document.body.removeChild(textArea);
      }
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo copiar el link.');
    }
  };

  const price = useMemo(() => (listing ? getPrice(listing) : 0), [listing]);
  const images = useMemo(() => (listing?.images ?? []).filter(Boolean), [listing]);
  const isAuction = useMemo(() => (listing?.sale_type ?? 'direct') === 'auction', [listing]);
  const highestBid = useMemo(() => {
    const hb = listing?.auction_highest_bid;
    const n = typeof hb === 'number' ? hb : Number(hb ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [listing]);
  const bidIncrement = useMemo(() => {
    const inc = listing?.auction_bid_increment;
    const n = typeof inc === 'number' ? inc : Number(inc ?? 0);
    return Number.isFinite(n) ? n : 0;
  }, [listing]);

  const sellerBadgeLabel = useMemo(() => {
    if (sellerBadge === 'platinum') return 'Vendedor Platinum';
    if (sellerBadge === 'gold') return 'Vendedor Gold';
    if (sellerBadge === 'plata') return 'Vendedor Plata';
    return null;
  }, [sellerBadge]);

  const placeBid = async () => {
    setError(null);
    setSuccess(null);
    setIsBidding(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        window.location.href = '/';
        return;
      }
      if (!listing) {
        setError('Publicación no encontrada.');
        return;
      }
      if (listing.status !== 'active') {
        setError('La subasta no está activa.');
        return;
      }
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('No se encontró el token de sesión para pujar.');

      const res = await fetch('/api/bids/place', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ listingId: listing.id, amount: Number(bidAmount) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo registrar tu puja.');

      const newHighest = Number(json?.newHighest ?? bidAmount);
      setSuccess('¡Puja registrada!');
      setListing((prev) =>
        prev
          ? {
              ...prev,
              auction_highest_bid: newHighest,
              auction_highest_bidder_id: user.id,
            }
          : prev,
      );
      setBidAmount(newHighest + Math.max(bidIncrement, 1));
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No se pudo pujar.');
    } finally {
      setIsBidding(false);
    }
  };

  const addToCart = async () => {
    setError(null);
    setSuccess(null);
    setIsAdding(true);

    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw userErr;
      const user = userData.user;
      if (!user) {
        window.location.href = '/';
        return;
      }

      if (!listing) {
        setError('Publicación no encontrada.');
        return;
      }

      // Validar que se hayan seleccionado las variantes si existen
      const sizeVariants = normalizeArray(listing.size_variants);
      const colorVariants = normalizeArray(listing.color_variants);
      const hasSizeVariants = sizeVariants && sizeVariants.length > 0;
      const hasColorVariants = colorVariants && colorVariants.length > 0;

      // Usar el valor seleccionado o el primero por defecto si hay variantes
      const finalSelectedSize = hasSizeVariants 
        ? (selectedSize || sizeVariants[0] || null)
        : null;
      
      const finalSelectedColor = hasColorVariants 
        ? (selectedColor || colorVariants[0] || null)
        : null;

      if (hasSizeVariants && !finalSelectedSize) {
        setError('Por favor selecciona una talla antes de agregar al carrito.');
        setIsAdding(false);
        return;
      }

      if (hasColorVariants && !finalSelectedColor) {
        setError('Por favor selecciona un color antes de agregar al carrito.');
        setIsAdding(false);
        return;
      }

      const payload: any = {
        user_id: user.id,
        listing_id: listing.id,
        quantity: 1,
        selected_color: finalSelectedColor,
        selected_size: finalSelectedSize,
      };
      
      // Usar el nuevo constraint que incluye selected_color y selected_size (permite mismo listing con diferentes colores/tallas)
      const { error: upsertErr } = await supabase
        .from('cart_items')
        .upsert(payload, { onConflict: 'user_id,listing_id,selected_color,selected_size' });

      if (upsertErr) throw upsertErr;
      setSuccess('Agregado al carrito.');
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'No se pudo agregar al carrito.');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm hover:opacity-95">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </Link>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Detalle</div>
              <div className="text-xs text-gray-500">Publicación</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link
              href="/listings"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Volver
            </Link>
            <Link
              href="/cart"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Carrito
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {success}
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="aspect-[4/5] rounded-3xl bg-white/70 ring-1 ring-black/5" />
            <div className="h-72 rounded-3xl bg-white/70 ring-1 ring-black/5" />
          </div>
        ) : !listing ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
            <div className="text-lg font-bold text-gray-900">Publicación no encontrada</div>
            <p className="mt-2 text-sm text-gray-600">Es posible que ya no esté disponible.</p>
            <div className="mt-6">
              <Link
                href="/listings"
                className="inline-flex rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90"
              >
                Volver a explorar
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="space-y-4">
              <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
                <div className="group relative aspect-[4/5] bg-gray-100">
                  {activeImg ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeImg}
                        alt={listing.title}
                        className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.08]"
                        draggable={false}
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setZoomScale(1);
                          setIsZoomOpen(true);
                        }}
                        className="absolute inset-0"
                        aria-label="Ver imagen en zoom"
                      />
                      <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                        Zoom
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">
                      Sin imagen
                    </div>
                  )}
                </div>
              </div>

              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img) => (
                    <button
                      key={img}
                      type="button"
                      onClick={() => {
                        setActiveImg(img);
                      }}
                      className={`h-20 w-16 flex-none overflow-hidden rounded-2xl ring-1 ${
                        activeImg === img ? 'ring-brand-pink' : 'ring-black/10'
                      }`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img}
                        alt=""
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.05]"
                        draggable={false}
                      />
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
                  {listing.status === 'active' ? 'Disponible' : 'No disponible'}
                </div>
                {coupon && (
                  <div className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-800 ring-1 ring-green-200">
                    <span>
                      Cupón disponible
                      <span className="ml-1 font-extrabold">
                        {coupon.discount_type === 'percent'
                          ? `-${Math.round(coupon.discount_value)}%`
                          : `-${formatMoney(coupon.discount_value)}`}
                      </span>
                    </span>
                    {coupon.code?.trim() ? (
                      <span className="rounded-md bg-green-100 px-2 py-0.5 font-mono font-bold tracking-wide ring-1 ring-green-300">
                        Código: {String(coupon.code).trim()}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-start justify-between gap-3">
                <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">{listing.title}</h1>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleFavorite}
                    disabled={isFavLoading}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-black/5 hover:bg-gray-50 disabled:opacity-60 transition-colors ${
                      isFav ? 'text-brand-pink' : 'text-gray-700'
                    }`}
                    aria-label={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                    title={isFav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill={isFav ? '#E3127D' : 'none'}
                      stroke={isFav ? '#E3127D' : 'currentColor'}
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-all"
                      aria-hidden="true"
                    >
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={shareListing}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white text-gray-700 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                    aria-label="Compartir"
                    title="Compartir"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="18" cy="5" r="3" />
                      <circle cx="6" cy="12" r="3" />
                      <circle cx="18" cy="19" r="3" />
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="mt-2 text-2xl font-extrabold text-brand-pink">
                {isAuction ? `Puja actual: ${formatMoney(highestBid)}` : formatMoney(price)}
              </div>
              {listing.public_id ? <div className="mt-1 text-xs font-semibold text-gray-500">ID: {listing.public_id}</div> : null}

              {(listing.gender || listing.size || listing.size_variants || listing.color || listing.color_variants || listing.category) && (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {listing.category && (
                    <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
                      <div className="text-xs font-medium text-gray-600">Categoría</div>
                      <div className="mt-1 text-sm font-bold text-gray-900">{listing.category}</div>
                    </div>
                  )}
                  {listing.gender && (
                    <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
                      <div className="text-xs font-medium text-gray-600">Género</div>
                      <div className="mt-1 text-sm font-bold text-gray-900">{listing.gender}</div>
                    </div>
                  )}
                  {(() => {
                    const sizeVariants = normalizeArray(listing.size_variants);
                    const hasSizeVariants = sizeVariants && sizeVariants.length > 0;
                    const displaySize = hasSizeVariants ? selectedSize || sizeVariants[0] : listing.size;
                    
                    if (!displaySize) return null;
                    
                    return (
                      <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
                        <div className="text-xs font-medium text-gray-600">Talla {hasSizeVariants && <span className="text-red-500">*</span>}</div>
                        {hasSizeVariants ? (
                          <select
                            value={selectedSize || sizeVariants[0] || ''}
                            onChange={(e) => setSelectedSize(e.target.value)}
                            className="mt-1.5 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none transition-colors focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                          >
                            {sizeVariants.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="mt-1 text-sm font-bold text-gray-900">{displaySize}</div>
                        )}
                      </div>
                    );
                  })()}
                  {(() => {
                    const variants = normalizeArray(listing.color_variants);
                    const hasVariants = variants && variants.length > 0;
                    const displayColor = hasVariants ? selectedColor || variants[0] : listing.color;
                    
                    if (!displayColor) return null;
                    
                    return (
                      <div className="rounded-2xl border border-black/5 bg-white px-4 py-3">
                        <div className="text-xs font-medium text-gray-600">Color {hasVariants && <span className="text-red-500">*</span>}</div>
                        {hasVariants && variants && variants.length > 0 ? (
                          <select
                            value={selectedColor || variants[0] || ''}
                            onChange={(e) => {
                              setSelectedColor(e.target.value);
                            }}
                            required
                            className="mt-1.5 w-full rounded-xl border-2 border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-900 outline-none transition-colors focus:border-brand-pink focus:ring-2 focus:ring-brand-pink/20"
                          >
                            <option value="">Selecciona un color</option>
                            {variants.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="mt-1 text-sm font-bold text-gray-900">{displayColor}</div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="mt-4">
                <SellerDisplay
                  sellerId={listing.seller_id}
                  sellerName={sellerName}
                  state={sellerState}
                  city={sellerCity}
                  isVerified={sellerIsVerified}
                  operationsCount={sellerOperationsCount}
                  size="sm"
                />
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-gray-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/perfil/${listing.seller_id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-pink">
                    Termómetro de comportamiento →
                  </Link>
                  {sellerBadgeLabel && (
                    <div className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-900 ring-1 ring-black/10">
                      {sellerBadgeLabel}
                    </div>
                  )}
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  {Math.max(0, Math.min(100, Math.round(sellerRatingPercent)))}% de calificaciones buenas
                </div>
                <div className="mt-3">
                  <div className="relative h-2 w-full overflow-visible rounded-full bg-gray-200">
                    <div
                      className="absolute inset-0"
                      style={{
                        background: 'linear-gradient(90deg, #ef4444 0%, #f59e0b 35%, #22c55e 100%)',
                        opacity: 0.9,
                      }}
                    />
                    {/* Línea indicadora del porcentaje */}
                    <div
                      className="absolute inset-y-0 w-[2px] bg-white/90 shadow"
                      style={{ left: `calc(${Math.max(0, Math.min(100, sellerRatingPercent))}% - 1px)` }}
                      aria-hidden="true"
                    />
                    {/* Círculo completo que sale de la franja y parpadea */}
                    <div
                      className="absolute top-1/2 h-6 w-6 -translate-y-1/2 animate-blink rounded-full bg-white ring-4 ring-brand-pink shadow-lg"
                      style={{ left: `calc(${Math.max(0, Math.min(100, sellerRatingPercent))}% - 12px)` }}
                      aria-hidden="true"
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                    <span>0%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              {isAuction ? (
                <div className="mt-8 space-y-3">
                  <div className="rounded-2xl border border-black/5 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    <div className="text-xs font-semibold text-gray-700">Regla de pujas</div>
                    <div className="mt-1">
                      Solo puedes pujar <span className="font-semibold">una vez</span> hasta que alguien más te supere.
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-semibold text-gray-900">Tu puja</label>
                      <input
                        type="number"
                        min={Math.max(1, highestBid + Math.max(bidIncrement, 1))}
                        step={1}
                        value={bidAmount}
                        onChange={(e) => setBidAmount(Number(e.target.value))}
                        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                      />
                      <div className="mt-1 text-xs text-gray-600">
                        Mínimo: {formatMoney(highestBid + Math.max(bidIncrement, 1))}
                      </div>
                    </div>
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={placeBid}
                        disabled={isBidding || listing.status !== 'active'}
                        className="w-full rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isBidding ? 'Pujando…' : 'Pujar'}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={addToCart}
                    disabled={isAdding || listing.status !== 'active'}
                    className="w-full rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isAdding ? 'Agregando…' : 'Agregar al carrito'}
                  </button>
                  <Link
                    href="/cart"
                    className="w-full rounded-xl bg-white px-5 py-3 text-center text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
                  >
                    Ver carrito
                  </Link>
                </div>
              )}

              <p className="mt-4 text-xs text-gray-500">
                Nota: la protección total de imágenes requiere watermark server-side. Aquí solo deshabilitamos la interacción como disuasión.
              </p>
            </section>

            {/* Secciones de ancho completo (para plantillas/landing) */}
            <section className="lg:col-span-2 space-y-8">
              <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
                <div className="text-sm font-semibold text-gray-900">Descripción</div>
                {Array.isArray((listing as any).description_blocks) && (listing as any).description_blocks.length > 0 ? (
                  <div className="mt-3 rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
                    <BlocksRenderer blocks={((listing as any).description_blocks as TemplateBlock[]) ?? []} />
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">{listing.description || '—'}</p>
                )}
              </div>

              {/* Más del vendedor */}
              <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      Más publicaciones de{' '}
                      <Link href={`/perfil/${listing.seller_id}`} className="font-semibold text-brand-pink hover:opacity-90">
                        {sellerName}
                      </Link>
                    </div>
                    <div className="mt-1 text-xs text-gray-600">Artículos activos del mismo vendedor.</div>
                  </div>
                  <Link href={`/perfil/${listing.seller_id}`} className="text-xs font-semibold text-brand-pink hover:opacity-90">
                    Ver reputación →
                  </Link>
                </div>

                {isMoreLoading ? (
                  <div className="mt-4 text-sm text-gray-600">Cargando…</div>
                ) : moreFromSeller.length === 0 ? (
                  <div className="mt-4 text-sm text-gray-600">Aún no hay más publicaciones activas de este vendedor.</div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {moreFromSeller.slice(0, 8).map((r) => {
                      const img = (r.images ?? []).filter(Boolean)[0] ?? null;
                      const p = typeof r.price === 'number' ? r.price : Number(r.price ?? 0);
                      const price2 = Number.isFinite(p) ? p : 0;
                      return (
                        <Link
                          key={r.id}
                          href={`/listings/${r.id}`}
                          className="group overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="aspect-[4/5] bg-gray-100">
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={img}
                                alt={r.title}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                draggable={false}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen</div>
                            )}
                          </div>
                          <div className="p-3">
                            <div className="line-clamp-1 text-sm font-semibold text-gray-900">{r.title}</div>
                            <div className="mt-1 text-sm font-extrabold text-brand-pink">{formatMoney(price2)}</div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Preguntas al vendedor (públicas) */}
              <div className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Preguntas al vendedor</div>
                    <div className="mt-1 text-xs text-gray-600">Visibles para todos.</div>
                  </div>
                  <Link href="/dashboard/preguntas" className="text-xs font-semibold text-brand-pink hover:opacity-90">
                    Soy vendedor →
                  </Link>
                </div>

                {questionsError ? (
                  <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{questionsError}</div>
                ) : null}

                {/* Formulario: solo interesados (no vendedor) */}
                {listing.seller_id !== viewerId ? (
                  <div className="mt-4">
                    <label className="block text-sm font-semibold text-gray-900">Haz una pregunta</label>
                    {viewerId ? (
                      <>
                        <div className="mt-2 flex gap-2">
                          <textarea
                            value={questionInput}
                            onChange={(e) => setQuestionInput(e.target.value)}
                            rows={3}
                            className="flex-1 rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                            placeholder="Ej. ¿Cuál es la medida, viene con etiqueta, aceptas cambios?"
                          />
                          <div className="flex items-start pt-2">
                            <EmojiPicker
                              onEmojiSelect={(emoji) => {
                                setQuestionInput((prev) => prev + emoji);
                              }}
                            />
                          </div>
                        </div>
                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={askQuestion}
                            disabled={isAsking}
                            className="rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-60"
                          >
                            {isAsking ? 'Enviando…' : 'Enviar pregunta'}
                          </button>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">Nota: el vendedor recibirá una notificación y podrá responder desde su panel.</div>
                      </>
                    ) : (
                      <div className="mt-2 rounded-2xl border border-black/5 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                        Inicia sesión para preguntar.{' '}
                        <button
                          type="button"
                          onClick={() => redirectToLogin()}
                          className="font-semibold text-brand-pink hover:opacity-90"
                        >
                          Iniciar sesión →
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-black/5 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    Eres el vendedor de esta publicación. Las respuestas se gestionan desde{' '}
                    <span className="font-semibold">Dashboard → Preguntas</span>.
                  </div>
                )}

                <div className="mt-5">
                  {isQuestionsLoading ? (
                    <div className="text-sm text-gray-600">Cargando preguntas…</div>
                  ) : questions.length === 0 ? (
                    <div className="text-sm text-gray-600">Aún no hay preguntas.</div>
                  ) : (
                    <div className="space-y-3">
                      {questions.map((q) => (
                        <div key={q.id} className="rounded-2xl border border-black/5 bg-gray-50 px-4 py-3">
                          <div className="text-sm font-semibold text-gray-900">Pregunta</div>
                          <div className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{q.question_text}</div>
                          {q.answer_text ? (
                            <div className="mt-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5">
                              <div className="text-sm font-semibold text-brand-pink">Respuesta del vendedor</div>
                              <div className="mt-1 text-sm text-gray-800 whitespace-pre-wrap">{q.answer_text}</div>
                            </div>
                          ) : (
                            <div className="mt-2 text-xs font-semibold text-gray-500">Sin respuesta aún.</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {isZoomOpen && activeImg && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
            <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
              <div className="text-sm font-semibold text-gray-900">Vista previa</div>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-black/5"
              >
                Cerrar
              </button>
            </div>
            <div className="bg-black">
              <button
                type="button"
                onClick={() => setZoomScale((z) => (z === 1 ? 2 : 1))}
                className="block w-full"
                aria-label="Alternar zoom"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activeImg}
                  alt={listing?.title || 'Imagen'}
                  className="mx-auto max-h-[78vh] w-auto select-none transition-transform duration-300"
                  style={{ transform: `scale(${zoomScale})`, transformOrigin: 'center', cursor: zoomScale === 1 ? 'zoom-in' : 'zoom-out' }}
                  draggable={false}
                />
              </button>
            </div>
            <div className="border-t border-black/5 px-4 py-3 text-xs text-gray-600">
              Tip: toca/clic para {zoomScale === 1 ? 'acercar' : 'alejar'}.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

