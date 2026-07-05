import { z } from 'zod'

export const createAirportSchema = z.object({
  icao_code: z
    .string()
    .min(2)
    .max(4)
    .regex(/^[A-Za-z0-9]+$/, 'ICAO code must be alphanumeric'),
  iata_code: z.string().max(3).optional(),
  name: z.string().min(2).max(200),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  country_iso: z.string().length(2).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  elevation_ft: z.number().int().optional(),
  timezone: z.string().max(50).optional(),
  source: z.enum(['AIP', 'OPERATOR']).default('OPERATOR'),
  rwy_m: z.number().positive().optional(),
  rwy_desc: z.string().max(200).optional(),
  surface: z.string().max(50).optional(),
  fuel: z.string().max(100).optional(),
  region: z.string().max(100).optional(),
  remarks: z.string().max(2000).optional(),
  notam_notes: z.string().max(2000).optional(),
})

export const updateAirportSchema = createAirportSchema.partial()