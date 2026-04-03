// test/providers.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getClaudeJsonFields, isQuotaExceededError, PROVIDER_NAMES } = require('../src/providers')

test('PROVIDER_NAMES contains all four providers', () => {
  assert.deepEqual(PROVIDER_NAMES, ['anthropic', 'bedrock', 'openrouter', 'openai', 'claude-pro'])
})

test('getClaudeJsonFields for anthropic sets apiKey and clears baseUrl and flags', () => {
  const fields = getClaudeJsonFields('anthropic', { apiKey: 'sk-ant-123' })
  assert.equal(fields.apiKey, 'sk-ant-123')
  assert.equal(fields.apiBaseUrl, null)
  assert.equal(fields.useBedrock, false)
  assert.equal(fields.useVertex, false)
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

test('getClaudeJsonFields throws for unknown provider', () => {
  assert.throws(() => getClaudeJsonFields('unknown', {}), /Unknown provider/)
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
