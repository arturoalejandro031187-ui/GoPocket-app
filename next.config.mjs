/** @type {import('next').NextConfig} */
const nextConfig = {
  // Evita que `next build` (producción) corrompa el cache/artefactos del dev server en Windows.
  // Dev usa `.next-dev` y producción usa `.next`.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',

  // OPTIMIZACIÓN: Compresión automática
  compress: true,

  // Evitar "failed to load stylesheet" cuando algo pide layout.css desde rutas anidadas (ej. /dashboard/reputacion).
  async rewrites() {
    return [
      { source: '/layout.css', destination: '/_next/static/css/app/layout.css' },
      { source: '/:path+/layout.css', destination: '/_next/static/css/app/layout.css' },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.cloudinary.com',
      },
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'upload.wikimedia.org',
      },
    ],
  },

  // Forzar webpack en lugar de Turbopack (compatible con Next.js 14 y 16)
  // Si usas Next.js 16+, puedes usar --webpack flag o esta configuración
  webpack: (config, { dev }) => {
    // En Windows a veces se corrompe el cache en disco (.next/cache/webpack/*.pack.gz)
    // y Next se queda sin manifests (middleware-manifest.json) => "missing required error components".
    // Forzamos cache en memoria para evitar ENOENT por pack files.
    if (dev) {
      config.cache = { type: 'memory' };
    }
    return config;
  },
  
  turbopack: {},

  experimental: {
    webpackBuildWorker: true,
  },
};

export default nextConfig;
