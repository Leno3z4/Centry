/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      process.env.WALLETCONNECT_PROJECT_ID || '',
  },
};

module.exports = nextConfig;
