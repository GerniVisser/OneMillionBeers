import { type Logger } from 'pino'
import { uploadGroupAvatar, coreConfig, internalAuthHeader } from '@omb/collector-core'
import { getGroupPictureUrl, getGroupInviteCode, listAllGroups } from './waha-client.js'
import { config } from './config.js'

async function downloadBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

async function pushGroupSync(
  sourceGroupId: string,
  name: string,
  avatarUrl: string | null,
  inviteCode: string | null,
  logger: Logger,
): Promise<void> {
  const url = `${coreConfig.BACKEND_URL}/v1/internal/groups/${encodeURIComponent(sourceGroupId)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...internalAuthHeader() },
    body: JSON.stringify({ name, avatarUrl, inviteCode }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '(unreadable)')
    logger.error(
      { status: res.status, body: text, sourceGroupId },
      'Group sync rejected by backend',
    )
    throw new Error(`Backend returned ${res.status}`)
  }
}

/**
 * Group sync runs for the primary session only. Every number is in the same
 * groups, so syncing from each one would multiply a WAHA call that NOWEB backs
 * with groupFetchAllParticipating — already rate-limit prone — for no new data.
 */
function primarySession(): string {
  return config.WAHA_SESSIONS[0]!
}

export async function syncGroup(
  rawGroupId: string,
  subject: string,
  logger: Logger,
): Promise<void> {
  const sourceGroupId = 'wa:' + rawGroupId

  let avatarUrl: string | null = null
  try {
    const pictureUrl = await getGroupPictureUrl(primarySession(), rawGroupId)
    if (pictureUrl) {
      const buffer = await downloadBuffer(pictureUrl)
      if (buffer) {
        avatarUrl = await uploadGroupAvatar(sourceGroupId, buffer)
      }
    }
  } catch (err) {
    logger.warn({ err, rawGroupId }, 'Failed to sync group avatar — proceeding with name only')
  }

  let inviteCode: string | null = null
  try {
    inviteCode = await getGroupInviteCode(primarySession(), rawGroupId)
  } catch (err) {
    logger.warn({ err, rawGroupId }, 'Failed to fetch invite code — proceeding without it')
  }

  try {
    await pushGroupSync(sourceGroupId, subject, avatarUrl, inviteCode, logger)
    logger.info({ sourceGroupId, avatarUrl: !!avatarUrl, inviteCode: !!inviteCode }, 'Group synced')
  } catch (err) {
    logger.error({ err, sourceGroupId }, 'Failed to push group sync to backend')
  }
}

export async function syncAllGroups(logger: Logger): Promise<void> {
  logger.info('Starting group sync')
  const groups = await listAllGroups(primarySession())
  logger.info({ count: groups.length }, 'Groups to sync')
  for (const { id, subject } of groups) {
    await syncGroup(id, subject, logger)
  }
  logger.info('Group sync complete')
}

export function startGroupPolling(logger: Logger): () => void {
  syncAllGroups(logger).catch((err) => logger.error({ err }, 'Initial group sync failed'))

  const timer = setInterval(() => {
    syncAllGroups(logger).catch((err) => logger.error({ err }, 'Periodic group sync failed'))
  }, config.WAHA_GROUP_SYNC_INTERVAL_MS)

  return () => clearInterval(timer)
}
