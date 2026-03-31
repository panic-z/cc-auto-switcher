// test/providers.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getClaudeJsonFields, getProviderType, isQuotaExceededError, PROVIDER_TYPES, PROVIDER_NAMES } = require('../src/providers')

test('PROVIDER_TYPES contains all four types', () => {
  assert.deepEqual(PROVIDER_TYPES, ['anthropic', 'bedrock', 'openrouter', 'openai'])
})

test('PROVIDER_NAMES is an alias for PROVIDER_TYPES', () => {
  assert.equal(PROVIDER_NAMES, PROVIDER_TYPES)
})

test('getProviderType uses type field when present', () => {
  assert.equal(getProviderType('my-account', { type: 'anthropic' }), 'anthropic')
})

test('getProviderType falls back to provider name', () => {
  assert.equal(getProviderType('anthropic', {}), 'anthropic')
  assert.equal(getProviderType('openai', { apiKey: 'k' }), 'openai')
})

test('getClaudeJsonFields for anthropic sets apiKey and clears baseUrl and flags', () => {
  const fields = getClaudeJsonFields('anthropic', { apiKey: 'sk-ant-123' })
  assert.equal(fields.apiKey, 'sk-ant-123')
  assert.equal(fields.apiBaseUrl, null)
  assert.equal(fields.useBedrock, false)
  assert.equal(fields.useVertex, false)
})

test('getClaudeJsonFields for anthropic supports custom baseUrl', () => {
  const fields = getClaudeJsonFields('anthropic', { apiKey: 'k', baseUrl: 'https://proxy.example.com' })
  assert.equal(fields.apiBaseUrl, 'https://proxy.example.com')
})

test('getClaudeJsonFields for bedrock sets useBedrock and clears apiKey', () => {
  const fields = getClaudeJsonFields('bedrock', { awsProfile: 'myprofile', awsRegion: 'eu-west-1' })
  assert.equal(fields.apiKey, null)
  assert.equal(fields.apiBaseUrl, null)
  assert.equal(fields.useBedrock, true)
  assert.equal(fields.useVertex, false)
  assert.equal(fields.awsProfile, 'myprofile')
  assert.equal(fields.awsRegion, 'eu-west-1')
})

test('getClaudeJsonFields for bedrock uses defaults when profile/region missing', () => {
  const fields = getClaudeJsonFields('bedrock', {})
  assert.equal(fields.awsProfile, 'default')
  assert.equal(fields.awsRegion, 'us-east-1')
})

test('getClaudeJsonFields for openrouter sets apiKey and baseUrl', () => {
  const fields = getClaudeJsonFields('openrouter', { apiKey: 'sk-or-abc', baseUrl: 'https://openrouter.ai/api/v1' })
  assert.equal(fields.apiKey, 'sk-or-abc')
  assert.equal(fields.apiBaseUrl, 'https://openrouter.ai/api/v1')
  assert.equal(fields.useBedrock, false)
})

test('getClaudeJsonFields for openai sets apiKey and baseUrl', () => {
  const fields = getClaudeJsonFields('openai', { apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1' })
  assert.equal(fields.apiKey, 'sk-openai')
  assert.equal(fields.apiBaseUrl, 'https://api.openai.com/v1')
  assert.equal(fields.useBedrock, false)
})

test('getClaudeJsonFields uses type field for custom-named provider', () => {
  const fields = getClaudeJsonFields('my-work', { type: 'anthropic', apiKey: 'sk-ant-work' })
  assert.equal(fields.apiKey, 'sk-ant-work')
  assert.equal(fields.useBedrock, false)
})

test('getClaudeJsonFields custom openrouter instance via type', () => {
  const fields = getClaudeJsonFields('backup', { type: 'openrouter', apiKey: 'sk-or-2', baseUrl: 'https://openrouter.ai/api/v1' })
  assert.equal(fields.apiKey, 'sk-or-2')
  assert.equal(fields.apiBaseUrl, 'https://openrouter.ai/api/v1')
  assert.equal(fields.useBedrock, false)
})

test('getClaudeJsonFields throws for unknown type', () => {
  assert.throws(() => getClaudeJsonFields('unknown', {}), /Unknown provider type/)
  assert.throws(() => getClaudeJsonFields('foo', { type: 'bad' }), /Unknown provider type/)
})

test('getClaudeJsonFields passes model through for all providers', () => {
  assert.equal(getClaudeJsonFields('anthropic', { apiKey: 'k', model: 'claude-opus-4-6' }).model, 'claude-opus-4-6')
  assert.equal(getClaudeJsonFields('bedrock', { model: 'my-model' }).model, 'my-model')
  assert.equal(getClaudeJsonFields('openai', { apiKey: 'k', baseUrl: 'u', model: 'gpt-4o' }).model, 'gpt-4o')
})

test('getClaudeJsonFields model is null when not configured', () => {
  assert.equal(getClaudeJsonFields('anthropic', { apiKey: 'k' }).model, null)
})

test('isQuotaExceededError detects rate_limit_exceeded', () => {
  assert.equal(isQuotaExceededError('rate_limit_exceeded'), true)
})

test('isQuotaExceededError detects 429', () => {
  assert.equal(isQuotaExceededError('429'), true)
})

test('isQuotaExceededError returns false for unrelated errors', () => {
  assert.equal(isQuotaExceededError('internal_server_error'), false)
})
