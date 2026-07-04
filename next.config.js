/** @type {import('next').NextConfig} */
// BACKEND_URL: set this env var on the production server to point to the public backend host.
// Falls back to localhost for local development.
const BACKEND_ORIGIN = process.env.BACKEND_URL || 'http://127.0.0.1:5000';

const nextConfig = {
  // Keep production browser bundles minified without exposing source maps.
  // This does not affect local development or application logic.
  productionBrowserSourceMaps: false,
  allowedDevOrigins: ['googer.site', 'admin.googer.site', '*.googer.site', 'app.infranex.it.com', 'appadmin.infranex.it.com', '*.infranex.it.com', '*.trycloudflare.com', '*.ngrok-free.app'],
  experimental: {
  },
  images: {
    // Skip Next.js server-side optimization for all images. Profile pictures and
    // user-uploaded media are served via the /uploads/ rewrite to the backend; the
    // optimizer makes an extra server-side fetch that fails with "received null" when
    // a file is missing or the backend hasn't finished writing it yet. Skipping
    // optimization means the browser fetches images directly — broken files just show
    // a fallback, no terminal spam.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/login',
        destination: '/home',
        permanent: false,
      },
      {
        source: '/terms',
        destination: '/terms-and-policies',
        permanent: false,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${BACKEND_ORIGIN}/uploads/:path*`,
      },
      {
        source: '/socket.io/:path*',
        destination: `${BACKEND_ORIGIN}/socket.io/:path*`,
      },
      {
        source: '/shop/:id',
        destination: '/dashboard/shop?id=:id',
      },
      {
        source: '/shop/:id/:reseller',
        destination: '/dashboard/shop?id=:id&reseller=:reseller',
      },
    ];
  },
};

module.exports = nextConfig;
