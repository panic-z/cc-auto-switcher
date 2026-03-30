// test/config.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switcher-test-'))
}

test('readConfig returns default when file missing', () => {
  const dir = makeTmpDir()
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  const { readConfig } = require('../src/config')
  const cfg = readConfig()
  assert.equal(cfg.activeProvider, null)
  assert.deepEqual(cfg.priority, ['anthropic', 'bedrock', 'openrouter', 'openai'])
  assert.deepEqual(cfg.providers, {})
  fs.rmSync(dir, { recursive: true })
})

test('writeConfig persists and readConfig retrieves', () => {
  const dir = makeTmpDir()
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  const { readConfig, writeConfig } = require('../src/config')
  const cfg = readConfig()
  cfg.activeProvider = 'anthropic'
  cfg.providers.anthropic = { apiKey: 'sk-test', monthlyTokenLimit: 100000, warningThreshold: 0.9 }
  writeConfig(cfg)
  delete require.cache[require.resolve('../src/config')]
  const { readConfig: readConfig2 } = require('../src/config')
  const loaded = readConfig2()
  assert.equal(loaded.activeProvider, 'anthropic')
  assert.equal(loaded.providers.anthropic.apiKey, 'sk-test')
  fs.rmSync(dir, { recursive: true })
})

test('setProviderConfig creates provider entry if missing', () => {
  const dir = makeTmpDir()
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  const { setProviderConfig, getProviderConfig } = require('../src/config')
  setProviderConfig('openrouter', 'apiKey', 'sk-or-abc')
  const p = getProviderConfig('openrouter')
  assert.equal(p.apiKey, 'sk-or-abc')
  fs.rmSync(dir, { recursive: true })
})

test('setActiveProvider updates activeProvider field', () => {
  const dir = makeTmpDir()
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  const { setActiveProvider, getActiveProvider } = require('../src/config')
  setActiveProvider('bedrock')
  assert.equal(getActiveProvider(), 'bedrock')
  fs.rmSync(dir, { recursive: true })
})
