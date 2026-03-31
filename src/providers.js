// src/providers.js
'use strict'

const PROVIDER_TYPES = ['anthropic', 'bedrock', 'openrouter', 'openai']

// Backward-compat alias
const PROVIDER_NAMES = PROVIDER_TYPES

function getProviderType(providerName, providerConfig) {
  return (providerConfig && providerConfig.type) || providerName
}

function getClaudeJsonFields(providerName, providerConfig) {
  const type = getProviderType(providerName, providerConfig)
  const model = providerConfig.model || null
  switch (type) {
    case 'anthropic':
      return {
        apiKey: providerConfig.apiKey,
        apiBaseUrl: providerConfig.baseUrl || null,
        useBedrock: false,
        useVertex: false,
        model
      }
    case 'bedrock':
      return {
        apiKey: null,
        apiBaseUrl: null,
        useBedrock: true,
        useVertex: false,
        awsProfile: providerConfig.awsProfile || 'default',
        awsRegion: providerConfig.awsRegion || 'us-east-1',
        model
      }
    case 'openrouter':
    case 'openai':
      return {
        apiKey: providerConfig.apiKey,
        apiBaseUrl: providerConfig.baseUrl,
        useBedrock: false,
        useVertex: false,
        model
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
