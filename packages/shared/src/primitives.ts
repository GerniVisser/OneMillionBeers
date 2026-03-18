import { z } from 'zod'

export const UuidSchema = z.string().uuid()
export const IsoDatetimeSchema = z.string().datetime({ offset: true })
export const SlugSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug format')
export const Sha256HexSchema = z
  .string()
  .length(64)
  .regex(/^[0-9a-f]{64}$/, 'Must be 64-char lowercase hex')
export const PhoneE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Must be a valid E.164 phone number')
