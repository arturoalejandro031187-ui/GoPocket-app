export type AttributeType = 'text' | 'number' | 'select' | 'boolean' | 'textarea';

export interface AttributeConfig {
  id: string;
  label: string;
  type: AttributeType;
  options?: string[]; // For select type
  min?: number; // For number type
  max?: number;
  suffix?: string; // e.g., "cm", "kg"
  required?: boolean;
  placeholder?: string;
  helpText?: string; // Contextual guidance
  section?: string; // To group attributes in UI if needed
}

export interface SubCategory {
  id: string;
  label: string;
  attributes?: AttributeConfig[];
}

export interface Category {
  id: string;
  label: string;
  subcategories: SubCategory[];
  attributes?: AttributeConfig[]; // Attributes that apply to the whole category
}

export interface GenderCategory {
  label: 'Mujeres' | 'Hombre' | 'Niños' | 'Niñas';
  categories: Category[];
}

// Helper to create simple category without special attributes
const simpleCategory = (label: string): Category => ({
  id: label,
  label,
  subcategories: [],
});

// --- Attribute Definitions ---

export const UNIVERSAL_ATTRIBUTES: AttributeConfig[] = [
  { id: 'brand', label: 'Marca', type: 'text', required: false, section: 'General', helpText: 'Marca del fabricante (ej: Zara, Nike, Sony).' },
  { id: 'model', label: 'Modelo', type: 'text', required: false, section: 'General', helpText: 'Modelo específico (ej: Air Max 90, iPhone 12).' },
  { id: 'color', label: 'Color', type: 'text', required: false, section: 'General', helpText: 'Color principal del artículo.' },
  { id: 'country_of_origin', label: 'País de Origen', type: 'text', required: false, section: 'General', helpText: 'País donde fue fabricado.' },
  { id: 'main_material', label: 'Material Principal', type: 'text', required: false, section: 'General', helpText: 'Material predominante (ej: Algodón, Cuero, Plástico).' },
  { id: 'condition', label: 'Condición', type: 'select', options: ['Nuevo', 'Usado', 'Como nuevo'], required: true, section: 'General', helpText: 'Estado actual del producto.' },
  { id: 'warranty', label: 'Garantía', type: 'text', required: false, placeholder: 'Ej: 30 días con vendedor', section: 'General', helpText: 'Ofrecer garantía aumenta la confianza del comprador.' },
];

const CLOTHING_ATTRIBUTES: AttributeConfig[] = [
  // Size attribute removed in favor of chips (size_variants)
  { id: 'measurements', label: 'Medidas (pecho, cintura, cadera, largo)', type: 'text', required: false, placeholder: 'Ej: 90-60-90, 100cm largo', helpText: 'Proporcionar medidas exactas en cm ayuda a reducir devoluciones.' },
  { id: 'fabric_composition', label: 'Composición de telas', type: 'text', required: false, helpText: 'Ej: 100% Algodón, 50% Poliéster / 50% Algodón.' },
  { id: 'care_instructions', label: 'Instrucciones de cuidado', type: 'text', required: false, helpText: 'Menciona si requiere lavado en seco o cuidados especiales.' },
  // Universal attributes will be merged in UI
];

const SHOE_ATTRIBUTES: AttributeConfig[] = [
  // Size attribute removed in favor of chips (size_variants)
  { id: 'type', label: 'Tipo', type: 'select', options: ['Tenis', 'Zapato', 'Bota', 'Sandalia', 'Tacón', 'Otro'], required: true, helpText: 'Estilo del calzado.' },
  { id: 'heel_height', label: 'Altura de Tacón', type: 'number', suffix: 'cm', required: false, helpText: 'Mide desde la base del talón hasta el suelo.' },
  { id: 'material_exterior', label: 'Material Exterior', type: 'text', required: false, helpText: 'Ej: Piel, Sintético, Lona.' }, // Specific to shoes
  { id: 'material_interior', label: 'Material Interior', type: 'text', required: false, helpText: 'Ej: Piel, Tela, Sintético.' }, // Specific to shoes
];

const HAT_ATTRIBUTES: AttributeConfig[] = [
  { id: 'head_size', label: 'Talla de cabeza', type: 'text', required: false, helpText: 'Medida de la circunferencia de la cabeza en cm.' },
  { id: 'brim_type', label: 'Tipo de ala', type: 'text', required: false, helpText: 'Ej: Ala ancha, Ala corta, Plana.' },
  { id: 'material', label: 'Material', type: 'text', required: false, helpText: 'Ej: Fieltro, Paja, Lana.' },
  { id: 'style', label: 'Estilo', type: 'text', required: false, helpText: 'Estilo visual del sombrero.' },
  { id: 'type', label: 'Tipo', type: 'select', options: ['Gorras (Snapback)', 'Gorras (Trucker)', 'Gorras (Planas)', 'Sombreros (Panamá)', 'Sombreros (Fedora)', 'Beanies', 'Viseras'], required: true, helpText: 'Categoría específica del sombrero.' },
];

const GLASSES_ATTRIBUTES: AttributeConfig[] = [
  { id: 'frame_type', label: 'Tipo de montura', type: 'text', required: false, helpText: 'Ej: Aviador, Cat-eye, Redondos.' },
  { id: 'lens_material', label: 'Material del lente', type: 'text', required: false, helpText: 'Ej: Policarbonato, Cristal, Orgánico.' },
  { id: 'prescription', label: 'Graduación', type: 'text', required: false, helpText: 'Si aplica, especifica las dioptrías.' },
  { id: 'uv_protection', label: 'Protección UV', type: 'boolean', required: false, helpText: '¿Cuentan con filtro de protección ultravioleta?' },
  { id: 'type', label: 'Tipo', type: 'select', options: ['Lentes de Sol', 'Lentes Oftálmicos'], required: true, helpText: 'Uso principal de los lentes.' },
];

const COMPLEMENTS_ATTRIBUTES: AttributeConfig[] = [
  { id: 'type', label: 'Tipo', type: 'select', options: ['Relojes', 'Carteras', 'Cinturones', 'Corbatas', 'Joyería', 'Bolsos', 'Mochilas', 'Maletines'], required: true, helpText: 'Tipo de accesorio.' },
];

const BEDDING_ATTRIBUTES: AttributeConfig[] = [
  { id: 'size', label: 'Tamaño', type: 'select', options: ['Individual', 'Matrimonial', 'Queen', 'King Size'], required: true, helpText: 'Tamaño del colchón para el que está diseñado.' },
  { id: 'material', label: 'Material', type: 'text', required: true, helpText: 'Ej: Algodón, Microfibra, Lana, Poliéster.' },
  { id: 'weight', label: 'Peso', type: 'text', required: false, helpText: 'Sugerencia: Incluye el peso (ligero/pesado) para indicar si es apto para clima cálido o frío.' },
  { id: 'weave_technique', label: 'Técnica de tejido', type: 'text', required: false, helpText: 'Ej: Tejido de punto, Percal, Satén.' },
  { id: 'type', label: 'Tipo', type: 'select', options: ['Cobijas (Térmicas)', 'Cobijas (Ligeras)', 'Edredones', 'Cobertores', 'Sábanas', 'Fundas'], required: true, helpText: 'Tipo de ropa de cama.' },
];

const TABLE_ATTRIBUTES: AttributeConfig[] = [
  { id: 'type', label: 'Tipo', type: 'select', options: ['Manteles (Redondos)', 'Manteles (Rectangulares)', 'Manteles (Cuadrados)', 'Caminos de Mesa', 'Individuales', 'Servilletas de Tela'], required: true, helpText: 'Forma o tipo de textil de mesa.' },
  { id: 'dimensions', label: 'Dimensiones (Largo x Ancho)', type: 'text', suffix: 'cm', required: true, helpText: 'Medidas exactas en centímetros para asegurar el ajuste.' },
];

const BATH_ATTRIBUTES: AttributeConfig[] = [
  { id: 'type', label: 'Tipo', type: 'select', options: ['Toallas (Cuerpo)', 'Toallas (Manos)', 'Toallas (Facial)', 'Batas de Baño', 'Tapetes absorbentes'], required: true, helpText: 'Uso específico del textil de baño.' },
];

const DECOR_ATTRIBUTES: AttributeConfig[] = [
  { id: 'type', label: 'Tipo', type: 'select', options: ['Cojines (Decorativos)', 'Cojines (para Silla)', 'Alfombras', 'Cortinas'], required: true, helpText: 'Categoría de decoración.' },
  { id: 'dimensions', label: 'Dimensiones', type: 'text', required: false, helpText: 'Largo x Ancho (y Alto si aplica) en cm.' },
];


// --- Category Structure ---

// 1. ACCESORIOS (Dama y Caballero)
const ACCESSORIES_SUBCATEGORIES: SubCategory[] = [
  {
    id: 'cabeza',
    label: 'Cabeza (Gorras y Sombreros)',
    attributes: HAT_ATTRIBUTES
  },
  {
    id: 'lentes',
    label: 'Lentes',
    attributes: GLASSES_ATTRIBUTES
  },
  {
    id: 'complementos',
    label: 'Otros Complementos',
    attributes: COMPLEMENTS_ATTRIBUTES
  }
];

const ACCESSORIES_CATEGORY: Category = {
  id: 'Accesorios',
  label: 'Accesorios',
  subcategories: ACCESSORIES_SUBCATEGORIES,
};

// 2. TEXTILES Y BLANCOS (Hogar)
const HOME_TEXTILES_SUBCATEGORIES: SubCategory[] = [
  {
    id: 'recamara',
    label: 'Recámara',
    attributes: BEDDING_ATTRIBUTES
  },
  {
    id: 'decoracion',
    label: 'Decoración',
    attributes: DECOR_ATTRIBUTES
  },
  {
    id: 'bano',
    label: 'Baño',
    attributes: BATH_ATTRIBUTES
  },
  {
    id: 'mesa_cocina',
    label: 'Mesa y Cocina',
    attributes: TABLE_ATTRIBUTES
  }
];

const HOME_CATEGORY: Category = {
  id: 'Textiles y Blancos',
  label: 'Textiles y Blancos',
  subcategories: HOME_TEXTILES_SUBCATEGORIES,
};

// Helper to apply clothing attributes to simple categories
const clothingCategory = (label: string): Category => ({
  id: label,
  label,
  subcategories: [],
  attributes: CLOTHING_ATTRIBUTES
});

export const NEW_CATEGORIES_CONFIG: Record<string, Category[]> = {
  'Mujer': [
    ACCESSORIES_CATEGORY,
    clothingCategory('Blusas'),
    clothingCategory('Playeras'),
    clothingCategory('Tops y Bodies'),
    clothingCategory('Sueter y Cardigans'),
    clothingCategory('Sudaderas'),
    clothingCategory('Pantalones'),
    clothingCategory('Jeans'),
    clothingCategory('Leggings'),
    clothingCategory('Faldas'),
    clothingCategory('Shorts y Bermudas'),
    clothingCategory('Chamarras'),
    clothingCategory('Abrigos y Gabardinas'),
    clothingCategory('Chalecos'),
    clothingCategory('Sacos y Blazers'),
    clothingCategory('Vestidos'),
    clothingCategory('Overoles y Jumpers'),
    clothingCategory('Lenceria'),
    clothingCategory('Pijamas'),
    clothingCategory('Ropa de Playa'),
    clothingCategory('Conjuntos Deportivos'),
    clothingCategory('Ropa de Alto Rendimiento'),
    {
      id: 'Calzado',
      label: 'Calzado',
      subcategories: [],
      attributes: SHOE_ATTRIBUTES
    },
  ],
  'Hombre': [
    ACCESSORIES_CATEGORY,
    clothingCategory('Playeras'),
    clothingCategory('Camisas'),
    clothingCategory('Sudaderas'),
    clothingCategory('Sueteres'),
    clothingCategory('Pantalones'),
    clothingCategory('Jeans'),
    clothingCategory('Shorts y Bermudas'),
    clothingCategory('Chamarra'),
    clothingCategory('Sacos y Blazers'),
    clothingCategory('Abrigos y Gabardinas'),
    clothingCategory('Trajes'),
    clothingCategory('Ropa Interior'),
    clothingCategory('Pijamas'),
    clothingCategory('Ropa de Playa'),
    clothingCategory('Ropa de Entrenamiento'),
    clothingCategory('Jerseys'),
    {
      id: 'Calzado',
      label: 'Calzado',
      subcategories: [],
      attributes: SHOE_ATTRIBUTES
    },
  ],
  'Niños': [
    {
      id: 'Accesorios',
      label: 'Accesorios',
      subcategories: [
         {
            id: 'cabeza',
            label: 'Cabeza',
            attributes: HAT_ATTRIBUTES
         },
         {
            id: 'complementos',
            label: 'Complementos',
            attributes: COMPLEMENTS_ATTRIBUTES
         }
      ]
    },
    clothingCategory('Playeras'),
    clothingCategory('Polos'),
    clothingCategory('Tanks'),
    clothingCategory('Pantalones'),
    clothingCategory('Jeans'),
    clothingCategory('Joggers y Pants'),
    clothingCategory('Shorts y Bermudas'),
    clothingCategory('Sudadera'),
    clothingCategory('Chamarras'),
    clothingCategory('Sueteres'),
    clothingCategory('Conjuntos'),
    clothingCategory('Pijamas'),
    clothingCategory('Ropa Interior'),
    clothingCategory('Ropa Deportiva'),
    clothingCategory('Trajes'),
    {
      id: 'Calzado',
      label: 'Calzado',
      subcategories: [],
      attributes: SHOE_ATTRIBUTES
    },
  ],
  'Niñas': [
     {
      id: 'Accesorios',
      label: 'Accesorios',
      subcategories: [
         {
            id: 'cabeza',
            label: 'Cabeza',
            attributes: HAT_ATTRIBUTES
         },
         {
            id: 'complementos',
            label: 'Complementos',
            attributes: COMPLEMENTS_ATTRIBUTES
         }
      ]
    },
    clothingCategory('Blusas'),
    clothingCategory('Playeras'),
    clothingCategory('Vestidos'),
    clothingCategory('Faldas'),
    clothingCategory('Pantalones'),
    clothingCategory('Jeans'),
    clothingCategory('Leggings'),
    clothingCategory('Shorts'),
    clothingCategory('Sudaderas'),
    clothingCategory('Chamarras'),
    clothingCategory('Sueteres'),
    clothingCategory('Conjuntos'),
    clothingCategory('Pijamas'),
    clothingCategory('Ropa Interior'),
    clothingCategory('Ropa Deportiva'),
    clothingCategory('Trajes'),
    {
      id: 'Calzado',
      label: 'Calzado',
      subcategories: [],
      attributes: SHOE_ATTRIBUTES
    },
  ],
  'Hogar': [
    HOME_CATEGORY
  ]
};

export function generateTags(gender: string, category: string, subcategory: string | null, attributes: Record<string, any>): string[] {
  const tags = new Set<string>();
  
  if (gender) tags.add(gender);
  if (category) tags.add(category);
  if (subcategory) tags.add(subcategory);
  
  // Semantic mapping for Winter
  const winterCategories = ['Sudaderas', 'Chamarras', 'Abrigos', 'Sueteres', 'Botas', 'Beanies', 'Cobijas', 'Cobertores', 'Gorras de lana'];
  if (winterCategories.some(c => category.includes(c) || (subcategory && subcategory.includes(c)))) {
    tags.add('Ropa de invierno');
    tags.add('Invierno');
    tags.add('Frio');
  }

  // Attributes to tags
  Object.entries(attributes).forEach(([key, value]) => {
    if (value && typeof value === 'string') {
      // Exclude long descriptions or irrelevant values
      if (value.length < 20) {
        tags.add(value);
      }
    }
  });

  return Array.from(tags);
}
