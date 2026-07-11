import { getAllConfig, saveConfig } from './config.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const getConfig = asyncHandler(async (_req, res) => {
  const config = await getAllConfig()
  res.json({ success: true, data: config })
})

export const updateConfig = asyncHandler(async (req, res) => {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ success: false, message: 'No config values provided' })
  }
  const config = await saveConfig(req.body)
  res.json({ success: true, data: config })
})