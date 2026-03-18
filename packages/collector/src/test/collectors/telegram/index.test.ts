import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../../uploader.js', () => ({ uploadPhoto: vi.fn() }))
vi.mock('../../../forwarder.js', () => ({ forwardBeerLog: vi.fn() }))
vi.mock('../../../config.js', () => ({
  config: {
    LOG_LEVEL: 'silent',
    COLLECTOR: 'telegram',
    BACKEND_URL: 'http://localhost:3000',
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_BUCKET: 'omb-photos',
    STORAGE_KEY: 'key',
    STORAGE_SECRET: 'secret',
    STORAGE_REGION: 'auto',
  },
}))
vi.mock('../../../collectors/telegram/config.js', () => ({
  telegramConfig: { TELEGRAM_BOT_TOKEN: 'fake-token' },
}))

// Mock grammY Bot: capture registered handlers for direct invocation in tests
vi.mock('grammy', () => {
  const Bot = vi.fn(function (this: Record<string, unknown>) {
    const handlers: Record<string, ((ctx: unknown) => Promise<void>)[]> = {}
    this._handlers = handlers
    this.api = { config: { use: vi.fn() } }
    this.on = vi.fn((event: string, handler: (ctx: unknown) => Promise<void>) => {
      handlers[event] = handlers[event] ?? []
      handlers[event].push(handler)
    })
    this.start = vi.fn().mockResolvedValue(undefined)
    this.stop = vi.fn().mockResolvedValue(undefined)
  })
  return { Bot }
})

// hydrateFiles is a no-op in tests — file.download() is mocked on the context
vi.mock('@grammyjs/files', () => ({ hydrateFiles: vi.fn(() => vi.fn()) }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

type BotInstance = {
  _handlers: Record<string, ((ctx: unknown) => Promise<void>)[]>
}

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    chat: {
      type: 'supergroup',
      id: -1001234567890,
      title: 'Beer Lovers',
      ...(overrides.chat as object | undefined),
    },
    from: { id: 99887766, ...(overrides.from as object | undefined) },
    message: {
      date: 1742306400, // 2026-03-18T14:00:00Z
      photo: [
        { file_id: 'small_id', file_unique_id: 'SMALL', width: 100, height: 100 },
        { file_id: 'large_id', file_unique_id: 'ABC123', width: 800, height: 600 },
      ],
      ...(overrides.message as object | undefined),
    },
    getFile: vi.fn().mockResolvedValue({
      file_path: 'photos/file/path.jpg',
      download: vi.fn().mockResolvedValue(new Uint8Array(8).buffer),
    }),
    ...overrides,
  }
}

describe('Telegram message handler', () => {
  let uploadPhoto: ReturnType<typeof vi.fn>
  let forwardBeerLog: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()

    const uploader = await import('../../../uploader.js')
    const forwarder = await import('../../../forwarder.js')
    uploadPhoto = vi.mocked(uploader.uploadPhoto)
    forwardBeerLog = vi.mocked(forwarder.forwardBeerLog)

    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    })
    uploadPhoto.mockResolvedValue(
      'http://localhost:9000/omb-photos/photos/-1001234567890/ABC123.jpg',
    )
    forwardBeerLog.mockResolvedValue(undefined)
  })

  async function getHandler() {
    const { createTelegramBot } = await import('../../../collectors/telegram/index.js')
    const bot = createTelegramBot() as unknown as BotInstance
    return bot._handlers['message:photo'][0]
  }

  it('uploads to S3 with the correct key and forwards the beer log', async () => {
    const handler = await getHandler()
    await handler(makeCtx())

    expect(uploadPhoto).toHaveBeenCalledWith('photos/-1001234567890/ABC123.jpg', expect.any(Buffer))
    expect(forwardBeerLog).toHaveBeenCalledWith({
      sourceGroupId: 'tg:-1001234567890',
      groupName: 'Beer Lovers',
      senderId: 'tg:99887766',
      timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
      photoUrl: 'http://localhost:9000/omb-photos/photos/-1001234567890/ABC123.jpg',
    })
  })

  it('ignores messages from private chats', async () => {
    const handler = await getHandler()
    await handler(makeCtx({ chat: { type: 'private', id: 12345, title: 'Bob' } }))

    expect(uploadPhoto).not.toHaveBeenCalled()
    expect(forwardBeerLog).not.toHaveBeenCalled()
  })

  it('discards the photo when S3 upload fails — does not call the forwarder', async () => {
    uploadPhoto.mockRejectedValue(new Error('S3 down'))
    const handler = await getHandler()
    await handler(makeCtx())

    expect(uploadPhoto).toHaveBeenCalled()
    expect(forwardBeerLog).not.toHaveBeenCalled()
  })

  it('logs the error but does not throw when the backend call fails', async () => {
    forwardBeerLog.mockRejectedValue(new Error('backend down'))
    const handler = await getHandler()

    // Must resolve without throwing
    await expect(handler(makeCtx())).resolves.toBeUndefined()
  })

  it('handles anonymous senders (no ctx.from) by using tg:anonymous:<chatId> as senderId', async () => {
    const handler = await getHandler()
    await handler(makeCtx({ from: undefined }))

    expect(forwardBeerLog).toHaveBeenCalledWith(
      expect.objectContaining({ senderId: 'tg:anonymous:-1001234567890' }),
    )
  })

  it('uses the last (highest-resolution) photo in the array', async () => {
    const handler = await getHandler()
    await handler(makeCtx())

    // Key should use file_unique_id of the last photo (ABC123), not the first (SMALL)
    expect(uploadPhoto).toHaveBeenCalledWith(expect.stringContaining('ABC123'), expect.any(Buffer))
  })

  it('discards the photo when Telegram download fails', async () => {
    const handler = await getHandler()
    const ctx = makeCtx()
    // Override getFile to return a download() that rejects
    ctx.getFile = vi.fn().mockResolvedValue({
      file_path: 'photos/file/path.jpg',
      download: vi.fn().mockRejectedValue(new Error('download failed')),
    })
    await handler(ctx)

    expect(uploadPhoto).not.toHaveBeenCalled()
    expect(forwardBeerLog).not.toHaveBeenCalled()
  })
})
