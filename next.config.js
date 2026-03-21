/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fix HTTP 431 "Request Header Fields Too Large" caused by large cookies/JWT tokens.
  // Raises the maximum allowed HTTP header size from the default 8KB to 32KB.
  experimental: {
    serverComponentsHmrCache: false, // needed when using custom header size
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
};

module.exports = nextConfig;
