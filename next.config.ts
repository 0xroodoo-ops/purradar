import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // A stray lockfile in the parent folder otherwise makes Turbopack guess the
  // wrong project root.
  turbopack: { root: path.resolve(process.cwd()) },
}

export default nextConfig
