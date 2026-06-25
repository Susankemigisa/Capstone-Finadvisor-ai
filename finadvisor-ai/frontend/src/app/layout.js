import './globals.css'

export const metadata = {
  title: 'FinAdvisor AI',
  description: 'AI-powered financial advisory',
}

// Runs before React hydrates — prevents flash of wrong theme.
// Reads the OS preference directly, no localStorage needed.
const themeScript = `
  (function() {
    var theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
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
      <script dangerouslySetInnerHTML={{ __html: `(function(){
        var s=localStorage.getItem('finadvisor-theme');
        var t=s||(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');
        document.documentElement.classList.add(t);
      })()` }} />
      <body>{children}</body>
    </html>
  )
}
