import { NEW_CATEGORIES_CONFIG, Category, SubCategory } from './categories';

interface CategoryMatch {
  gender: string;
  category: string;
  subcategory: string | null;
  confidence: number; // 0 to 1
}

const GENDER_KEYWORDS: Record<string, string> = {
  'mujer': 'Mujer',
  'dama': 'Mujer',
  'señora': 'Mujer',
  'hombre': 'Hombre',
  'caballero': 'Hombre',
  'niño': 'Niños',
  'niña': 'Niñas',
  'infantil': 'Niños', // Default to Niños if generic
  'bebe': 'Niños',
};

// Map keywords to semantic category concepts
// Then we map concept + gender to actual Category ID
const KEYWORD_CONCEPTS: Record<string, string> = {
  'tenis': 'Calzado',
  'zapatos': 'Calzado',
  'botas': 'Calzado',
  'sandalias': 'Calzado',
  'tacones': 'Calzado',
  'sneakers': 'Calzado',
  
  'gorra': 'Accesorios:cabeza',
  'sombrero': 'Accesorios:cabeza',
  'beanie': 'Accesorios:cabeza',
  'visera': 'Accesorios:cabeza',
  
  'lentes': 'Accesorios:lentes',
  'gafas': 'Accesorios:lentes',
  
  'reloj': 'Accesorios:complementos',
  'cartera': 'Accesorios:complementos',
  'cinturon': 'Accesorios:complementos',
  'corbata': 'Accesorios:complementos',
  'joyeria': 'Accesorios:complementos',
  'collar': 'Accesorios:complementos',
  'arete': 'Accesorios:complementos',
  'anillo': 'Accesorios:complementos',
  'bolso': 'Accesorios:complementos',
  'mochila': 'Accesorios:complementos',
  'maletin': 'Accesorios:complementos',
  
  'cobija': 'Hogar:Textiles y Blancos:recamara',
  'edredon': 'Hogar:Textiles y Blancos:recamara',
  'sabana': 'Hogar:Textiles y Blancos:recamara',
  'cobertor': 'Hogar:Textiles y Blancos:recamara',
  'funda': 'Hogar:Textiles y Blancos:recamara',
  
  'cojin': 'Hogar:Textiles y Blancos:decoracion',
  'alfombra': 'Hogar:Textiles y Blancos:decoracion',
  'cortina': 'Hogar:Textiles y Blancos:decoracion',
  
  'toalla': 'Hogar:Textiles y Blancos:bano',
  'bata': 'Hogar:Textiles y Blancos:bano',
  'tapete': 'Hogar:Textiles y Blancos:bano',
  
  'mantel': 'Hogar:Textiles y Blancos:mesa_cocina',
  'camino': 'Hogar:Textiles y Blancos:mesa_cocina', // camino de mesa
  'servilleta': 'Hogar:Textiles y Blancos:mesa_cocina',
  
  'blusa': 'Blusas',
  'top': 'Tops y Bodies',
  'body': 'Tops y Bodies',
  'playera': 'Playeras',
  'tshirt': 'Playeras',
  'camiseta': 'Playeras',
  
  'sueter': 'Sueter', // Generic
  'cardigan': 'Sueter',
  'sudadera': 'Sudaderas',
  'hoodie': 'Sudaderas',
  
  'pantalon': 'Pantalones',
  'jeans': 'Jeans',
  'mezclilla': 'Jeans',
  'legging': 'Leggings',
  'malla': 'Leggings',
  
  'falda': 'Faldas',
  'vestido': 'Vestidos',
  
  'short': 'Shorts y Bermudas',
  'bermuda': 'Shorts y Bermudas',
  
  'chamarra': 'Chamarras', // or Chamarra singular
  'jacket': 'Chamarras',
  'abrigo': 'Abrigos y Gabardinas',
  'gabardina': 'Abrigos y Gabardinas',
  'chaleco': 'Chalecos',
  
  'saco': 'Sacos y Blazers',
  'blazer': 'Sacos y Blazers',
  
  'overol': 'Overoles y Jumpers',
  'jumper': 'Overoles y Jumpers',
  
  'lenceria': 'Lenceria',
  'calzon': 'Lenceria',
  'brasier': 'Lenceria',
  'pijama': 'Pijamas',
  
  'camisa': 'Camisas',
  'traje': 'Trajes',
  'jersey': 'Jerseys',
  
  'polo': 'Polos',
  'tank': 'Tanks',
  'jogger': 'Joggers y Pants',
};

// Helper to normalize text
function normalize(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-z0-9\s]/g, ""); // Remove special chars
}

export function detectCategory(title: string): CategoryMatch | null {
  const normalizedTitle = normalize(title);
  const words = normalizedTitle.split(/\s+/);
  
  // 1. Detect Gender
  let detectedGender: string | null = null;
  for (const word of words) {
    if (GENDER_KEYWORDS[word]) {
      detectedGender = GENDER_KEYWORDS[word];
      break;
    }
  }
  
  // 2. Detect Concept
  let detectedConcept: string | null = null;
  let maxLen = 0;
  
  // Check multi-word phrases first? For simplicity, check single keywords or bigrams if needed.
  // We'll iterate over keys to find matches in title
  for (const [key, concept] of Object.entries(KEYWORD_CONCEPTS)) {
    if (normalizedTitle.includes(key)) {
      // Prefer longer matches (e.g. "camino de mesa" vs "camino") - though keys are single words mostly
      if (key.length > maxLen) {
        detectedConcept = concept;
        maxLen = key.length;
      }
    }
  }
  
  if (!detectedConcept) return null;
  
  // 3. Resolve to specific Category ID based on Gender
  // If no gender detected, default to Mujeres or most likely?
  // Or return null gender and let UI prompt user?
  // We'll default to Mujeres if ambiguous for clothing, unless concept implies Home.
  
  let finalGender = detectedGender;
  
  if (detectedConcept.startsWith('Hogar:')) {
    finalGender = 'Hogar';
    const parts = detectedConcept.split(':');
    return {
      gender: 'Hogar',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.9
    };
  }
  
  // Handle Accesorios special case
  if (detectedConcept.startsWith('Accesorios:')) {
    const parts = detectedConcept.split(':');
    // If gender not specified, default to Mujer but confidence lower?
    // Actually, Accessories exist in all genders.
    return {
      gender: finalGender || 'Mujer', // Default
      category: 'Accesorios',
      subcategory: parts[1],
      confidence: finalGender ? 0.9 : 0.6
    };
  }
  
  if (!finalGender) {
    // Infer gender from concept if possible?
    if (['Vestidos', 'Faldas', 'Blusas', 'Lenceria', 'Tops y Bodies'].includes(detectedConcept)) {
      finalGender = 'Mujer';
    } else if (['Camisas', 'Trajes'].includes(detectedConcept)) {
      finalGender = 'Hombre';
    } else {
      finalGender = 'Mujer'; // Fallback
    }
  }
  
  // Map concept to exact category label in config
  const categories = NEW_CATEGORIES_CONFIG[finalGender];
  if (!categories) return null;
  
  let matchedCategory: Category | undefined;
  
  // Try exact match first
  matchedCategory = categories.find(c => normalize(c.label) === normalize(detectedConcept!));
  
  // If not found, try fuzzy match or specific mappings
  if (!matchedCategory) {
    // Handle "Sueter" mapping
    if (detectedConcept === 'Sueter') {
      if (finalGender === 'Mujer') matchedCategory = categories.find(c => c.label === 'Sueter y Cardigans');
      else matchedCategory = categories.find(c => c.label === 'Sueteres');
    }
    // Handle "Chamarras" mapping
    else if (detectedConcept === 'Chamarras') {
       matchedCategory = categories.find(c => c.label === 'Chamarras' || c.label === 'Chamarra');
    }
    // Handle "Pantalones"
    else if (detectedConcept === 'Pantalones') {
       matchedCategory = categories.find(c => c.label === 'Pantalones');
    }
     // Handle "Shorts y Bermudas"
    else if (detectedConcept === 'Shorts y Bermudas') {
       matchedCategory = categories.find(c => c.label === 'Shorts y Bermudas');
    }
  }
  
  // Fallback: search for partial label match
  if (!matchedCategory) {
     matchedCategory = categories.find(c => normalize(c.label).includes(normalize(detectedConcept!)));
  }
  
  if (matchedCategory) {
    return {
      gender: finalGender,
      category: matchedCategory.id,
      subcategory: null,
      confidence: 0.8
    };
  }
  
  return null;
}
