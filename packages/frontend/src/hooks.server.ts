import { env } from '$env/dynamic/private'

export async function handleFetch({ event, request, fetch }) {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    const newPath = url.pathname.replace('/api/', '/') + url.search
    const proxied = new Request(env.BACKEND_INTERNAL_URL + newPath, request)
    const forwardedFor = event.request.headers.get('x-forwarded-for')
    if (forwardedFor) proxied.headers.set('x-forwarded-for', forwardedFor)
    return fetch(proxied)
  }
  return fetch(request)
}
