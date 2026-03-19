import './globals.css'

export const metadata = {
  title: 'FinAdvisor AI',
  description: 'AI-powered financial advisory',
}

// Inline script to apply theme before page renders (prevents flash)
const themeScript = `
  (function() {
    var theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.classList.add(theme);
  })();
`

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