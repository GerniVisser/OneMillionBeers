import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BeerLogRequest } from '@omb/shared'

vi.mock('../config.js', () => ({
  config: {
    BACKEND_URL: 'http://localhost:3000',
    INTERNAL_API_TOKEN: 'test-internal-token-at-least-32-chars-long',
    LOG_LEVEL: 'silent',
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_BUCKET: 'omb-photos',
    STORAGE_KEY: 'key',
    STORAGE_SECRET: 'secret',
    STORAGE_REGION: 'auto',
  },
}))

const validPayload: BeerLogRequest = {
  sourceGroupId: 'tg:-1001234567890',
  groupName: 'Beer Lovers',
  senderId: 'tg:99887766',
  timestamp: '2026-03-18T14:00:00.000Z',
  photoUrl: 'http://localhost:9000/omb-photos/photos/-1001234567890/abc.jpg',
  sourceMessageId: 'MSGID001',
}

const created = () => new Response('{"ok":true,"outcome":"created"}', { status: 201 })

describe('forwardBeerLog', () => {
  let fetchSpy: ReturnType<typeof vi.fn> & { mockRestore: () => void }

  beforeEach(() => {
    vi.resetModules()
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as typeof fetchSpy
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('POSTs to the correct endpoint', async () => {
    fetchSpy.mockResolvedValue(created())

    const { forwardBeerLog } = await import('../forwarder.js')
    await forwardBeerLog(validPayload)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/v1/internal/beer-log')
  })

  it('sends POST with JSON content-type, correct body, and an AbortSignal', async () => {
    fetchSpy.mockResolvedValue(created())

    const { forwardBeerLog } = await import('../forwarder.js')
    await forwardBeerLog(validPayload)

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toMatchObject(validPayload)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('presents the internal API token as a bearer header', async () => {
    fetchSpy.mockResolvedValue(created())

    const { forwardBeerLog } = await import('../forwarder.js')
    await forwardBeerLog(validPayload)

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-internal-token-at-least-32-chars-long',
    )
  })

  it('body matches BeerLogRequestSchema', async () => {
    fetchSpy.mockResolvedValue(created())
    const { BeerLogRequestSchema } = await import('@omb/shared')

    const { forwardBeerLog } = await import('../forwarder.js')
    await forwardBeerLog(validPayload)

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(() => BeerLogRequestSchema.parse(JSON.parse(init.body as string))).not.toThrow()
  })

  it('throws when backend returns a non-2xx status', async () => {
    fetchSpy.mockResolvedValue(new Response('Bad Request', { status: 400 }))

    const { forwardBeerLog } = await import('../forwarder.js')
    await expect(forwardBeerLog(validPayload)).rejects.toThrow('Backend returned 400')
  })

  it('propagates network errors', async () => {
    fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'))

    const { forwardBeerLog } = await import('../forwarder.js')
    await expect(forwardBeerLog(validPayload)).rejects.toThrow('ECONNREFUSED')
  })

  it('returns the outcome the backend reports', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true,"outcome":"duplicate"}', { status: 201 }))

    const { forwardBeerLog } = await import('../forwarder.js')
    await expect(forwardBeerLog(validPayload)).resolves.toBe('duplicate')
  })

  it('rejects a 2xx response that carries no outcome', async () => {
    // The collector decides whether to clean up its S3 object from the outcome,
    // so a backend that does not report one is a contract break, not a success.
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 201 }))

    const { forwardBeerLog } = await import('../forwarder.js')
    await expect(forwardBeerLog(validPayload)).rejects.toThrow()
  })
})

describe('forwardDeleteBeerLog', () => {
  let fetchSpy: ReturnType<typeof vi.fn> & { mockRestore: () => void }

  beforeEach(() => {
    vi.resetModules()
    fetchSpy = vi.spyOn(globalThis, 'fetch') as unknown as typeof fetchSpy
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  it('sends the group as a query parameter and returns the photo URL', async () => {
    fetchSpy.mockResolvedValue(
      new Response('{"ok":true,"photoUrl":"http://localhost:9000/omb-photos/a.jpg"}', {
        status: 200,
      }),
    )

    const { forwardDeleteBeerLog } = await import('../forwarder.js')
    const photoUrl = await forwardDeleteBeerLog('MSGID001', 'wa:120363XXXX@g.us')

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      'http://localhost:3000/v1/internal/beer-log/by-message/MSGID001' +
        '?sourceGroupId=wa%3A120363XXXX%40g.us',
    )
    expect(init.method).toBe('DELETE')
    expect(photoUrl).toBe('http://localhost:9000/omb-photos/a.jpg')
  })

  it('returns null when the revoke matched no beer log', async () => {
    // Normal: the revoke can arrive before the message it revokes. The backend
    // still records the revocation, so this is a 200 with no photoUrl.
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const { forwardDeleteBeerLog } = await import('../forwarder.js')
    await expect(forwardDeleteBeerLog('MSGID001', 'wa:120363XXXX@g.us')).resolves.toBeNull()
  })

  it('throws when the backend rejects the delete', async () => {
    fetchSpy.mockResolvedValue(new Response('Bad Request', { status: 400 }))

    const { forwardDeleteBeerLog } = await import('../forwarder.js')
    await expect(forwardDeleteBeerLog('MSGID001', 'wa:120363XXXX@g.us')).rejects.toThrow(
      'Backend returned 400',
    )
  })
})
