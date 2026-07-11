import * as usersService from './users.service.js'
import asyncHandler from '../../utils/asyncHandler.js'

export const getAll    = asyncHandler(async (req, res) => {
  const users = await usersService.getAllUsers()
  res.json({ success: true, data: users })
})

export const getOne    = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.params.id)
  res.json({ success: true, data: user })
})

export const create    = asyncHandler(async (req, res) => {
  const user = await usersService.createUser(req.body)
  res.status(201).json({ success: true, data: user })
})

export const update    = asyncHandler(async (req, res) => {
  const user = await usersService.updateUser(req.params.id, req.body)
  res.json({ success: true, data: user })
})

export const deactivate = asyncHandler(async (req, res) => {
  const user = await usersService.deactivateUser(req.params.id)
  res.json({ success: true, data: user })
})