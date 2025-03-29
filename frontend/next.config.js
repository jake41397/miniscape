/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Disable strict mode for better performance
  // Only use export for production builds, not during development
  output: process.env.NODE_ENV === 'production' ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  // Ensure APIs can be mocked with /api routes in static export
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://miniscape.io/api/:path*',
      },
    ];
  },
  // Add performance optimizations
  swcMinify: true,
  compress: true,
  poweredByHeader: false,
};

module.exports = nextConfig; 