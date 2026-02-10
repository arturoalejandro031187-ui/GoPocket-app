import { createClient } from '@supabase/supabase-js';

// En Next.js, las variables NEXT_PUBLIC_* están disponibles tanto en servidor como en cliente
// Se inyectan en tiempo de compilación
const rawSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

// Validación más robusta
let supabaseUrl: string;
let supabaseAnonKeyFinal: string;

if (!rawSupabaseUrl || !supabaseAnonKey) {
  const errorMsg = `Missing Supabase environment variables:
    - NEXT_PUBLIC_SUPABASE_URL: ${rawSupabaseUrl ? '✓' : '✗'}
    - NEXT_PUBLIC_SUPABASE_ANON_KEY: ${supabaseAnonKey ? '✓' : '✗'}
    
    Please check your .env.local file and restart the development server.
    
    To fix this:
    1. Copy .env.example to .env.local
    2. Add your Supabase credentials from https://supabase.com/dashboard
    3. Restart the development server (npm run dev)`;
  
  console.error(errorMsg);
  
  // En desarrollo, mostrar error más descriptivo
    if (process.env.NODE_ENV === 'development') {
      console.error('Current env vars:', {
        NEXT_PUBLIC_SUPABASE_URL: rawSupabaseUrl || 'NOT SET',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey ? 'SET (hidden)' : 'NOT SET',
      });
      console.warn('⚠️  Running with mock Supabase client. Please configure .env.local');
      // En desarrollo, usar valores mock para evitar que la app se rompa completamente
      supabaseUrl = 'https://placeholder.supabase.co';
      supabaseAnonKeyFinal = 'mock-key';
    } else {
      // Allow build to proceed even if env vars are missing (e.g. CI/CD without secrets yet)
      console.warn('Missing Supabase env vars. Using mock for build/server safety.');
      supabaseUrl = 'https://placeholder.supabase.co';
      supabaseAnonKeyFinal = 'mock-key';
    }
  } else {
  // Normalizar y validar URL (evitar http:// en proyectos .supabase.co)
  let validUrl: URL;
  try {
    validUrl = new URL(rawSupabaseUrl);
    if (!validUrl.protocol.startsWith('http')) {
      throw new Error('URL must use http or https protocol');
    }
    // Si alguien configuró http://<project>.supabase.co, el navegador puede bloquearlo en https (mixed content)
    if (validUrl.protocol === 'http:' && validUrl.hostname.endsWith('.supabase.co')) {
      validUrl.protocol = 'https:';
    }
    // Quitar trailing slash para consistencia
    supabaseUrl = validUrl.toString().replace(/\/$/, '');
  } catch (error) {
    console.error('Invalid Supabase URL:', rawSupabaseUrl);
    throw new Error(`Invalid Supabase URL format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  supabaseAnonKeyFinal = supabaseAnonKey;
}

// Crear cliente de Supabase con configuración optimizada
export const supabase = createClient(supabaseUrl, supabaseAnonKeyFinal, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce', // Usar PKCE para mejor seguridad
  },
  global: {
    headers: {
      'x-client-info': 'pocket-app@1.0.0',
    },
  },
  db: {
    schema: 'public',
  },
});

// Log de inicialización en desarrollo
if (process.env.NODE_ENV === 'development') {
  console.log('✓ Supabase client initialized successfully');
  console.log('  URL:', supabaseUrl);
  console.log('  Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : 'NOT SET');
}