import { createBrowserClient } from '@supabase/ssr';

type SupabaseClientType = ReturnType<typeof createBrowserClient>;

let cached: SupabaseClientType | null = null;

const buildClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase env vars missing');
  }
  return createBrowserClient(url, key);
};

const getClient = (): SupabaseClientType => {
  if (cached) return cached;
  if (typeof window === 'undefined') {
    return new Proxy(
      {},
      {
        get() {
          throw new Error('Supabase client unavailable on server');
        },
      }
    ) as SupabaseClientType;
  }
  cached = buildClient();
  return cached;
};

export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getClient();
      return (client as any)[prop];
    },
  }
) as SupabaseClientType;
