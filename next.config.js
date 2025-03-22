/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    return config;
  },
  // No need for rewrites now that we're using the backend socket server
}

module.exports = nextConfig 