// test/tracker.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switcher-test-'))
}

function freshTracker(dir) {
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  delete require.cache[require.resolve('../src/tracker')]
  return require('../src/tracker')
}

test('readUsage returns empty usage for new directory', () => {
  const dir = makeTmpDir()
  const { readUsage } = freshTracker(dir)
  const usage = readUsage()
  assert.equal(typeof usage.month, 'string')
  assert.match(usage.month, /^\d{4}-\d{2}$/)
  assert.deepEqual(usage.providers, {})
  fs.rmSync(dir, { recursive: true })
})

test('addTokens accumulates across calls', () => {
  const dir = makeTmpDir()
  const { addTokens, getProviderTokens } = freshTracker(dir)
  addTokens('anthropic', 100, 50)
  addTokens('anthropic', 200, 75)
  assert.equal(getProviderTokens('anthropic'), 425)
  fs.rmSync(dir, { recursive: true })
})

test('addTokens for different providers are independent', () => {
  const dir = makeTmpDir()
  const { addTokens, getProviderTokens } = freshTracker(dir)
  addTokens('anthropic', 1000, 0)
  addTokens('openrouter', 500, 100)
  assert.equal(getProviderTokens('anthropic'), 1000)
  assert.equal(getProviderTokens('openrouter'), 600)
  fs.rmSync(dir, { recursive: true })
})

test('getProviderTokens returns 0 for unknown provider', () => {
  const dir = makeTmpDir()
  const { getProviderTokens } = freshTracker(dir)
  assert.equal(getProviderTokens('bedrock'), 0)
  fs.rmSync(dir, { recursive: true })
})

test('readUsage resets when month changes', () => {
  const dir = makeTmpDir()
  const { readUsage, writeUsage } = freshTracker(dir)
  const stale = { month: '2020-01', providers: { anthropic: { inputTokens: 999, outputTokens: 0 } } }
  writeUsage(stale)
  const usage = readUsage()
  assert.deepEqual(usage.providers, {})
  assert.notEqual(usage.month, '2020-01')
  fs.rmSync(dir, { recursive: true })
})
