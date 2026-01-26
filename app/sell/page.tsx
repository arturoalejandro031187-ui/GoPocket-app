'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { TemplateBlock } from '@/lib/templates/blocks';
import { blocksToPlainText } from '@/lib/templates/text';
import { BlocksRenderer } from '@/components/templates/BlocksRenderer';
import { listingPolicyHumanWarning, scanListingContentPolicy } from '@/lib/moderation/listingContentPolicy';

type UploadResult = { url: string };

function getFriendlyErrorMessage(err: unknown) {
  // Errores típicos cuando Supabase no está bien configurado / bloqueado por red
  const msg =
    err instanceof Error
      ? err.message
      : typeof (err as any)?.message === 'string'
        ? String((err as any).message)
        : '';

  if (msg.toLowerCase().includes('failed to fetch')) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const urlHint =
      url && url.startsWith('http://') && url.includes('.supabase.co')
        ? `\n\nTu URL parece ser http://... (debe ser https://...).`
        : '';

    return (
      'No se pudo conectar con Supabase (Failed to fetch). ' +
      'Esto casi siempre es por URL/keys mal configuradas o por bloqueo de red.\n\n' +
      'Revisa en `.env.local`:\n' +
      '- NEXT_PUBLIC_SUPABASE_URL = https://<tu-proyecto>.supabase.co\n' +
      '- NEXT_PUBLIC_SUPABASE_ANON_KEY = <tu anon key>\n\n' +
      'Luego reinicia `npm run dev`.' +
      urlHint
    );
  }

  // Si es un error estilo Supabase (tiene code/details/hint), lo mostramos sin perder contexto
  const details = typeof (err as any)?.details === 'string' ? String((err as any).details) : '';
  const hint = typeof (err as any)?.hint === 'string' ? String((err as any).hint) : '';
  const code = typeof (err as any)?.code === 'string' ? String((err as any).code) : '';

  const base =
    msg ||
    (err instanceof Error
      ? err.message
      : 'No se pudo iniciar la página de venta.');

  const extraParts = [code ? `Código: ${code}` : '', details ? `Detalles: ${details}` : '', hint ? `Hint: ${hint}` : '']
    .filter(Boolean)
    .join('\n');

  return extraParts ? `${base}\n\n${extraParts}` : base;
}

function formatMoney(value: number) {
  return value.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
}

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min
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

export default function SellPage() {
  const [isBooting, setIsBooting] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  const [templates, setTemplates] = useState<
    Array<{
      id: string;
      title: string;
      is_global?: boolean;
      is_active?: boolean;
      blocks?: TemplateBlock[] | null;
    }>
  >([]);
  const [isTemplatesLoading, setIsTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [selectedTemplateTitle, setSelectedTemplateTitle] = useState<string>('');
  const [descriptionBlocks, setDescriptionBlocks] = useState<TemplateBlock[] | null>(null);
  const tplFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [tplUploadingSlot, setTplUploadingSlot] = useState<string | null>(null);

  const [gender, setGender] = useState<'Mujer' | 'Hombre' | 'Niños' | 'Niñas'>('Mujer');
  const [size, setSize] = useState<string>('M');
  const [color, setColor] = useState<string>('');
  const [category, setCategory] = useState<string>('Tops');
  const [stock, setStock] = useState<string>('');
  const [colorVariants, setColorVariants] = useState<string[]>([]);
  const [newColorVariant, setNewColorVariant] = useState<string>('');
  const [sizeVariants, setSizeVariants] = useState<string[]>([]);
  const [newSizeVariant, setNewSizeVariant] = useState<string>('');
  const [sizeType, setSizeType] = useState<'clothing' | 'shoes'>('clothing');
  const [sizeStock, setSizeStock] = useState<Record<string, number>>({});

  const [saleType, setSaleType] = useState<'direct' | 'auction'>('direct');
  const [isFeatured, setIsFeatured] = useState(false);
  const [freeShipping, setFreeShipping] = useState(false);
  const [condition, setCondition] = useState<'nuevo' | 'usado' | 'casi_nuevo' | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceInput, setPriceInput] = useState<string>('');

  // Subasta
  const [auctionStartDate, setAuctionStartDate] = useState<string>(''); // yyyy-mm-dd
  const [auctionDurationDays, setAuctionDurationDays] = useState<number>(3); // 1..7
  const [auctionEndHour, setAuctionEndHour] = useState<string>('20:00'); // HH:mm
  const [auctionStartingBidInput, setAuctionStartingBidInput] = useState<string>('');
  const [auctionBidIncrementInput, setAuctionBidIncrementInput] = useState<string>('10');

  const [files, setFiles] = useState<File[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const categories = useMemo(() => {
    if (gender === 'Mujer') {
      return [
        'Blusas',
        'Playeras',
        'Tops y Bodies',
        'Sueter y Cardigans',
        'Sudaderas',
        'Pantalones',
        'Jeans',
        'Leggings',
        'Faldas',
        'Shorts y Bermudas',
        'Chamarras',
        'Abrigos y Gabardinas',
        'Chalecos',
        'Sacos y Blazers',
        'Vestidos',
        'Overoles y Jumpers',
        'Lenceria',
        'Pijamas',
        'Ropa de Playa',
        'Conjuntos Deportivos',
        'Ropa de Alto Rendimiento',
        'Tenis',
        'Sandalias y Chanclas',
        'Botas y Botines',
        'Zapatillas y Tacones',
        'Flats Mocasines',
        'Pantunflas',
        'Alpargatas',
        'Calzado Escolar',
        'Calzado Laboral',
      ];
    }
    if (gender === 'Hombre') {
      return [
        'Playeras',
        'Camisas',
        'Sudaderas',
        'Sueteres',
        'Pantalones',
        'Jeans',
        'Shorts y Bermudas',
        'Chamarra',
        'Sacos y Blazers',
        'Abrigos y Gabardinas',
        'Trajes',
        'Ropa Interior',
        'Pijamas',
        'Ropa de Playa',
        'Ropa de Entrenamiento',
        'Jerseys',
        'Tenis',
        'Casual Skate',
        'Zapatos Oxfords',
        'Mocasines',
        'Botas y Botines',
        'Sandalias y Chanclas',
        'Alpargatas',
        'Pantunflas',
      ];
    }
    if (gender === 'Niñas') {
      return [
        'Vestidos Casual',
        'Vestidos de Fiesta',
        'Playeras',
        'Blusas',
        'Playeras, Tops y Crop Tops',
        'Pantalones',
        'Leggings',
        'Jeans',
        'Joggers y Pants',
        'Faldas y Shorts',
        'Chamarras',
        'Sudaderas',
        'Abrigos y Capas',
        'Pijamas',
        'Trajes de Baño',
        'Tenis',
        'Zapatos',
        'Botas y Botines',
        'Sandalias y Chanclas',
        'Pantunflas',
      ];
    }
    if (gender === 'Niños') {
      return [
        'Playeras',
        'Polos',
        'Tanks',
        'Pantalones',
        'Jeans',
        'Joggers y Pants',
        'Shorts y Bermudas',
        'Sudadera',
        'Chamarras',
        'Sueteres',
        'Conjuntos',
        'Pijamas',
        'Ropa Interior',
        'Ropa Deportiva',
        'Trajes',
        'Tenis',
        'Zapatos',
        'Botas y Botines',
        'Sandalias y Chanclas',
        'Pantunflas',
      ];
    }
    // Fallback
    return ['Calzado', 'Tenis', 'Botas y Botines', 'Sandalias y Chanclas', 'Zapatos'];
  }, [gender]);

  // Validar que la categoría actual esté en la lista disponible
  useEffect(() => {
    if (!categories.includes(category)) {
      setCategory(categories[0] || 'Otro');
    }
  }, [categories, category]);

  const sizes = useMemo(
    () => ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', 'Unitalla'],
    [],
  );

  // Tallas de ropa predefinidas (chips seleccionables)
  const clothingSizes = useMemo(() => ['XCH', 'CH', 'M', 'L', 'XG', 'XXL', 'XXXL'], []);

  // Tallas de calzado (cuando la categoría es Zapatos/Zapatillas/Tenis/Calzado)
  const shoeSizes = useMemo(() => {
    const cat = category.toLowerCase();
    const isShoes =
      cat.includes('zapato') ||
      cat.includes('calzado') ||
      cat.includes('zapatilla') ||
      cat.includes('tenis') ||
      cat.includes('bota') ||
      cat.includes('sandalia') ||
      cat.includes('chancla') ||
      cat.includes('mocasin') ||
      cat.includes('alpargata') ||
      cat.includes('pantunf') ||
      cat.includes('oxford') ||
      cat.includes('flat') ||
      cat.includes('tacon') ||
      cat.includes('skate');
    if (!isShoes) return null;
    const sizes: string[] = [];
    if (gender === 'Niños' || gender === 'Niñas') {
      for (let n = 22; n <= 30; n++) sizes.push(String(n));
      return sizes;
    }
    if (gender === 'Mujer') {
      for (let n = 22; n <= 28; n++) {
        sizes.push(String(n));
        if (n < 28) sizes.push(`${n}.5`);
      }
      return sizes;
    }
    for (let n = 25; n <= 33; n++) {
      sizes.push(String(n));
      if (n < 33) sizes.push(`${n}.5`);
    }
    return sizes;
  }, [category, gender]);

  const shoeLabel = useMemo(() => {
    if (!shoeSizes) return '';
    if (gender === 'Mujer') return 'Damas';
    if (gender === 'Hombre') return 'Caballeros';
    if (gender === 'Niñas') return 'Niñas';
    if (gender === 'Niños') return 'Niños';
    return 'Calzado';
  }, [shoeSizes, gender]);

  function getCommonShoeSizes(): string[] {
    if (!shoeSizes) return [];
    if (gender === 'Mujer') {
      return ['23', '23.5', '24', '24.5', '25', '25.5', '26'];
    }
    if (gender === 'Niños' || gender === 'Niñas') {
      return ['22', '23', '24', '25', '26'];
    }
    return ['26', '26.5', '27', '27.5', '28', '28.5', '29', '29.5'];
  }

  useEffect(() => {
    setSizeType(shoeSizes ? 'shoes' : 'clothing');
  }, [shoeSizes]);

  useEffect(() => {
    // Ajustar tallas seleccionadas según el tipo actual
    if (shoeSizes) {
      setSizeVariants((prev) => prev.filter((s) => shoeSizes.includes(s)).slice(0, 12));
    } else {
      setSizeVariants((prev) => prev.filter((s) => clothingSizes.includes(s)).slice(0, 12));
    }
  }, [shoeSizes, clothingSizes]);

  useEffect(() => {
    setSizeStock((prev) => {
      const next: Record<string, number> = {};
      for (const s of sizeVariants) {
        next[s] = Number.isFinite(prev[s]) ? prev[s] : 0;
      }
      return next;
    });
  }, [sizeVariants]);

  const canSubmit = useMemo(() => {
    const parsedDirectPrice = Number(priceInput || 0);
    const parsedStartingBid = Number(auctionStartingBidInput || 0);
    const parsedBidIncrement = Number(auctionBidIncrementInput || 0);
    const baseOk =
      title.trim().length >= 3 &&
      files.length >= 2 &&
      files.length <= 6 &&
      !isSaving &&
      uploadingCount === 0 &&
      category.trim().length > 0 &&
      color.trim().length > 0;

    if (!baseOk) return false;

    // Si hay placeholders de plantilla, deben estar llenos antes de publicar
    const blocks = Array.isArray(descriptionBlocks) ? descriptionBlocks : null;
    if (blocks) {
      const missing = blocks.some((b: any) => b?.type === 'image' && !String(b?.url || '').trim());
      if (missing) return false;
    }

    if (saleType === 'direct') return Number.isFinite(parsedDirectPrice) && parsedDirectPrice > 0;

    // Subasta
    const durOk = auctionDurationDays >= 1 && auctionDurationDays <= 7;
    const incOk = Number.isFinite(parsedBidIncrement) && parsedBidIncrement > 0;
    const startOk = auctionStartDate.trim().length > 0;
    const endHourOk = /^\d{2}:\d{2}$/.test(auctionEndHour);
    return durOk && incOk && startOk && endHourOk && Number.isFinite(parsedStartingBid) && parsedStartingBid > 0;
  }, [
    title,
    priceInput,
    files.length,
    isSaving,
    uploadingCount,
    category,
    color,
    saleType,
    auctionDurationDays,
    auctionBidIncrementInput,
    auctionStartDate,
    auctionEndHour,
    auctionStartingBidInput,
    descriptionBlocks,
  ]);

  useEffect(() => {
    let cancelled = false;
    const boot = async () => {
      try {
        setIsBooting(true);
        setPageError(null);

        // Diagnóstico rápido de env (valores inyectados en build)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error(
            'Faltan variables de entorno de Supabase. Revisa `.env.local` (NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY) y reinicia `npm run dev`.',
          );
        }

        const { data, error } = await supabase.auth.getUser();
        if (error) {
          const msg = String((error as any)?.message || '').toLowerCase();
          if (msg.includes('auth session missing')) {
            window.location.href = '/login';
            return;
          }
          throw error;
        }
        if (!data.user) {
          window.location.href = '/login';
          return;
        }

        // Verificación obligatoria para vender: dirección + INE
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select(
            'full_name,phone,address_street,ext_number,int_number,neighborhood,zip_code,state,city,references,cross_streets,ine_front_url,ine_back_url',
          )
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileErr) {
          const anyErr = profileErr as any;
          const code = String(anyErr?.code || '');
          const msg = String(anyErr?.message || '');
          if (code === '42703' && msg.includes('ine_front_url')) {
            throw new Error(
              "Tu tabla `profiles` no tiene las columnas `ine_front_url` y `ine_back_url`. " +
                "Ejecuta el SQL `supabase_profiles_ine_migration.sql` en Supabase (SQL Editor) y vuelve a intentar.",
            );
          }
          if (code === '42703' && msg.includes('address_street')) {
            throw new Error(
              "Tu tabla `profiles` no tiene columnas de dirección (por ejemplo `address_street`). " +
                "Ejecuta el SQL `supabase_profiles_address_migration.sql` en Supabase (SQL Editor) y vuelve a intentar.",
            );
          }
          throw profileErr;
        }

        const p: any = profile || {};
        const userEmail = typeof data.user?.email === 'string' ? data.user.email.trim() : '';
        const required = [
          userEmail,
          p.full_name,
          p.phone,
          p.address_street,
          p.ext_number,
          p.int_number,
          p.neighborhood,
          p.zip_code,
          p.state,
          p.city,
          p.references,
          p.cross_streets,
          p.ine_front_url,
          p.ine_back_url,
        ].every((v) => typeof v === 'string' && v.trim().length > 0);

        if (!required) {
          window.location.href = '/verificacion';
          return;
        }
      } catch (err: unknown) {
        console.error(err);
        if (!cancelled) setPageError(getFriendlyErrorMessage(err));
      } finally {
        if (!cancelled) setIsBooting(false);
      }
    };
    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadTemplates = async () => {
      if (isBooting) return;
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
  }, [isBooting]);

  // Mini vistas previas locales (antes de subir)
  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => {
      for (const u of urls) URL.revokeObjectURL(u);
    };
  }, [files]);

  const onSelectFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files ? Array.from(e.target.files) : [];
    if (list.length === 0) return;
    const next = [...files, ...list].slice(0, 6);
    setFiles(next);
    setSuccess(null);
    setPageError(null);
    e.target.value = '';
  };

  const removeFileAt = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const onPublish = async (e: React.FormEvent) => {
    e.preventDefault();
    setPageError(null);
    setSuccess(null);

    const t = title.trim();
    const d0 = description.trim();
    const blocks = Array.isArray(descriptionBlocks) ? descriptionBlocks : null;
    if (blocks) {
      const missing = blocks.some((b: any) => b?.type === 'image' && !String(b?.url || '').trim());
      if (missing) {
        setPageError('Te falta subir una o más imágenes de la plantilla (bloques de imagen vacíos).');
        return;
      }
    }
    const d = d0 || (blocks ? blocksToPlainText(blocks) : '');

    // Anti-contacto / anti-links externos: validar ANTES de subir fotos
    const scan = scanListingContentPolicy({ title: t, description: d, blocksText: blocks ? blocksToPlainText(blocks) : '' });
    if (!scan.ok) {
      setPageError(listingPolicyHumanWarning(scan.violations));
      return;
    }
    const directPrice = Number(priceInput || 0);
    if (t.length < 3) {
      setPageError('El título debe tener al menos 3 caracteres.');
      return;
    }
    if (saleType === 'direct' && (!Number.isFinite(directPrice) || directPrice <= 0)) {
      setPageError('El precio debe ser mayor a 0.');
      return;
    }
    if (!color.trim()) {
      setPageError('Indica el color de la prenda.');
      return;
    }
    if (files.length < 2) {
      setPageError('Sube mínimo 2 imágenes.');
      return;
    }
    if (files.length > 6) {
      setPageError('Máximo 6 imágenes.');
      return;
    }

    try {
      setIsSaving(true);
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr) {
        const msg = String((userErr as any)?.message || '').toLowerCase();
        if (msg.includes('auth session missing')) {
          window.location.href = '/login';
          return;
        }
        throw userErr;
      }
      const user = userData.user;
      if (!user) {
        window.location.href = '/login';
        return;
      }

      let auctionStartAt: string | null = null;
      let auctionEndAt: string | null = null;
      const startingBid = Number(auctionStartingBidInput || 0);
      const inc = Number(auctionBidIncrementInput || 0);

      if (saleType === 'auction') {
        if (!auctionStartDate) {
          setPageError('Selecciona la fecha de inicio de la subasta.');
          return;
        }
        if (auctionDurationDays < 1 || auctionDurationDays > 7) {
          setPageError('La duración de la subasta debe ser entre 1 y 7 días.');
          return;
        }
        if (!/^\d{2}:\d{2}$/.test(auctionEndHour)) {
          setPageError('La hora de finalización no es válida.');
          return;
        }
        if (startingBid <= 0) {
          setPageError('La puja inicial debe ser mayor a 0.');
          return;
        }
        if (inc <= 0) {
          setPageError('El incremento de puja debe ser mayor a 0.');
          return;
        }

        // Construir timestamps (local) y guardar como ISO
        const start = new Date(`${auctionStartDate}T00:00:00`);
        const [hh, mm] = auctionEndHour.split(':').map((x) => Number(x));
        const end = new Date(start);
        end.setDate(end.getDate() + Number(auctionDurationDays));
        end.setHours(hh, mm, 0, 0);

        // Seguridad: max 7 días
        const maxEnd = new Date(start);
        maxEnd.setDate(maxEnd.getDate() + 7);
        if (end.getTime() > maxEnd.getTime()) {
          setPageError('La subasta no puede durar más de 7 días.');
          return;
        }

        auctionStartAt = start.toISOString();
        auctionEndAt = end.toISOString();
      }

      setUploadingCount(files.length);
      const urls: string[] = [];
      for (const f of files) {
        const url = await uploadFile(f);
        urls.push(url);
        setUploadingCount((c) => Math.max(0, c - 1));
      }

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Auth session missing');

      const createController = new AbortController();
      const createTimeout = setTimeout(() => createController.abort(), 60_000); // 1 min
      const res = await fetch('/api/listings/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: t,
          description: d || null,
          description_blocks: blocks,
          description_blocks_meta: blocks
            ? {
                template_id: selectedTemplateId || null,
                template_title: selectedTemplateTitle || null,
                applied_at: new Date().toISOString(),
                applied_by: user.id,
              }
            : null,
          price: saleType === 'direct' ? directPrice : startingBid,
          currency: 'MXN',
          images: urls,
          status: 'active',
          gender,
          size,
          color: color.trim(),
          category,
          free_shipping: Boolean(freeShipping),
          condition: condition || null,
          stock: stock.trim() ? Number(stock.trim()) || null : null,
          color_variants: colorVariants.length > 0 ? colorVariants : null,
          size_variants: sizeVariants.length > 0 ? sizeVariants : null,
          size_stock: Object.keys(sizeStock).length > 0 ? sizeStock : null,
          size_type: sizeType || null,
          sale_type: saleType,
          is_featured: Boolean(isFeatured),
          featured_fee: isFeatured ? 25 : 0,
          auction_start_at: auctionStartAt,
          auction_end_at: auctionEndAt,
          auction_starting_bid: saleType === 'auction' ? startingBid : 0,
          auction_bid_increment: saleType === 'auction' ? inc : 0,
          auction_highest_bid: saleType === 'auction' ? startingBid : 0,
        }),
        signal: createController.signal,
      }).catch((e: any) => {
        if (String(e?.name || '').toLowerCase().includes('abort')) {
          throw new Error('La publicación tardó demasiado. Intenta de nuevo (si persiste, revisa tu conexión).');
        }
        throw e;
      });
      clearTimeout(createTimeout);

      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(json?.error || 'No se pudo publicar.');

      const id = String(json?.id || '');
      if (!id) throw new Error('Respuesta inválida del servidor al crear la publicación.');

      setSuccess('¡Publicación creada! Redirigiendo…');
      setTimeout(() => {
        window.location.href = `/listings/${id}`;
      }, 900);
    } catch (err: unknown) {
      console.error(err);
      setPageError(err instanceof Error ? err.message : 'No se pudo publicar.');
    } finally {
      setUploadingCount(0);
      setIsSaving(false);
    }
  };

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

  if (isBooting) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="h-12 rounded-2xl bg-white/70 ring-1 ring-black/5" />
          <div className="mt-6 h-96 rounded-2xl bg-white/70 ring-1 ring-black/5" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 to-white">
      <div className="sticky top-0 z-40 border-b border-black/5 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 items-center justify-center rounded-xl bg-brand-pink px-3 text-white shadow-sm">
              <span className="text-sm font-extrabold tracking-widest">GoPocket</span>
            </div>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-gray-900">Vender</div>
              <div className="text-xs text-gray-500">Crear publicación</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/listings"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Explorar
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 rounded-full bg-pink-50 px-3 py-1 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
            Publicación
          </div>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900">Publica tu artículo</h1>
          <p className="mt-2 text-sm text-gray-600">
            Mínimo 2 fotos, máximo 6. Precio en MXN. Después lo podrás pausar o marcar como vendido.
          </p>
        </div>

        {pageError && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {pageError}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            {success}
          </div>
        )}

        <form onSubmit={onPublish} className="space-y-6">
          {/* IMÁGENES ARRIBA */}
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Imágenes</h2>
                <p className="mt-1 text-sm text-gray-600">Selecciona tus fotos. Puedes añadir varias veces.</p>
              </div>
              <div className="text-sm font-semibold text-gray-900">{files.length}/6</div>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="font-extrabold">Importante (evita bloqueo)</div>
              <div className="mt-1 text-xs">
                No publiques ni subas fotos con <span className="font-semibold">teléfono, WhatsApp, direcciones, redes sociales o links externos</span>.
                Solo se permiten links de <span className="font-semibold">tiendas/publicaciones dentro de GoPocket</span>.
                Si intentas evadir esta regla, tu cuenta puede ser bloqueada de forma permanente.
              </div>
            </div>

            <div className="mt-4">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onSelectFiles}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm file:mr-4 file:rounded-xl file:border-0 file:bg-brand-pink file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:opacity-90"
              />
              <div className="mt-2 text-xs text-gray-500">Requisito: mínimo 2 imágenes.</div>
            </div>

            {files.length > 0 && (
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {files.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="group overflow-hidden rounded-2xl border border-black/5 bg-white">
                    <div className="relative aspect-[4/5] bg-gray-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrls[idx] || ''}
                        alt={f.name}
                        className="h-full w-full object-cover"
                        draggable={false}
                      />
                      <button
                        type="button"
                        onClick={() => removeFileAt(idx)}
                        className="absolute right-2 top-2 rounded-full bg-black/70 px-3 py-2 text-xs font-semibold text-white hover:bg-black"
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="p-3">
                      <div className="text-xs font-semibold text-gray-900 line-clamp-1">{f.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{Math.round(f.size / 1024)} KB</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo de publicación</label>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setSaleType('direct')}
                    className={`rounded-2xl border p-4 text-left text-sm ${
                      saleType === 'direct' ? 'border-brand-pink bg-pink-50' : 'border-black/5 bg-white'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">Venta directa</div>
                    <div className="mt-1 text-xs text-gray-600">Compra inmediata con precio fijo.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleType('auction')}
                    className={`rounded-2xl border p-4 text-left text-sm ${
                      saleType === 'auction' ? 'border-brand-pink bg-pink-50' : 'border-black/5 bg-white'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">Subasta</div>
                    <div className="mt-1 text-xs text-gray-600">Los usuarios pujan y gana la mayor oferta.</div>
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-black/5 bg-gray-50 p-4">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Destacar por {formatMoney(25)}</div>
                    <div className="mt-1 text-xs text-gray-600">Tu artículo aparece en “Destacados”.</div>
                  </div>
                  <input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} />
                </label>
              </div>

              <div className="rounded-2xl border border-black/5 bg-gray-50 p-4">
                <label className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Ofrecer envío gratis</div>
                    <div className="mt-1 text-xs text-gray-600">
                      El comprador no paga envío. Se descuenta hasta <span className="font-semibold">$180</span> de tu venta.
                    </div>
                  </div>
                  <input type="checkbox" checked={freeShipping} onChange={(e) => setFreeShipping(e.target.checked)} />
                </label>
              </div>
            </div>
          </section>

          {/* Condición del artículo */}
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <div>
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
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Título</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="Ej. Blusa Zara como nueva"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Descripción</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  rows={4}
                  placeholder="Detalles: condición, medidas, etc."
                />
              </div>

              {/* Plantillas PRO (opcional) */}
              <div className="rounded-2xl border border-black/5 bg-pink-50 p-4 ring-1 ring-pink-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">Plantilla PRO (opcional)</div>
                    <div className="mt-1 text-xs text-gray-700">Aplica un diseño por bloques (seguro) para que tu descripción se vea más profesional.</div>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-pink ring-1 ring-pink-100">
                    Nuevo
                  </div>
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
                    {!templatesError && templates.filter((x) => x.is_active !== false).length === 0 ? (
                      <div className="mt-2 rounded-2xl border border-pink-200 bg-white px-3 py-2 text-xs text-gray-800">
                        Aún no hay plantillas PRO. Un admin puede crear globales en <span className="font-semibold">/admin/plantillas</span> o tú puedes crear las tuyas en{' '}
                        <span className="font-semibold">/dashboard/plantillas</span>.
                      </div>
                    ) : null}
                    <div className="mt-1 text-[11px] text-gray-600">
                      Admin crea globales en <span className="font-semibold">/admin/plantillas</span>. Tú puedes crear las tuyas en <span className="font-semibold">/dashboard/plantillas</span>.
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const blocks = Array.isArray(descriptionBlocks) ? descriptionBlocks : null;
                        if (!blocks) return;
                        const txt = blocksToPlainText(blocks);
                        if (txt) setDescription(txt);
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
                {Array.isArray(descriptionBlocks) && descriptionBlocks.some((b: any) => b?.type === 'image' && (b as any)?.is_slot !== false) ? (
                  <div className="mt-4 rounded-3xl border border-black/5 bg-white p-4">
                    <div className="text-sm font-extrabold text-gray-900">Imágenes de la plantilla</div>
                    <div className="mt-1 text-xs text-gray-600">Sube aquí las imágenes de los “espacios” de la plantilla. Verás el preview y podrás reemplazar.</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {descriptionBlocks
                        .map((b: any, i: number) => ({ b, i }))
                        .filter(({ b }) => b?.type === 'image' && (b as any)?.is_slot !== false)
                        .slice(0, 6)
                        .map(({ b, i }) => {
                          const slotId = String(b?.slot_id || `slot-${i + 1}`).trim();
                          const label = String(b?.slot_label || 'Imagen').trim();
                          const hasUrl = Boolean(String(b?.url || '').trim());
                          const asp = slotAspect(b);
                          const previewUrl = hasUrl ? cloudinaryPreviewUrl(String(b?.url || '').trim(), asp) : '';
                          return (
                            <div key={slotId} className="rounded-2xl border border-black/5 bg-gray-50 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-sm font-extrabold text-gray-900">{label}</div>
                                    <span
                                      className={hasUrl ? 'rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-green-700 ring-1 ring-green-200' : 'rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-amber-800 ring-1 ring-amber-200'}
                                    >
                                      {hasUrl ? 'OK' : 'Pendiente'}
                                    </span>
                                  </div>
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
                                      } catch (err: any) {
                                        setPageError(err?.message || 'No se pudo subir la imagen de la plantilla.');
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
                                    {tplUploadingSlot === slotId ? 'Subiendo…' : hasUrl ? 'Reemplazar' : 'Subir'}
                                  </button>
                                </div>
                              </div>

                              <div className="mt-3 overflow-hidden rounded-2xl border border-black/5 bg-white">
                                <div className={['relative', aspectClass(asp)].join(' ')}>
                                  {hasUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={previewUrl} alt={label} className="h-full w-full object-cover" draggable={false} />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">Sin imagen aún</div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                    <div className="mt-3 text-[11px] text-gray-600">
                      Cuando subas todas, podrás publicar normalmente.
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Género</label>
                  <select
                    value={gender}
                    onChange={(e) => {
                      const newGender = e.target.value as 'Mujer' | 'Hombre' | 'Niños' | 'Niñas';
                      setGender(newGender);
                      setCategory('');
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  >
                    <option value="Mujer">Mujer</option>
                    <option value="Hombre">Hombre</option>
                    <option value="Niñas">Niñas</option>
                    <option value="Niños">Niños</option>
                  </select>
                </div>
                {!shoeSizes && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Talla</label>
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                    >
                      {sizes.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Color</label>
                  <input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                    placeholder="Ej. Negro, Rosa, Azul..."
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Categoría</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Cantidad disponible</label>
                  <input
                    type="number"
                    min="0"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
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
                {shoeSizes && (
                  <div className="mb-3 rounded-xl border border-pink-200 bg-pink-50 p-3">
                    <div className="text-xs font-semibold text-gray-900 mb-2">
                      Tallas de calzado disponibles{shoeLabel ? ` (${shoeLabel})` : ''}:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {shoeSizes.map((shoeSize) => {
                        const isSelected = sizeVariants.includes(shoeSize);
                        return (
                          <button
                            key={shoeSize}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSizeVariants(sizeVariants.filter((s) => s !== shoeSize));
                              } else if (sizeVariants.length < 12) {
                                setSizeVariants([...sizeVariants, shoeSize]);
                              }
                            }}
                            disabled={!isSelected && sizeVariants.length >= 12}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              isSelected
                                ? 'bg-brand-pink text-white shadow-sm'
                                : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:ring-brand-pink disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                          >
                            {shoeSize}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-600">
                      Haz clic en las tallas para agregarlas o quitarlas. Puedes seleccionar hasta 12 tallas.
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const defaults = getCommonShoeSizes();
                          const next = Array.from(new Set([...sizeVariants, ...defaults])).slice(0, 12);
                          setSizeVariants(next);
                        }}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-gray-300 hover:ring-brand-pink"
                      >
                        Seleccionar frecuentes
                      </button>
                      <button
                        type="button"
                        onClick={() => setSizeVariants([])}
                        className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold ring-1 ring-gray-300 hover:ring-brand-pink"
                      >
                        Limpiar
                      </button>
                    </div>
                  </div>
                )}
                {!shoeSizes && (
                  <div className="mb-3 rounded-xl border border-pink-200 bg-pink-50 p-3">
                    <div className="text-xs font-semibold text-gray-900 mb-2">Tallas de ropa disponibles:</div>
                    <div className="flex flex-wrap gap-2">
                      {clothingSizes.map((clSize) => {
                        const isSelected = sizeVariants.includes(clSize);
                        return (
                          <button
                            key={clSize}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSizeVariants(sizeVariants.filter((s) => s !== clSize));
                              } else if (sizeVariants.length < 12) {
                                setSizeVariants([...sizeVariants, clSize]);
                              }
                            }}
                            disabled={!isSelected && sizeVariants.length >= 12}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                              isSelected
                                ? 'bg-brand-pink text-white shadow-sm'
                                : 'bg-white text-gray-700 ring-1 ring-gray-300 hover:ring-brand-pink disabled:opacity-50 disabled:cursor-not-allowed'
                            }`}
                          >
                            {clSize}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-[11px] text-gray-600">
                      Haz clic en las tallas para agregarlas o quitarlas. Puedes seleccionar hasta 12 tallas.
                    </div>
                  </div>
                )}
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
              
              {sizeVariants.length > 0 && (
                <div className="mt-4 rounded-2xl border border-black/5 bg-gray-50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Stock por talla</div>
                    <div className="text-xs text-gray-600">{sizeType === 'shoes' ? 'Calzado' : 'Ropa'}</div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {sizeVariants.map((sv) => (
                      <div key={sv} className="flex items-center gap-3">
                        <div className="min-w-[80px] rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-gray-900 ring-1 ring-gray-300">{sv}</div>
                        <input
                          type="number"
                          min={0}
                          value={Number.isFinite(sizeStock[sv]) ? String(sizeStock[sv]) : ''}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setSizeStock((prev) => ({ ...prev, [sv]: Number.isFinite(n) && n >= 0 ? n : 0 }));
                          }}
                          className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                          placeholder="Cantidad"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              {saleType === 'direct' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Precio</label>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={priceInput}
                    onChange={(e) => {
                      // Solo dígitos; permitir vacío para que no “se pegue” el 0
                      const next = e.target.value.replace(/[^\d]/g, '');
                      setPriceInput(next);
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                    placeholder="Ej. 250"
                    required
                  />
                  <div className="mt-1 text-xs text-gray-500">Vista previa: {formatMoney(Number(priceInput || 0))}</div>
                </div>
              ) : (
                <div className="rounded-2xl border border-black/5 bg-gray-50 p-4">
                  <div className="text-sm font-semibold text-gray-900">Parámetros de subasta</div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Fecha de inicio</label>
                      <input
                        type="date"
                        value={auctionStartDate}
                        onChange={(e) => setAuctionStartDate(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Duración (días, máx 7)</label>
                      <input
                        type="number"
                        min={1}
                        max={7}
                        value={auctionDurationDays}
                        onChange={(e) => setAuctionDurationDays(Number(e.target.value))}
                        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Hora de finalización</label>
                      <input
                        type="time"
                        value={auctionEndHour}
                        onChange={(e) => setAuctionEndHour(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Puja inicial</label>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={auctionStartingBidInput}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^\d]/g, '');
                          setAuctionStartingBidInput(next);
                        }}
                        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                        required
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Incremento de puja</label>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={auctionBidIncrementInput}
                        onChange={(e) => {
                          const next = e.target.value.replace(/[^\d]/g, '');
                          setAuctionBidIncrementInput(next);
                        }}
                        className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                        required
                      />
                      <div className="mt-1 text-xs text-gray-600">
                        Regla: un usuario no puede pujar dos veces seguidas; solo vuelve a pujar cuando alguien más lo supere.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-xl bg-brand-pink px-6 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploadingCount > 0 ? `Subiendo imágenes… (${uploadingCount})` : isSaving ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

