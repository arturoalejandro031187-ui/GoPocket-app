import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export async function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  // Para Server Components, usar createClient estándar
  return createSupabaseClient(supabaseUrl, supabaseAnonKey);
}