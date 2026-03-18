import { createHash } from 'crypto'

export function hashPhone(phone: string): string {
  return createHash('sha256').update(phone).digest('hex')
}
