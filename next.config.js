/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    return config;
  },
  // Disable the bodyParser specifically for the socket API route
  async rewrites() {
    return [
      {
        source: '/api/socket',
        destination: '/api/socket',
      },
    ];
  },
}

module.exports = nextConfig 