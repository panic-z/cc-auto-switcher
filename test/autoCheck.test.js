// test/autoCheck.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { extractUsageFromPayload } = require('../src/commands/autoCheck')

test('extractUsageFromPayload parses input and output tokens', () => {
  const result = extractUsageFromPayload(
    JSON.stringify({ tool_result: { usage: { input_tokens: 100, output_tokens: 50 } } })
  )
  assert.equal(result.inputTokens, 100)
  assert.equal(result.outputTokens, 50)
  assert.equal(result.errorCode, null)
})

test('extractUsageFromPayload falls back to top-level usage field', () => {
  const result = extractUsageFromPayload(
    JSON.stringify({ usage: { input_tokens: 200, output_tokens: 75 } })
  )
  assert.equal(result.inputTokens, 200)
  assert.equal(result.outputTokens, 75)
})

test('extractUsageFromPayload extracts errorCode from tool_result.error.type', () => {
  const result = extractUsageFromPayload(
    JSON.stringify({ tool_result: { error: { type: 'rate_limit_exceeded' }, usage: {} } })
  )
  assert.equal(result.errorCode, 'rate_limit_exceeded')
})

test('extractUsageFromPayload extracts errorCode from top-level error.type', () => {
  const result = extractUsageFromPayload(
    JSON.stringify({ error: { type: 'quota_exceeded' } })
  )
  assert.equal(result.errorCode, 'quota_exceeded')
})

test('extractUsageFromPayload returns zeros and null for invalid JSON', () => {
  const result = extractUsageFromPayload('not-valid-json')
  assert.equal(result.inputTokens, 0)
  assert.equal(result.outputTokens, 0)
  assert.equal(result.errorCode, null)
})

test('extractUsageFromPayload returns zeros for empty object', () => {
  const result = extractUsageFromPayload('{}')
  assert.equal(result.inputTokens, 0)
  assert.equal(result.outputTokens, 0)
  assert.equal(result.errorCode, null)
})
