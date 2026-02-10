'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { TemplateBlock } from '@/lib/templates/blocks';
import { blocksToPlainText } from '@/lib/templates/text';
import { BlocksRenderer } from '@/components/templates/BlocksRenderer';
import RichTextEditor from '@/components/editor/RichTextEditor';
import { listingPolicyHumanWarning, scanListingContentPolicy } from '@/lib/moderation/listingContentPolicy';
import { checkLimit, getPlan, PLAN_LIMITS, PlanType, getCommissions } from '@/lib/plans/limits';
import { NEW_CATEGORIES_CONFIG, generateTags, UNIVERSAL_ATTRIBUTES, type Category, type SubCategory, type AttributeConfig } from '@/lib/categories';
import { SmartCategorySelector } from '@/components/listings/SmartCategorySelector';
import { PageTour } from '@/components/PageTour';
import { pageTours } from '@/lib/tours/config';
import { detectCategory } from '@/lib/category-detection';
import { taskQueue } from '@/lib/queue/TaskQueue';
import { PublicationAssistantPocky } from '@/components/mascot/PublicationAssistantPocky';

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
  const [commissionRates, setCommissionRates] = useState<{ basic: number; pro: number } | null>(null);
  const [userProfile, setUserProfile] = useState<any>(null);

  useEffect(() => {
    getCommissions(supabase).then(setCommissionRates);
    
    // Fetch profile for official store check
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from('profiles').select('*').eq('id', data.user.id).single()
          .then(({ data: profile }) => setUserProfile(profile));
      }
    });
  }, []);

  // Función para reiniciar el tutorial
  const restartTour = async () => {
    try {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        // El pageId es "sell_tour", así que la key es `pocket_tour_sell_tour_${uid}`
        localStorage.removeItem(`pocket_tour_sell_tour_${data.user.id}`);
        window.location.reload();
      } else {
        alert('Debes iniciar sesión para ver el tutorial completo.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [shippingBySeller, setShippingBySeller] = useState(false);
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

  const [gender, setGender] = useState<string>('Mujer');
  const [size, setSize] = useState<string>('M');
  const [color, setColor] = useState<string>('');
  const [category, setCategory] = useState<string>('Tops');
  const [stock, setStock] = useState<string>('');
  const [brand, setBrand] = useState<string>('');
  const [model, setModel] = useState<string>('');

  // New categorization state
  const [subcategory, setSubcategory] = useState<string>('');
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [disabledAttributes, setDisabledAttributes] = useState<string[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [autoDetectionEnabled, setAutoDetectionEnabled] = useState(true);
  const [pendingCategories, setPendingCategories] = useState<string[]>([]);
  const [approvedCategories, setApprovedCategories] = useState<string[]>([]);

  // Derived: Current subcategory config
  const currentSubcategoryConfig = useMemo(() => {
    if (!subcategory) return null;
    
    // Search in all categories
    for (const group of Object.values(NEW_CATEGORIES_CONFIG)) {
      for (const cat of group) {
        const found = cat.subcategories.find(s => s.id === subcategory);
        if (found) return found;
      }
    }
    return null;
  }, [subcategory]);

  // Validation: Check restricted categories (Official Stores Only)
  useEffect(() => {
    if (currentSubcategoryConfig?.restricted && userProfile) {
      if (!userProfile.is_official_store) {
        setSubcategory(''); // Reset selection
        // Show warning
        setPageError(`⛔ La venta de "${currentSubcategoryConfig.label}" está restringida exclusivamente a Tiendas Oficiales Verificadas. Esta acción ha sido bloqueada.`);
        
        // Auto-hide error after 5s
        setTimeout(() => setPageError(null), 5000);
      }
    }
  }, [currentSubcategoryConfig, userProfile]);

  useEffect(() => {
    const fetchApproved = async () => {
      const { data } = await supabase
        .from('category_requests')
        .select('category_name')
        .eq('status', 'approved')
        .eq('gender', gender);

      if (data) {
        setApprovedCategories(data.map(d => d.category_name));
      }
    };
    fetchApproved();
  }, [gender]);

  // Scroll to error
  useEffect(() => {
    if (pageError) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [pageError]);

  const handleToggleAttribute = (id: string) => {
    setDisabledAttributes(prev => {
      const isDisabling = !prev.includes(id);
      if (isDisabling) {
        // Clear value if disabling
        setAttributes(curr => {
          const next = { ...curr };
          delete next[id];
          return next;
        });
        return [...prev, id];
      } else {
        return prev.filter(x => x !== id);
      }
    });
  };

  const [colorVariants, setColorVariants] = useState<string[]>([]);
  const [newColorVariant, setNewColorVariant] = useState<string>('');
  const [sizeVariants, setSizeVariants] = useState<string[]>([]);
  const [newSizeVariant, setNewSizeVariant] = useState<string>('');
  const [sizeType, setSizeType] = useState<'clothing' | 'shoes'>('clothing');
  const [sizeStock, setSizeStock] = useState<Record<string, number>>({});

  const [saleType, setSaleType] = useState<'direct' | 'auction'>('direct');
  const [isFeatured, setIsFeatured] = useState(false);
  const [freeShipping, setFreeShipping] = useState(false);
  const [customShippingPrice, setCustomShippingPrice] = useState<string>('');
  const [selectedShippingCarrier, setSelectedShippingCarrier] = useState<string>('');
  const [condition, setCondition] = useState<'nuevo' | 'usado' | 'casi_nuevo' | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [richTextContent, setRichTextContent] = useState('');
  const [priceInput, setPriceInput] = useState<string>('');

  const handleRteChange = (html: string) => {
    setRichTextContent(html);
    // Strip HTML for plain text description
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const plain = doc.body.textContent || '';
    setDescription(plain);

    // Only update blocks if NOT using a template
    if (!selectedTemplateId) {
      setDescriptionBlocks([{ type: 'richtext', content: html }]);
    }
  };

  // Subasta
  const [auctionStartDate, setAuctionStartDate] = useState<string>(''); // yyyy-mm-dd
  const [auctionDurationDays, setAuctionDurationDays] = useState<number>(3); // 1..7
  const [auctionEndHour, setAuctionEndHour] = useState<string>('20:00'); // HH:mm
  const [auctionStartingBidInput, setAuctionStartingBidInput] = useState<string>('');
  const [auctionBidIncrementInput, setAuctionBidIncrementInput] = useState<string>('10');

  // Peso y dimensiones
  const [weight, setWeight] = useState<string>('1');
  const [length, setLength] = useState<string>('20');
  const [width, setWidth] = useState<string>('20');
  const [height, setHeight] = useState<string>('10');

  // Costo de envío calculado y subsidio
  const [shippingCost, setShippingCost] = useState<number | null>(null);
  const [shippingSubsidy, setShippingSubsidy] = useState<string>('');
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [allowPersonalDelivery, setAllowPersonalDelivery] = useState(false);
  const [handlingDays, setHandlingDays] = useState<string>('0');

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

        // Auto-disable features if not allowed
        if (!PLAN_LIMITS[auctions.plan].allow_shipping_by_seller) {
          setShippingBySeller(false);
        }
        if (!PLAN_LIMITS[auctions.plan].allow_personal_delivery) {
          setAllowPersonalDelivery(false);
        }
      }
    };
    void fetchLimits();
  }, []);

  const [files, setFiles] = useState<File[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);

  const canSaveDraft = useMemo(() => {
    return title.trim().length >= 3 && !isSaving && uploadingCount === 0;
  }, [title, isSaving, uploadingCount]);

  const categories = useMemo(() => {
    const cats = NEW_CATEGORIES_CONFIG[gender] || [];
    const defaults = cats.map(c => c.label);
    return Array.from(new Set([...defaults, ...pendingCategories, ...approvedCategories]));
  }, [gender, pendingCategories, approvedCategories]);

  const handleProposeCategory = async (newCat: string) => {
    const normalized = newCat.trim();
    if (normalized.length < 3) return;

    // Check duplicates
    const exists = categories.some(c =>
      c.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0
    );
    if (exists) {
      const existing = categories.find(c => c.localeCompare(normalized, undefined, { sensitivity: 'base' }) === 0);
      if (existing) setCategory(existing);
      return;
    }

    // Check for similar categories to suggest
    const similar = categories.filter(c => {
      const cNorm = c.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const inputNorm = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return cNorm.includes(inputNorm) || (inputNorm.length > 3 && inputNorm.includes(cNorm));
    });

    let message = `¿Deseas proponer la creación de la categoría "${normalized}"? Se enviará a revisión.`;
    if (similar.length > 0) {
      message = `Encontramos categorías similares: ${similar.join(', ')}.\n\n¿Quizás querías decir alguna de estas?\n\n` + message;
    }

    if (!window.confirm(message)) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Optimistic update
        setPendingCategories(prev => [...prev, normalized]);
        setCategory(normalized);

        // Attempt to save request
        const { error } = await supabase.from('category_requests').insert({
          user_id: user.id,
          category_name: normalized,
          gender: gender,
          status: 'pending'
        });
        if (error) console.warn('Could not save category request (table might be missing)', error);
      }
    } catch (e) {
      console.error('Error creating category request:', e);
    }
  };

  // Derived state for current category config
  const currentCategoryConfig = useMemo(() => {
    const cats = NEW_CATEGORIES_CONFIG[gender] || [];
    return cats.find(c => c.label === category);
  }, [gender, category]);

  // Derived state for current subcategory config
  const currentSubcategoryConfig = useMemo(() => {
    if (!currentCategoryConfig || !subcategory) return null;
    return currentCategoryConfig.subcategories?.find(s => s.id === subcategory);
  }, [currentCategoryConfig, subcategory]);

  // Validation: Check restricted categories (Official Stores Only)
  useEffect(() => {
    if (currentSubcategoryConfig?.restricted && userProfile) {
      if (!userProfile.is_official_store) {
        setSubcategory(''); // Reset selection
        // Show warning
        setPageError(`⛔ La venta de "${currentSubcategoryConfig.label}" está restringida exclusivamente a Tiendas Oficiales Verificadas. Esta acción ha sido bloqueada.`);
        
        // Auto-hide error after 5s
        setTimeout(() => setPageError(null), 5000);
      }
    }
  }, [currentSubcategoryConfig, userProfile]);

  // Derived state for active attributes (merged from category and subcategory)
  const activeAttributes = useMemo(() => {
    const catAttrs = currentCategoryConfig?.attributes || [];
    const subAttrs = currentSubcategoryConfig?.attributes || [];

    // Merge universal, category, and subcategory attributes
    // Use Map to deduplicate by ID (subcategory overrides category, category overrides universal)
    const attrMap = new Map<string, AttributeConfig>();

    UNIVERSAL_ATTRIBUTES.forEach(attr => attrMap.set(attr.id, attr));
    catAttrs.forEach(attr => attrMap.set(attr.id, attr));
    subAttrs.forEach(attr => attrMap.set(attr.id, attr));

    return Array.from(attrMap.values());
  }, [currentCategoryConfig, currentSubcategoryConfig]);

  // Auto-detection effect with Task Queue
  useEffect(() => {
    if (!autoDetectionEnabled || !title || title.length < 3) return;

    // Enqueue critical detection task
    taskQueue.enqueue(async () => {
      const match = detectCategory(title);
      if (match && match.confidence > 0.6) {
        // Verify gender exists
        if (NEW_CATEGORIES_CONFIG[match.gender]) {
          // Use functional updates or verify mounted state if needed
          // For now direct state set is fine as this runs in client
          setGender(match.gender as any);

          // Verify category exists in that gender
          const catExists = NEW_CATEGORIES_CONFIG[match.gender].find(c => c.label === match.category);
          if (catExists) {
            setCategory(match.category);
            if (match.subcategory) {
              // Verify subcategory
              const subExists = catExists.subcategories?.find(s => s.id === match.subcategory);
              if (subExists) {
                setSubcategory(match.subcategory);
              } else {
                setSubcategory('');
              }
            } else {
              setSubcategory('');
            }
          }
        }
      }
    }, 'critical', 'auto-detect-category');

  }, [title, autoDetectionEnabled]);

  // Auto-save Draft effect (Compaction)
  useEffect(() => {
    if (!canSaveDraft) return;

    // Enqueue compaction task (throttled to 5 mins by queue)
    taskQueue.enqueue(async () => {
      // TODO: Implement actual save logic here or call existing save function
      // For now just simulating the compaction operation
      await new Promise(resolve => setTimeout(resolve, 500));
    }, 'compaction', 'auto-save-draft');

  }, [title, description, priceInput, canSaveDraft]);

  // Reset subcategory and attributes when category changes
  useEffect(() => {
    setSubcategory('');
    setAttributes({});
    setTags([]);
  }, [category, gender]);

  // Reset attributes when subcategory changes
  useEffect(() => {
    setAttributes({});
  }, [subcategory]);

  // Auto-generate tags
  useEffect(() => {
    const autoTags = generateTags(gender, category, subcategory || null, attributes);
    setTags(prev => {
      const newSet = new Set([...prev, ...autoTags]);
      return Array.from(newSet);
    });
  }, [gender, category, subcategory, attributes]);

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
  const clothingSizes = useMemo(() => {
    // Permitir tallas si es Fashion Root O si es Lencería en Otros
    const isFashion = IS_FASHION_ROOT(gender) || (gender === 'Otros' && (subcategory === 'Lenceria' || subcategory === 'Lencería'));
    
    if (!isFashion) return [];
    if (gender === 'Niños' || gender === 'Niñas') {
      return ['2', '4', '6', '8', '10', '12', '14', '16'];
    }
    return ['XCH', 'CH', 'M', 'L', 'XG', 'XXL', 'XXXL'];
  }, [gender, subcategory]);

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
      for (let n = 15; n <= 25; n++) {
        sizes.push(String(n));
        if (n < 25) sizes.push(`${n}.5`);
      }
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

  const isClothing = useMemo(() => {
    if (!IS_FASHION_ROOT(gender)) return false;
    if (shoeSizes) return false;
    if (category === 'Accesorios' || category === 'Textiles y Blancos') return false;
    if (gender === 'Hogar') return false;

    // Verificar si es una categoría conocida en la configuración (ropa estándar)
    const config = NEW_CATEGORIES_CONFIG[gender] || [];
    const isKnown = config.some(c => c.label === category);

    // Si está en la configuración y no fue excluida arriba, es ropa.
    if (isKnown) return true;

    // Si es una categoría nueva/personalizada, asumimos que NO es ropa por defecto
    // para evitar bloquear la publicación pidiendo tallas que no existen.
    return false;
  }, [shoeSizes, category, gender]);

  function getCommonShoeSizes(): string[] {
    if (!shoeSizes) return [];
    if (gender === 'Mujer') {
      return ['23', '23.5', '24', '24.5', '25', '25.5', '26'];
    }
    if (gender === 'Niños' || gender === 'Niñas') {
      return ['18', '19', '20', '21', '22', '23', '24', '25'];
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

    // Validate subcategory
    if (currentCategoryConfig?.subcategories && currentCategoryConfig.subcategories.length > 0) {
      if (!subcategory) return false;
    }

    // Validate required attributes
    if (activeAttributes.length > 0) {
      const missingAttr = activeAttributes.some(attr => attr.required && !attributes[attr.id]);
      if (missingAttr) return false;
    }

    // Validate size selection (Required for Clothing and Shoes)
    if ((isClothing || shoeSizes) && sizeVariants.length === 0) {
      return false;
    }

    // Si hay placeholders de plantilla, deben estar llenos antes de publicar
    const blocks = Array.isArray(descriptionBlocks) ? descriptionBlocks : null;
    if (blocks) {
      const missing = blocks.some((b: any) => b?.type === 'image' && !String(b?.url || '').trim());
      if (missing) return false;
    }

    if (saleType === 'direct') {
      if (limitsUsage && !limitsUsage.listings.allowed) return false;
      return Number.isFinite(parsedDirectPrice) && parsedDirectPrice > 0;
    }

    // Subasta
    if (limitsUsage && !limitsUsage.auctions.allowed) return false;
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
    currentCategoryConfig,
    activeAttributes,
    subcategory,
    attributes,
    limitsUsage,
    isClothing,
    shoeSizes,
    sizeVariants
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

  const saveListing = async (targetStatus: 'active' | 'draft') => {
    setPageError(null);
    setSuccess(null);

    const t = title.trim();
    if (t.length < 3) {
      setPageError('El título debe tener al menos 3 caracteres.');
      return;
    }

    if (uploadingCount > 0) {
      setPageError('Por favor espera a que terminen de subirse las imágenes.');
      return;
    }

    const d0 = description.trim();
    const blocks = Array.isArray(descriptionBlocks) ? descriptionBlocks : null;
    const d = d0 || (blocks ? blocksToPlainText(blocks) : '');
    const directPrice = Number(priceInput || 0);

    // Validaciones estrictas solo para publicar (active)
    if (targetStatus === 'active') {
      if (!category.trim()) {
        setPageError('Selecciona una categoría.');
        return;
      }

      if (currentCategoryConfig?.subcategories && currentCategoryConfig.subcategories.length > 0 && !subcategory) {
        setPageError('Selecciona una subcategoría.');
        return;
      }

      if (!condition) {
        setPageError('Selecciona la condición del producto (Nuevo, Usado, etc.).');
        return;
      }

      // Validar Tallas (Ropa/Calzado)
      if ((isClothing || shoeSizes) && sizeVariants.length === 0) {
        setPageError('Selecciona al menos una talla.');
        return;
      }

      // Validar Stock
      if (saleType === 'direct') {
        if (sizeVariants.length > 0) {
          const totalStock = Object.values(sizeStock).reduce((a, b) => Number(a) + Number(b), 0);
          if (totalStock <= 0) {
            setPageError('Indica el stock para al menos una talla.');
            return;
          }
        } else {
          if (!stock.trim() || Number(stock) <= 0) {
            setPageError('Indica la cantidad disponible (Stock).');
            return;
          }
        }
      }

      // Attribute Validation (Flexible)
      const missingRequired = activeAttributes.filter(
        attr => attr.required && attr.id !== 'condition' && !attributes[attr.id] && !disabledAttributes.includes(attr.id)
      );

      if (missingRequired.length > 0) {
        setPageError(`Faltan atributos obligatorios: ${missingRequired.map(a => a.label).join(', ')}. Complétalos o marca "No aplica".`);
        return;
      }

      const disabledRequired = activeAttributes.filter(
        attr => attr.required && disabledAttributes.includes(attr.id)
      );

      if (disabledRequired.length > 0) {
        // Soft warning for disabled required attributes
        const confirm = window.confirm(
          `Has desactivado atributos recomendados (${disabledRequired.map(a => a.label).join(', ')}). \n\nEsto podría reducir la visibilidad de tu producto en las búsquedas. ¿Deseas publicar de todas formas?`
        );
        if (!confirm) return;
      }

      if (blocks) {
        const missing = blocks.some((b: any) => b?.type === 'image' && !String(b?.url || '').trim());
        if (missing) {
          setPageError('Te falta subir una o más imágenes de la plantilla (bloques de imagen vacíos).');
          return;
        }
      }

      // Anti-contacto
      const scan = scanListingContentPolicy({ title: t, description: d, blocksText: blocks ? blocksToPlainText(blocks) : '' });
      if (!scan.ok) {
        setPageError(listingPolicyHumanWarning(scan.violations));
        return;
      }

      if (saleType === 'direct' && (!Number.isFinite(directPrice) || directPrice <= 0)) {
        setPageError('El precio debe ser mayor a 0.');
        return;
      }

      // Validar regla de negocio: No permitir saldo negativo con envío gratis
      if (saleType === 'direct' && freeShipping && shippingCost !== null) {
        const rate = limitsUsage?.plan === 'pro' 
          ? ((commissionRates?.pro ?? PLAN_LIMITS.pro.commission_percent) / 100) 
          : ((commissionRates?.basic ?? PLAN_LIMITS.basic.commission_percent) / 100);
        const commission = directPrice * rate;
        const estimatedNet = directPrice - commission - shippingCost;

        if (estimatedNet < 0) {
          setPageError(`El precio ($${directPrice}) es muy bajo para ofrecer envío gratis ($${shippingCost}). Después de comisión ($${commission.toFixed(2)}) y envío, tendrías un saldo negativo de ${formatMoney(estimatedNet)}. Aumenta el precio o cobra el envío.`);
          return;
        }
      }
      // Validar regla de negocio: Entregas personales solo > $200
      if (saleType === 'direct' && allowPersonalDelivery && directPrice < 200) {
        setPageError('Las entregas personales solo están permitidas para artículos de $200.00 o más.');
        return;
      }

      // Validar comisión mínima de $15.00
      if (limitsUsage) {
        const rate = limitsUsage.plan === 'pro' 
          ? ((commissionRates?.pro ?? PLAN_LIMITS.pro.commission_percent) / 100) 
          : ((commissionRates?.basic ?? PLAN_LIMITS.basic.commission_percent) / 100);
        const minPrice = 15 / rate;
        if (directPrice < minPrice) {
          setPageError(`El precio mínimo debe ser $${minPrice.toFixed(2)} para cubrir la comisión mínima de $15.00.`);
          return;
        }
      }

      const finalColor = attributes['color']?.trim() || color.trim();
      if (!finalColor && !colorVariants.length) {
        setPageError('Indica el color principal del producto.');
        return;
      }

      // Validar límites del plan
      if (limitsUsage) {
        if (saleType === 'auction' && !limitsUsage.auctions.allowed) {
          setPageError(`Has alcanzado tu límite de ${limitsUsage.auctions.limit} subastas este mes. Cámbiate a PRO para ilimitadas.`);
          return;
        }
        // Si es venta directa o subasta, cuenta como listing
        if (!limitsUsage.listings.allowed) {
          setPageError(`Has alcanzado tu límite de ${limitsUsage.listings.limit} publicaciones este mes. Cámbiate a PRO para ilimitadas.`);
          return;
        }
        // Destacado removido
        if (isFeatured && !limitsUsage.featured.allowed) {
          setPageError(`Has alcanzado tu límite de ${limitsUsage.featured.limit} destacados este mes. Cámbiate a PRO para obtener 25.`);
          return;
        }
        if (shippingBySeller && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller) {
          setPageError('Tu plan actual no permite envíos por cuenta propia. Cámbiate a PRO.');
          return;
        }
        if (allowPersonalDelivery && !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery) {
          setPageError('Tu plan actual no permite entregas personales. Cámbiate a PRO.');
          return;
        }
      }

      if (files.length < 2) {
        setPageError('Sube mínimo 2 imágenes.');
        return;
      }
      if (files.length > 6) {
        setPageError('Máximo 6 imágenes.');
        return;
      }
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

      if (saleType === 'auction' && targetStatus === 'active') {
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

      // Reemplazar URLs de blob (locales) por URLs permanentes en los bloques de descripción
      let finalBlocks = blocks;
      if (finalBlocks && previewUrls.length > 0 && urls.length === previewUrls.length) {
        finalBlocks = finalBlocks.map((b: any) => {
          if (b.type === 'richtext' && typeof b.content === 'string') {
            let newContent = b.content;
            previewUrls.forEach((blobUrl, idx) => {
              // Reemplazo global de todas las ocurrencias del blobUrl
              newContent = newContent.split(blobUrl).join(urls[idx]);
            });
            return { ...b, content: newContent };
          }
          return b;
        });
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
          status: targetStatus,
          brand: attributes['brand']?.trim() || brand.trim(),
          model: attributes['model']?.trim() || model.trim(),
          gender,
          size,
          color: attributes['color']?.trim() || color.trim(),
          category,
          subcategory,
          attributes,
          tags,
          free_shipping: Boolean(freeShipping),
          condition: condition || null,
          stock: stock.trim() ? Number(stock.trim()) || null : null,
          color_variants: colorVariants.length > 0 ? colorVariants : null,
          size_variants: sizeVariants.length > 0 ? sizeVariants : null,
          size_stock: Object.keys(sizeStock).length > 0 ? sizeStock : null,
          size_type: sizeType || null,
          sale_type: saleType,
          is_featured: Boolean(isFeatured),
          featured_fee: 0,
          auction_start_at: auctionStartAt,
          auction_end_at: auctionEndAt,
          auction_starting_bid: saleType === 'auction' ? startingBid : 0,
          auction_bid_increment: saleType === 'auction' ? inc : 0,
          auction_highest_bid: saleType === 'auction' ? startingBid : 0,
          weight_kg: Number(weight) > 0 ? Number(weight) : 1,
          length_cm: Number(length) > 0 ? Number(length) : 10,
          width_cm: Number(width) > 0 ? Number(width) : 10,
          height_cm: Number(height) > 0 ? Number(height) : 10,
          shipping_by_seller: Boolean(shippingBySeller),
          shipping_price: shippingBySeller && !freeShipping ? (Number(customShippingPrice) || 0) : 0,
          shipping_carrier: shippingBySeller ? selectedShippingCarrier : null,
          shipping_subsidy: shippingSubsidy ? Number(shippingSubsidy) : 0,
          allow_personal_delivery: Boolean(allowPersonalDelivery),
          handling_days: Number(handlingDays) || 0,
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

      setSuccess(targetStatus === 'draft' ? '¡Borrador guardado!' : '¡Publicación creada! Redirigiendo…');
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

  const onPublish = (e: React.FormEvent) => {
    e.preventDefault();
    saveListing('active');
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
          <div className="mt-3 flex items-center justify-between">
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">Publica tu artículo</h1>
            <button
              onClick={restartTour}
              type="button"
              className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-brand-pink ring-1 ring-pink-200 hover:bg-pink-100"
            >
              Ver Tutorial 🤖
            </button>
          </div>
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
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8" data-tour="images-section">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Imágenes</h2>
                <p className="mt-1 text-sm text-gray-600">Selecciona tus fotos. Puedes añadir varias veces.</p>
              </div>
              <div className="text-sm font-semibold text-gray-900">{files.length}/6</div>
            </div>

            <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
              <span className="font-bold">💡 Consejo:</span> Usa fotos con fondo blanco o profesionales para que tu producto luzca mejor y vendas más rápido.
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
                    className={`rounded-2xl border p-4 text-left text-sm ${saleType === 'direct' ? 'border-brand-pink bg-pink-50' : 'border-black/5 bg-white'
                      }`}
                  >
                    <div className="font-semibold text-gray-900">Venta directa</div>
                    <div className="mt-1 text-xs text-gray-600">Compra inmediata con precio fijo.</div>
                    {limitsUsage && (
                      <div className={`mt-2 text-xs font-bold ${limitsUsage.listings.allowed ? 'text-green-600' : 'text-red-600'}`}>
                        {limitsUsage.listings.allowed
                          ? `Restantes: ${limitsUsage.listings.limit === Infinity ? 'Ilimitadas' : limitsUsage.listings.limit - limitsUsage.listings.usage}`
                          : 'Límite mensual alcanzado'}
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSaleType('auction')}
                    className={`rounded-2xl border p-4 text-left text-sm ${saleType === 'auction' ? 'border-brand-pink bg-pink-50' : 'border-black/5 bg-white'
                      }`}
                  >
                    <div className="font-semibold text-gray-900">Subasta</div>
                    <div className="mt-1 text-xs text-gray-600">Los usuarios pujan y gana la mayor oferta.</div>
                    {limitsUsage && (
                      <div className={`mt-2 text-xs font-bold ${limitsUsage.auctions.allowed ? 'text-green-600' : 'text-red-600'}`}>
                        {limitsUsage.auctions.allowed
                          ? `Restantes: ${limitsUsage.auctions.limit === Infinity ? 'Ilimitadas' : limitsUsage.auctions.limit - limitsUsage.auctions.usage}`
                          : 'Límite mensual alcanzado'}
                      </div>
                    )}
                  </button>
                </div>

                {/* Bloqueo por límite alcanzado */}
                {limitsUsage && (
                  (saleType === 'direct' && !limitsUsage.listings.allowed) ||
                  (saleType === 'auction' && !limitsUsage.auctions.allowed)
                ) && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                      <p className="font-bold">Has alcanzado tu límite mensual de {saleType === 'direct' ? 'publicaciones' : 'subastas'}.</p>
                      <p className="mt-1">
                        Tu plan actual ({limitsUsage.plan.toUpperCase()}) solo permite {saleType === 'direct' ? limitsUsage.listings.limit : limitsUsage.auctions.limit} al mes.
                        <Link href="/dashboard/pro" className="ml-1 font-bold underline hover:text-red-900">Actualiza a PRO para tener ilimitadas.</Link>
                      </p>
                    </div>
                  )}
              </div>


            </div>
          </section>

          {/* Promoción / Destacados */}
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Visibilidad</h2>
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
              <label className={`flex items-start gap-3 cursor-pointer ${limitsUsage && !limitsUsage.featured.allowed ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div className="mt-1">
                  <input
                    type="checkbox"
                    checked={isFeatured}
                    disabled={limitsUsage && !limitsUsage.featured.allowed}
                    onChange={(e) => {
                      if (limitsUsage && !limitsUsage.featured.allowed) return;
                      setIsFeatured(e.target.checked);
                    }}
                    className="h-5 w-5 rounded border-gray-300 text-yellow-500 focus:ring-yellow-500"
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-yellow-900">Destacar publicación</span>
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">
                      Recomendado
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-yellow-800">
                    Tu artículo aparecerá en la sección de "Destacados" y tendrá mayor visibilidad en las búsquedas.
                  </div>
                  {limitsUsage && (
                    <div className="mt-2 text-xs font-semibold">
                      {limitsUsage.featured.allowed ? (
                        <span className="text-green-700">
                          Te quedan {limitsUsage.featured.limit === Infinity ? 'Ilimitados' : limitsUsage.featured.limit - limitsUsage.featured.usage} destacados gratis este mes.
                        </span>
                      ) : (
                        <span className="text-red-700">
                          Has alcanzado tu límite de destacados ({limitsUsage.featured.limit}).
                          {limitsUsage.plan === 'basic' && (
                            <Link href="/dashboard/pro" className="ml-1 underline hover:text-red-800">
                              Mejora a PRO para obtener 25 destacados.
                            </Link>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </label>
            </div>
          </section>

          {/* Condición del artículo */}
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8" data-tour="condition-section">
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

          {/* Peso y Dimensiones (para envío) */}
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8" data-tour="shipping-section">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Envío y Entrega</h2>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700">Días de preparación (Handling Days)</label>
              <div className="mt-1 text-xs text-gray-500 mb-2">
                Si necesitas tiempo para fabricar o preparar el producto antes de enviarlo, indícalo aquí.
                (Ej. 0 para envío inmediato, 3 para 3 días de fabricación).
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

            <div className="mb-6 rounded-2xl border border-black/5 bg-gray-50 p-4">
              <label className={`flex items-center justify-between gap-3 cursor-pointer ${limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <div>
                  <div className="text-sm font-semibold text-gray-900">Envío por mi propia cuenta</div>
                  <div className="mt-1 text-xs text-gray-600">
                    Yo me encargo de la logística y el envío (no se generará guía de GoPocket).
                  </div>
                  {limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller && (
                    <div className="mt-1 text-xs font-bold text-red-600">
                      No disponible en tu plan actual. <Link href="/dashboard/pro" className="underline">Mejorar a PRO</Link>
                    </div>
                  )}
                </div>
                <input
                  type="checkbox"
                  checked={shippingBySeller}
                  disabled={limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller}
                  onChange={(e) => {
                    if (limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_shipping_by_seller) return;
                    setShippingBySeller(e.target.checked);
                    if (!e.target.checked) setFreeShipping(false);
                  }}
                  className="h-5 w-5 rounded border-gray-300 text-brand-pink focus:ring-brand-pink"
                />
              </label>

              {/* Configuración de Envío por cuenta propia */}
              {shippingBySeller && (
                <div className="mt-4 border-t border-gray-200 pt-4 space-y-4">
                  {/* Paquetería */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Paquetería / Método de envío</label>
                    <input
                      type="text"
                      value={selectedShippingCarrier}
                      onChange={(e) => setSelectedShippingCarrier(e.target.value)}
                      placeholder="Ej. Estafeta, DHL, Entrega personal..."
                      className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                    />
                  </div>

                  {/* Checkbox Envío Gratis */}
                  <label className="flex items-center justify-between gap-3 cursor-pointer rounded-xl border border-gray-200 p-3 bg-white">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">OFRECE ENVIO GRATIS POR TU PROPIA CUENTA</div>
                      <div className="mt-1 text-xs text-gray-600">
                        El comprador verá "Envío Gratis" y tú cubrirás el costo logístico por fuera.
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={freeShipping}
                      onChange={(e) => setFreeShipping(e.target.checked)}
                      className="h-5 w-5 rounded border-gray-300 text-brand-pink focus:ring-brand-pink"
                    />
                  </label>

                  {/* Costo de envío (solo si no es gratis) */}
                  {!freeShipping && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Costo de envío (a cargo del comprador)</label>
                      <div className="relative mt-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={customShippingPrice}
                          onChange={(e) => setCustomShippingPrice(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-xl border border-gray-300 pl-7 pr-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                        />
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        Este monto se sumará al total del comprador y se te liberará cuando califique la compra.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {!shippingBySeller && (
              <>
                <p className="mb-4 text-sm text-gray-600">
                  Ingresa el peso y dimensiones aproximadas del paquete para calcular el costo de envío.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Peso (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                      placeholder="Ej. 1.0"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Largo (cm)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                      placeholder="Ej. 20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Ancho (cm)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                      placeholder="Ej. 20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Alto (cm)</label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                      placeholder="Ej. 10"
                    />
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                  {isCalculatingShipping ? (
                    <div className="text-sm text-blue-800">Calculando costo de envío...</div>
                  ) : shippingCost !== null ? (
                    <div>
                      <div className="text-sm text-blue-800">
                        Costo de la guía: <span className="font-semibold">{formatMoney(shippingCost)}</span>
                      </div>
                      <div className="mt-1 text-base font-bold text-green-700">
                        Tu cliente pagará: {formatMoney(Math.max(0, shippingCost - (Number(shippingSubsidy) || 0)))}
                      </div>

                      <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 border border-amber-100">
                        <strong>Importante:</strong> El costo de la guía solo cubre el envío por el peso y medidas indicadas. Si sobrepesa, tendrás que pagarlo en la sucursal Estafeta. Estas guías solo se reciben en sucursales Estafeta.
                      </div>

                      <div className="mt-4">
                        <label className="block text-xs font-medium text-blue-800">
                          Subsidiar envío (descontar de mis ganancias):
                        </label>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-blue-800">$</span>
                            <input
                              type="number"
                              min="0"
                              max={shippingCost}
                              value={shippingSubsidy}
                              onChange={(e) => {
                                setShippingSubsidy(e.target.value);
                                const val = Number(e.target.value);
                                const cost = Number(shippingCost);
                                setFreeShipping(val >= cost);
                              }}
                              placeholder="0"
                              className="w-32 rounded-xl border border-blue-200 bg-white pl-7 pr-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-200"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setShippingSubsidy(String(shippingCost));
                              setFreeShipping(true);
                            }}
                            className="rounded-xl bg-blue-100 px-3 py-2 text-xs font-bold text-blue-800 hover:bg-blue-200"
                          >
                            Ofrecer envío Gratis
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-blue-200 pt-3">
                        <label className="flex items-start gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={allowPersonalDelivery}
                            disabled={limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery}
                            onChange={(e) => {
                              if (limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery) return;
                              setAllowPersonalDelivery(e.target.checked);
                            }}
                            className={`mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-pink focus:ring-brand-pink ${limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                          />
                          <div>
                            <div className="text-sm font-bold text-blue-900">Ofrecer entrega personal</div>
                            <div className="text-xs text-blue-800">
                              Esta opción solo aparecerá a compradores de tu mismo estado y ciudad.
                              {limitsUsage && !PLAN_LIMITS[limitsUsage.plan].allow_personal_delivery && (
                                <span className="block mt-1 font-bold text-red-600">
                                  No disponible en tu plan actual. <Link href="/dashboard/pro" className="underline">Mejorar a PRO</Link>
                                </span>
                              )}
                            </div>
                          </div>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-blue-800">Ingresa peso y medidas para calcular el costo.</div>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-black/5 sm:p-8" data-tour="title-input">
            <div className="grid gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Título</label>
                <input
                  data-tour="title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  placeholder="Ej. Blusa Zara como nueva"
                  required
                />
              </div>

              <div data-tour="description-section">
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                {!selectedTemplateId ? (
                  <RichTextEditor
                    content={richTextContent}
                    onChange={handleRteChange}
                    onImageUpload={uploadFile}
                    availableImages={previewUrls}
                  />
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                    Estás usando una Plantilla PRO. La descripción se genera a partir de los bloques de abajo.
                    <br />
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTemplateId('');
                        setSelectedTemplateTitle('');
                        // Restore rich text content if any
                        if (richTextContent) {
                          setDescriptionBlocks([{ type: 'richtext', content: richTextContent }]);
                        } else {
                          setDescriptionBlocks(null);
                        }
                      }}
                      className="mt-2 font-semibold text-brand-pink underline"
                    >
                      Quitar plantilla para editar descripción libre
                    </button>
                  </div>
                )}
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
                        if (txt) {
                          setDescription(txt);
                          setRichTextContent(txt.replace(/\n/g, '<br>'));
                        }
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
                        if (richTextContent) {
                          setDescriptionBlocks([{ type: 'richtext', content: richTextContent }]);
                        } else {
                          setDescriptionBlocks(null);
                        }
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
                <div data-tour="gender-selector">
                  <label className="block text-sm font-medium text-gray-700">Género</label>
                  <select
                    value={gender}
                    onChange={(e) => {
                      const newGender = e.target.value as any;
                      setGender(newGender);
                      setCategory('');
                    }}
                    className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                  >
                    <option value="Mujer">Mujer</option>
                    <option value="Hombre">Hombre</option>
                    <option value="Niñas">Niñas</option>
                    <option value="Niños">Niños</option>
                    <option value="Hogar">Hogar</option>
                    <option value="Deportes y Aire Libre">Deportes y Aire Libre</option>
                    <option value="Automotriz y Motocicletas">Automotriz y Motocicletas</option>
                    <option value="Alimentos y Bebidas">Alimentos y Bebidas</option>
                    <option value="Mascotas">Mascotas</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>
                {/* Auto-Detection UI */}
                <div className="mb-6 rounded-2xl border border-pink-100 bg-pink-50/50 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${autoDetectionEnabled ? 'bg-brand-pink text-white' : 'bg-gray-200 text-gray-500'}`}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                          <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">Detección Automática</h3>
                        <p className="text-xs text-gray-500">Clasificación inteligente basada en el título</p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={autoDetectionEnabled}
                        onChange={(e) => setAutoDetectionEnabled(e.target.checked)}
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-pink-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-pink"></div>
                    </label>
                  </div>

                  {/* Confidence Indicator */}
                  {autoDetectionEnabled && title.length >= 3 && (
                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="text-gray-600">Confianza del sistema:</span>
                      <div className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all duration-500"
                          style={{ width: detectCategory(title)?.confidence ? `${detectCategory(title)!.confidence * 100}%` : '0%' }}
                        />
                      </div>
                      <span className="font-medium text-gray-900">
                        {detectCategory(title)?.confidence ? `${Math.round(detectCategory(title)!.confidence * 100)}%` : '0%'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2" data-tour="category-section">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Categoría</label>
                  <div className="mt-1">
                    <SmartCategorySelector
                      value={category}
                      onChange={setCategory}
                      categories={categories}
                      onPropose={handleProposeCategory}
                    />
                  </div>
                </div>

                {/* Subcategory Selector */}
                {currentCategoryConfig?.subcategories && currentCategoryConfig.subcategories.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Subcategoría <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={subcategory}
                      onChange={(e) => setSubcategory(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-brand-pink"
                    >
                      <option value="">Selecciona...</option>
                      {currentCategoryConfig.subcategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Dynamic Attributes */}
              {activeAttributes.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2" data-tour="details-section">
                  {activeAttributes
                    .filter(attr => attr.id !== 'condition') // Condition uses custom UI
                    .map((attr) => {
                      const isDisabled = disabledAttributes.includes(attr.id);
                      return (
                        <div key={attr.id} className={attr.type === 'textarea' ? 'sm:col-span-2' : ''}>
                          <div className="mb-1 flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <label className={`block text-sm font-medium ${isDisabled ? 'text-gray-400' : 'text-gray-700'}`}>
                                {attr.label} {attr.required && <span className="text-red-500">*</span>}
                              </label>
                              {attr.helpText && (
                                <div className="group relative cursor-help">
                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-500 ring-1 ring-gray-200">?</span>
                                  <div className="absolute bottom-full left-0 mb-2 w-48 hidden rounded-lg bg-gray-900 p-2 text-xs text-white shadow-lg group-hover:block z-10">
                                    {attr.helpText}
                                    <div className="absolute -bottom-1 left-3 h-2 w-2 rotate-45 bg-gray-900"></div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* N/A Toggle */}
                            <button
                              type="button"
                              onClick={() => handleToggleAttribute(attr.id)}
                              className={`text-[10px] font-semibold uppercase tracking-wider ${isDisabled ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'
                                }`}
                            >
                              {isDisabled ? 'Habilitar' : 'No aplica'}
                            </button>
                          </div>

                          {attr.type === 'select' ? (
                            <select
                              value={attributes[attr.id] || ''}
                              onChange={(e) => setAttributes(prev => ({ ...prev, [attr.id]: e.target.value }))}
                              disabled={isDisabled}
                              className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors ${isDisabled
                                  ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                  : 'bg-white border-gray-300 focus:border-transparent focus:ring-2 focus:ring-brand-pink'
                                }`}
                            >
                              <option value="">Selecciona...</option>
                              {attr.options?.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="relative">
                              <input
                                type={attr.type === 'number' ? 'number' : 'text'}
                                value={attributes[attr.id] || ''}
                                onChange={(e) => setAttributes(prev => ({ ...prev, [attr.id]: e.target.value }))}
                                disabled={isDisabled}
                                className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors ${isDisabled
                                    ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : 'bg-white border-gray-300 focus:border-transparent focus:ring-2 focus:ring-brand-pink'
                                  }`}
                                placeholder={isDisabled ? 'No aplica' : (attr.placeholder || attr.label)}
                              />
                              {attr.suffix && !isDisabled && (
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                                  {attr.suffix}
                                </div>
                              )}
                            </div>
                          )}
                          {attr.helpText && !isDisabled && (
                            <p className="mt-1 text-xs text-gray-500">{attr.helpText}</p>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Variantes de talla {isClothing || shoeSizes ? <span className="text-red-600 text-xs font-bold">(Requerido)</span> : <span className="text-gray-400 font-normal">(opcional)</span>}
                </label>
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
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isSelected
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
                      Selecciona la talla (o tallas) de tu prenda. Es obligatorio elegir al menos una.
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
                {isClothing && (
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
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${isSelected
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
                <div data-tour="price-section">
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
                    <div data-tour="price-section">
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

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => saveListing('draft')}
              disabled={!canSaveDraft}
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Guardando...' : 'Guardar Borrador'}
            </button>
            <button
              type="submit"
              data-tour="publish-button"
              disabled={isSaving || uploadingCount > 0}
              className={`rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all ${isSaving || uploadingCount > 0
                  ? 'bg-gray-400 cursor-not-allowed opacity-70'
                  : 'bg-brand-pink hover:opacity-90 hover:scale-[1.02]'
                }`}
            >
              {uploadingCount > 0 ? `Subiendo imágenes… (${uploadingCount})` : isSaving ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </form>
      </main>
      <PageTour steps={pageTours.sell} pageId="sell_tour" />
    </div>
  );
}

