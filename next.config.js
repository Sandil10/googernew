/** @type {import('next').NextConfig} */
// BACKEND_URL: set this env var on the production server to point to the public backend host.
// Falls back to localhost for local development.
const BACKEND_ORIGIN = process.env.BACKEND_URL || 'http://127.0.0.1:5000';

const nextConfig = {
  experimental: {
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**', // Allow all https domains for user-uploaded/linked images
      },
      {
        protocol: 'http',
        hostname: 'localhost',
      },
      {
        protocol: 'https',
        hostname: 'i.pravatar.cc',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      {
        protocol: 'https',
        hostname: 'ui-avatars.com',
      },
    ],
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
