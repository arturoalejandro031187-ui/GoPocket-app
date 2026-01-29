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
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Pago Rechazado</h1>
          </div>
          <div class="content">
            <p>Hola,</p>
            <p>Tu pago fue rechazado. Por favor intenta de nuevo o elige otro método de pago.</p>
            ${data.linkTo ? `<a href="${data.linkTo}" class="button">Intentar de Nuevo</a>` : ''}
          </div>
        </div>
      </body>
      </html>
    `,
    text: (data) => `
      Pago Rechazado
      
      Tu pago fue rechazado. Por favor intenta de nuevo o elige otro método de pago.
      ${data.linkTo ? `Intentar: ${data.linkTo}` : ''}
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
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #E3127D; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Restablecer Contraseña</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, puedes ignorar este correo.</p>
            <p>Para crear una nueva contraseña, haz clic en el siguiente botón:</p>
            <a href="${data.resetLink}" class="button">Restablecer Contraseña</a>
            <p>Este enlace expirará pronto.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Restablecer Contraseña
      
      Recibimos una solicitud para restablecer tu contraseña.
      Para crear una nueva contraseña, visita: ${data.resetLink}
      
      Si no fuiste tú, ignora este correo.
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
}): { subject: string; html: string; text: string } {
  return {
    subject: '💬 Te hicieron una pregunta - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #E3127D; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .quote { background: white; padding: 15px; border-left: 4px solid #E3127D; margin: 15px 0; font-style: italic; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💬 Nueva Pregunta</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>Te hicieron una pregunta en tu publicación <strong>"${data.listingTitle}"</strong>:</p>
            <div class="quote">"${data.questionText}"</div>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/preguntas" class="button">Responder Pregunta</a>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Nueva Pregunta
      
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
}): { subject: string; html: string; text: string } {
  return {
    subject: '💬 Respondieron tu pregunta - GoPocket',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #E3127D; color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
          .quote { background: white; padding: 15px; border-left: 4px solid #E3127D; margin: 15px 0; font-style: italic; }
          .button { display: inline-block; padding: 12px 24px; background: #E3127D; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>💬 Respondieron tu Pregunta</h1>
          </div>
          <div class="content">
            <p>Hola${data.userName ? ` ${data.userName}` : ''},</p>
            <p>El vendedor respondió tu pregunta sobre <strong>"${data.listingTitle}"</strong>:</p>
            <div class="quote">"${data.answerText}"</div>
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/listings/${data.listingId}" class="button">Ver Publicación</a>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      Respondieron tu Pregunta
      
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
