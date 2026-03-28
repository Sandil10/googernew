/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix HTTP 431 "Request Header Fields Too Large" caused by large cookies/JWT tokens.
  // Raises the maximum allowed HTTP header size from the default 8KB to 32KB.
  experimental: {
  },
  httpAgentOptions: {
    maxHeaderSize: 32768, // 32KB (default is 8192 = 8KB)
  },
  images: {
    unoptimized: true,
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
        destination: 'http://localhost:5000/api/:path*',
      },
      // Reverse compatibility for legacy routes if needed
      {
        source: '/auth/:path*',
        destination: 'http://localhost:5000/auth/:path*',
      },
      {
        source: '/wallet/:path*',
        destination: 'http://localhost:5000/wallet/:path*',
      },
      {
        source: '/market/:path*',
        destination: 'http://localhost:5000/market/:path*',
      },
      {
        source: '/orders/:path*',
        destination: 'http://localhost:5000/orders/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
