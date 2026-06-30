const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/api/soal-cache',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=60, s-maxage=300' },
          { key: 'CDN-Cache-Control', value: 'max-age=300' },
          { key: 'Vercel-CDN-Cache-Control', value: 'max-age=300' },
        ],
      },
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

module.exports = withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: "instiper",
    project: "portal-ujian",
  },
  {
    widenClientFileUpload: true,
    transpileClientSDK: true,
    hideSourceMaps: true,
    disableLogger: true,
  }
);
