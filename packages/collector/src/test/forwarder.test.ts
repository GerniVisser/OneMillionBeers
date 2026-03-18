import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { BeerLogRequest } from '@omb/shared'

vi.mock('../config.js', () => ({
  config: {
    BACKEND_URL: 'http://localhost:3000',
    COLLECTOR: 'telegram',
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
}

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
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 201 }))

    const { forwardBeerLog } = await import('../forwarder.js')
    await forwardBeerLog(validPayload)

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:3000/v1/internal/beer-log')
  })

  it('sends POST with JSON content-type, correct body, and an AbortSignal', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 201 }))

    const { forwardBeerLog } = await import('../forwarder.js')
    await forwardBeerLog(validPayload)

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toMatchObject(validPayload)
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('body matches BeerLogRequestSchema', async () => {
    fetchSpy.mockResolvedValue(new Response('{"ok":true}', { status: 201 }))
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
})
