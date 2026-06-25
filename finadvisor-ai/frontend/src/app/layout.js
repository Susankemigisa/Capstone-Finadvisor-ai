import './globals.css'

export const metadata = {
  title: 'FinAdvisor AI',
  description: 'AI-powered financial advisory',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2' },
      { url: '/favicon-16x16.png?v=2', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png?v=2', sizes: '180x180' }],
  },
}

// Single blocking script — runs synchronously before any paint.
// Always applies 'dark' unless user explicitly toggled to light in settings.
// Since both themes are now navy, the class only matters for subtle differences.
const themeScript = `(function(){
  try {
    var stored = localStorage.getItem('finadvisor-theme');
    var cls = (stored === 'light') ? 'light' : 'dark';
    document.documentElement.classList.add(cls);
  } catch(e) {
    document.documentElement.classList.add('dark');
  }
})()`

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
