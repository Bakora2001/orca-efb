// import type { RTOWInput, RTOWResult } from '../types'

// /**
//  * Performance Engine Service
//  *
//  * This is the most critical service in the platform. It replaces manual
//  * chart reading by looking up (and interpolating between) digitized
//  * Dash 8 performance data points stored in the performance_data table.
//  *
//  * TODO:
//  * 1. Load the digitized chart dataset (temperature, pressure altitude,
//  *    runway, flap setting -> weight limit, obstacle limit, WAT limit).
//  * 2. Implement bilinear/multi-axis interpolation across the nearest
//  *    data points to the given input.
//  * 3. Derive RTOW, payload, takeoff/landing/zero-fuel weight, limiting
//  *    factor, and dispatch status from the interpolated result.
//  */
// export async function calculateRTOW(input: RTOWInput): Promise<RTOWResult> {
//   throw new Error('calculateRTOW not implemented — performance engine pending')
// }

// export async function calculateWAT(input: Pick<RTOWInput, 'airport' | 'temperature' | 'flap'> & { weight: number }) {
//   throw new Error('calculateWAT not implemented — performance engine pending')
// }
