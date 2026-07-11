/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-force-graph-2d'],
  output: 'standalone',
};

module.exports = nextConfig;
