/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
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
};

module.exports = nextConfig; 