import { z } from 'zod'

export const createAircraftSchema = z.object({
  registration: z
    .string()
    .min(2, 'Registration must be at least 2 characters')
    .max(20, 'Registration must be at most 20 characters'),
  type: z
    .string()
    .min(1, 'Aircraft type is required')
    .max(50, 'Type must be at most 50 characters'),
  manufacturer: z.string().max(50).optional(),
  mtow_kg: z.number().positive('MTOW must be a positive number').optional(),
  mlw_kg: z.number().positive('MLW must be a positive number').optional(),
  mzfw_kg: z.number().positive('MZFW must be a positive number').optional(),
  bew_kg: z.number().positive('BEW must be a positive number').optional(),
  max_pax: z
    .number()
    .int('Max PAX must be a whole number')
    .min(0)
    .optional(),
  cruise_tas_kt: z.number().positive('Cruise TAS must be positive').optional(),
  fuel_burn_kg_hr: z.number().positive('Fuel burn must be positive').optional(),
  flaps: z
    .array(z.string())
    .optional()
    .default([]),
  notes: z.string().max(2000).optional(),
})

export const updateAircraftSchema = createAircraftSchema.partial()