/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/app',
        destination: '/',
      },
      {
        source: '/',
        destination: '/welcome',
      },
    ];
  },
};

module.exports = nextConfig;
