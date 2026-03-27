import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pino } from 'pino'

const mockUploadPhoto = vi.fn()
const mockForwardBeerLog = vi.fn()
const mockHandleSessionStatusChange = vi.fn()
const mockGetGroupName = vi.fn()

vi.mock('@omb/collector-core', () => ({
  uploadPhoto: mockUploadPhoto,
  forwardBeerLog: mockForwardBeerLog,
  coreConfig: { LOG_LEVEL: 'silent' },
}))
vi.mock('../session-monitor.js', () => ({
  handleSessionStatusChange: mockHandleSessionStatusChange,
}))
vi.mock('../waha-client.js', () => ({ getGroupName: mockGetGroupName }))
vi.mock('../config.js', () => ({
  config: {
    WAHA_BASE_URL: 'http://waha:3000',
    WAHA_API_KEY: 'test-key',
  },
}))

const logger = pino({ level: 'silent' })

function mockImageFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: (h: string) => (h === 'content-type' ? 'image/jpeg' : null) },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }),
  )
}

function makeImagePayload(overrides?: Record<string, unknown>) {
  return {
    event: 'message',
    session: 'default',
    payload: {
      id: 'MSGID123',
      timestamp: 1742306400,
      from: '1234567890@s.whatsapp.net',
      fromMe: false,
      to: '120363XXXX@g.us',
      participant: '1234567890@s.whatsapp.net',
      body: '',
      hasMedia: true,
      media: {
        mimetype: 'image/jpeg',
        filename: 'photo.jpg',
        url: 'http://waha:3000/api/files/fake',
      },
      chatId: '120363XXXX@g.us',
      ...overrides,
    },
  }
}

describe('webhook', () => {
  beforeEach(() => {
    vi.resetModules()
    mockUploadPhoto.mockReset()
    mockForwardBeerLog.mockReset()
    mockHandleSessionStatusChange.mockReset()
    mockGetGroupName.mockReset()
    mockGetGroupName.mockResolvedValue('Beer Crew')
    mockUploadPhoto.mockResolvedValue('https://s3.example.com/photos/120363XXXX/MSGID123.jpg')
    mockForwardBeerLog.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('processes valid image message and calls uploadPhoto + forwardBeerLog', async () => {
    mockImageFetch()
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(makeImagePayload(), logger)

    expect(mockUploadPhoto).toHaveBeenCalledOnce()
    const [key] = mockUploadPhoto.mock.calls[0]!
    expect(key).toBe('photos/120363XXXX/MSGID123.jpg')

    expect(mockForwardBeerLog).toHaveBeenCalledOnce()
    const [beerLog] = mockForwardBeerLog.mock.calls[0]!
    expect(beerLog.sourceGroupId).toBe('wa:120363XXXX@g.us')
    expect(beerLog.senderId).toBe('wa:1234567890')
    expect(beerLog.timestamp).toBe(new Date(1742306400 * 1000).toISOString())
  })

  it('dispatches session.status event to handleSessionStatusChange', async () => {
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(
      { event: 'session.status', payload: { status: 'SCAN_QR_CODE' } },
      logger,
    )
    expect(mockHandleSessionStatusChange).toHaveBeenCalledWith('SCAN_QR_CODE', logger)
  })

  it('ignores message with hasMedia=false', async () => {
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(makeImagePayload({ hasMedia: false }), logger)
    expect(mockUploadPhoto).not.toHaveBeenCalled()
  })

  it('ignores message with non-image mimetype', async () => {
    const { handleWebhookEvent } = await import('../webhook.js')
    const body = makeImagePayload()
    ;(body.payload as Record<string, unknown>).media = {
      mimetype: 'video/mp4',
      url: 'http://waha:3000/api/files/fake',
    }
    await handleWebhookEvent(body, logger)
    expect(mockUploadPhoto).not.toHaveBeenCalled()
  })

  it('ignores private chat messages (chatId ends in @s.whatsapp.net)', async () => {
    const { handleWebhookEvent } = await import('../webhook.js')
    const body = makeImagePayload({ chatId: '1234567890@s.whatsapp.net' })
    await handleWebhookEvent(body, logger)
    expect(mockUploadPhoto).not.toHaveBeenCalled()
  })

  it('does not call forwardBeerLog when uploadPhoto throws', async () => {
    mockImageFetch()
    mockUploadPhoto.mockRejectedValue(new Error('S3 error'))
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(makeImagePayload(), logger)
    expect(mockForwardBeerLog).not.toHaveBeenCalled()
  })

  it('does not rethrow when forwardBeerLog throws', async () => {
    mockImageFetch()
    mockForwardBeerLog.mockRejectedValue(new Error('backend error'))
    const { handleWebhookEvent } = await import('../webhook.js')
    await expect(handleWebhookEvent(makeImagePayload(), logger)).resolves.toBeUndefined()
  })

  it('ignores unknown event types without throwing', async () => {
    const { handleWebhookEvent } = await import('../webhook.js')
    await expect(
      handleWebhookEvent({ event: 'some.unknown.event' }, logger),
    ).resolves.toBeUndefined()
    expect(mockUploadPhoto).not.toHaveBeenCalled()
    expect(mockHandleSessionStatusChange).not.toHaveBeenCalled()
  })

  it('rewrites media URL origin to WAHA_BASE_URL before fetching', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      arrayBuffer: async () => new ArrayBuffer(8),
    })
    vi.stubGlobal('fetch', fetchMock)
    const body = makeImagePayload()
    ;(body.payload as Record<string, unknown>).media = {
      mimetype: 'image/jpeg',
      url: 'http://localhost:3000/api/files/default/abc123.jpeg',
    }
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(body, logger)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://waha:3000/api/files/default/abc123.jpeg',
      expect.anything(),
    )
  })

  it('discards when media URL is absent', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const body = makeImagePayload()
    ;(body.payload as Record<string, unknown>).media = { mimetype: 'image/jpeg' }
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(body, logger)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockUploadPhoto).not.toHaveBeenCalled()
  })

  it('discards when Content-Length exceeds 20 MB', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (h: string) => (h === 'content-length' ? String(21 * 1024 * 1024) : 'image/jpeg'),
        },
        arrayBuffer: async () => {
          throw new Error('should not be called')
        },
      }),
    )
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(makeImagePayload(), logger)
    expect(mockUploadPhoto).not.toHaveBeenCalled()
  })

  it('discards when response Content-Type is not image/', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (h: string) => (h === 'content-type' ? 'application/octet-stream' : null) },
        arrayBuffer: async () => {
          throw new Error('should not be called')
        },
      }),
    )
    const { handleWebhookEvent } = await import('../webhook.js')
    await handleWebhookEvent(makeImagePayload(), logger)
    expect(mockUploadPhoto).not.toHaveBeenCalled()
  })
})
