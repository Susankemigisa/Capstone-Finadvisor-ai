/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*.jpg',
        headers: [
          { key: 'Accept-Ranges', value: 'bytes' },
          { key: 'Content-Type', value: 'image/jpeg' },
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ]
  },
}

export default nextConfig
