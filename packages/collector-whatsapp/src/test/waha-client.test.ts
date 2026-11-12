import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../config.js', () => ({
  config: {
    WAHA_BASE_URL: 'http://waha:3000',
    WAHA_API_KEY: 'test-api-key',
    WAHA_SESSIONS: ['default'],
  },
}))

describe('waha-client', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('getSessionStatus returns the session status string', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ name: 'default', status: 'WORKING' }),
      }),
    )
    const { getSessionStatus } = await import('../waha-client.js')
    const status = await getSessionStatus('default')
    expect(status).toBe('WORKING')
  })

  it('getSessionStatus throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const { getSessionStatus } = await import('../waha-client.js')
    await expect(getSessionStatus('default')).rejects.toThrow('500')
  })

  it('getQrCodePng returns a Buffer from the response', async () => {
    const fakeData = new Uint8Array([1, 2, 3]).buffer
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => fakeData,
      }),
    )
    const { getQrCodePng } = await import('../waha-client.js')
    const buf = await getQrCodePng('default')
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf[0]).toBe(1)
  })

  it('getQrCodePng throws on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const { getQrCodePng } = await import('../waha-client.js')
    await expect(getQrCodePng('default')).rejects.toThrow('404')
  })

  it('getGroupName returns the group name on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ subject: 'Beer Crew' }),
      }),
    )
    const { getGroupName } = await import('../waha-client.js')
    const name = await getGroupName('default', '120363@g.us')
    expect(name).toBe('Beer Crew')
  })

  it('getGroupName returns groupId as fallback when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
    const { getGroupName } = await import('../waha-client.js')
    const name = await getGroupName('default', '120363@g.us')
    expect(name).toBe('120363@g.us')
  })

  it('getGroupName rejects subject that starts with raw JID digits (WAHA garbage)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          subject: '120363402479181080@g.us","countryCode":"ZA"}}',
        }),
      }),
    )
    const { getGroupName } = await import('../waha-client.js')
    const name = await getGroupName('default', '120363402479181080@g.us')
    expect(name).toBe('120363402479181080@g.us')
  })

  it('getGroupName rejects subject that contains JSON syntax characters', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ subject: '{"id":"120363402479181080@g.us"}' }),
      }),
    )
    const { getGroupName } = await import('../waha-client.js')
    const name = await getGroupName('default', '120363402479181080@g.us')
    expect(name).toBe('120363402479181080@g.us')
  })

  it('getGroupName falls back to groupId when subject is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ subject: null }),
      }),
    )
    const { getGroupName } = await import('../waha-client.js')
    const name = await getGroupName('default', '120363402479181080@g.us')
    expect(name).toBe('120363402479181080@g.us')
  })

  it('listAllGroups returns groups from an array response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{ id: '123@g.us', subject: 'Beer Crew' }],
      }),
    )
    const { listAllGroups } = await import('../waha-client.js')
    const groups = await listAllGroups('default')
    expect(groups).toHaveLength(1)
    expect(groups[0]).toEqual({ id: '123@g.us', subject: 'Beer Crew' })
  })

  it('listAllGroups returns groups from an object-map response (WAHA NOWEB)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ '123@g.us': { id: '123@g.us', subject: 'Beer Crew' } }),
      }),
    )
    const { listAllGroups } = await import('../waha-client.js')
    const groups = await listAllGroups('default')
    expect(groups).toHaveLength(1)
    expect(groups[0].subject).toBe('Beer Crew')
  })

  it('listAllGroups returns empty array on non-2xx', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
    const { listAllGroups } = await import('../waha-client.js')
    expect(await listAllGroups('default')).toEqual([])
  })
})
