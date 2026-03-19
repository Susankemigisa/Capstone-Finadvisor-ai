import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SUPPORTED_LOCALES = ['en', 'fr', 'es', 'de', 'sw', 'pt', 'ar', 'zh', 'hi', 'ja', 'ko', 'ru', 'yo', 'ha', 'ig', 'am']

export function proxy(request: NextRequest) {
  const locale = request.cookies.get('NEXT_LOCALE')?.value || 'en'
  const validLocale = SUPPORTED_LOCALES.includes(locale) ? locale : 'en'
  const response = NextResponse.next()
  response.cookies.set('NEXT_LOCALE', validLocale, { path: '/', maxAge: 60 * 60 * 24 * 365 })
  return response
}

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
}