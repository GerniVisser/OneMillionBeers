import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../config.js', () => ({
  config: {
    WAHA_BASE_URL: 'http://waha:3000',
    WAHA_API_KEY: 'test-api-key',
    WAHA_SESSIONS: ['default'],
    WAHA_WEBHOOK_URL: 'http://collector:8080/webhook',
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

  describe('reconcileSession', () => {
    const liveConfig = {
      webhooks: [
        {
          url: 'http://collector:8080/webhook',
          events: [
            'message',
            'message.revoked',
            'session.status',
            'group.v2.join',
            'group.v2.update',
          ],
          retries: { policy: 'exponential', delaySeconds: 2, attempts: 8 },
        },
      ],
      noweb: { markOnline: false },
    }

    it('creates a session that does not exist, started, with the config', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404 })
        .mockResolvedValueOnce({ ok: true })
      vi.stubGlobal('fetch', mockFetch)
      const { reconcileSession } = await import('../waha-client.js')

      expect(await reconcileSession('backup')).toEqual({ action: 'created' })
      const [url, init] = mockFetch.mock.calls[1] as [string, RequestInit]
      expect(url).toBe('http://waha:3000/api/sessions')
      expect(init.method).toBe('POST')
      const body = JSON.parse(init.body as string)
      expect(body).toMatchObject({ name: 'backup', start: true })
      expect(body.config.webhooks[0].events).toContain('message')
      expect(body.config.webhooks[0].events).not.toContain('message.any')
      expect(body.config.noweb.markOnline).toBe(false)
    })

    it('leaves an already-correct session alone', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'WORKING', config: liveConfig }),
      })
      vi.stubGlobal('fetch', mockFetch)
      const { reconcileSession } = await import('../waha-client.js')

      expect(await reconcileSession('default')).toEqual({ action: 'unchanged', status: 'WORKING' })
      expect(mockFetch).toHaveBeenCalledOnce() // GET only — no PUT
    })

    it('ignores event order when comparing', async () => {
      const shuffled = {
        ...liveConfig,
        webhooks: [
          { ...liveConfig.webhooks[0], events: [...liveConfig.webhooks[0]!.events].reverse() },
        ],
      }
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'WORKING', config: shuffled }),
      })
      vi.stubGlobal('fetch', mockFetch)
      const { reconcileSession } = await import('../waha-client.js')

      expect((await reconcileSession('default')).action).toBe('unchanged')
    })

    it('PUTs when the live config has drifted', async () => {
      const stale = { webhooks: [{ url: 'http://old:8080/webhook', events: ['message.any'] }] }
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'WORKING', config: stale }),
        })
        .mockResolvedValueOnce({ ok: true })
      vi.stubGlobal('fetch', mockFetch)
      const { reconcileSession } = await import('../waha-client.js')

      expect(await reconcileSession('default')).toEqual({ action: 'updated', status: 'WORKING' })
      const [putUrl, putInit] = mockFetch.mock.calls[1] as [string, RequestInit]
      expect(putUrl).toBe('http://waha:3000/api/sessions/default')
      expect(putInit.method).toBe('PUT')
    })

    it('PUTs when markOnline is left at the WAHA default', async () => {
      const noMarkOnline = { webhooks: liveConfig.webhooks }
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ status: 'WORKING', config: noMarkOnline }),
        })
        .mockResolvedValueOnce({ ok: true })
      vi.stubGlobal('fetch', mockFetch)
      const { reconcileSession } = await import('../waha-client.js')

      expect((await reconcileSession('default')).action).toBe('updated')
    })

    it('reports the live status so a change made while the collector was down is seen', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'SCAN_QR_CODE', config: liveConfig }),
      })
      vi.stubGlobal('fetch', mockFetch)
      const { reconcileSession } = await import('../waha-client.js')

      expect(await reconcileSession('default')).toEqual({
        action: 'unchanged',
        status: 'SCAN_QR_CODE',
      })
    })

    it('throws when WAHA is unreachable, so the caller can keep the other sessions', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))
      const { reconcileSession } = await import('../waha-client.js')
      await expect(reconcileSession('default')).rejects.toThrow('500')
    })

    it('URL-encodes the session name', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'WORKING', config: liveConfig }),
      })
      vi.stubGlobal('fetch', mockFetch)
      const { reconcileSession } = await import('../waha-client.js')
      await reconcileSession('a/b')
      expect(mockFetch.mock.calls[0]![0]).toBe('http://waha:3000/api/sessions/a%2Fb')
    })
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
