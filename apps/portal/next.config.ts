import path from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Un `next build` de verificación usa otra carpeta para no pisar el `next dev` que esté corriendo.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  outputFileTracingRoot: path.resolve(process.cwd(), '../..'),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@sp/schemas', '@sp/pricing'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), usb=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default config;
