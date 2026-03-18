import { describe, it, expect } from 'vitest'
import { toSlug, computeStreaks, computeFavoriteHour } from '../../db/queries.js'

describe('toSlug', () => {
  it('lowercases and replaces spaces with hyphens', () => {
    expect(toSlug('Hello World')).toBe('hello-world')
  })

  it('strips accents', () => {
    expect(toSlug('Bière de France')).toBe('biere-de-france')
  })

  it('collapses multiple non-alphanumeric chars', () => {
    expect(toSlug('foo--bar   baz')).toBe('foo-bar-baz')
  })

  it('trims leading/trailing hyphens', () => {
    expect(toSlug('  --hello--  ')).toBe('hello')
  })

  it('truncates to 128 chars', () => {
    expect(toSlug('a'.repeat(200))).toHaveLength(128)
  })

  it('returns fallback for empty string', () => {
    expect(toSlug('')).toBe('group')
  })
})

describe('computeStreaks', () => {
  it('returns zeros for empty array', () => {
    expect(computeStreaks([])).toEqual({ currentStreak: 0, longestStreak: 0 })
  })

  it('returns 1/1 for single entry today', () => {
    const today = new Date()
    const { currentStreak, longestStreak } = computeStreaks([today])
    expect(longestStreak).toBe(1)
    expect(currentStreak).toBe(1)
  })

  it('computes longest streak', () => {
    const base = new Date('2024-01-10T12:00:00Z')
    const dates = [0, 1, 2, 3, 5, 6].map((d) => new Date(base.getTime() + d * 86400000))
    const { longestStreak } = computeStreaks(dates)
    expect(longestStreak).toBe(4)
  })

  it('deduplicates same-day entries', () => {
    const d = new Date('2024-01-10T10:00:00Z')
    const d2 = new Date('2024-01-10T20:00:00Z')
    const { longestStreak } = computeStreaks([d, d2])
    expect(longestStreak).toBe(1)
  })
})

describe('computeFavoriteHour', () => {
  it('returns null for fewer than 5 entries', () => {
    const dates = [new Date(), new Date(), new Date()]
    expect(computeFavoriteHour(dates)).toBeNull()
  })

  it('returns the most frequent UTC hour', () => {
    const dates = [
      '2024-01-01T10:00:00Z',
      '2024-01-02T10:00:00Z',
      '2024-01-03T10:00:00Z',
      '2024-01-04T10:00:00Z',
      '2024-01-05T10:00:00Z',
      '2024-01-06T14:00:00Z',
    ].map((s) => new Date(s))
    expect(computeFavoriteHour(dates)).toBe(10)
  })
})
