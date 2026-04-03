// src/switcher.js
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const { spawnSync } = require('child_process')
const { readConfig, writeConfig, getConfigDir } = require('./config')
const { getProviderTokens } = require('./tracker')
const { getClaudeJsonFields, getProviderType } = require('./providers')

function getClaudeJsonPath() {
  return process.env.CC_SWITCHER_CLAUDE_JSON || path.join(os.homedir(), '.claude.json')
}

function readClaudeJson() {
  try {
    return JSON.parse(fs.readFileSync(getClaudeJsonPath(), 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`[cc-switcher] Warning: could not read ~/.claude.json (${err.message}).\n`)
    }
    return {}
  }
}

function writeClaudeJson(fields) {
  const jsonPath = getClaudeJsonPath()
  const current = readClaudeJson()
  const updated = { ...current }
  for (const [k, v] of Object.entries(fields)) {
    if (v === null) {
      delete updated[k]
    } else {
      updated[k] = v
    }
  }
  // Preserve existing file permissions; fall back to 0o600 for new files
  let mode = 0o600
  try { mode = fs.statSync(jsonPath).mode & 0o777 } catch { /* file doesn't exist yet */ }
  fs.writeFileSync(jsonPath, JSON.stringify(updated, null, 2), { mode })
}

const KEYCHAIN_SERVICE = 'Claude Code-credentials'

// On macOS, manage the Claude Code OAuth Keychain entry so Claude Code can't
// restore the OAuth session when we want to use an API-key provider.
//
// SECURITY NOTE: When backing up the Keychain entry before switching away from
// claude-pro, the raw OAuth access token is stored in config.savedKeychainCredentials
// inside ~/.cc-switcher/config.json (plaintext). Anyone with read access to that
// file can obtain your Claude OAuth token. Protect the file accordingly.
//
// HOOK CONTEXT NOTE: This function is called from the PostToolUse hook (no TTY).
// The `security` command may display a GUI permission dialog the FIRST TIME it
// accesses the Keychain item. Grant "Always Allow" when prompted so subsequent
// hook invocations run silently. After that one-time grant, no further prompts occur.
function applyKeychainOverride(providerName, providerConfig, config) {
  if (os.platform() !== 'darwin') return
  const type = getProviderType(providerName, providerConfig)
  const account = os.userInfo().username

  if (type === 'claude-pro') {
    // Restore the saved Keychain entry
    const saved = config.savedKeychainCredentials
    if (!saved) return
    // Delete first in case a stale entry exists, then re-add
    spawnSync('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE], { stdio: 'ignore' })
    spawnSync('security', [
      'add-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account, '-w', saved
    ], { stdio: 'ignore' })
  } else {
    // Read and backup the current Keychain entry before deleting it.
    // The token is stored in config; writeConfig() called by switchTo() persists it.
    // WARNING: this backs up a sensitive OAuth token to plaintext config.json.
    const result = spawnSync('security', [
      'find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'
    ], { encoding: 'utf8' })
    if (result.status === 0 && result.stdout.trim()) {
      // Successfully read the credential — back it up, then delete it
      config.savedKeychainCredentials = result.stdout.trim()
      spawnSync('security', ['delete-generic-password', '-s', KEYCHAIN_SERVICE], { stdio: 'ignore' })
    } else if (result.status !== 0 && result.status !== 44) {
      // Non-zero and NOT "item not found" (44) — keychain locked, permission denied, etc.
      // Do NOT delete — we could not back up the credential.
      process.stderr.write(`[cc-switcher] Warning: could not read Keychain entry (exit ${result.status}). Skipping Keychain management.\n`)
    }
    // status === 44 means no Keychain entry exists — nothing to back up or delete
  }
}

// Write POSIX-shell env vars to ~/.cc-switcher/env so that any shell that
// sources this file will have ANTHROPIC_API_KEY / ANTHROPIC_BASE_URL set
// correctly for the active provider. The file has 0600 permissions.

// Escape a value for safe embedding inside single-quoted POSIX shell strings.
// Single quotes cannot appear inside '...' so we close the quote, emit an
// escaped single quote via $'\'', then reopen the quote.
function shellEscape(value) {
  return String(value).replace(/'/g, "'\\''")
}

function applyShellEnv(providerName, providerConfig) {
  const type = getProviderType(providerName, providerConfig)
  let content
  if (type === 'claude-pro') {
    content = '# cc-switcher: claude-pro (OAuth) — clear API key overrides\nunset ANTHROPIC_API_KEY\nunset ANTHROPIC_BASE_URL\nunset ANTHROPIC_MODEL\n'
  } else {
    const lines = ['# cc-switcher: active provider = ' + providerName]
    if (providerConfig.apiKey)  lines.push(`export ANTHROPIC_API_KEY='${shellEscape(providerConfig.apiKey)}'`)
    else                        lines.push('unset ANTHROPIC_API_KEY')
    if (providerConfig.baseUrl) lines.push(`export ANTHROPIC_BASE_URL='${shellEscape(providerConfig.baseUrl)}'`)
    else                        lines.push('unset ANTHROPIC_BASE_URL')
    if (providerConfig.model)   lines.push(`export ANTHROPIC_MODEL='${shellEscape(providerConfig.model)}'`)
    else                        lines.push('unset ANTHROPIC_MODEL')
    content = lines.join('\n') + '\n'
  }
  const envFile = path.join(getConfigDir(), 'env')
  fs.mkdirSync(getConfigDir(), { recursive: true })
  fs.writeFileSync(envFile, content, { mode: 0o600 })
}

function switchTo(providerName) {
  const config = readConfig()
  const providerConfig = config.providers[providerName]
  if (!providerConfig) {
    // Give type-appropriate setup advice rather than always suggesting apiKey,
    // which is wrong for bedrock (uses awsProfile/awsRegion) and claude-pro (uses OAuth).
    const knownType = providerName  // unregistered provider: name is our best guess at type
    let hint
    if (knownType === 'bedrock') {
      hint = `cc-switcher config set ${providerName} awsProfile default`
    } else if (knownType === 'claude-pro') {
      hint = `cc-switcher config init  (OAuth login required)`
    } else {
      hint = `cc-switcher config set ${providerName} apiKey <your-key>`
    }
    throw new Error(`Provider "${providerName}" not configured. Run: ${hint}`)
  }

  // Capture oauthAccount from ~/.claude.json whenever it's present — either as a
  // save-before-leaving-OAuth, or as a backup when switching back to claude-pro
  const currentClaudeJson = readClaudeJson()
  if (currentClaudeJson.oauthAccount) {
    if (!config.savedOauthAccount) config.savedOauthAccount = currentClaudeJson.oauthAccount
    // Keep the per-provider copy fresh too
    const type = getProviderType(providerName, providerConfig)
    if (type === 'claude-pro' && !providerConfig.oauthAccount) {
      config.providers[providerName].oauthAccount = currentClaudeJson.oauthAccount
    }
  }

  const fields = getClaudeJsonFields(providerName, providerConfig, config.savedOauthAccount)
  writeClaudeJson(fields)
  applyKeychainOverride(providerName, providerConfig, config)
  applyShellEnv(providerName, providerConfig)
  config.activeProvider = providerName
  writeConfig(config)
}

function selectNextProvider(exclude) {
  const config = readConfig()
  const { priority = [], providers } = config
  for (const name of priority) {
    if (name === exclude) continue
    const pConfig = providers[name]
    if (!pConfig) continue
    // claude-pro uses OAuth and has no token quota — always available
    if (getProviderType(name, pConfig) === 'claude-pro') return name
    // No monthly limit configured → treat as unlimited / always available
    if (!pConfig.monthlyTokenLimit) return name
    const used = getProviderTokens(name)
    const threshold = pConfig.warningThreshold || 0.9
    if (used / pConfig.monthlyTokenLimit < threshold) {
      return name
    }
  }
  return null
}

module.exports = { readClaudeJson, writeClaudeJson, switchTo, selectNextProvider, applyKeychainOverride, applyShellEnv }
