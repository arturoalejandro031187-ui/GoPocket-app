// Configuración de tours para cada página del dashboard
// Cada página tiene pasos super sencillos que explican las funciones principales

import type { TourStep } from '@/components/PageTour';

type PageTourConfig = {
  [pageId: string]: TourStep[];
};

export const pageTours: PageTourConfig = {
  // Dashboard principal
  dashboard: [
    {
      id: 'welcome',
      target: 'body',
      title: '¡Bienvenido! 👋',
      content: 'Este es tu panel principal. Aquí verás un resumen de todo lo importante.',
      position: 'bottom',
    },
    {
      id: 'charts',
      target: '[data-tour="charts"]',
      title: '📊 Gráficas y desempeño',
      content: 'Vistas de tus artículos, ventas y compras por mes. Todo para llevar un buen control.',
      position: 'bottom',
    },
    {
      id: 'recent-operations',
      target: '[data-tour="recent-operations"]',
      title: '📦 Operaciones Recientes',
      content: 'Mira tus compras y ventas más recientes. Haz clic para ver detalles.',
      position: 'bottom',
    },
    {
      id: 'menu',
      target: '[data-tour="menu"]',
      title: '📋 Menú',
      content: 'Desde aquí accedes a todas las secciones de tu cuenta.',
      position: 'right',
    },
  ],

  // Ventas
  ventas: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Tus Ventas 💰',
      content: 'Aquí verás todas las órdenes que recibiste de tus compradores.',
      position: 'bottom',
    },
    {
      id: 'filters',
      target: '[data-tour="filters"]',
      title: 'Filtros',
      content: 'Filtra tus ventas por estado: pendientes, pagadas, enviadas, etc.',
      position: 'bottom',
    },
    {
      id: 'orders',
      target: '[data-tour="orders-list"]',
      title: 'Lista de Ventas',
      content: 'Cada orden muestra el estado, el comprador y el total. Haz clic para ver detalles.',
      position: 'bottom',
    },
  ],

  // Compras
  compras: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Tus Compras 🛒',
      content: 'Aquí verás todas las órdenes que realizaste como comprador.',
      position: 'bottom',
    },
    {
      id: 'filters',
      target: '[data-tour="filters"]',
      title: 'Filtros',
      content: 'Filtra tus compras por estado: pendientes, pagadas, enviadas, etc.',
      position: 'bottom',
    },
    {
      id: 'orders',
      target: '[data-tour="orders-list"]',
      title: 'Lista de Compras',
      content: 'Cada orden muestra el estado, el vendedor y el total. Haz clic para ver detalles.',
      position: 'bottom',
    },
  ],

  // Preguntas
  preguntas: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Preguntas y Respuestas 💬',
      content: 'Aquí verás las preguntas que te hicieron sobre tus productos y las que tú hiciste.',
      position: 'bottom',
    },
    {
      id: 'questions',
      target: '[data-tour="questions-list"]',
      title: 'Lista de Preguntas',
      content: 'Las preguntas están agrupadas por publicación. Responde para ayudar a los compradores.',
      position: 'bottom',
    },
  ],

  // Respuestas
  respuestas: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Respuestas Recibidas ✅',
      content: 'Aquí verás las respuestas que recibiste a tus preguntas.',
      position: 'bottom',
    },
    {
      id: 'responses',
      target: '[data-tour="responses-list"]',
      title: 'Lista de Respuestas',
      content: 'Las respuestas están agrupadas por publicación. Revisa lo que te respondieron.',
      position: 'bottom',
    },
  ],

  // Publicaciones
  listings: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Mis Publicaciones 📦',
      content: 'Aquí gestionas todos tus productos en venta.',
      position: 'bottom',
    },
    {
      id: 'create',
      target: '[data-tour="create-button"]',
      title: 'Crear Publicación',
      content: 'Haz clic aquí para crear un nuevo producto en venta.',
      position: 'bottom',
    },
    {
      id: 'list',
      target: '[data-tour="listings-list"]',
      title: 'Tus Productos',
      content: 'Aquí verás todos tus productos. Puedes editarlos o pausarlos.',
      position: 'bottom',
    },
  ],

  // Perfil
  perfil: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Tu Perfil 👤',
      content: 'Aquí puedes actualizar tu información personal y configuración.',
      position: 'bottom',
    },
    {
      id: 'personal',
      target: '[data-tour="personal-info"]',
      title: 'Información Personal',
      content: 'Actualiza tu nombre, teléfono y dirección de envío.',
      position: 'bottom',
    },
    {
      id: 'documents',
      target: '[data-tour="documents"]',
      title: 'Documentos',
      content: 'Sube tu INE para poder vender productos en la plataforma.',
      position: 'bottom',
    },
    {
      id: 'payout',
      target: '[data-tour="payout-info"]',
      title: 'Datos de Pago',
      content: 'Configura cómo quieres recibir tus ganancias de las ventas.',
      position: 'bottom',
    },
  ],

  // Pagos
  pagos: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Tus Pagos 💳',
      content: 'Aquí verás el historial de tus pagos y retiros.',
      position: 'bottom',
    },
    {
      id: 'balance',
      target: '[data-tour="balance"]',
      title: 'Balance',
      content: 'Este es tu dinero disponible. Puedes retirarlo cuando quieras.',
      position: 'bottom',
    },
    {
      id: 'history',
      target: '[data-tour="history"]',
      title: 'Historial',
      content: 'Aquí verás todos tus pagos recibidos y retiros realizados.',
      position: 'bottom',
    },
  ],

  // Favoritos
  favoritos: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Tus Favoritos ❤️',
      content: 'Aquí guardas los productos que te gustaron para comprarlos después.',
      position: 'bottom',
    },
    {
      id: 'list',
      target: '[data-tour="favorites-list"]',
      title: 'Lista de Favoritos',
      content: 'Todos tus productos favoritos están aquí. Haz clic para verlos o comprarlos.',
      position: 'bottom',
    },
  ],

  // Reputación
  reputacion: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Tu Reputación ⭐',
      content: 'Aquí verás las calificaciones que recibiste de otros usuarios.',
      position: 'bottom',
    },
    {
      id: 'stats',
      target: '[data-tour="stats"]',
      title: 'Estadísticas',
      content: 'Mira tu calificación promedio y el número de reseñas recibidas.',
      position: 'bottom',
    },
    {
      id: 'reviews',
      target: '[data-tour="reviews"]',
      title: 'Reseñas',
      content: 'Lee lo que otros usuarios dijeron sobre ti después de comprarte.',
      position: 'bottom',
    },
  ],

  // Devoluciones/Disputas
  devoluciones: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Devoluciones y Disputas 🔄',
      content: 'Aquí gestionas las devoluciones y disputas de tus compras o ventas.',
      position: 'bottom',
    },
    {
      id: 'list',
      target: '[data-tour="disputes-list"]',
      title: 'Lista de Disputas',
      content: 'Verás todas las disputas abiertas. Puedes responder y seguir el proceso.',
      position: 'bottom',
    },
  ],

  // Cupones
  coupons: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Cupones de Descuento 🎟️',
      content: 'Crea cupones de descuento para tus productos y atrae más compradores.',
      position: 'bottom',
    },
    {
      id: 'create',
      target: '[data-tour="create-coupon"]',
      title: 'Crear Cupón',
      content: 'Haz clic aquí para crear un nuevo cupón de descuento.',
      position: 'bottom',
    },
    {
      id: 'list',
      target: '[data-tour="coupons-list"]',
      title: 'Tus Cupones',
      content: 'Aquí verás todos tus cupones activos e inactivos.',
      position: 'bottom',
    },
  ],

  // Ayuda
  ayuda: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Centro de Ayuda 📚',
      content: 'Aquí encontrarás respuestas a las preguntas más comunes.',
      position: 'bottom',
    },
    {
      id: 'sections',
      target: '[data-tour="help-sections"]',
      title: 'Secciones',
      content: 'Explora las diferentes categorías para encontrar la ayuda que necesitas.',
      position: 'bottom',
    },
  ],

  // Soporte
  soporte: [
    {
      id: 'welcome',
      target: 'body',
      title: 'Soporte al Cliente 💬',
      content: 'Aquí puedes contactar directamente con nuestro equipo de soporte.',
      position: 'bottom',
    },
    {
      id: 'conversations',
      target: '[data-tour="conversations"]',
      title: 'Conversaciones',
      content: 'Verás todas tus conversaciones con soporte. Haz clic para abrir una.',
      position: 'bottom',
    },
    {
      id: 'new',
      target: '[data-tour="new-ticket"]',
      title: 'Nuevo Ticket',
      content: 'Haz clic aquí para crear un nuevo ticket de soporte.',
      position: 'bottom',
    },
  ],
};
