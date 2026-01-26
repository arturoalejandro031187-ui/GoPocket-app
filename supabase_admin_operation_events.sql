-- ============================================================
-- TABLA DE EVENTOS DE OPERACIONES PARA PANEL DE ADMIN
-- Sistema de tracking centralizado de todas las operaciones
-- ============================================================

-- Crear tabla de eventos de operaciones
CREATE TABLE IF NOT EXISTS public.admin_operation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'order_created', 'payment_received', 'dispute_opened', etc.
  entity_type TEXT NOT NULL, -- 'order', 'payment', 'dispute', 'listing', 'user', etc.
  entity_id TEXT NOT NULL,
  user_id TEXT, -- Usuario que realizó la acción
  admin_id TEXT, -- Admin que procesó (si aplica)
  status TEXT, -- 'pending', 'processing', 'completed', 'failed'
  metadata JSONB DEFAULT '{}'::jsonb, -- Datos adicionales del evento
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  processed_at TIMESTAMPTZ,
  notified_admin BOOLEAN DEFAULT FALSE
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_admin_events_type ON public.admin_operation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_admin_events_entity ON public.admin_operation_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_admin_events_created ON public.admin_operation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_events_notified ON public.admin_operation_events(notified_admin) WHERE notified_admin = FALSE;
CREATE INDEX IF NOT EXISTS idx_admin_events_user ON public.admin_operation_events(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_events_status ON public.admin_operation_events(status) WHERE status IS NOT NULL;

-- Comentarios
COMMENT ON TABLE public.admin_operation_events IS 'Registro centralizado de todas las operaciones para tracking y notificaciones del panel de administrador';
COMMENT ON COLUMN public.admin_operation_events.event_type IS 'Tipo de evento: order_created, payment_received, dispute_opened, etc.';
COMMENT ON COLUMN public.admin_operation_events.entity_type IS 'Tipo de entidad: order, payment, dispute, listing, user, etc.';
COMMENT ON COLUMN public.admin_operation_events.entity_id IS 'ID de la entidad relacionada';
COMMENT ON COLUMN public.admin_operation_events.metadata IS 'Datos adicionales del evento en formato JSON';
COMMENT ON COLUMN public.admin_operation_events.notified_admin IS 'Indica si ya se notificó a los administradores';

-- RLS: Solo admins pueden leer eventos
ALTER TABLE public.admin_operation_events ENABLE ROW LEVEL SECURITY;

-- Política: Solo admins pueden leer eventos
DROP POLICY IF EXISTS "Admins can read operation events" ON public.admin_operation_events;
CREATE POLICY "Admins can read operation events"
  ON public.admin_operation_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users 
      WHERE admin_users.user_id = auth.uid()
    )
  );

-- Política: Service role puede insertar eventos (para APIs server-side)
-- Nota: Las APIs usarán service_role, así que no necesitamos política de INSERT para usuarios

-- Función helper para verificar si un usuario es admin (si no existe)
CREATE OR REPLACE FUNCTION public.is_admin(user_id_param UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.admin_users 
    WHERE admin_users.user_id = user_id_param
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Verificación final
SELECT 
  'VERIFICACIÓN COMPLETA' as estado,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_operation_events') as tabla_creada,
  (SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'admin_operation_events') as indices_creados,
  (SELECT COUNT(*) FROM pg_proc WHERE proname = 'is_admin' AND pronamespace = 'public'::regnamespace) as funcion_is_admin;
