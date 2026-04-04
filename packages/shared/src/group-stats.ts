import { z } from 'zod'

export const GroupStatsResponseSchema = z.object({
  totalBeers: z.number().int(),
  activeMemberCount: z.number().int(),
  daysActive: z.number().int(),
  avgPerDay: z.number(),
  peakDay: z.object({ date: z.string(), count: z.number().int() }).nullable(),
})

export const ActivityDaySchema = z.object({
  date: z.string(),
  count: z.number().int(),
})

export const GroupActivityResponseSchema = z.object({
  days: z.array(ActivityDaySchema),
})

export const HourBucketSchema = z.object({
  hour: z.number().int().min(0).max(23),
  count: z.number().int(),
})

export const GroupHourlyResponseSchema = z.object({
  hours: z.array(HourBucketSchema),
})

export const MonthBucketSchema = z.object({
  month: z.string(),
  count: z.number().int(),
})

export const GroupMonthlyResponseSchema = z.object({
  months: z.array(MonthBucketSchema),
})

export type GroupStatsResponse = z.infer<typeof GroupStatsResponseSchema>
export type ActivityDay = z.infer<typeof ActivityDaySchema>
export type GroupActivityResponse = z.infer<typeof GroupActivityResponseSchema>
export type HourBucket = z.infer<typeof HourBucketSchema>
export type GroupHourlyResponse = z.infer<typeof GroupHourlyResponseSchema>
export type MonthBucket = z.infer<typeof MonthBucketSchema>
export type GroupMonthlyResponse = z.infer<typeof GroupMonthlyResponseSchema>
