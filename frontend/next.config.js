/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/app',
        destination: '/?dashboard=1',
      },
      {
        source: '/',
        destination: '/welcome',
      },
    ];
  },
};

module.exports = nextConfig;
