import { z } from 'zod'

export const createNavpointSchema = z.object({
  ident: z
    .string()
    .min(2, 'Identifier must be at least 2 characters')
    .max(12, 'Identifier must be at most 12 characters')
    .regex(/^[A-Za-z0-9]+$/, 'Identifier can only contain letters and numbers'),
  name: z.string().max(200).optional(),
  lat: z
    .number({ required_error: 'Latitude is required' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lon: z
    .number({ required_error: 'Longitude is required' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  point_type: z
    .enum(['VOR', 'NDB', 'WAYPOINT', 'INTERSECTION', 'USER', 'AIRPORT'])
    .default('USER'),
  elevation_ft: z.number().int().optional(),
  region: z.string().max(100).optional(),
  country_iso: z.string().length(2).optional(),
  provider: z.string().max(50).optional(),
  effective_date: z.string().optional(), // ISO date string e.g. "2026-01-01"
})

export const updateNavpointSchema = createNavpointSchema.partial()

export const bulkImportSchema = z.object({
  overwrite: z.boolean().default(false),
  points: z
    .array(
      z.object({
        ident: z.string().min(1).max(12),
        name: z.string().optional(),
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        point_type: z.enum(['VOR', 'NDB', 'WAYPOINT', 'INTERSECTION', 'USER', 'AIRPORT']).optional(),
        elevation_ft: z.number().int().optional(),
        region: z.string().optional(),
        country_iso: z.string().length(2).optional(),
        provider: z.string().optional(),
        source: z.string().optional(),
        effective_date: z.string().optional(),
      })
    )
    .min(1, 'At least one point is required')
    .max(50000, 'Maximum 50,000 points per import batch'),
})