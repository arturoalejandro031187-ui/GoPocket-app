export type EmailTemplate = {
  subject: string;
  html: (data: Record<string, unknown>) => string;
  text: (data: Record<string, unknown>) => string;
};

const templates: Record<string, EmailTemplate> = {
  new_sale: {
    subject: '🛒 ¡Nueva Venta Pendiente! - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8b5cf6; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛒 ¡Nueva Venta Pendiente!</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Has recibido una nueva orden de compra.</p>
            ${data.orderId ? `<p><strong>Orden:</strong> ${data.orderId}</p>` : ''}
            <p>El pago está <strong>pendiente</strong>. Te notificaremos cuando se acredite para que puedas realizar el envío.</p>
            ${data.linkTo ? `<a href="${data.linkTo}" class="button">Ver Detalles</a>` : ''}
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      ¡Nueva Venta Pendiente!
      
      Has recibido una nueva orden de compra.
      ${data.orderId ? `Orden: ${data.orderId}` : ''}
      
      El pago está pendiente. Te notificaremos cuando se acredite.
      ${data.linkTo ? `Ver detalles: ${data.linkTo}` : ''}
    `,
  },

  payment_approved: {
    subject: '✅ Pago Acreditado - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #E3127D 0%, #ff6b6b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>¡Pago Acreditado!</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu pago ha sido acreditado exitosamente.</p>
            ${data.orderIds ? `<p><strong>Órdenes:</strong> ${Array.isArray(data.orderIds) ? data.orderIds.join(', ') : data.orderIds}</p>` : ''}
            ${data.amount ? `<p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>` : ''}
            <p>Ya puedes dar seguimiento a tu compra desde tu panel.</p>
            ${data.linkTo ? `<a href="${data.linkTo}" class="button">Ver Mis Compras</a>` : ''}
          </div>
          <div class="footer">
            <p>GoPocket - Tu marketplace de confianza</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      ¡Pago Acreditado!
      
      Tu pago ha sido acreditado exitosamente.
      ${data.orderIds ? `Órdenes: ${Array.isArray(data.orderIds) ? data.orderIds.join(', ') : data.orderIds}` : ''}
      ${data.amount ? `Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : ''}
      
      Ya puedes dar seguimiento a tu compra desde tu panel.
      ${data.linkTo ? `Ver: ${data.linkTo}` : ''}
    `,
  },

  payment_rejected: {
    subject: '⚠️ Pago Rechazado - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #dc2626; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pago Rechazado</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu pago no pudo ser procesado.</p>
            ${data.reason ? `<p><strong>Motivo:</strong> ${data.reason}</p>` : ''}
            <p>Por favor, intenta con otro método de pago.</p>
            ${data.linkTo ? `<a href="${data.linkTo}" class="button">Intentar Nuevamente</a>` : ''}
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      Pago Rechazado
      
      Tu pago no pudo ser procesado.
      ${data.reason ? `Motivo: ${data.reason}` : ''}
      
      Por favor, intenta con otro método de pago.
      ${data.linkTo ? `Intentar: ${data.linkTo}` : ''}
    `,
  },

  reset_password: {
    subject: '🔐 Restablecer Contraseña - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #E3127D 0%, #ff6b6b 100%); color: white; padding: 40px 20px; text-align: center; }
          .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 10px; }
          .title { font-size: 20px; font-weight: 600; opacity: 0.95; }
          .content { padding: 40px 30px; background: white; text-align: center; }
          .text { color: #4b5563; font-size: 16px; margin-bottom: 24px; }
          .button { display: inline-block; padding: 16px 32px; background: #E3127D; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; margin: 10px 0 30px 0; box-shadow: 0 4px 12px rgba(227, 18, 125, 0.2); transition: transform 0.2s; }
          .button:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(227, 18, 125, 0.3); }
          .footer { background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6; }
          .link-fallback { word-break: break-all; color: #E3127D; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">GoPocket</div>
            <div class="title">Recuperación de Cuenta</div>
          </div>
          <div class="content">
            <p class="text">Hola,</p>
            <p class="text">Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, puedes ignorar este correo.</p>
            <p class="text">Para continuar, haz clic en el siguiente botón:</p>
            
            <a href="${data.resetLink}" class="button">Restablecer Contraseña</a>
            
            <p class="text" style="font-size: 14px; color: #6b7280;">Este enlace expirará en 1 hora por seguridad.</p>
            
            <div class="link-fallback">
              <p>¿El botón no funciona? Copia y pega este enlace en tu navegador:</p>
              ${data.resetLink}
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} GoPocket. Todos los derechos reservados.</p>
            <p>Este es un correo automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      Restablecer Contraseña - GoPocket
      
      Hola,
      
      Recibimos una solicitud para restablecer tu contraseña.
      
      Para continuar, visita el siguiente enlace:
      ${data.resetLink}
      
      Si no solicitaste esto, puedes ignorar este mensaje.
    `,
  },

  order_shipped: {
    subject: '📦 Tu Pedido Fue Enviado - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .tracking { background: white; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Tu Pedido Fue Enviado</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu pedido ha sido enviado y está en camino.</p>
            ${data.trackingNumber ? `
              <div class="tracking">
                <p><strong>Número de rastreo:</strong> ${data.trackingNumber}</p>
                ${data.carrier ? `<p><strong>Transportista:</strong> ${data.carrier}</p>` : ''}
              </div>
            ` : ''}
            ${data.linkTo ? `<a href="${data.linkTo}" class="button">Rastrear Pedido</a>` : ''}
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      Tu Pedido Fue Enviado
      
      Tu pedido ha sido enviado y está en camino.
      ${data.trackingNumber ? `Número de rastreo: ${data.trackingNumber}` : ''}
      ${data.carrier ? `Transportista: ${data.carrier}` : ''}
      ${data.linkTo ? `Rastrear: ${data.linkTo}` : ''}
    `,
  },

  sale_paid: {
    subject: '💰 ¡Hiciste una Venta! - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 ¡Hiciste una Venta!</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>¡Felicidades! Se ha acreditado el pago de una de tus ventas.</p>
            ${data.orderId ? `<p><strong>Orden:</strong> ${data.orderId}</p>` : ''}
            ${data.amount ? `<p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>` : ''}
            <p>Por favor, prepara el envío lo antes posible.</p>
            ${data.linkTo ? `<a href="${data.linkTo}" class="button">Ver Venta</a>` : ''}
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      ¡Hiciste una Venta!
      
      ¡Felicidades! Se ha acreditado el pago de una de tus ventas.
      ${data.orderId ? `Orden: ${data.orderId}` : ''}
      ${data.amount ? `Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : ''}
      
      Por favor, prepara el envío lo antes posible.
      ${data.linkTo ? `Ver venta: ${data.linkTo}` : ''}
    `,
  },

  estafeta_payment_approved: {
    subject: '✅ Pago Estafeta Acreditado - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Pago Estafeta Acreditado</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu pago de Estafeta ha sido acreditado exitosamente.</p>
            ${data.amount ? `<p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>` : ''}
            <p>La guía estará disponible pronto.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      Pago Estafeta Acreditado
      
      Tu pago de Estafeta ha sido acreditado exitosamente.
      ${data.amount ? `Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : ''}
      
      La guía estará disponible pronto.
    `,
  },

  ad_payment_approved: {
    subject: '📢 Pago de Publicidad Acreditado - GoPocket',
    html: (data) => `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #db2777; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📢 Pago de Publicidad Acreditado</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu pago de publicidad ha sido acreditado.</p>
            ${data.amount ? `<p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>` : ''}
            <p>Tu campaña está en proceso de revisión.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      Pago de Publicidad Acreditado
      
      Tu pago de publicidad ha sido acreditado.
      ${data.amount ? `Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : ''}
      
      Tu campaña está en proceso de revisión.
    `,
  },
};

export function getEmailTemplate(type: string): EmailTemplate | null {
  return templates[type] || null;
}

// Funciones específicas para compatibilidad con notify.ts
export function orderPaymentApprovedBuyer(data: {
  orderIds: string[];
  total?: number;
  userName?: string;
}): { subject: string; html: string; text: string } {
  const template = templates.payment_approved;
  return {
    subject: template.subject,
    html: template.html({ ...data, amount: data.total, linkTo: process.env.NEXT_PUBLIC_APP_URL + '/dashboard/compras' }),
    text: template.text({ ...data, amount: data.total, linkTo: process.env.NEXT_PUBLIC_APP_URL + '/dashboard/compras' }),
  };
}

export function abandonedCart(data: {
  userName?: string;
  items: Array<{ title: string; price: string; image?: string }>;
  cartLink: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '🛒 ¡No olvides tus favoritos! - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #E3127D 0%, #ff6b6b 100%); color: white; padding: 40px 20px; text-align: center; }
          .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 10px; }
          .title { font-size: 20px; font-weight: 600; opacity: 0.95; }
          .content { padding: 40px 30px; background: white; text-align: center; }
          .text { color: #4b5563; font-size: 16px; margin-bottom: 24px; }
          .items-preview { text-align: left; background: #f9fafb; padding: 20px; border-radius: 12px; margin-bottom: 30px; }
          .item-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; }
          .item-row:last-child { border-bottom: none; }
          .item-image { width: 50px; height: 50px; border-radius: 6px; object-fit: cover; margin-right: 15px; background-color: #eee; }
          .item-details { flex: 1; }
          .item-title { font-weight: 600; color: #111827; display: block; font-size: 14px; }
          .item-price { color: #E3127D; font-weight: 700; font-size: 14px; }
          .button { display: inline-block; padding: 16px 32px; background: #E3127D; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; margin: 10px 0 30px 0; box-shadow: 0 4px 12px rgba(227, 18, 125, 0.2); transition: transform 0.2s; }
          .button:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(227, 18, 125, 0.3); }
          .footer { background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">GoPocket</div>
            <div class="title">¿Olvidaste algo?</div>
          </div>
          <div class="content">
            <p class="text">Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p class="text">Notamos que dejaste algunos artículos increíbles en tu carrito. ¡Están esperando por ti!</p>
            
            ${data.items && Array.isArray(data.items) && data.items.length > 0 ? `
              <div class="items-preview">
                <p style="margin-top:0; color:#6b7280; font-size:14px; margin-bottom:15px;">Tus artículos guardados:</p>
                ${data.items.map((item) => `
                  <div class="item-row">
                    ${item.image ? `<img src="${item.image}" class="item-image" alt="Producto" />` : ''}
                    <div class="item-details">
                      <span class="item-title">${item.title}</span>
                      <span class="item-price">${item.price}</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            
            <a href="${data.cartLink}" class="button">Volver al Carrito</a>
            
            <p class="text" style="font-size: 14px; color: #6b7280;">No te preocupes, hemos guardado tu selección para cuando estés listo.</p>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} GoPocket. Todos los derechos reservados.</p>
            <p>Si ya realizaste tu compra, puedes ignorar este mensaje.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ¿Olvidaste algo en GoPocket?
      
      Hola${data.userName ? ` ${data.userName}` : ''},
      
      Notamos que dejaste algunos artículos en tu carrito. ¡Están esperando por ti!
      
      ${data.items && Array.isArray(data.items) ? data.items.map((item) => `- ${item.title}: ${item.price}`).join('\n') : ''}
      
      Vuelve a tu carrito aquí:
      ${data.cartLink}
    `,
  };
}

export function resetPassword(data: {
  userName?: string;
  resetLink: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '🔐 Restablecer Contraseña - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { background: linear-gradient(135deg, #E3127D 0%, #ff6b6b 100%); color: white; padding: 40px 20px; text-align: center; }
          .logo { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 10px; }
          .title { font-size: 20px; font-weight: 600; opacity: 0.95; }
          .content { padding: 40px 30px; background: white; text-align: center; }
          .text { color: #4b5563; font-size: 16px; margin-bottom: 24px; }
          .button { display: inline-block; padding: 16px 32px; background: #E3127D; color: white; text-decoration: none; border-radius: 12px; font-weight: 600; margin: 10px 0 30px 0; box-shadow: 0 4px 12px rgba(227, 18, 125, 0.2); transition: transform 0.2s; }
          .button:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(227, 18, 125, 0.3); }
          .footer { background: #f9fafb; padding: 20px; text-align: center; color: #9ca3af; font-size: 12px; border-top: 1px solid #f3f4f6; }
          .link-fallback { word-break: break-all; color: #E3127D; font-size: 12px; margin-top: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">GoPocket</div>
            <div class="title">Recuperación de Cuenta</div>
          </div>
          <div class="content">
            <p class="text">Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p class="text">Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, puedes ignorar este correo.</p>
            <p class="text">Para continuar, haz clic en el siguiente botón:</p>
            
            <a href="${data.resetLink}" class="button">Restablecer Contraseña</a>
            
            <p class="text" style="font-size: 14px; color: #6b7280;">Este enlace expirará en 1 hora por seguridad.</p>
            
            <div class="link-fallback">
              <p>¿El botón no funciona? Copia y pega este enlace en tu navegador:</p>
              ${data.resetLink}
            </div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} GoPocket. Todos los derechos reservados.</p>
            <p>Este es un correo automático, por favor no respondas.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Restablecer Contraseña - GoPocket
      
      Hola${data.userName ? ` ${data.userName}` : ''},
      
      Recibimos una solicitud para restablecer tu contraseña.
      
      Para continuar, visita el siguiente enlace:
      ${data.resetLink}
      
      Si no solicitaste esto, puedes ignorar este mensaje.
    `,
  };
}



export function saleMade(data: {
  userName?: string;
  listingTitle: string;
  amount: number;
  orderId: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '💰 ¡Hiciste una Venta! - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 ¡Hiciste una Venta!</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>¡Felicidades! Has vendido <strong>"${data.listingTitle}"</strong>.</p>
            <p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>
            <p>Por favor, prepara el envío lo antes posible.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/ventas" class="button">Ver Venta</a>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ¡Hiciste una Venta!
      
      ¡Felicidades! Has vendido "${data.listingTitle}".
      Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
      
      Por favor, prepara el envío lo antes posible.
      Ver venta: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/ventas
    `,
  };
}

export function purchaseConfirmed(data: {
  userName?: string;
  listingTitle: string;
  amount: number;
  orderId: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '🛍️ ¡Compra Confirmada! - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #8b5cf6; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🛍️ ¡Compra Confirmada!</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>Tu compra de <strong>"${data.listingTitle}"</strong> ha sido confirmada.</p>
            <p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>
            <p>El vendedor preparará tu envío pronto.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/compras" class="button">Ver Compra</a>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ¡Compra Confirmada!
      
      Tu compra de "${data.listingTitle}" ha sido confirmada.
      Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
      
      El vendedor preparará tu envío pronto.
      Ver compra: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/compras
    `,
  };
}

export function orderPaymentApprovedSeller(data: {
  orderIds: string[];
  total?: number;
}): { subject: string; html: string; text: string } {
  const amountStr = data.total
    ? Number(data.total).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
    : '';
  const ordersStr = data.orderIds.join(', ');

  return {
    subject: '💰 ¡Hiciste una Venta! - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💰 ¡Hiciste una Venta!</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>¡Felicidades! Se ha acreditado el pago de tus ventas.</p>
            <p><strong>Órdenes:</strong> ${ordersStr}</p>
            ${amountStr ? `<p><strong>Monto Total:</strong> ${amountStr}</p>` : ''}
            <p>Por favor, prepara el envío lo antes posible.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/ventas" class="button">Ver Ventas</a>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ¡Hiciste una Venta!
      
      ¡Felicidades! Se ha acreditado el pago de tus ventas.
      Órdenes: ${ordersStr}
      ${amountStr ? `Monto Total: ${amountStr}` : ''}
      
      Por favor, prepara el envío lo antes posible.
      Ver ventas: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/ventas
    `,
  };
}



export function orderPaymentRejectedBuyer(data: {
  userName?: string;
  reason?: string;
}): { subject: string; html: string; text: string } {
  const template = templates.payment_rejected;
  return {
    subject: template.subject,
    html: template.html({ ...data, linkTo: process.env.NEXT_PUBLIC_APP_URL + '/dashboard/compras' }),
    text: template.text({ ...data, linkTo: process.env.NEXT_PUBLIC_APP_URL + '/dashboard/compras' }),
  };
}

export function orderShippedBuyer(data: {
  orderId: string;
  tracking?: string;
  carrier?: string;
  userName?: string;
}): { subject: string; html: string; text: string } {
  const template = templates.order_shipped;
  return {
    subject: template.subject,
    html: template.html({ ...data, trackingNumber: data.tracking, linkTo: process.env.NEXT_PUBLIC_APP_URL + '/dashboard/compras' }),
    text: template.text({ ...data, trackingNumber: data.tracking, linkTo: process.env.NEXT_PUBLIC_APP_URL + '/dashboard/compras' }),
  };
}

export function orderConfirmReceivedSeller(data: {
  orderId: string;
  userName?: string;
  amount?: number;
}): { subject: string; html: string; text: string } {
  return {
    subject: '✅ Comprador Confirmó Recepción - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Comprador Confirmó Recepción</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>El comprador ha confirmado la recepción de la orden <strong>${data.orderId}</strong>.</p>
            ${data.amount ? `<p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>` : ''}
            <p>El dinero será liberado según los términos de la plataforma.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Comprador Confirmó Recepción
      
      El comprador ha confirmado la recepción de la orden ${data.orderId}.
      ${data.amount ? `Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}` : ''}
      
      El dinero será liberado según los términos de la plataforma.
    `,
  };
}

export function orderMarkedDeliveredByAdminSeller(data: {
  orderId: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '✅ Orden Marcada como Entregada por Admin - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Orden Marcada como Entregada</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>La orden <strong>${data.orderId}</strong> ha sido marcada como entregada por un administrador.</p>
            <p>El dinero será liberado según los términos de la plataforma.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Orden Marcada como Entregada
      
      La orden ${data.orderId} ha sido marcada como entregada por un administrador.
      El dinero será liberado según los términos de la plataforma.
    `,
  };
}

export function disputeOpened(data: {
  orderId: string;
  isBuyer: boolean;
  userName?: string;
}): { subject: string; html: string; text: string } {
  const role = data.isBuyer ? 'comprador' : 'vendedor';
  return {
    subject: '⚠️ Disputa Abierta - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc2626; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>⚠️ Disputa Abierta</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>Se ha abierto una disputa para la orden <strong>${data.orderId}</strong>.</p>
            <p>Como ${role}, recibirás actualizaciones sobre el estado de la disputa.</p>
            <p>Nuestro equipo de soporte revisará el caso y te notificará la resolución.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Disputa Abierta
      
      Se ha abierto una disputa para la orden ${data.orderId}.
      Como ${role}, recibirás actualizaciones sobre el estado de la disputa.
      Nuestro equipo de soporte revisará el caso y te notificará la resolución.
    `,
  };
}

export function disputeResolved(data: {
  orderId: string;
  decision?: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '✅ Disputa Resuelta - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Disputa Resuelta</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>La disputa para la orden <strong>${data.orderId}</strong> ha sido resuelta.</p>
            ${data.decision ? `<p><strong>Decisión:</strong> ${data.decision}</p>` : ''}
            <p>Puedes revisar los detalles en tu panel de disputas.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Disputa Resuelta
      
      La disputa para la orden ${data.orderId} ha sido resuelta.
      ${data.decision ? `Decisión: ${data.decision}` : ''}
      
      Puedes revisar los detalles en tu panel de disputas.
    `,
  };
}

export function estafetaPaymentApproved(data: {
  amount: number;
  userName?: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '✅ Pago Estafeta Acreditado - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #059669; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Pago Estafeta Acreditado</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>Tu pago de Estafeta ha sido acreditado exitosamente.</p>
            <p><strong>Monto:</strong> ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}</p>
            <p>Ya puedes usar el servicio de envío de Estafeta.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Pago Estafeta Acreditado
      
      Tu pago de Estafeta ha sido acreditado exitosamente.
      Monto: ${Number(data.amount).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
      
      Ya puedes usar el servicio de envío de Estafeta.
    `,
  };
}

export function questionReceived(data: {
  userName?: string;
  questionText: string;
  listingTitle: string;
  listingId: string;
  listingImageUrl?: string;
}): { subject: string; html: string; text: string } {
  const imageUrl = data.listingImageUrl || 'https://via.placeholder.com/150?text=No+Image';

  return {
    subject: '💬 Te hicieron una pregunta - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #E3127D 0%, #ff6b6b 100%); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: bold; }
          .content { padding: 30px; }
          .product-card { background: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0; display: flex; align-items: center; border: 1px solid #eee; }
          .product-image { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; margin-right: 15px; background-color: #eee; }
          .product-info { flex: 1; }
          .product-title { font-weight: bold; color: #333; margin: 0 0 5px 0; font-size: 16px; }
          .quote-box { background: #fff0f6; border-left: 4px solid #E3127D; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
          .quote-text { font-style: italic; color: #555; font-size: 16px; margin: 0; }
          .button { display: block; width: fit-content; margin: 30px auto; padding: 14px 28px; background: #E3127D; color: white !important; text-decoration: none; border-radius: 30px; font-weight: bold; text-align: center; box-shadow: 0 4px 10px rgba(227, 18, 125, 0.3); }
          .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
          .footer p { margin: 5px 0; }
          @media (max-width: 480px) {
            .container { margin: 0; border-radius: 0; }
            .content { padding: 20px; }
            .header { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💬 Nueva Pregunta</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px;">Hola${data.userName ? ` <strong>${data.userName}</strong>` : ''},</p>
            
            <p>Un usuario está interesado en tu producto y te ha dejado una pregunta.</p>

            <div class="product-card">
              <img src="${imageUrl}" alt="Producto" class="product-image" />
              <div class="product-info">
                <p class="product-title">${data.listingTitle}</p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/listings/${data.listingId}" style="color: #E3127D; text-decoration: none; font-size: 14px;">Ver publicación &rarr;</a>
              </div>
            </div>

            <div class="quote-box">
              <p class="quote-text">"${data.questionText}"</p>
            </div>

            <p style="text-align: center; color: #666; margin-bottom: 0;">Responde lo antes posible para aumentar tus posibilidades de venta.</p>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/preguntas" class="button">Responder Ahora</a>
          </div>
          <div class="footer">
            <p>Este correo fue enviado por GoPocket.</p>
            <p>Si no deseas recibir estos correos, puedes ajustar tus preferencias en tu cuenta.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Nueva Pregunta
      
      Hola${data.userName ? ` ${data.userName}` : ''},
      
      Te hicieron una pregunta en tu publicación "${data.listingTitle}":
      "${data.questionText}"
      
      Responder: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/preguntas
    `,
  };
}

export function answerReceived(data: {
  userName?: string;
  answerText: string;
  listingTitle: string;
  listingId: string;
  listingImageUrl?: string;
}): { subject: string; html: string; text: string } {
  const imageUrl = data.listingImageUrl || 'https://via.placeholder.com/150?text=No+Image';

  return {
    subject: '💬 Respondieron tu pregunta - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #E3127D 0%, #ff6b6b 100%); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: bold; }
          .content { padding: 30px; }
          .product-card { background: #f9f9f9; border-radius: 8px; padding: 15px; margin: 20px 0; display: flex; align-items: center; border: 1px solid #eee; }
          .product-image { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; margin-right: 15px; background-color: #eee; }
          .product-info { flex: 1; }
          .product-title { font-weight: bold; color: #333; margin: 0 0 5px 0; font-size: 16px; }
          .quote-box { background: #e6f7ff; border-left: 4px solid #1890ff; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
          .quote-text { font-style: italic; color: #555; font-size: 16px; margin: 0; }
          .button { display: block; width: fit-content; margin: 30px auto; padding: 14px 28px; background: #E3127D; color: white !important; text-decoration: none; border-radius: 30px; font-weight: bold; text-align: center; box-shadow: 0 4px 10px rgba(227, 18, 125, 0.3); }
          .footer { background: #f9f9f9; padding: 20px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; }
          .footer p { margin: 5px 0; }
          @media (max-width: 480px) {
            .container { margin: 0; border-radius: 0; }
            .content { padding: 20px; }
            .header { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💬 Respondieron tu Pregunta</h1>
          </div>
          <div class="content">
            <p style="font-size: 16px;">Hola${data.userName ? ` <strong>${data.userName}</strong>` : ''},</p>
            
            <p>El vendedor ha respondido a tu pregunta sobre el siguiente producto:</p>

            <div class="product-card">
              <img src="${imageUrl}" alt="Producto" class="product-image" />
              <div class="product-info">
                <p class="product-title">${data.listingTitle}</p>
                <a href="${process.env.NEXT_PUBLIC_APP_URL}/listings/${data.listingId}" style="color: #E3127D; text-decoration: none; font-size: 14px;">Ver publicación &rarr;</a>
              </div>
            </div>

            <div class="quote-box">
              <p class="quote-text">"${data.answerText}"</p>
            </div>

            <a href="${process.env.NEXT_PUBLIC_APP_URL}/listings/${data.listingId}" class="button">Ver Respuesta Completa</a>
          </div>
          <div class="footer">
            <p>Este correo fue enviado por GoPocket.</p>
            <p>Si no deseas recibir estos correos, puedes ajustar tus preferencias en tu cuenta.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Respondieron tu Pregunta
      
      Hola${data.userName ? ` ${data.userName}` : ''},
      
      El vendedor respondió tu pregunta sobre "${data.listingTitle}":
      "${data.answerText}"
      
      Ver publicación: ${process.env.NEXT_PUBLIC_APP_URL}/listings/${data.listingId}
    `,
  };
}

export function auctionLost(data: {
  userName?: string;
  listingTitle: string;
  listingId: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '🔨 Subasta Finalizada - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6b7280; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔨 Subasta Finalizada</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>La subasta de <strong>"${data.listingTitle}"</strong> ha finalizado y lamentablemente no ganaste esta vez.</p>
            <p>¡No te desanimes! Hay muchos más productos esperándote.</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}" class="button">Explorar Más</a>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Subasta Finalizada
      
      La subasta de "${data.listingTitle}" ha finalizado y lamentablemente no ganaste esta vez.
      
      Explorar más: ${process.env.NEXT_PUBLIC_APP_URL}
    `,
  };
}

export function welcome(data: {
  userName?: string;
}): { subject: string; html: string; text: string } {
  return {
    subject: '🎉 ¡Bienvenido a GoPocket!',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #E3127D 0%, #ff6b6b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 ¡Bienvenido a GoPocket!</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>Nos alegra mucho tenerte aquí. GoPocket es el mejor lugar para comprar y vender moda.</p>
            <p>¿Listo para empezar?</p>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}" class="button">Ir a GoPocket</a>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      ¡Bienvenido a GoPocket!
      
      Nos alegra mucho tenerte aquí. GoPocket es el mejor lugar para comprar y vender moda.
      
      Ir a GoPocket: ${process.env.NEXT_PUBLIC_APP_URL}
    `,
  };
}
