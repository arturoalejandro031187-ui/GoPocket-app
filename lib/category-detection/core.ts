import { CategoryMatch, CategoryConcept } from './types';
import { KEYWORD_CONCEPTS, GENDER_KEYWORDS } from './config';
import { normalize } from './utils';

// --- Configuration & Cache ---

// Cache for detection results to avoid re-processing identical inputs
// Limit size to avoid memory leaks
const RESULT_CACHE = new Map<string, CategoryMatch>();
const MAX_CACHE_SIZE = 500;

// O(1) Lookup Map for Concepts
// We pre-normalize keys from config to ensure fast matching
const CONCEPT_MAP = new Map<string, string>();
let isMapInitialized = false;

function initializeConceptMap() {
  if (isMapInitialized) return;
  
  Object.entries(KEYWORD_CONCEPTS).forEach(([key, value]) => {
    // Keys in config should already be normalized, but we ensure it here
    CONCEPT_MAP.set(normalize(key), value);
  });
  
  isMapInitialized = true;
}

// --- Helper Functions ---

/**
 * Detects gender context from the input title
 */
function detectGender(normalizedTitle: string): string | null {
  const words = normalizedTitle.split(/\s+/);
  
  // Check exact words first (high priority)
  for (const word of words) {
    if (GENDER_KEYWORDS[word]) {
      return GENDER_KEYWORDS[word];
    }
  }
  
  // Check phrases (if we had multi-word gender keywords)
  // For now, GENDER_KEYWORDS are mostly single words.
  
  return null;
}

/**
 * Finds the best matching concept in the title.
 * Prioritizes longest matching keyword (e.g. "vestido de noche" > "vestido").
 */
function findBestConcept(normalizedTitle: string): CategoryConcept | null {
  initializeConceptMap();
  
  const words = normalizedTitle.split(/\s+/);
  let bestConcept: CategoryConcept | null = null;
  
  // Sliding window approach to find multi-word matches
  // Max phrase length to check (e.g., 4 words)
  const MAX_PHRASE_LENGTH = 4;
  
  for (let i = 0; i < words.length; i++) {
    for (let len = MAX_PHRASE_LENGTH; len >= 1; len--) {
      if (i + len > words.length) continue;
      
      const phrase = words.slice(i, i + len).join(' ');
      
      if (CONCEPT_MAP.has(phrase)) {
        const conceptValue = CONCEPT_MAP.get(phrase)!;
        
        // Calculate a score based on length and position
        // Longer matches are better. Earlier matches are slightly better.
        const lengthScore = len * 10; 
        const positionScore = (1 - (i / words.length)) * 2; // 0 to 2 bonus
        const score = lengthScore + positionScore;
        
        // If this match is better than previous best, keep it
        if (!bestConcept || score > bestConcept.score) {
          bestConcept = {
            concept: conceptValue,
            score: score,
            keyword: phrase
          };
        }
        
        // If we found a long match, we can skip checking shorter phrases starting at this position
        // But we continue to check other positions to see if there's an even better match
        break; 
      }
    }
  }
  
  return bestConcept;
}

/**
 * Parses the colon-separated concept string into category parts.
 * Handles gender overrides if the category is gender-dependent.
 */
function resolveCategoryPath(
  conceptPath: string, 
  detectedGender: string | null
): { category: string; subcategory: string | null; subSubcategory: string | null } {
  
  const parts = conceptPath.split(':');
  
  let category = parts[0] || '';
  let subcategory = parts[1] || null;
  let subSubcategory = parts[2] || null;
  
  // Logic to handle "Generic" paths if they exist (e.g. "Tenis" -> mapped to gender)
  // In our new config, most paths are explicit (e.g. "Mujer:Calzado:Tenis")
  // But if we have generic paths like "Calzado:Tenis" (hypothetical), we could prepend gender.
  
  // Current Strategy: The config should be explicit. 
  // However, if the user explicitly typed a gender (e.g. "Tenis Mujer"),
  // and the detected concept was generic (e.g. "Deportes:Calzado:Tenis"), 
  // we might want to switch to "Mujer:Calzado:Tenis" IF valid.
  // But we stick to the config's definition for reliability unless strictly required.
  
  // Special Case: "Unisex" concepts or "Genderless"
  // If the concept is definitely "Mujer" (e.g. "Vestido"), we ignore detected gender "Hombre" (user error or weird item).
  
  return { category, subcategory, subSubcategory };
}

// --- Main Detection Function ---

export function detectCategory(title: string): CategoryMatch | null {
  if (!title || !title.trim()) return null;
  
  // 1. Check Cache
  const cacheKey = title.trim();
  if (RESULT_CACHE.has(cacheKey)) {
    return RESULT_CACHE.get(cacheKey)!;
  }
  
  // 2. Normalize
  const normalizedTitle = normalize(title);
  
  // 3. Detect Gender
  const detectedGender = detectGender(normalizedTitle);
  
  // 4. Find Best Concept
  const match = findBestConcept(normalizedTitle);
  
  if (!match) {
    return null;
  }
  
  // 5. Resolve Path
  const { category, subcategory, subSubcategory } = resolveCategoryPath(match.concept, detectedGender);
  
  // 6. Construct Result
  // Base confidence on the match score relative to input length? 
  // For now, fixed high confidence if match found.
  // Cap at 0.95 as requested (leave room for user correction)
  const confidence = 0.95; 
  
  const result: CategoryMatch = {
    gender: detectedGender || (['Mujer', 'Hombre'].includes(category) ? category : 'Unisex'),
    category,
    subcategory,
    subSubcategory,
    confidence
  };
  
  // 7. Update Cache
  if (RESULT_CACHE.size >= MAX_CACHE_SIZE) {
    // Remove oldest (first) entry
    const firstKey = RESULT_CACHE.keys().next().value;
    if (firstKey) RESULT_CACHE.delete(firstKey);
  }
  RESULT_CACHE.set(cacheKey, result);
  
  return result;
}
