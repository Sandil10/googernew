/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix HTTP 431 "Request Header Fields Too Large" caused by large cookies/JWT tokens.
  // Raises the maximum allowed HTTP header size from the default 8KB to 32KB.
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
        destination: 'http://127.0.0.1:5000/api/:path*',
      },
      {
        source: '/uploads/:path*',
        destination: 'http://127.0.0.1:5000/uploads/:path*',
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
