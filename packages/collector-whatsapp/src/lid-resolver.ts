import { getGroupParticipants } from './waha-client.js'

// Reactions name the reactor only by LID. Messages pair a sender's LID with their
// phone, and the group's participant list pairs every member's.
const phoneByLid = new Map<string, string>()
const lastFetchByGroup = new Map<string, number>()

const PARTICIPANTS_REFETCH_MS = 10 * 60 * 1000

function digits(jid: string): string {
  return jid.split('@')[0].split(':')[0]
}

export function rememberLid(participant: string | undefined, participantAlt: string | undefined) {
  if (!participant?.endsWith('@lid') || !participantAlt) return
  phoneByLid.set(digits(participant), digits(participantAlt))
}

/**
 * The phone number (digits only) behind a LID, or null when no source knows it.
 * Throws when WAHA cannot be asked, so the caller can try again later.
 */
export async function resolveLid(
  session: string,
  groupId: string,
  lid: string,
): Promise<string | null> {
  const key = digits(lid)
  const known = phoneByLid.get(key)
  if (known) return known

  // A burst of reactions from an unknown member would otherwise fetch the list each time.
  const last = lastFetchByGroup.get(groupId)
  if (last !== undefined && Date.now() - last < PARTICIPANTS_REFETCH_MS) return null
  lastFetchByGroup.set(groupId, Date.now())

  let participants: Awaited<ReturnType<typeof getGroupParticipants>>
  try {
    participants = await getGroupParticipants(session, groupId)
  } catch (err) {
    lastFetchByGroup.delete(groupId)
    throw err
  }
  for (const { id, pn } of participants) {
    if (id.endsWith('@lid') && pn) phoneByLid.set(digits(id), digits(pn))
  }
  return phoneByLid.get(key) ?? null
}
