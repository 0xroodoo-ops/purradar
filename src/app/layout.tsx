import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { siteUrl } from '@/lib/site'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: 'PURRADAR — Real planes. Cats instead.',
  description:
    'Live aircraft tracking where every aircraft is a cat. Real ADS-B positions, real headings, real traffic. No fake cats.',
  openGraph: {
    title: 'PURRADAR',
    description: 'REAL PLANES. CATS INSTEAD.',
    type: 'website',
  },
}

export const viewport: Viewport = {
  themeColor: '#04060f',
  // Page zoom is deliberately left alone. Locking it stops the map fighting a
  // pinch, but it also stops anyone who needs to magnify the UI — and MapLibre
  // already claims touch gestures over its own canvas.
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/* The basemap is a third-party origin on the critical path; opening the
            connection early takes the handshake off the front of the style
            request. */}
        <link rel="preconnect" href="https://tiles.openfreemap.org" crossOrigin="" />
        <link rel="dns-prefetch" href="https://tiles.openfreemap.org" />
      </head>
      <body className="h-full">{children}</body>
    </html>
  )
}
