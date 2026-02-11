# Manual Operativo del Panel de Administración - GoPocket

**Versión:** 2.0  
**Última Actualización:** Febrero 2026  
**Nivel de Acceso:** Administrativo / Gerencial

---

## 1. Introducción
Este documento sirve como guía oficial para el uso del Panel de Administración ("God Mode") de la plataforma. Está diseñado para capacitar a empleados y gerentes en la gestión diaria, resolución de problemas y supervisión financiera de la aplicación.

**Advertencia de Seguridad:** Todas las acciones realizadas en este panel quedan registradas. El uso indebido de las herramientas de eliminación o modificación financiera será auditado.

---

## 2. Gestión de Usuarios y Clientes

### 👥 Usuarios (General)
**Ruta:** `/admin/usuarios`
- **Función:** Base de datos completa de todos los registrados.
- **Acciones:**
  - Buscar por nombre, correo o ID.
  - Ver estado de cuenta y fecha de registro.
  - **Editar Perfil:** Modificar datos personales si el usuario perdió acceso.

### 🌟 Usuarios PRO (Suscripciones)
**Ruta:** `/admin/usuarios-pro`
- **Función:** Control de suscriptores pagados (Membresía PRO).
- **Columnas Clave:**
  - **Inicio/Fin Suscripción:** Fechas de vigencia.
  - **Plan Type:** Indica si es 'pro' o 'basic'.
- **Acciones:**
  - **Renovar Manualmente:** Extender la suscripción 30 días (útil para pagos offline).
  - **Cancelar:** Revocar acceso PRO inmediato.
  - **Notificar:** Enviar recordatorio de pago vía email.

### 🏢 Tiendas Oficiales
**Ruta:** `/admin/tiendas-oficiales`
- **Función:** Gestión de marcas verificadas y grandes vendedores.
- **Características:**
  - Permite configurar banners personalizados.
  - Asignar "Check Azul" de verificación.
  - Ajustar comisiones preferenciales si aplica.

---

## 3. Finanzas y Tesorería

### 💰 Pagos (Entrantes)
**Ruta:** `/admin/pagos`
- **Función:** Monitor de todas las transacciones de compra (MercadoPago/Stripe).
- **Uso:** Verificar si un pago fue exitoso ("approved") o rechazado.
- **Resolución:** Si un usuario reclama un pago, buscar aquí por "Order ID".

### 💳 PocketCash (Billetera Virtual)
**Ruta:** `/admin/pocketcash`
- **Función:** Autorización de recargas de saldo manuales (SPEI/Transferencia).
- **Proceso:**
  1. El usuario sube su comprobante.
  2. El admin revisa el archivo adjunto.
  3. **Aprobar:** Acredita el saldo inmediatamente.
  4. **Rechazar:** Cancela la solicitud.

### 🏦 Retiros (Salientes)
**Ruta:** `/admin/retiros`
- **Función:** Solicitudes de vendedores para retirar sus ganancias a cuentas bancarias.
- **Acción Requerida:** Marcar como "Pagado" una vez que tesorería haya realizado la transferencia real.

### 💼 Negocio (Configuración Fiscal)
**Ruta:** `/admin/negocio`
- **Función:** "Cerebro Financiero" de la app.
- **Controles:**
  - **Comisiones:** Definir el % que cobra la plataforma por venta.
  - **Cashback:** Activar/Desactivar campañas de devolución de dinero global.

---

## 4. Operaciones y Logística

### 📦 Envíos y Guías
**Ruta:** `/admin/envios`
- **Función:** Monitor de paquetería.
- **Estado:** Rastreo de paquetes en tiempo real.
- **Problemas:** Si una guía falla al generarse, aparecerá aquí en rojo.

### 🚚 Estafeta (Integración)
**Ruta:** `/admin/estafeta`
- **Función:** Configuración técnica de la cuenta maestra de Estafeta.
- **Uso:** Solo para personal técnico. No modificar credenciales.

### ⚖️ Disputas y Devoluciones
**Ruta:** `/admin/disputas` | `/admin/devoluciones`
- **Función:** Tribunal de resolución de conflictos.
- **Flujo:**
  1. Comprador inicia reclamo.
  2. Vendedor responde.
  3. **Admin Interviene:** Decide quién recibe el dinero (Reembolso o Liberación al vendedor).

---

## 5. Marketing y Contenido

### 📢 Publicidad (Ads)
**Ruta:** `/admin/publicidad`
- **Función:** Gestión de campañas pagadas dentro de la app (Productos patrocinados).
- **Acciones:** Aprobar anuncios para que salgan en vivo.

### 🖼️ Banners
**Ruta:** `/admin/banners`
- **Función:** Cambiar las imágenes del carrusel principal de la Home.
- **Tip:** Usar imágenes de alta resolución (1920x600 px recomendado).

### 📧 Plantillas de Correo
**Ruta:** `/admin/plantillas`
- **Función:** Editor de los emails automáticos que envía el sistema (Bienvenida, Compra Exitosa, etc.).

---

## 6. Seguridad y Auditoría (IA)

### 🛡️ Auditoría (Centinela IA)
**Ruta:** `/admin/auditoria`
- **Función:** Sistema autónomo que revisa la contabilidad y los datos.
- **Uso:** Hacer clic en "Ejecutar Centinela".
- **Qué detecta:**
  - Usuarios PRO vencidos que siguen teniendo beneficios.
  - Tiendas oficiales mal configuradas.
  - Discrepancias en saldos.
- **Importante:** Revisar esto cada mañana.

### 🔍 Diagnóstico
**Ruta:** `/admin/diagnostico`
- **Función:** Herramienta técnica para ver la salud de la base de datos. Muestra contadores crudos.

---

## 7. Soporte al Cliente

### 💬 Chat de Soporte
**Ruta:** `/admin/chat`
- **Función:** Consola de atención directa con usuarios.
- **IA de Apoyo:** El sistema sugiere respuestas, pero un humano debe supervisar casos complejos.

### 🎫 Tickets de Soporte
**Ruta:** `/admin/soporte`
- **Función:** Buzón de quejas y sugerencias formales.

---

## Glosario Rápido
- **UUID:** Identificador único de usuario/orden (ej: `a1b2-c3d4...`).
- **Callback:** Confirmación automática de pago desde el banco.
- **Hold:** Dinero retenido temporalmente hasta que se entrega el producto.
