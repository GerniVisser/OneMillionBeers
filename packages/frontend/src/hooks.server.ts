import { env } from '$env/dynamic/private'

export async function handleFetch({ request, fetch }) {
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) {
    const newPath = url.pathname.replace('/api/', '/') + url.search
    return fetch(new Request(env.BACKEND_INTERNAL_URL + newPath, request))
  }
  return fetch(request)
}
