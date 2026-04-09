import { z } from 'zod'
import { ActivityDaySchema, HourBucketSchema, MonthBucketSchema } from './group-stats.js'

export const GlobalStatsResponseSchema = z.object({
  totalBeers: z.number().int(),
  activeMemberCount: z.number().int(),
  activeGroupCount: z.number().int(),
  daysActive: z.number().int(),
  avgPerDay: z.number(),
  peakDay: z.object({ date: z.string(), count: z.number().int() }).nullable(),
})

export const GlobalActivityResponseSchema = z.object({ days: z.array(ActivityDaySchema) })
export const GlobalHourlyResponseSchema = z.object({ hours: z.array(HourBucketSchema) })
export const GlobalMonthlyResponseSchema = z.object({ months: z.array(MonthBucketSchema) })

export type GlobalStatsResponse = z.infer<typeof GlobalStatsResponseSchema>
export type GlobalActivityResponse = z.infer<typeof GlobalActivityResponseSchema>
export type GlobalHourlyResponse = z.infer<typeof GlobalHourlyResponseSchema>
export type GlobalMonthlyResponse = z.infer<typeof GlobalMonthlyResponseSchema>

export const CountryStatSchema = z.object({
  countryCode: z.string().length(2),
  beerCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
})
export const GlobalCountriesResponseSchema = z.array(CountryStatSchema)

export type CountryStat = z.infer<typeof CountryStatSchema>
export type GlobalCountriesResponse = z.infer<typeof GlobalCountriesResponseSchema>
