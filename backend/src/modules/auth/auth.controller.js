import * as authService from './auth.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body)
  res.status(201).json({ success: true, data: user })
})

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body)
  res.json({ success: true, data: result })
})

export const getProfile = asyncHandler(async (req, res) => {
  const profile = await authService.getProfile(req.user.id)
  res.json({ success: true, data: profile })
})