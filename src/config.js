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
  try {
    return JSON.parse(fs.readFileSync(getConfigFile(), 'utf8'))
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
}

function writeConfig(config) {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2))
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
  return readConfig().providers[name] || null
}

function setProviderConfig(name, key, value) {
  const config = readConfig()
  if (!config.providers[name]) config.providers[name] = {}
  config.providers[name][key] = value
  writeConfig(config)
}

module.exports = {
  readConfig,
  writeConfig,
  getActiveProvider,
  setActiveProvider,
  getProviderConfig,
  setProviderConfig,
  getConfigDir,
  getConfigFile
}
