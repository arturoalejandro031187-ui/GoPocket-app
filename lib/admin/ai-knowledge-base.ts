export const PLATFORM_KNOWLEDGE_BASE = `
[REGLAS Y CONFIGURACIÓN DE LA PLATAFORMA GOPOCKET]

1. PLANES DE MEMBRESÍA (Sellers)
- Plan BASIC:
  * Comisión: 23% por venta.
  * Límites: 50 publicaciones activas, 15 subastas activas.
  * Retiros: Disponibles 7 días (168 horas) después de la venta.
  * Envío: Solo guías prepagadas de la plataforma.
- Plan PRO:
  * Comisión: 18% por venta.
  * Límites: Publicaciones y subastas ILIMITADAS.
  * Retiros: Disponibles 48 horas después de la venta.
  * Envío: Permite "Envío por cuenta propia" y entrega personal.

2. ENVÍOS Y LOGÍSTICA
- Costo Base (Usuario): $180 MXN (puede variar por promociones).
- Proveedor Principal: Estafeta.
- Cálculo de Peso: Se usa el mayor entre Peso Físico y Peso Volumétrico (Largo x Ancho x Alto / 5000).
- Tarifas Estafeta (Aprox):
  * 0-1kg: ~$168
  * 1-5kg: ~$170
  * 5-10kg: ~$225
  * (Sube progresivamente hasta 60kg).

3. SUBASTAS
- Duración: Configurable de 1 hora a 7 días.
- Reglas: No se pueden cancelar, pausar ni eliminar una vez iniciadas.
- Cierre: Al finalizar, se genera una orden "pending_payment" para el ganador.
- Pago: El ganador debe completar el checkout para pagar envío y producto.

4. PAGOS Y RETIROS
- Pasarela: MercadoPago (Tarjetas, OXXO, Transferencia).
- Wallet (Monedero): Los vendedores reciben sus ganancias en su "PocketCash".
- Retiros: Se solicitan desde el panel y se procesan manualmente o vía API bancaria (si está activa).
- Seguridad: Operaciones de saldo usan "Row Locking" para evitar doble gasto.

5. PUBLICIDAD (Featured)
- Costo Destacado: ~$25 MXN (pago único por destacar publicación).
- Beneficio: Aparece en carruseles principales y búsquedas prioritarias.

6. ESTADOS DE ORDEN
- pending_payment: Creada, no pagada.
- paid: Pagada, esperando envío.
- shipped: En tránsito (guía generada).
- delivered: Entregada al comprador.
- completed: Finalizada (fondos liberados al vendedor).
- cancelled: Cancelada (reembolso si aplicaba).
- disputed: En reclamación.
`;
