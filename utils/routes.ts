export const publicRoutes = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/privacy',
  '/terms',
  '/acceptable-use',
  '/cookies',
  '/help',
  '/support',
  '/status',
]

export const authRoutes = [
  '/auth/login',
  '/auth/register',
  '/auth/verify',
  '/auth/verify/verification',
  '/auth/verify-email',
  '/auth/registered',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]

export const apiAuthPrefix = '/api/auth'

export const apiRoutes = '/api'

export const DEFAULT_LOGIN_REDIRECT = '/workspaces'

/**
 * Generated metadata images (app/icon.tsx, app/apple-icon.tsx,
 * app/opengraph-image.tsx, app/twitter-image.tsx). They have no file
 * extension, so the proxy would send signed-out visitors and social-media
 * crawlers to the login page instead of the image.
 */
export function isMetadataImageRoute(pathname: string): boolean {
  return (
    pathname === '/icon' ||
    pathname.startsWith('/icon/') ||
    pathname === '/apple-icon' ||
    pathname.startsWith('/apple-icon/') ||
    pathname === '/opengraph-image' ||
    pathname.startsWith('/opengraph-image/') ||
    pathname === '/twitter-image' ||
    pathname.startsWith('/twitter-image/')
  )
}
