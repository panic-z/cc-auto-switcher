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
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function readUsage() {
  let usage
  try {
    usage = JSON.parse(fs.readFileSync(getUsageFile(), 'utf8'))
  } catch {
    usage = { month: currentMonth(), providers: {} }
  }
  if (usage.month !== currentMonth()) {
    usage = { month: currentMonth(), providers: {} }
    writeUsage(usage)
  }
  return usage
}

function writeUsage(usage) {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getUsageFile(), JSON.stringify(usage, null, 2))
}

function addTokens(provider, inputTokens, outputTokens) {
  const usage = readUsage()
  if (!usage.providers[provider]) {
    usage.providers[provider] = { inputTokens: 0, outputTokens: 0 }
  }
  usage.providers[provider].inputTokens += (inputTokens || 0)
  usage.providers[provider].outputTokens += (outputTokens || 0)
  writeUsage(usage)
}

function getProviderTokens(provider) {
  const usage = readUsage()
  const p = usage.providers[provider] || { inputTokens: 0, outputTokens: 0 }
  return p.inputTokens + p.outputTokens
}

module.exports = { readUsage, writeUsage, addTokens, getProviderTokens }
