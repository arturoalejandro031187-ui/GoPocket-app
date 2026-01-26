-- Actualizar configuración de Estafeta a sistema de rangos de peso con precios fijos
-- Ejecuta este SQL en Supabase SQL Editor si ya tienes la columna estafeta_config

-- Actualizar la configuración existente con los nuevos rangos
UPDATE public.app_settings
SET estafeta_config = jsonb_build_object(
  'enabled', COALESCE((estafeta_config->>'enabled')::boolean, true),
  'weight_ranges', jsonb_build_array(
    jsonb_build_object('max_weight_kg', 1, 'price', 168),
    jsonb_build_object('max_weight_kg', 5, 'price', 170),
    jsonb_build_object('max_weight_kg', 10, 'price', 225),
    jsonb_build_object('max_weight_kg', 15, 'price', 240),
    jsonb_build_object('max_weight_kg', 20, 'price', 260),
    jsonb_build_object('max_weight_kg', 25, 'price', 275),
    jsonb_build_object('max_weight_kg', 30, 'price', 295),
    jsonb_build_object('max_weight_kg', 35, 'price', 295),
    jsonb_build_object('max_weight_kg', 40, 'price', 310),
    jsonb_build_object('max_weight_kg', 45, 'price', 385),
    jsonb_build_object('max_weight_kg', 50, 'price', 435),
    jsonb_build_object('max_weight_kg', 55, 'price', 465),
    jsonb_build_object('max_weight_kg', 60, 'price', 485)
  )
)
WHERE id = 1;

-- Actualizar el comentario
COMMENT ON COLUMN public.app_settings.estafeta_config IS 'Configuración de precios Estafeta: {enabled: boolean, weight_ranges: [{max_weight_kg: número, price: número}]}';
