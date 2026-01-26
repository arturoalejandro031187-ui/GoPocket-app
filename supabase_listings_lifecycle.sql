-- Pocket - Lifecycle de publicaciones (vistas + vigencia 30 días) (idempotente)
-- Ejecuta en Supabase → SQL Editor.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

-- Backfill para registros existentes
UPDATE public.listings
SET expires_at = created_at + INTERVAL '30 days'
WHERE expires_at IS NULL;

-- Si quieres que nuevas publicaciones tengan vigencia automática:
ALTER TABLE public.listings
  ALTER COLUMN expires_at SET DEFAULT (TIMEZONE('utc'::text, NOW()) + INTERVAL '30 days');

