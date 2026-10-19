import { describe, it, expect, vi, beforeEach } from 'vitest'
import { pino } from 'pino'

class MockRetryLater extends Error {}
const mockHandleWebhookEvent = vi.fn()

vi.mock('../webhook.js', () => ({
  handleWebhookEvent: mockHandleWebhookEvent,
  RetryLater: MockRetryLater,
}))
vi.mock('../admin.js', () => ({ registerAdminRoutes: vi.fn() }))

const { buildServer } = await import('../server.js')

describe('POST /webhook', () => {
  beforeEach(() => {
    mockHandleWebhookEvent.mockReset()
  })

  const post = () =>
    buildServer(pino({ level: 'silent' })).inject({
      method: 'POST',
      url: '/webhook',
      payload: { event: 'message' },
    })

  it('answers 200 once the event is handled', async () => {
    mockHandleWebhookEvent.mockResolvedValue(undefined)
    expect((await post()).statusCode).toBe(200)
  })

  it('answers 503 so WAHA delivers the event again when storing it failed', async () => {
    mockHandleWebhookEvent.mockRejectedValue(new MockRetryLater())
    expect((await post()).statusCode).toBe(503)
  })

  it('answers 503 on an unexpected error too', async () => {
    mockHandleWebhookEvent.mockRejectedValue(new Error('bug'))
    expect((await post()).statusCode).toBe(503)
  })
})
