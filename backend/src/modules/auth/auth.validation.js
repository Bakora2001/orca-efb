import { z } from 'zod'

// Accepts either a plain username handle OR a full email address
const usernameOrEmail = z.string().min(1).max(254).refine(
  (val) => {
    // Accept email format
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) return true
    // Accept plain username: letters, numbers, underscore, hyphen, dot; min 3 chars
    if (/^[a-zA-Z0-9_.\-]{3,50}$/.test(val)) return true
    return false
  },
  {
    message: 'Enter a valid username (e.g. john_doe) or email address (e.g. john@example.com)',
  }
)

export const registerSchema = z.object({
  username: usernameOrEmail,
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(100, 'Password is too long'),
  fullName: z.string().max(100).optional(),
  role: z.enum(['admin', 'dispatcher'], {
    errorMap: () => ({ message: 'Role must be either admin or dispatcher' }),
  }).optional(),
})

export const loginSchema = z.object({
  // Login also accepts username or email
  username: z.string().min(1, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
})