import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { pino } from 'pino'

const mockListAllGroups = vi.fn()
const mockGetGroupPictureUrl = vi.fn()
const mockGetGroupInviteCode = vi.fn()
const mockListSessions = vi.fn()

vi.mock('../waha-client.js', () => ({
  listAllGroups: mockListAllGroups,
  getGroupPictureUrl: mockGetGroupPictureUrl,
  getGroupInviteCode: mockGetGroupInviteCode,
  listSessions: mockListSessions,
}))
vi.mock('@omb/collector-core', () => ({
  uploadGroupAvatar: vi.fn(),
  coreConfig: { BACKEND_URL: 'http://backend:3000' },
  internalAuthHeader: () => ({ Authorization: 'Bearer test' }),
}))
vi.mock('../config.js', () => ({
  config: { WAHA_GROUP_SYNC_INTERVAL_MS: 1_800_000 },
}))

const logger = pino({ level: 'silent' })

describe('group sync', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.resetModules()
    mockListAllGroups.mockReset()
    mockGetGroupPictureUrl.mockReset().mockResolvedValue(null)
    mockGetGroupInviteCode.mockReset().mockResolvedValue(null)
    mockListSessions.mockReset().mockResolvedValue([
      { name: 'one', status: 'WORKING' },
      { name: 'two', status: 'WORKING' },
    ])
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const syncedGroups = () =>
    fetchMock.mock.calls.map(([url]) => decodeURIComponent(String(url).split('/groups/')[1]))

  const groupsBySession = (bySession: Record<string, string[]>) =>
    mockListAllGroups.mockImplementation(async (session: string) =>
      (bySession[session] ?? []).map((id) => ({ id, subject: id })),
    )

  it('syncs the groups every number can see', async () => {
    groupsBySession({ one: ['a@g.us'], two: ['b@g.us'] })
    const { syncAllGroups } = await import('../group-sync.js')
    await syncAllGroups(logger)

    expect(syncedGroups()).toEqual(['wa:a@g.us', 'wa:b@g.us'])
  })

  it('syncs a group that several numbers share once', async () => {
    groupsBySession({ one: ['a@g.us', 'b@g.us'], two: ['b@g.us', 'c@g.us'] })
    const { syncAllGroups } = await import('../group-sync.js')
    await syncAllGroups(logger)

    expect(syncedGroups()).toEqual(['wa:a@g.us', 'wa:b@g.us', 'wa:c@g.us'])
    expect(mockGetGroupPictureUrl).not.toHaveBeenCalledWith('two', 'b@g.us')
  })

  it('keeps syncing when one number is down', async () => {
    // listAllGroups returns [] when WAHA cannot list a session's groups.
    groupsBySession({ two: ['b@g.us'] })
    const { syncAllGroups } = await import('../group-sync.js')
    await syncAllGroups(logger)

    expect(syncedGroups()).toEqual(['wa:b@g.us'])
  })

  it('fetches picture and invite code through the number that sees the group', async () => {
    groupsBySession({ two: ['b@g.us'] })
    const { syncAllGroups } = await import('../group-sync.js')
    await syncAllGroups(logger)

    expect(mockGetGroupPictureUrl).toHaveBeenCalledWith('two', 'b@g.us')
    expect(mockGetGroupInviteCode).toHaveBeenCalledWith('two', 'b@g.us')
  })

  it('reads groups only through numbers that are WORKING', async () => {
    mockListSessions.mockResolvedValue([
      { name: 'one', status: 'SCAN_QR_CODE' },
      { name: 'two', status: 'WORKING' },
    ])
    groupsBySession({ one: ['a@g.us'], two: ['b@g.us'] })
    const { syncAllGroups } = await import('../group-sync.js')
    await syncAllGroups(logger)

    expect(mockListAllGroups).toHaveBeenCalledTimes(1)
    expect(syncedGroups()).toEqual(['wa:b@g.us'])
  })

  it('skips the sync when WAHA cannot list its sessions', async () => {
    mockListSessions.mockRejectedValue(new Error('ECONNREFUSED'))
    const { syncAllGroups } = await import('../group-sync.js')
    await syncAllGroups(logger)

    expect(mockListAllGroups).not.toHaveBeenCalled()
  })
})
