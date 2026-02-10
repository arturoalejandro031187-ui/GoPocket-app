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

  // ALIMENTOS Y BEBIDAS
  // Despensa
  'arroz': 'Alimentos y Bebidas:Despensa:Arroz y Granos',
  'frijol': 'Alimentos y Bebidas:Despensa:Arroz y Granos',
  'pasta': 'Alimentos y Bebidas:Despensa:Arroz y Granos',
  'atun': 'Alimentos y Bebidas:Despensa:Enlatados',
  'sardina': 'Alimentos y Bebidas:Despensa:Enlatados',
  'aceite': 'Alimentos y Bebidas:Despensa:Aceites',
  'vinagre': 'Alimentos y Bebidas:Despensa:Aceites',
  'harina': 'Alimentos y Bebidas:Despensa:Harinas',
  'azucar': 'Alimentos y Bebidas:Despensa:Harinas',
  
  // Desayuno
  'cereal': 'Alimentos y Bebidas:Desayuno:Cereales',
  'avena': 'Alimentos y Bebidas:Desayuno:Cereales',
  'galleta': 'Alimentos y Bebidas:Desayuno:Panaderia',
  'pan': 'Alimentos y Bebidas:Desayuno:Panaderia',
  'mermelada': 'Alimentos y Bebidas:Desayuno:Untables',
  'nutella': 'Alimentos y Bebidas:Desayuno:Untables',
  
  // Bebidas
  'agua': 'Alimentos y Bebidas:Bebidas:Aguas',
  'refresco': 'Alimentos y Bebidas:Bebidas:Aguas',
  'jugo': 'Alimentos y Bebidas:Bebidas:Jugos',
  'cafe': 'Alimentos y Bebidas:Bebidas:Cafe y Te',
  'te': 'Alimentos y Bebidas:Bebidas:Cafe y Te',
  'gatorade': 'Alimentos y Bebidas:Bebidas:Energizantes',
  'red bull': 'Alimentos y Bebidas:Bebidas:Energizantes',
  
  // Alcohol (Updated)
  'cerveza': 'Alimentos y Bebidas:Alcohol:Cervezas',
  'chela': 'Alimentos y Bebidas:Alcohol:Cervezas',
  'beer': 'Alimentos y Bebidas:Alcohol:Cervezas',
  'vino': 'Alimentos y Bebidas:Alcohol:Vinos',
  'tequila': 'Alimentos y Bebidas:Alcohol:Licores',
  'whisky': 'Alimentos y Bebidas:Alcohol:Licores',
  'vodka': 'Alimentos y Bebidas:Alcohol:Licores',
  'ron': 'Alimentos y Bebidas:Alcohol:Licores',
  'mezcal': 'Alimentos y Bebidas:Alcohol:Licores',
  
  // Snacks
  'papas': 'Alimentos y Bebidas:Snacks:Botanas',
  'palomitas': 'Alimentos y Bebidas:Snacks:Botanas',
  'dulces': 'Alimentos y Bebidas:Snacks:Dulces',
  'chocolate': 'Alimentos y Bebidas:Snacks:Chocolates',
  'almendra': 'Alimentos y Bebidas:Snacks:Snacks Saludables',
  'nuez': 'Alimentos y Bebidas:Snacks:Snacks Saludables',
  
  // Saludable
  'chia': 'Alimentos y Bebidas:Saludable:Organico',
  'matcha': 'Alimentos y Bebidas:Saludable:Organico',
  'gluten free': 'Alimentos y Bebidas:Saludable:Sin Gluten',
  'keto': 'Alimentos y Bebidas:Saludable:Keto',
  'vegano': 'Alimentos y Bebidas:Saludable:Vegano',
  
  // OTROS
  'vibrador': 'Otros:Adultos:Juguetes',
  'dildo': 'Otros:Adultos:Juguetes',
  'lubricante': 'Otros:Adultos:Lubricantes',

  // DEPORTES
  'pesa': 'Deportes y Aire Libre:Fitness:Pesas',
  'mancuerna': 'Deportes y Aire Libre:Fitness:Pesas',
  'caminadora': 'Deportes y Aire Libre:Fitness:Cardio',
  'bicicleta': 'Deportes y Aire Libre:Ciclismo:Bicicletas',
  'casco bici': 'Deportes y Aire Libre:Ciclismo:Accesorios Bici',
  'balon': 'Deportes y Aire Libre:Deportes Equipo:Futbol',
  'raqueta': 'Deportes y Aire Libre:Raqueta:Tenis',

  // AUTOMOTRIZ
  'llanta': 'Automotriz y Motocicletas:Llantas:Llantas',
  'neumatico': 'Automotriz y Motocicletas:Llantas:Llantas',
  'rin': 'Automotriz y Motocicletas:Llantas:Rines',
  'casco moto': 'Automotriz y Motocicletas:Motos:Equipamiento Moto',
  'bateria auto': 'Automotriz y Motocicletas:Refacciones Auto:Electrico',

  // RESTRINGIDOS (Solo Tiendas Oficiales)
  'guia prepagada': 'Otros:Restringidos:Guias',
  'guia envio': 'Otros:Restringidos:Guias',
  'estafeta': 'Otros:Restringidos:Guias',
  'fedex': 'Otros:Restringidos:Guias',
  'dhl': 'Otros:Restringidos:Guias',
  
  'windows': 'Otros:Restringidos:Software',
  'office': 'Otros:Restringidos:Software',
  'antivirus': 'Otros:Restringidos:Software',
  'adobe': 'Otros:Restringidos:Software',
  'licencia': 'Otros:Restringidos:Software',
  'software': 'Otros:Restringidos:Software',
  
  'netflix': 'Otros:Restringidos:Suscripciones',
  'spotify': 'Otros:Restringidos:Suscripciones',
  'disney': 'Otros:Restringidos:Suscripciones',
  'hbo': 'Otros:Restringidos:Suscripciones',
  'game pass': 'Otros:Restringidos:Suscripciones',
  'psn': 'Otros:Restringidos:Suscripciones',
  'suscripcion': 'Otros:Restringidos:Suscripciones',
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

  if (detectedConcept.startsWith('Alimentos y Bebidas:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Alimentos y Bebidas',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  if (detectedConcept.startsWith('Otros:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Otros',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  if (detectedConcept.startsWith('Deportes y Aire Libre:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Deportes y Aire Libre',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
    };
  }

  if (detectedConcept.startsWith('Automotriz y Motocicletas:')) {
    const parts = detectedConcept.split(':');
    return {
      gender: 'Automotriz y Motocicletas',
      category: parts[1],
      subcategory: parts[2] || null,
      confidence: 0.95
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
