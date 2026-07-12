/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['react-force-graph-2d'],
  output: 'standalone',
  webpack: (config, { isServer }) => {
    // Fix for three-render-objects importing three/webgpu which doesn't exist in three@0.159.0
    // Alias the missing export to an empty module
    config.resolve.alias = {
      ...config.resolve.alias,
      'three/webgpu': false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    return config;
  },
};

module.exports = nextConfig;
