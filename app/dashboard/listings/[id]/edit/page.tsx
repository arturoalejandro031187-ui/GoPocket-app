'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { TemplateBlock } from '@/lib/templates/blocks';
import { blocksToPlainText } from '@/lib/templates/text';
import { BlocksRenderer } from '@/components/templates/BlocksRenderer';
import { listingPolicyHumanWarning, scanListingContentPolicy } from '@/lib/moderation/listingContentPolicy';
import { checkLimit, getPlan, PLAN_LIMITS, PlanType } from '@/lib/plans/limits';

type ListingRow = {
  id: string;
  seller_id: string;
  title: string;
  description: string | null;
  description_blocks?: any[] | null;
  price: number | string;
  currency: string;
  images?: string[] | null;
  free_shipping?: boolean | null;
  condition?: 'nuevo' | 'usado' | 'casi_nuevo' | null;
  status: 'draft' | 'active' | 'sold' | 'paused' | 'blocked';
  gender?: 'Mujer' | 'Hombre' | 'Niños' | 'Niñas' | null;
  size?: string | null;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  category?: string | null;
  sale_type?: 'direct' | 'auction' | null;
  is_featured?: boolean | null;
  featured_fee?: number | null;
  auction_start_at?: string | null;
  auction_end_at?: string | null;
  auction_starting_bid?: number | null;
  auction_bid_increment?: number | null;
  expires_at?: string | null;
  shipping_subsidy?: number | null;
  handling_days?: number | null;
};

function toNumber(v: number | string | null | undefined) {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isValidTimeHHmm(v: string) {
  return /^\d{2}:\d{2}$/.test(v);
}

function addDaysToLocalDate(dateIso: string, days: number) {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  return d;
}

type UploadResult = { url: string };

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: fd,
    signal: controller.signal,
  }).catch((e: any) => {
    if (String(e?.name || '').toLowerCase().includes('abort')) {
      throw new Error('La subida de imágenes tardó demasiado. Intenta de nuevo con fotos más ligeras.');
    }
    throw e;
  });
  clearTimeout(timeout);

  const json = (await res.json().catch(() => ({}))) as Partial<UploadResult> & { error?: string };
  if (!res.ok) throw new Error(json?.error || 'No se pudo subir la imagen.');
  if (!json?.url) throw new Error('Respuesta inválida del servidor de upload.');
  return json.url;
}

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

export default function EditListingPage() {
  const p = useParams<{ id: string }>();
  const listingId = p?.id ?? '';
  const [isBooting, setIsBooting] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [row, setRow] = useState<ListingRow | null>(null);
  const [images, setImages] = useState<string[]>([]);
  const [imagesDirty, setImagesDirty] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);

  const [templates, setTemplates] = useState<Array<{ id: string; title: string; is_global?: boolean; is_active?: boolean; blocks?: TemplateBlock[] }>>([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplateTitle, setSelectedTemplateTitle] = useState<string>('');
  const [descriptionBlocks, setDescriptionBlocks] = useState<TemplateBlock[] | null>(null);
  const [blocksDirty, setBlocksDirty] = useState(false);
  const tplFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [tplUploadingSlot, setTplUploadingSlot] = useState<string | null>(null);

  const slotAspect = (b: any): 'portrait' | 'square' | 'landscape' => {
    const v = String(b?.slot_aspect || '').trim();
    if (v === 'square' || v === 'landscape' || v === 'portrait') return v as any;
    return 'portrait';
  };
  const aspectClass = (a: 'portrait' | 'square' | 'landscape') =>
    a === 'square' ? 'aspect-square' : a === 'landscape' ? 'aspect-[16/9]' : 'aspect-[4/5]';
  const recommendLabel = (a: 'portrait' | 'square' | 'landscape') =>
    a === 'square' ? '1080×1080' : a === 'landscape' ? '1600×900' : '1080×1350';
  const cloudinaryPreviewUrl = (urlRaw: string, a: 'portrait' | 'square' | 'landscape') => {
    const url = String(urlRaw || '').trim();
    if (!url) return '';
    if (!url.startsWith('https://res.cloudinary.com/')) return url;
    const i = url.indexOf('/upload/');
    if (i === -1) return url;
    const trans =
      a === 'square'
        ? 'c_fill,w_1080,h_1080,q_auto,f_auto'
        : a === 'landscape'
          ? 'c_fill,w_1600,h_900,q_auto,f_auto'
          : 'c_fill,w_1080,h_1350,q_auto,f_auto';
    return `${url.slice(0, i + '/upload/'.length)}${trans}/${url.slice(i + '/upload/'.length)}`;
  };

  const rowId = row?.id || '';

  const [saleType, setSaleType] = useState<'direct' | 'auction'>('direct');
  const [isFeatured, setIsFeatured] = useState(false);
  const [freeShipping, setFreeShipping] = useState(false);
  const [shippingSubsidy, setShippingSubsidy] = useState<string>('');
  const [weight, setWeight] = useState<string>('1');
  const [length, setLength] = useState<string>('20');
  const [width, setWidth] = useState<string>('20');
  const [height, setHeight] = useState<string>('10');
  const [shippingBySeller, setShippingBySeller] = useState(false);
  const [allowPersonalDelivery, setAllowPersonalDelivery] = useState(false);
  const [handlingDays, setHandlingDays] = useState<string>('0');
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [condition, setCondition] = useState<'nuevo' | 'usado' | 'casi_nuevo' | null>(null);
  const [auctionStartDate, setAuctionStartDate] = useState<string>(''); // yyyy-mm-dd
  const [auctionDurationDays, setAuctionDurationDays] = useState<number>(3); // 1..7
  const [auctionEndHour, setAuctionEndHour] = useState<string>('20:00'); // HH:mm
  const [auctionStartingBidInput, setAuctionStartingBidInput] = useState<string>(''); // número en string
  const [auctionBidIncrementInput, setAuctionBidIncrementInput] = useState<string>('10');

  // Plan limits
  const [limitsUsage, setLimitsUsage] = useState<{
    auctions: { allowed: boolean; usage: number; limit: number };
    listings: { allowed: boolean; usage: number; limit: number };
    featured: { allowed: boolean; usage: number; limit: number };
    plan: PlanType;
  } | null>(null);

  useEffect(() => {
    const fetchLimits = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        const [auctions, listings, featured] = await Promise.all([
          checkLimit(supabase, data.user.id, 'auctions'),
          checkLimit(supabase, data.user.id, 'listings'),
          checkLimit(supabase, data.user.id, 'featured'),
        ]);
        setLimitsUsage({
          auctions,
          listings,
          featured,
          plan: auctions.plan,
        });
        
        // Auto-disable features if not allowed (only if they are newly set or we want to enforce it)
        // However, for existing listings, we might want to be careful not to break existing data if they downgrade.
        // But the requirement says "must be blocked".
        if (!PLAN_LIMITS[auctions.plan].allow_shipping_by_seller) {
          // If the user is not allowed, we force it to false?
          // Or just disable the checkbox so they can't *enable* it if it was false.
          // If it was true (grandfathered), maybe we let it be?
          // For now, let's just use limitsUsage to control the disabled state in the UI.
        }
      }
    };
    void fetchLimits();
  }, []);

  const [form, setForm] = useState({
    title: '',
    description: '',
    price: '',
    gender: 'Mujer' as 'Mujer' | 'Hombre' | 'Niños' | 'Niñas',
    size: 'M',
    brand: '',
    model: '',
    color: '',
    category: 'Ropa',
    status: 'active' as 'active' | 'paused' | 'sold' | 'draft',
  });
  const [stock, setStock] = useState<string>('');
  const [colorVariants, setColorVariants] = useState<string[]>([]);
  const [newColorVariant, setNewColorVariant] = useState<string>('');
  const [sizeVariants, setSizeVariants] = useState<string[]>([]);
  const [newSizeVariant, setNewSizeVariant] = useState<string>('');

  const [brandSelect, setBrandSelect] = useState('');

  const POPULAR_BRANDS = useMemo(() => [
    'Zara', 'H&M', 'Bershka', 'Pull & Bear', 'Stradivarius',
    'Nike', 'Adidas', 'Shein', 'Forever 21', 'Mango',
    'Levi\'s', 'Guess', 'Calvin Klein', 'Tommy Hilfiger',
    'American Eagle', 'Old Navy', 'Gap', 'Victoria\'s Secret',
    'Michael Kors', 'Coach', 'Kate Spade', 'Tory Burch',
    'Steve Madden', 'Aldo', 'Nine West',
    'Otro'
  ], []);

  // Sincronizar brandSelect con form.brand al cargar (o cuando cambie externamente)
  useEffect(() => {
    if (form.brand) {
      if (POPULAR_BRANDS.includes(form.brand)) {
        setBrandSelect(form.brand);
      } else {
        setBrandSelect('Otro');
      }
    } else {
      setBrandSelect('');
    }
  }, [form.brand, POPULAR_BRANDS]);

  const categories = useMemo(() => {
    if (form.gender === 'Mujer') {
      return [
        'Tops',
        'Blusas',
        'Camisetas y Tops',
        'Bodies',
        'Croptops',
        'Vestidos Cortos',
        'Vestidos Largos y Midi',
        'Enterizos (Jumpsuits)',
        'Jeans',
        'Pantalones',
        'Faldas',
        'Shorts',
        'Leggings',
        'Chaquetas y Chamarras',
        'Abrigos y Blazers',
        'Sudaderas y Cardigans',
        'Lencería y Pijamas',
        'Ropa de Baño',
        'Ropa Deportiva',
        'Bolsas',
        'Zapatos',
        'Accesorios',
        'Top marcas',
        'Otro',
      ];
    }
    if (form.gender === 'Hombre') {
      return [
        'Camisetas',
        'Polos',
        'Camisas Casuales',
        'Camisas de Vestir',
        'Jeans',
        'Pantalones Chinos',
        'Pantalones de Vestir',
        'Bermudas y Shorts',
        'Trajes Completos',
        'Blazers y Sacos',
        'Chalecos',
        'Chamarras',
        'Sudaderas (Hoodies)',
        'Suéteres',
        'Ropa Interior y Pijamas',
        'Ropa de Baño',
        'Ropa Deportiva',
        'Tenis y Sneakers',
        'Botas y Botines',
        'Zapatos Formales',
        'Sandalias',
        'Tacones (Dama)',
        'Cinturones',
        'Gafas de Sol',
        'Relojes y Joyería',
        'Gorras y Sombreros',
        'Bolsos de Mano',
        'Mochilas',
        'Maletines y Carteras',
        'Top marcas',
        'Otro',
      ];
    }
    if (form.gender === 'Niñas') {
      return [
        'Tops',
        'Camisetas y Tops',
        'Blusas',
        'Sudaderas',
        'Suéteres y Cardigans',
        'Vestidos y Conjuntos',
        'Vestidos Casuales',
        'Vestidos de Fiesta',
        'Monos y Jumpers',
        'Conjuntos de 2 Piezas',
        'Partes Bajas',
        'Leggings',
        'Pantalones y Jeans',
        'Faldas y Tutús',
        'Shorts',
        'Ropa de Abrigo',
        'Chamarras y Abrigos',
        'Chalecos',
        'Ropa Interior y Dormir',
        'Pijamas',
        'Ropa Interior y Calcetas',
        'Ropa de Baño',
        'Ropa Deportiva',
      ];
    }
    if (form.gender === 'Niños') {
      return [
        'Camisetas',
        'Polos',
        'Camisas',
        'Sudaderas (Hoodies)',
        'Suéteres',
        'Partes Bajas',
        'Jeans',
        'Pantalones (Chinos/Cargo)',
        'Bermudas y Shorts',
        'Joggers',
        'Ropa de Abrigo',
        'Chamarras y Rompevientos',
        'Abrigos y Blazers',
        'Chalecos',
        'Ropa Interior y Dormir',
        'Pijamas',
        'Boxers y Calcetas',
        'Ropa de Baño',
        'Ropa Deportiva',
      ];
    }
    // Fallback
    return ['Ropa', 'Bolsas', 'Zapatos', 'Accesorios', 'Top marcas', 'Otro'];
  }, [form.gender]);
  const sizes = useMemo(() => ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'Unitalla'], []);

  // Validar que la categoría actual esté en la lista disponible
  useEffect(() => {
    if (!categories.includes(form.category)) {
      setForm((p) => ({
        ...p,
        category: categories[0] || 'Otro',
      }));
    }
  }, [categories, form.category]);

  const isDraft = (row?.status ?? form.status) === 'draft';

  const canSave = useMemo(() => {
    const titleOk = form.title.trim().length >= 3;
    const imgsOk = images.length >= 2 && images.length <= 6;
    const colorOk = form.color.trim().length > 0;
    const categoryOk = form.category.trim().length > 0;
    if (!titleOk || !imgsOk || !colorOk || !categoryOk) return false;

    if (isDraft) {
      if (saleType === 'direct') return toNumber(form.price) > 0 && !isSaving && !isUploading && uploadingCount === 0;
      const starting = Number(auctionStartingBidInput || 0);
      const inc = Number(auctionBidIncrementInput || 0);
      const durOk = auctionDurationDays >= 1 && auctionDurationDays <= 7;
      const startOk = auctionStartDate.trim().length > 0;
      const endHourOk = isValidTimeHHmm(auctionEndHour);
      return (
        durOk &&
        startOk &&
        endHourOk &&
        Number.isFinite(starting) &&
        starting > 0 &&
        Number.isFinite(inc) &&
        inc > 0 &&
        !isSaving &&
        !isUploading &&
        uploadingCount === 0
      );
    }

    // No-draft: comportamiento original (guardar cambios)
    if (form.status === 'active' && saleType === 'direct' && toNumber(form.price) <= 0) return false;
    // Evitar guardar con placeholders vacíos (si hay template blocks)
    const blocks = Array.isArray(descriptionBlocks) ? descriptionBlocks : null;
    if (blocks) {
      const missing = blocks.some((b: any) => b?.type === 'image' && !String(b?.url || '').trim());
      if (missing) return false;
    }
    return !isSaving && !isUploading && uploadingCount === 0;
  }, [
    form,
    images.length,
    isSaving,
    isUploading,
    uploadingCount,
    isDraft,
    saleType,
    auctionStartDate,
    auctionDurationDays,
    auctionEndHour,
    auctionStartingBidInput,
    auctionBidIncrementInput,
    descriptionBlocks,
  ]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setError(null);

        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!userData.user) {
          window.location.href = '/login';
          return;
        }

        let res: any = await supabase
          .from('listings')
          .select(
            'id,seller_id,title,description,description_blocks,price,currency,images,free_shipping,shipping_subsidy,condition,status,gender,size,brand,model,color,category,sale_type,is_featured,featured_fee,auction_start_at,auction_end_at,auction_starting_bid,auction_bid_increment,expires_at,stock,color_variants,size_variants',
          )
          .eq('id', listingId)
          .maybeSingle();

        if (res?.error) {
          const code = String((res.error as any)?.code || '');
          const msg = String((res.error as any)?.message || '');
          if (code === '42703' || msg.toLowerCase().includes('does not exist')) {
            // fallback si aún no corren `supabase_shipping_features.sql`
            res = await supabase
              .from('listings')
              .select(
                'id,seller_id,title,description,price,currency,images,status,gender,size,brand,model,color,category,sale_type,is_featured,featured_fee,auction_start_at,auction_end_at,auction_starting_bid,auction_bid_increment,expires_at',
              )
              .eq('id', listingId)
              .maybeSingle();
          }
        }

        const fetchErr = res?.error || null;
        const data = res?.data || null;
        if (fetchErr) throw fetchErr;
        if (!data) {
          setRow(null);
          return;
        }
        const r = data as ListingRow;
        if (r.seller_id !== userData.user.id) {
          throw new Error('No autorizado.');
        }
        if (!cancelled) {
          setRow(r);
          setForm({
            title: r.title || '',
            description: r.description || '',
            price: String(toNumber(r.price) || ''),
            gender: (r.gender ?? 'Mujer') as any,
            size: r.size ?? 'M',
            brand: r.brand ?? '',
            model: r.model ?? '',
            color: r.color ?? '',
            category: r.category ?? 'Ropa',
            status: (r.status === 'paused' ? 'paused' : r.status === 'sold' ? 'sold' : r.status === 'draft' ? 'draft' : 'active') as any,
          });
          setImages(((r as any).images as string[] | null | undefined) ?? []);
          setImagesDirty(false);
          setDescriptionBlocks((Array.isArray((r as any).description_blocks) ? ((r as any).description_blocks as any) : null) as any);
          setBlocksDirty(false);
          setSaleType(((r as any).sale_type as any) === 'auction' ? 'auction' : 'direct');
          setIsFeatured(Boolean((r as any).is_featured));
          setFreeShipping(Boolean((r as any).free_shipping));
          setShippingSubsidy(String(Number((r as any).shipping_subsidy ?? 0) || ''));
          setWeight(String(Number((r as any).weight_kg ?? 1) || '1'));
          setLength(String(Number((r as any).length_cm ?? 20) || '20'));
          setWidth(String(Number((r as any).width_cm ?? 20) || '20'));
          setHeight(String(Number((r as any).height_cm ?? 10) || '10'));
          setShippingBySeller(Boolean((r as any).shipping_by_seller));
          setAllowPersonalDelivery(Boolean((r as any).allow_personal_delivery));
          setHandlingDays(String(Number((r as any).handling_days ?? 0) || '0'));
          setCondition(((r as any).condition as any) || null);
          setStock(String((r as any).stock ?? ''));
          setColorVariants(Array.isArray((r as any).color_variants) ? ((r as any).color_variants as string[]) : []);
          setSizeVariants(Array.isArray((r as any).size_variants) ? ((r as any).size_variants as string[]) : []);
          setAuctionStartingBidInput(String(Number((r as any).auction_starting_bid ?? 0) || 0).replace(/[^\d]/g, '') || '');
          setAuctionBidIncrementInput(String(Number((r as any).auction_bid_increment ?? 10) || 10).replace(/[^\d]/g, '') || '10');

          // Si ya existían fechas, precargarlas (si no, en borrador quedarán vacías)
          const startAt = String((r as any).auction_start_at || '').trim();
          const endAt = String((r as any).auction_end_at || '').trim();
          if (startAt) {
            const d = new Date(startAt);
            if (!Number.isNaN(d.getTime())) setAuctionStartDate(d.toISOString().slice(0, 10));
          }
          if (endAt && startAt) {
            const s = new Date(startAt);
            const e = new Date(endAt);
            if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime())) {
              const diffDays = Math.max(1, Math.min(7, Math.round((e.getTime() - s.getTime()) / (24 * 60 * 60 * 1000))));
              setAuctionDurationDays(diffDays);
              const hh = String(e.getHours()).padStart(2, '0');
              const mm = String(e.getMinutes()).padStart(2, '0');
              setAuctionEndHour(`${hh}:${mm}`);
            }
          }
        }
      } catch (e: unknown) {
        console.error(e);
        if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudo cargar la publicación.');
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      if (!rowId) return;
      try {
        setIsTemplatesLoading(true);
        setTemplatesError(null);
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) {
          if (!cancelled) setTemplates([]);
          return;
        }
        const res = await fetch('/api/templates/list?limit=200', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setTemplatesError(String(json?.error || 'No se pudieron cargar plantillas.'));
          return;
        }
        const rows = ((json?.rows as any[]) ?? []) as any[];
        if (!cancelled) {
          setTemplates(
            rows.map((r) => ({
              id: String(r.id || ''),
              title: String(r.title || 'Plantilla'),
              is_global: Boolean(r.is_global),
              is_active: r.is_active !== false,
              blocks: (Array.isArray(r.blocks) ? (r.blocks as any) : []) as TemplateBlock[],
            })),
          );
        }
      } catch {
        if (!cancelled) setTemplates([]);
        if (!cancelled) setTemplatesError('No se pudieron cargar plantillas.');
      } finally {
        if (!cancelled) setIsTemplatesLoading(false);
      }
    };
    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [rowId]);

  useEffect(() => {
    let cancelled = false;
    const calculateShipping = async () => {
      if (shippingBySeller) {
        setShippingCost(null);
        return;
      }

      const w = Number(weight);
      const l = Number(length);
      const wd = Number(width);
      const h = Number(height);

      if (w > 0 && l > 0 && wd > 0 && h > 0) {
        try {
          setIsCalculatingShipping(true);
          const { data: session } = await supabase.auth.getSession();
          const token = session.session?.access_token;
          if (!token || cancelled) return;

          const res = await fetch('/api/estafeta/calculate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              weight_kg: w,
              length_cm: l,
              width_cm: wd,
              height_cm: h
            })
          });
          const json = await res.json();
          if (!cancelled) {
            if (json.ok && typeof json.cost === 'number') {
              setShippingCost(json.cost);
            } else {
              setShippingCost(null);
            }
          }
        } catch (err) {
          console.error('Error calculating shipping:', err);
          if (!cancelled) setShippingCost(null);
        } finally {
          if (!cancelled) setIsCalculatingShipping(false);
        }
      }
    };

    const timer = setTimeout(calculateShipping, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [weight, length, width, height, shippingBySeller]);

  // Sincronizar estado de envío gratis si cambia el costo/subsidio
  useEffect(() => {
    if (shippingCost !== null) {
      const sub = Number(shippingSubsidy || 0);
      if (sub < shippingCost && freeShipping) {
        setFreeShipping(false);
      }
    }
  }, [shippingCost, shippingSubsidy, freeShipping]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!row) return;

    try {
      setIsSaving(true);
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const patch: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        gender: form.gender,
        size: form.size,
        brand: form.brand.trim() || null,
        model: form.model.trim() || null,
        color: form.color.trim(),
        category: form.category.trim(),
        weight_kg: Number(weight) || 1,
        length_cm: Number(length) || 20,
        width_cm: Number(width) || 20,
        height_cm: Number(height) || 10,
        shipping_by_seller: shippingBySeller,
        allow_personal_delivery: allowPersonalDelivery,
        handling_days: Number(handlingDays) || 0,
      };
      if (!isDraft) patch.status = form.status;
      if (isDraft) patch.status = 'active';

      // Siempre mantenemos el sale_type editable si es borrador (publicación nueva precargada)
      if (isDraft) patch.sale_type = saleType;

      // Destacado (como /sell)
      patch.is_featured = Boolean(isFeatured);
      patch.featured_fee = isFeatured ? 25 : 0;
      patch.free_shipping = Boolean(freeShipping);
      patch.shipping_subsidy = freeShipping ? null : shippingSubsidy ? Number(shippingSubsidy) : 0;
      patch.condition = condition || null;
      patch.stock = stock.trim() ? Number(stock.trim()) || null : null;
      patch.color_variants = colorVariants.length > 0 ? colorVariants : null;
      patch.size_variants = sizeVariants.length > 0 ? sizeVariants : null;

      if ((isDraft ? saleType : (row.sale_type ?? 'direct')) === 'direct') {
        patch.price = toNumber(form.price);

        // Validar regla de negocio: No permitir saldo negativo con envío gratis
        if (Boolean(freeShipping) && shippingCost !== null) {
          const rate = limitsUsage?.plan === 'pro' ? (PLAN_LIMITS.pro.commission_percent / 100) : (PLAN_LIMITS.basic.commission_percent / 100);
          const commission = patch.price * rate;
          const estimatedNet = patch.price - commission - shippingCost;

          if (estimatedNet < 0) {
            throw new Error(`El precio ($${patch.price}) es muy bajo para ofrecer envío gratis ($${shippingCost}). Después de comisión ($${commission.toFixed(2)}) y envío, tendrías un saldo negativo de ${formatMoney(estimatedNet)}. Aumenta el precio o cobra el envío.`);
          }
        }
        // Validar regla de negocio: Entregas personales solo > $200
        if (allowPersonalDelivery && patch.price < 200) {
          throw new Error('Las entregas personales solo están permitidas para artículos de $200.00 o más.');
        }

        // Validar comisión mínima de $15.00
        if (limitsUsage) {
          const rate = limitsUsage.plan === 'pro' ? (PLAN_LIMITS.pro.commission_percent / 100) : (PLAN_LIMITS.basic.commission_percent / 100);
          const minPrice = 15 / rate;
          if (patch.price < minPrice) {
            throw new Error(`El precio mínimo debe ser $${minPrice.toFixed(2)} para cubrir la comisión mínima de $15.00.`);
          }
        }

        if (isDraft) {
          patch.auction_start_at = null;
          patch.auction_end_at = null;
          patch.auction_starting_bid = 0;
          patch.auction_bid_increment = 0;
        }
      }

      // Si es borrador y el vendedor eligió subasta, calculamos fechas/pujas y publicamos
      if (isDraft && saleType === 'auction') {
        const startingBid = Number(auctionStartingBidInput || 0);
        const inc = Number(auctionBidIncrementInput || 0);
        if (!auctionStartDate) throw new Error('Selecciona la fecha de inicio de la subasta.');
        if (auctionDurationDays < 1 || auctionDurationDays > 7) throw new Error('La duración de la subasta debe ser entre 1 y 7 días.');
        if (!isValidTimeHHmm(auctionEndHour)) throw new Error('La hora de finalización no es válida.');
        if (!Number.isFinite(startingBid) || startingBid <= 0) throw new Error('La puja inicial debe ser mayor a 0.');
        if (!Number.isFinite(inc) || inc <= 0) throw new Error('El incremento de puja debe ser mayor a 0.');

        const startLocal = new Date(`${auctionStartDate}T00:00:00`);
        const [hh, mm] = auctionEndHour.split(':').map((x) => Number(x));
        const endLocal = addDaysToLocalDate(startLocal.toISOString(), Number(auctionDurationDays));
        if (!endLocal) throw new Error('No se pudo calcular la fecha de fin de subasta.');
        endLocal.setHours(hh, mm, 0, 0);

        patch.auction_start_at = startLocal.toISOString();
        patch.auction_end_at = endLocal.toISOString();
        patch.auction_starting_bid = startingBid;
        patch.auction_bid_increment = inc;
        patch.price = startingBid;
      }

      if (imagesDirty) patch.images = images;
      if (blocksDirty) {
        patch.description_blocks = descriptionBlocks;
        patch.description_blocks_meta = descriptionBlocks
          ? { template_id: selectedTemplateId || null, template_title: selectedTemplateTitle || null, applied_at: new Date().toISOString(), applied_by: row.seller_id }
          : null;
      }

      // Anti-contacto / anti-links externos (al publicar o al editar contenido estando activo)
      const nextBlocks = blocksDirty ? descriptionBlocks : (Array.isArray((row as any).description_blocks) ? ((row as any).description_blocks as TemplateBlock[]) : null);
      const blocksText = nextBlocks ? blocksToPlainText(nextBlocks as any) : '';
      const nextDesc = (patch.description ? String(patch.description) : '') || blocksText || '';
      const scan = scanListingContentPolicy({ title: patch.title, description: nextDesc, blocksText });
      if (!scan.ok) {
        throw new Error(listingPolicyHumanWarning(scan.violations));
      }

      const res = await fetch('/api/listings/update-v2', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: row.id, patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'No se pudo guardar.');

      if (isDraft) {
        setSuccess('¡Publicado! Redirigiendo…');
        setImagesDirty(false);
        setTimeout(() => {
          window.location.href = `/listings/${row.id}`;
        }, 700);
        return;
      }

      setSuccess('Cambios guardados. Redirigiendo…');
      setImagesDirty(false);
      setBlocksDirty(false);
      setTimeout(() => {
        window.location.href = `/listings/${row.id}`;
      }, 700);
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  const onAddPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    setSuccess(null);
    const list = Array.from(files);
    const remaining = Math.max(0, 6 - (replaceMode ? 0 : images.length));
    const toUpload = list.slice(0, remaining);
    if (toUpload.length === 0) {
      setError('Máximo 6 imágenes.');
      return;
    }

    try {
      setIsUploading(true);
      setUploadingCount(toUpload.length);
      const urls: string[] = [];
      for (const f of toUpload) {
        const url = await uploadFile(f);
        urls.push(url);
        setUploadingCount((c) => Math.max(0, c - 1));
      }

      setImages((prev) => {
        const next = replaceMode ? urls : [...prev, ...urls];
        return next.slice(0, 6);
      });
      setImagesDirty(true);
      setSuccess(replaceMode ? 'Fotos reemplazadas (pendiente guardar).' : 'Fotos agregadas (pendiente guardar).');
    } catch (e: unknown) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'No se pudieron subir las fotos.');
    } finally {
      setUploadingCount(0);
      setIsUploading(false);
    }
  };

  const removeImageAt = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setImagesDirty(true);
  };

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="h-14 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-80 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
            <div className="text-lg font-bold text-gray-900">Publicación no encontrada</div>
            <div className="mt-6">
              <Link href="/dashboard/listings" className="inline-flex rounded-xl bg-brand-pink px-5 py-3 text-sm font-semibold text-white hover:opacity-90">
                Volver
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Editar publicación</div>
              <div className="text-xs text-gray-500">{row.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/sell" className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
              Vender
            </Link>
            <Link href="/dashboard/listings" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Volver
            </Link>
            <Link href={`/listings/${row.id}`} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50">
              Ver
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {error && <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{success}</div>
        )}

        <form onSubmit={onSave} className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8 space-y-4">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">Fotos</label>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={replaceMode}
                  onChange={(e) => setReplaceMode(e.target.checked)}
                />
                Reemplazar todas al subir
              </label>
            </div>
            <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-extrabold">Importante (evita bloqueo)</div>
              <div className="mt-1 text-xs">
                No publiques ni subas fotos con <span className="font-semibold">teléfono, WhatsApp, direcciones, redes sociales o links externos</span>.
                Solo se permiten links de <span className="font-semibold">tiendas/publicaciones dentro de GoPocket</span>.
                Si intentas evadir esta regla, tu cuenta puede ser bloqueada de forma permanente.
              </div>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-4">
              {images.length === 0 ? (
                <div className="sm:col-span-4 rounded-2xl bg-gray-50 px-4 py-3 text-sm text-gray-600 ring-1 ring-black/5">
                  Aún no hay fotos. Sube mínimo 2.
                </div>
              ) : (
                images.map((url, idx) => (
                  <div key={`${url}-${idx}`} className="relative overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-black/5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="h-24 w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImageAt(idx)}
                      className="absolute right-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-semibold text-red-700 shadow-sm ring-1 ring-red-200 hover:bg-red-50"
                      title="Quitar foto"
                    >
                      Quitar
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90">
                {uploadingCount > 0 ? `Subiendo… (${uploadingCount})` : 'Subir fotos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={isUploading || isSaving}
                  onChange={(e) => {
                    void onAddPhotos(e.target.files);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
              <div className="text-xs text-gray-600">
                Mínimo 2, máximo 6. Los cambios requieren presionar <span className="font-semibold">{isDraft ? 'Publicar' : 'Guardar cambios'}</span>.
              </div>
            </div>
          </div>

          {isDraft ? (
            <div className="rounded-2xl border border-black/5 bg-pink-50 p-4 ring-1 ring-pink-100">
              <div className="text-sm font-semibold text-gray-900">Publicación nueva (precargada)</div>
              <div className="mt-1 text-xs text-gray-700">
                Este borrador se creó con los datos de tu publicación anterior. Ajusta lo que quieras y presiona <span className="font-semibold">Publicar</span>.
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSaleType('direct')}
                  className={`rounded-2xl border p-4 text-left text-sm ${
                    saleType === 'direct' ? 'border-brand-pink bg-white' : 'border-black/5 bg-white/70'
                  }`}
                >
                  <div className="font-semibold text-gray-900">Venta directa</div>
                  <div className="mt-1 text-xs text-gray-600">Compra inmediata con precio fijo.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSaleType('auction')}
                  className={`rounded-2xl border p-4 text-left text-sm ${
                    saleType === 'auction' ? 'border-brand-pink bg-white' : 'border-black/5 bg-white/70'
                  }`}
                >
                  <div className="font-semibold text-gray-900">Subasta</div>
                  <div className="mt-1 text-xs text-gray-600">Los usuarios pujan y gana la mayor oferta.</div>
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-black/5 bg-white/70 p-4">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Destacar</div>
                    <div className="mt-1 text-xs text-gray-600">Aparecer en destacados. Costo: $25.00</div>
                  </div>
                  <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                </label>
              </div>

              <div className="mt-3 rounded-2xl border border-black/5 bg-white/70 p-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Envío</label>
                
                <div className="flex flex-col gap-3">
                  {!shippingBySeller && (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">Ofrecer envío gratis</div>
                          <div className="text-xs text-gray-600">
                            El comprador no paga envío. Se descuenta de tu venta.
                          </div>
                        </div>
                        <input type="checkbox" checked={freeShipping} onChange={(e) => {
                          setFreeShipping(e.target.checked);
                          if(e.target.checked) setShippingSubsidy('');
                        }} />
                      </div>

                      {!freeShipping && (
                        <div className="pt-3 border-t border-gray-100">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            O subsidiar una parte (descontar de mis ganancias):
                          </label>
                          <div className="relative w-32">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
                            <input
                              type="number"
                              min="0"
                              value={shippingSubsidy}
                              onChange={(e) => setShippingSubsidy(e.target.value)}
                              placeholder="0"
                              className="w-full rounded-xl border border-gray-300 bg-white pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand-pink"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="pt-3 border-t border-gray-100 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Peso (kg)</label>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                        className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Largo (cm)</label>
                        <input
                          type="number"
                          min="1"
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Ancho (cm)</label>
                        <input
                          type="number"
                          min="1"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Alto (cm)</label>
                        <input
                          type="number"
                          min="1"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 bg-white px-2 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex flex-col gap-4">
                    {/* Envío por cuenta propia (SOLO PRO) */}
                    <div className={`rounded-xl border border-gray-200 p-3 ${limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller ? 'bg-gray-50 opacity-75' : 'bg-white'}`}>
                      <label className="flex items-start justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Envío por mi propia cuenta</div>
                          <div className="text-xs text-gray-600">
                            Yo me encargo de la logística (no se genera guía GoPocket).
                          </div>
                          {limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller && (
                            <div className="mt-1 text-xs font-bold text-red-600">
                              Solo disponible en plan PRO. <Link href="/dashboard/pro" className="underline">Mejorar</Link>
                            </div>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={shippingBySeller}
                          disabled={limitsUsage ? !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller : false}
                          onChange={(e) => {
                             if (limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller) return;
                             setShippingBySeller(e.target.checked);
                             if (!e.target.checked) setFreeShipping(false);
                          }}
                          className="h-5 w-5 rounded border-gray-300 text-brand-pink focus:ring-brand-pink disabled:opacity-50"
                        />
                      </label>

                      {/* OFRECE ENVIO GRATIS POR TU PROPIA CUENTA (Anidado) */}
                      {shippingBySeller && (
                        <div className="mt-3 border-t border-gray-100 pt-2 pl-2">
                           <label className="flex items-center justify-between gap-3 cursor-pointer">
                            <div>
                              <div className="text-sm font-semibold text-gray-900">OFRECE ENVIO GRATIS POR TU PROPIA CUENTA</div>
                              <div className="text-xs text-gray-600">
                                El comprador verá "Envío Gratis" y tú cubres el costo.
                              </div>
                            </div>
                            <input 
                              type="checkbox"
                              checked={freeShipping}
                              onChange={(e) => setFreeShipping(e.target.checked)}
                              className="h-5 w-5 rounded border-gray-300 text-brand-pink focus:ring-brand-pink"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    {/* Entrega Personal */}
                    <div className={`rounded-xl border border-gray-200 p-3 ${limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery ? 'bg-gray-50 opacity-75' : 'bg-white'}`}>
                      <label className="flex items-start justify-between gap-3 cursor-pointer">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Entrega Personal</div>
                          <div className="text-xs text-gray-600">
                            Permite al comprador recoger el artículo en persona.
                          </div>
                          <div className="mt-1 text-xs text-amber-600 font-medium">
                            * Solo visible para compradores de tu misma ciudad y estado.
                          </div>
                          {limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery && (
                            <div className="mt-1 text-xs font-bold text-red-600">
                              Solo disponible en plan PRO.
                            </div>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={allowPersonalDelivery}
                          disabled={limitsUsage ? !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery : false}
                          onChange={(e) => setAllowPersonalDelivery(e.target.checked)}
                          className="h-5 w-5 rounded border-gray-300 text-brand-pink focus:ring-brand-pink"
                        />
                      </label>
                    </div>

                    {/* Handling Days */}
                    <div className="pt-2">
                        <label className="block text-sm font-medium text-gray-700">Días de preparación (Handling Days)</label>
                        <div className="mt-1 text-xs text-gray-500 mb-2">
                          Si necesitas tiempo para fabricar o preparar el producto antes de enviarlo. (0 = envío inmediato).
                        </div>
                        <input
                          type="number"
                          min="0"
                          max="30"
                          step="1"
                          value={handlingDays}
                          onChange={(e) => setHandlingDays(e.target.value)}
                          className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink sm:w-1/3"
                          placeholder="0"
                        />
                    </div>
                  </div>

                  {/* Calculadora de envío */}
                  {!shippingBySeller && (
                    <div className="mt-4 rounded-2xl bg-blue-50 p-4 border border-blue-100 text-sm text-blue-900">
                      <div className="font-bold mb-2">Costo estimado de envío</div>
                      {isCalculatingShipping ? (
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></div>
                          <span>Calculando...</span>
                        </div>
                      ) : shippingCost !== null ? (
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Costo real (aprox):</span>
                            <span className="font-semibold">{formatMoney(shippingCost)}</span>
                          </div>
                          {Number(shippingSubsidy) > 0 && (
                            <div className="flex justify-between text-green-700">
                              <span>- Tu subsidio:</span>
                              <span className="font-semibold">-{formatMoney(Number(shippingSubsidy))}</span>
                            </div>
                          )}
                          <div className="mt-2 flex justify-between border-t border-blue-200 pt-2 font-bold">
                            <span>El comprador paga:</span>
                            <span>
                              {freeShipping
                                ? 'Gratis'
                                : formatMoney(Math.max(0, shippingCost - Number(shippingSubsidy)))}
                            </span>
                          </div>
                          {Number(shippingSubsidy) > 0 && (
                            <div className="mt-1 text-xs text-blue-700">
                               * Se descontarán {formatMoney(Number(shippingSubsidy))} de tus ganancias al vender.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-blue-700">
                          Ingresa peso y medidas válidas para calcular.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Condición del artículo */}
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-3">Condición del artículo</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="condition"
                      checked={condition === 'nuevo'}
                      onChange={() => setCondition('nuevo')}
                      className="h-5 w-5 border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">Nuevo</div>
                      <div className="text-xs text-gray-600">Artículo sin usar, en su empaque original</div>
                    </div>
                    {condition === 'nuevo' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-green-600">
                        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="condition"
                      checked={condition === 'casi_nuevo'}
                      onChange={() => setCondition('casi_nuevo')}
                      className="h-5 w-5 border-gray-300 text-amber-600 focus:ring-amber-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">Casi Nuevo</div>
                      <div className="text-xs text-gray-600">Usado muy poco, en excelente estado</div>
                    </div>
                    {condition === 'casi_nuevo' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600">
                        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </label>
                  <label className="flex items-center gap-3 rounded-xl border border-black/5 bg-white p-3 cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="condition"
                      checked={condition === 'usado'}
                      onChange={() => setCondition('usado')}
                      className="h-5 w-5 border-gray-300 text-pink-600 focus:ring-pink-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-900">Usado</div>
                      <div className="text-xs text-gray-600">Artículo usado, puede tener señales de uso</div>
                    </div>
                    {condition === 'usado' && (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-pink-600">
                        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </label>
                </div>
              </div>
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-gray-700">Título</label>
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Descripción</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              rows={4}
            />
          </div>

          {/* Plantillas PRO (opcional) */}
          <div className="rounded-2xl border border-black/5 bg-pink-50 p-4 ring-1 ring-pink-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-gray-900">Plantilla PRO (opcional)</div>
                <div className="mt-1 text-xs text-gray-700">Aplica una plantilla por bloques (segura) para que tu descripción se vea más profesional.</div>
              </div>
              {Array.isArray(descriptionBlocks) && descriptionBlocks.length > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-brand-pink ring-1 ring-pink-100">
                  Activa en esta publicación
                </span>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700">Elegir plantilla</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedTemplateId(id);
                    const tRow = templates.find((x) => x.id === id);
                    setSelectedTemplateTitle(String(tRow?.title || ''));
                    setDescriptionBlocks((tRow?.blocks as any) || null);
                    setBlocksDirty(true);
                  }}
                  className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  disabled={isTemplatesLoading}
                >
                  <option value="">{isTemplatesLoading ? 'Cargando…' : '— Sin plantilla —'}</option>
                  {templates
                    .filter((x) => x.is_active !== false)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.is_global ? 'PRO · ' : 'Mía · '}
                        {t.title}
                      </option>
                    ))}
                </select>
                {templatesError ? (
                  <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    {templatesError}
                  </div>
                ) : null}
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const blocks = Array.isArray(descriptionBlocks) ? descriptionBlocks : null;
                    if (!blocks) return;
                    const txt = blocksToPlainText(blocks);
                    if (txt) setForm((p) => ({ ...p, description: txt }));
                  }}
                  className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-black disabled:opacity-60"
                  disabled={!Array.isArray(descriptionBlocks) || descriptionBlocks.length === 0}
                >
                  Aplicar a texto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId('');
                    setSelectedTemplateTitle('');
                    setDescriptionBlocks(null);
                    setBlocksDirty(true);
                  }}
                  className="rounded-xl bg-white px-3 py-3 text-sm font-extrabold text-gray-900 shadow-sm ring-1 ring-black/10 hover:bg-gray-50"
                  title="Quitar plantilla"
                >
                  ✕
                </button>
              </div>
            </div>

            {Array.isArray(descriptionBlocks) && descriptionBlocks.length > 0 ? (
              <div className="mt-4 overflow-hidden rounded-3xl border border-black/5 bg-white p-4">
                <div className="mb-2 text-xs font-semibold text-gray-600">Preview</div>
                <BlocksRenderer blocks={descriptionBlocks} />
              </div>
            ) : null}

            {/* Upload de placeholders (imágenes vacías) */}
            {Array.isArray(descriptionBlocks) && descriptionBlocks.some((b: any) => b?.type === 'image' && !String(b?.url || '').trim()) ? (
              <div className="mt-4 rounded-3xl border border-black/5 bg-white p-4">
                <div className="text-sm font-extrabold text-gray-900">Imágenes de la plantilla</div>
                <div className="mt-1 text-xs text-gray-600">Sube aquí las imágenes que la plantilla dejó como “espacios”.</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {descriptionBlocks
                    .map((b: any, i: number) => ({ b, i }))
                    .filter(({ b }) => b?.type === 'image' && !String(b?.url || '').trim())
                    .slice(0, 6)
                    .map(({ b, i }) => {
                      const slotId = String(b?.slot_id || `slot-${i + 1}`).trim();
                      const label = String(b?.slot_label || 'Imagen').trim();
                      const asp = slotAspect(b);
                      const previewUrl = cloudinaryPreviewUrl(String(b?.url || '').trim(), asp);
                      return (
                        <div key={slotId} className="rounded-2xl border border-black/5 bg-gray-50 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-extrabold text-gray-900">{label}</div>
                              <div className="mt-1 text-[11px] text-gray-600">
                                Tamaño recomendado: <span className="font-semibold">{recommendLabel(asp)}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-gray-600">ID: {slotId}</div>
                            </div>
                            <div className="shrink-0">
                              <input
                                ref={(el) => {
                                  tplFileRefs.current[slotId] = el;
                                }}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={async (e) => {
                                  const f = e.target.files?.[0] || null;
                                  e.currentTarget.value = '';
                                  if (!f) return;
                                  try {
                                    setTplUploadingSlot(slotId);
                                    const url = await uploadFile(f);
                                    setDescriptionBlocks((prev) => {
                                      const arr = Array.isArray(prev) ? [...prev] : [];
                                      const next = arr.map((x: any, idx2: number) => {
                                        if (idx2 !== i) return x;
                                        return { ...x, url, slot_id: slotId, slot_label: label };
                                      });
                                      return next as any;
                                    });
                                    setBlocksDirty(true);
                                  } catch (err: any) {
                                    setError(err?.message || 'No se pudo subir la imagen de la plantilla.');
                                  } finally {
                                    setTplUploadingSlot(null);
                                  }
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => tplFileRefs.current[slotId]?.click()}
                                disabled={tplUploadingSlot === slotId}
                                className="rounded-xl bg-gray-900 px-3 py-2 text-xs font-extrabold text-white shadow-sm hover:bg-black disabled:opacity-60"
                              >
                                {tplUploadingSlot === slotId ? 'Subiendo…' : 'Subir'}
                              </button>
                            </div>
                          </div>

                          {String(previewUrl || '').trim() ? (
                            <div className="mt-3 overflow-hidden rounded-2xl border border-black/5 bg-white">
                              <div className={['relative', aspectClass(asp)].join(' ')}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={previewUrl} alt={label} className="h-full w-full object-cover" draggable={false} />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                </div>
                <div className="mt-3 text-[11px] text-gray-600">Cuando subas todas, podrás guardar/publicar.</div>
              </div>
            ) : null}
          </div>

          {((isDraft ? saleType : (row.sale_type ?? 'direct')) as any) === 'direct' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Precio</label>
              <input
                value={form.price}
                onChange={(e) => setForm((p) => ({ ...p, price: e.target.value.replace(/[^\d]/g, '') }))}
                inputMode="numeric"
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                placeholder="Ej. 250"
              />
            </div>
          )}

          {isDraft && saleType === 'auction' ? (
            <div className="rounded-2xl border border-black/5 bg-white p-4 ring-1 ring-black/5">
              <div className="text-sm font-semibold text-gray-900">Configuración de subasta</div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Fecha de inicio</label>
                  <input
                    type="date"
                    value={auctionStartDate}
                    onChange={(e) => setAuctionStartDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Duración (días)</label>
                  <input
                    type="number"
                    min={1}
                    max={7}
                    value={auctionDurationDays}
                    onChange={(e) => setAuctionDurationDays(Math.max(1, Math.min(7, Number(e.target.value || 3))))}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Hora de finalización</label>
                  <input
                    type="time"
                    value={auctionEndHour}
                    onChange={(e) => setAuctionEndHour(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Puja inicial</label>
                  <input
                    value={auctionStartingBidInput}
                    onChange={(e) => setAuctionStartingBidInput(e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                    placeholder="Ej. 200"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">Incremento de puja</label>
                  <input
                    value={auctionBidIncrementInput}
                    onChange={(e) => setAuctionBidIncrementInput(e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                    placeholder="Ej. 10"
                  />
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Género</label>
              <select
                value={form.gender}
                onChange={(e) => {
                  const newGender = e.target.value as 'Mujer' | 'Hombre' | 'Niños' | 'Niñas';
                  setForm((p) => {
                    // Resetear categoría cuando cambia el género
                    let newCategory = 'Otro';
                    if (newGender === 'Mujer') {
                      newCategory = 'Tops';
                    } else if (newGender === 'Hombre') {
                      newCategory = 'Camisetas';
                    } else if (newGender === 'Niñas') {
                      newCategory = 'Tops';
                    } else if (newGender === 'Niños') {
                      newCategory = 'Camisetas';
                    } else {
                      newCategory = 'Ropa';
                    }
                    return { ...p, gender: newGender, category: newCategory };
                  });
                }}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              >
                <option value="Mujer">Mujer</option>
                <option value="Hombre">Hombre</option>
                <option value="Niñas">Niñas</option>
                <option value="Niños">Niños</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Modelo</label>
              <input
                value={form.model}
                onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                placeholder="Ej. Slim Fit, Air Max..."
              />
            </div>
            <div>
          <label className="block text-sm font-medium text-gray-700">Marca</label>
          <div className="space-y-2">
            <select
              value={brandSelect}
              onChange={(e) => {
                const val = e.target.value;
                setBrandSelect(val);
                if (val !== 'Otro') {
                  setForm((p) => ({ ...p, brand: val }));
                } else {
                  setForm((p) => ({ ...p, brand: '' }));
                }
              }}
              className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink bg-white"
            >
              <option value="">Selecciona una marca</option>
              {POPULAR_BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
            
            {brandSelect === 'Otro' && (
              <input
                value={form.brand}
                onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                placeholder="Escribe la marca..."
              />
            )}
          </div>
        </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Color</label>
              <input
                value={form.color}
                onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Cantidad disponible</label>
              <input
                type="number"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                placeholder="Ej. 10 (dejar vacío = ilimitado)"
              />
              <div className="mt-1 text-xs text-gray-500">Deja vacío si tienes cantidad ilimitada</div>
            </div>
          </div>

          {/* Variantes de talla */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Variantes de talla (opcional)</label>
            <div className="text-xs text-gray-600 mb-3">
              Si tu producto está disponible en otras tallas, agrégalas aquí (máximo 12 tallas)
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {sizeVariants.map((sv, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-sm font-semibold text-brand-pink ring-1 ring-pink-200"
                >
                  <span>{sv}</span>
                  <button
                    type="button"
                    onClick={() => setSizeVariants(sizeVariants.filter((_, i) => i !== idx))}
                    className="rounded-full bg-pink-100 p-0.5 hover:bg-pink-200 transition-colors"
                    aria-label="Eliminar talla"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            {sizeVariants.length < 12 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSizeVariant}
                  onChange={(e) => setNewSizeVariant(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = newSizeVariant.trim();
                      if (trimmed && !sizeVariants.includes(trimmed) && sizeVariants.length < 12) {
                        setSizeVariants([...sizeVariants, trimmed]);
                        setNewSizeVariant('');
                      }
                    }
                  }}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="Escribe una talla y presiona Enter"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newSizeVariant.trim();
                    if (trimmed && !sizeVariants.includes(trimmed) && sizeVariants.length < 12) {
                      setSizeVariants([...sizeVariants, trimmed]);
                      setNewSizeVariant('');
                    }
                  }}
                  disabled={!newSizeVariant.trim() || sizeVariants.includes(newSizeVariant.trim()) || sizeVariants.length >= 12}
                  className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Agregar
                </button>
              </div>
            )}
            {sizeVariants.length >= 12 && (
              <div className="mt-2 text-xs text-amber-600 font-semibold">Has alcanzado el límite de 12 tallas</div>
            )}
          </div>

          {/* Variantes de color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Variantes de color (opcional)</label>
            <div className="text-xs text-gray-600 mb-3">
              Si tu producto está disponible en otros colores, agrégalos aquí (máximo 12 colores)
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              {colorVariants.map((cv, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1.5 text-sm font-semibold text-brand-pink ring-1 ring-pink-200"
                >
                  <span>{cv}</span>
                  <button
                    type="button"
                    onClick={() => setColorVariants(colorVariants.filter((_, i) => i !== idx))}
                    className="rounded-full bg-pink-100 p-0.5 hover:bg-pink-200 transition-colors"
                    aria-label="Eliminar color"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            {colorVariants.length < 12 && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newColorVariant}
                  onChange={(e) => setNewColorVariant(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const trimmed = newColorVariant.trim();
                      if (trimmed && !colorVariants.includes(trimmed) && colorVariants.length < 12) {
                        setColorVariants([...colorVariants, trimmed]);
                        setNewColorVariant('');
                      }
                    }
                  }}
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="Escribe un color y presiona Enter"
                />
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = newColorVariant.trim();
                    if (trimmed && !colorVariants.includes(trimmed) && colorVariants.length < 12) {
                      setColorVariants([...colorVariants, trimmed]);
                      setNewColorVariant('');
                    }
                  }}
                  disabled={!newColorVariant.trim() || colorVariants.includes(newColorVariant.trim()) || colorVariants.length >= 12}
                  className="rounded-xl bg-brand-pink px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Agregar
                </button>
              </div>
            )}
            {colorVariants.length >= 12 && (
              <div className="mt-2 text-xs text-amber-600 font-semibold">Has alcanzado el límite de 12 colores</div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700">Modelo</label>
              <input
                value={form.model}
                onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                placeholder="Ej. Air Max, Galaxy S21..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Categoría</label>
              <select
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {!isDraft ? (
            <div>
              <label className="block text-sm font-medium text-gray-700">Estado</label>
              <select
                value={form.status}
                onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as any }))}
                className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
              >
                <option value="active">Activa</option>
                <option value="paused">Pausada</option>
                <option value="sold">Vendida</option>
                <option value="draft">Borrador</option>
              </select>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSave}
              className="rounded-xl bg-brand-pink px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:opacity-60"
            >
              {isSaving ? (isDraft ? 'Publicando…' : 'Guardando…') : isDraft ? 'Publicar' : 'Guardar cambios'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

