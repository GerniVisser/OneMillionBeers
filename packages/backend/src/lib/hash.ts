import { createHash } from 'crypto'

export function hashIdentity(id: string): string {
  return createHash('sha256').update(id).digest('hex')
}
