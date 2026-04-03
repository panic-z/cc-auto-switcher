// src/config.js
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')

function getConfigDir() {
  return process.env.CC_SWITCHER_DIR || path.join(os.homedir(), '.cc-switcher')
}

function getConfigFile() {
  return path.join(getConfigDir(), 'config.json')
}

const DEFAULT_CONFIG = {
  activeProvider: null,
  priority: ['anthropic', 'bedrock', 'openrouter', 'openai'],
  providers: {}
}

function readConfig() {
  let config
  try {
    config = JSON.parse(fs.readFileSync(getConfigFile(), 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // File exists but couldn't be parsed — warn the user rather than silently discarding data
      process.stderr.write(`[cc-switcher] Warning: could not read config (${err.message}). Using defaults.\n`)
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
  // Normalize fields that may be absent in old or manually-edited configs
  if (!Array.isArray(config.priority)) config.priority = DEFAULT_CONFIG.priority.slice()
  if (!config.providers || typeof config.providers !== 'object') config.providers = {}
  return config
}

function writeConfig(config) {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true })
  // Use mode 0o600 (owner read/write only) because config.json may contain
  // a backed-up OAuth access token in savedKeychainCredentials.
  fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2), { mode: 0o600 })
}

function getActiveProvider() {
  return readConfig().activeProvider
}

function setActiveProvider(name) {
  const config = readConfig()
  config.activeProvider = name
  writeConfig(config)
}

function getProviderConfig(name) {
  return readConfig().providers[name] ?? null
}

function setProviderConfig(name, key, value) {
  const config = readConfig()
  if (!config.providers[name]) config.providers[name] = {}
  config.providers[name][key] = value
  writeConfig(config)
}

function deleteProviderConfig(name) {
  const config = readConfig()
  if (!config.providers[name]) return false
  delete config.providers[name]
  // Remove from priority list
  config.priority = config.priority.filter(p => p !== name)
  // Clear activeProvider if it was this one
  if (config.activeProvider === name) config.activeProvider = null
  writeConfig(config)
  return true
}

module.exports = {
  readConfig,
  writeConfig,
  getActiveProvider,
  setActiveProvider,
  getProviderConfig,
  setProviderConfig,
  deleteProviderConfig,
  getConfigDir,
  getConfigFile
}
