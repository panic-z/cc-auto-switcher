// src/tracker.js
'use strict'
const fs = require('fs')
const path = require('path')
const { getConfigDir } = require('./config')

function getUsageFile() {
  return path.join(getConfigDir(), 'usage.json')
}

function currentMonth() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function readUsage() {
  let usage
  try {
    usage = JSON.parse(fs.readFileSync(getUsageFile(), 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`[cc-switcher] Warning: could not read usage file (${err.message}). Resetting.\n`)
    }
    usage = { month: currentMonth(), providers: {} }
  }
  const month = currentMonth()
  if (usage.month !== month) {
    usage = { month, providers: {} }
    writeUsage(usage)
  }
  // Normalize providers in case of a manually-edited usage file with a valid month
  // but a missing or non-object providers field — prevents crashes in addTokens.
  if (!usage.providers || typeof usage.providers !== 'object') {
    usage.providers = {}
  }
  return usage
}

function writeUsage(usage) {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getUsageFile(), JSON.stringify(usage, null, 2), { mode: 0o600 })
}

function addTokens(provider, inputTokens, outputTokens) {
  const usage = readUsage()
  if (!usage.providers[provider]) {
    usage.providers[provider] = { inputTokens: 0, outputTokens: 0 }
  }
  // Coerce stored values to numbers defensively — guards against manual edits
  // that leave string values, which would cause '+=' to concatenate instead of add.
  const current = usage.providers[provider]
  current.inputTokens = (Number(current.inputTokens) || 0) + (inputTokens || 0)
  current.outputTokens = (Number(current.outputTokens) || 0) + (outputTokens || 0)
  writeUsage(usage)
}

function getProviderTokens(provider) {
  const usage = readUsage()
  const p = usage.providers[provider] || { inputTokens: 0, outputTokens: 0 }
  return (Number(p.inputTokens) || 0) + (Number(p.outputTokens) || 0)
}

module.exports = { readUsage, writeUsage, addTokens, getProviderTokens }
