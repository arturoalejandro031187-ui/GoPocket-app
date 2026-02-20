import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function readPublicEnv(name: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  const value = process.env[name];
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSupabaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const upgraded = trimmed.replace(/^http:\/\//i, 'https://');
  if (/^https?:\/\//i.test(upgraded)) return upgraded;
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(upgraded)) return `https://${upgraded}`;
  return upgraded;
}

const supabaseUrl = normalizeSupabaseUrl(readPublicEnv('NEXT_PUBLIC_SUPABASE_URL'));
const supabaseAnonKey = readPublicEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

function createBrowserClient(url: string, anonKey: string): SupabaseClient {
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    global: {
      headers: {
        'x-client-info': 'pocket-app@1.0.0',
      },
    },
  });
}

export const supabase = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : createBrowserClient('https://invalid.supabase.co', 'missing-next-public-supabase-key');
