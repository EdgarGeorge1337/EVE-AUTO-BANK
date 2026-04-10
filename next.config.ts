import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    // Only ignore build errors in development if needed
    // In production, all TypeScript errors should be fixed
    ignoreBuildErrors: process.env.NODE_ENV === 'development',
  },
  reactStrictMode: true, // Enable React strict mode for better development experience

  // Fix Turbopack font module resolution issue
  experimental: {
    // Disable font loaders to resolve build issue
    optimizeCss: true,
  },
};
