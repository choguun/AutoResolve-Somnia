/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /ox\/_esm\/tempo\/internal\/virtualMasterPool/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...config.resolve.alias,
      '@react-native-async-storage/async-storage': false,
    };
    return config;
  },
};

module.exports = nextConfig;
