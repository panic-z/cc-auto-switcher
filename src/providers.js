// src/providers.js
'use strict'

const PROVIDER_TYPES = ['anthropic', 'bedrock', 'openrouter', 'openai', 'claude-pro']

// Backward-compat alias
const PROVIDER_NAMES = PROVIDER_TYPES

function getProviderType(providerName, providerConfig) {
  return (providerConfig && providerConfig.type) || providerName
}

function getClaudeJsonFields(providerName, providerConfig, savedOauthAccount) {
  const type = getProviderType(providerName, providerConfig)
  // Write the user-configured model only when explicitly set; otherwise leave
  // the field absent so Claude Code's own model selection is undisturbed.
  const model = providerConfig.model || null
  switch (type) {
    case 'claude-pro': {
      // Restore OAuth login; clear API-key fields.
      // Only include oauthAccount when we actually have one to restore —
      // passing null would cause writeClaudeJson to DELETE the field,
      // destroying an existing OAuth session that Claude Code already has.
      const oauthAccount = savedOauthAccount || providerConfig.oauthAccount
      return {
        ...(oauthAccount !== undefined && oauthAccount !== null
          ? { oauthAccount }
          : {}),
        apiKey: null,
        apiBaseUrl: null,
        useBedrock: false,
        useVertex: false,
      }
    }
    case 'anthropic':
      return {
        oauthAccount: null,
        apiKey: providerConfig.apiKey ?? null,
        apiBaseUrl: providerConfig.baseUrl ?? null,
        useBedrock: false,
        useVertex: false,
        ...(model !== null && { model }),
      }
    case 'bedrock':
      return {
        oauthAccount: null,
        apiKey: null,
        apiBaseUrl: null,
        useBedrock: true,
        useVertex: false,
        awsProfile: providerConfig.awsProfile || 'default',
        awsRegion: providerConfig.awsRegion || 'us-east-1',
        ...(model !== null && { model }),
      }
    case 'openrouter':
    case 'openai':
      return {
        oauthAccount: null,
        apiKey: providerConfig.apiKey ?? null,
        apiBaseUrl: providerConfig.baseUrl ?? null,
        useBedrock: false,
        useVertex: false,
        ...(model !== null && { model }),
      }
    default:
      throw new Error(`Unknown provider type: ${type}`)
  }
}

const QUOTA_ERROR_PATTERNS = ['quota_exceeded', 'rate_limit_exceeded', 'insufficient_quota', '429']

function isQuotaExceededError(errorCode) {
  const lower = String(errorCode).toLowerCase()
  return QUOTA_ERROR_PATTERNS.some(p => lower.includes(p))
}

module.exports = { PROVIDER_TYPES, PROVIDER_NAMES, getProviderType, getClaudeJsonFields, isQuotaExceededError }
