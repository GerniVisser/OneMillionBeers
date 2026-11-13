import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockGetGroupParticipants = vi.fn()

vi.mock('../waha-client.js', () => ({ getGroupParticipants: mockGetGroupParticipants }))

const GROUP = '120363XXXX@g.us'
const LID = '189468321554607@lid'

describe('lid-resolver', () => {
  beforeEach(() => {
    vi.resetModules()
    mockGetGroupParticipants.mockReset()
    mockGetGroupParticipants.mockResolvedValue([{ id: LID, pn: '27831234567@c.us' }])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('answers from a remembered message sender without asking WAHA', async () => {
    const { rememberLid, resolveLid } = await import('../lid-resolver.js')
    rememberLid(LID, '27831234567@s.whatsapp.net')
    expect(await resolveLid('default', GROUP, LID)).toBe('27831234567')
    expect(mockGetGroupParticipants).not.toHaveBeenCalled()
  })

  it('ignores a sender that is already a phone JID', async () => {
    const { rememberLid, resolveLid } = await import('../lid-resolver.js')
    rememberLid('27831234567@s.whatsapp.net', '27831234567@s.whatsapp.net')
    mockGetGroupParticipants.mockResolvedValue([])
    expect(await resolveLid('default', GROUP, '27831234567@lid')).toBeNull()
  })

  it('falls back to the group participants and caches every member', async () => {
    mockGetGroupParticipants.mockResolvedValue([
      { id: LID, pn: '27831234567@c.us' },
      { id: '200000000000001@lid', pn: '447700900123@c.us' },
    ])
    const { resolveLid } = await import('../lid-resolver.js')
    expect(await resolveLid('default', GROUP, LID)).toBe('27831234567')
    expect(await resolveLid('default', GROUP, '200000000000001@lid')).toBe('447700900123')
    expect(mockGetGroupParticipants).toHaveBeenCalledOnce()
  })

  it('fetches a group at most once per 10 minutes for unknown LIDs', async () => {
    vi.useFakeTimers()
    const { resolveLid } = await import('../lid-resolver.js')
    expect(await resolveLid('default', GROUP, '999@lid')).toBeNull()
    expect(await resolveLid('default', GROUP, '999@lid')).toBeNull()
    expect(mockGetGroupParticipants).toHaveBeenCalledOnce()

    vi.advanceTimersByTime(10 * 60 * 1000)
    await resolveLid('default', GROUP, '999@lid')
    expect(mockGetGroupParticipants).toHaveBeenCalledTimes(2)
  })

  it('fetches again after a failed fetch', async () => {
    mockGetGroupParticipants.mockRejectedValueOnce(new Error('WAHA down'))
    const { resolveLid } = await import('../lid-resolver.js')
    await expect(resolveLid('default', GROUP, LID)).rejects.toThrow('WAHA down')
    expect(await resolveLid('default', GROUP, LID)).toBe('27831234567')
  })
})
