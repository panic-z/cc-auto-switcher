// src/switcher.js
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const { readConfig, writeConfig } = require('./config')
const { getProviderTokens } = require('./tracker')
const { getClaudeJsonFields } = require('./providers')

function getClaudeJsonPath() {
  return process.env.CC_SWITCHER_CLAUDE_JSON || path.join(os.homedir(), '.claude.json')
}

function readClaudeJson() {
  try {
    return JSON.parse(fs.readFileSync(getClaudeJsonPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeClaudeJson(fields) {
  const current = readClaudeJson()
  const updated = { ...current }
  for (const [k, v] of Object.entries(fields)) {
    if (v === null) {
      delete updated[k]
    } else {
      updated[k] = v
    }
  }
  fs.writeFileSync(getClaudeJsonPath(), JSON.stringify(updated, null, 2))
}

function switchTo(providerName) {
  const config = readConfig()
  const providerConfig = config.providers[providerName]
  if (!providerConfig) {
    throw new Error(
      `Provider "${providerName}" not configured. Run: cc-switcher config set ${providerName} apiKey <your-key>`
    )
  }
  const fields = getClaudeJsonFields(providerName, providerConfig)
  writeClaudeJson(fields)
  config.activeProvider = providerName
  writeConfig(config)
}

function selectNextProvider() {
  const config = readConfig()
  const { priority, providers } = config
  for (const name of priority) {
    const pConfig = providers[name]
    if (!pConfig || !pConfig.monthlyTokenLimit) continue
    const used = getProviderTokens(name)
    const threshold = pConfig.warningThreshold || 0.9
    if (used / pConfig.monthlyTokenLimit < threshold) {
      return name
    }
  }
  return null
}

module.exports = { readClaudeJson, writeClaudeJson, switchTo, selectNextProvider }
