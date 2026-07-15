import * as authService from './auth.service.js'
import { blacklistToken } from '../../middleware/auth.js'
import { verifyAccessToken } from '../../utils/jwt.js'
import asyncHandler from '../../utils/asyncHandler.js'
import { logActivity } from '../config/activity.service.js'

export const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body)
  res.status(201).json({ user })
})

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, res)
  // Log login event
  logActivity({
    userId: result.user?.id,
    action: 'USER_LOGIN',
    tableName: 'users',
    newData: { username: result.user?.username },
    ipAddress: req.ip,
  }).catch(() => {})
  res.json(result)
})

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies?.refreshToken
  const result = await authService.refresh(refreshToken)
  res.json(result)
})

export const logout = asyncHandler(async (req, res) => {
  // Blacklist the current access token for its remaining lifetime
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    try {
      const decoded = verifyAccessToken(token)
      // decoded.exp is in seconds
      blacklistToken(token, decoded.exp * 1000)
    } catch {
      // Token already invalid — that's fine, just clear the cookie
    }
  }

  await authService.logout(res)
  // Log logout event
  logActivity({
    userId: req.user?.id,
    action: 'USER_LOGOUT',
    tableName: 'users',
    ipAddress: req.ip,
  }).catch(() => {})
  res.json({ success: true, message: 'Logged out' })
})

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await authService.getProfile(req.user.id)
  res.json({ success: true, data: profile })
})

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'currentPassword and newPassword are required' })
  }
  await authService.changePassword(req.user.id, currentPassword, newPassword)

  // Blacklist the current access token — user must log in again
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1]
    try {
      const decoded = verifyAccessToken(token)
      blacklistToken(token, decoded.exp * 1000)
    } catch { /* already expired */ }
  }

  // Clear refresh cookie too
  await authService.logout(res)
  res.json({ success: true, message: 'Password changed. Please log in again.' })
})
