// src/providers.js
'use strict'

const PROVIDER_NAMES = ['anthropic', 'bedrock', 'openrouter', 'openai']

function getClaudeJsonFields(providerName, providerConfig) {
  switch (providerName) {
    case 'anthropic':
      return {
        apiKey: providerConfig.apiKey,
        apiBaseUrl: null,
        useBedrock: false,
        useVertex: false
      }
    case 'bedrock':
      return {
        apiKey: null,
        apiBaseUrl: null,
        useBedrock: true,
        useVertex: false,
        awsProfile: providerConfig.awsProfile || 'default',
        awsRegion: providerConfig.awsRegion || 'us-east-1'
      }
    case 'openrouter':
    case 'openai':
      return {
        apiKey: providerConfig.apiKey,
        apiBaseUrl: providerConfig.baseUrl,
        useBedrock: false,
        useVertex: false
      }
    default:
      throw new Error(`Unknown provider: ${providerName}`)
  }
}

const QUOTA_ERROR_PATTERNS = ['quota_exceeded', 'rate_limit_exceeded', 'insufficient_quota', '429', 'overloaded']

function isQuotaExceededError(errorCode) {
  const lower = String(errorCode).toLowerCase()
  return QUOTA_ERROR_PATTERNS.some(p => lower.includes(p))
}

module.exports = { PROVIDER_NAMES, getClaudeJsonFields, isQuotaExceededError }
