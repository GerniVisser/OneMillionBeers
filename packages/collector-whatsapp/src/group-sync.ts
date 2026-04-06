import { type Logger } from 'pino'
import { uploadGroupAvatar, coreConfig } from '@omb/collector-core'
import { getGroupPictureUrl, listAllGroups } from './waha-client.js'

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
  logger: Logger,
): Promise<void> {
  const url = `${coreConfig.BACKEND_URL}/v1/internal/groups/${encodeURIComponent(sourceGroupId)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, avatarUrl }),
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

export async function syncGroup(
  rawGroupId: string,
  subject: string,
  logger: Logger,
): Promise<void> {
  const sourceGroupId = 'wa:' + rawGroupId

  let avatarUrl: string | null = null
  try {
    const pictureUrl = await getGroupPictureUrl(rawGroupId)
    if (pictureUrl) {
      const buffer = await downloadBuffer(pictureUrl)
      if (buffer) {
        avatarUrl = await uploadGroupAvatar(sourceGroupId, buffer)
      }
    }
  } catch (err) {
    logger.warn({ err, rawGroupId }, 'Failed to sync group avatar — proceeding with name only')
  }

  try {
    await pushGroupSync(sourceGroupId, subject, avatarUrl, logger)
    logger.info({ sourceGroupId, avatarUrl: !!avatarUrl }, 'Group synced')
  } catch (err) {
    logger.error({ err, sourceGroupId }, 'Failed to push group sync to backend')
  }
}

export async function syncAllGroups(logger: Logger): Promise<void> {
  logger.info('Starting startup group sync')
  const groups = await listAllGroups()
  logger.info({ count: groups.length }, 'Groups to sync')
  for (const { id, subject } of groups) {
    await syncGroup(id, subject, logger)
  }
  logger.info('Startup group sync complete')
}
