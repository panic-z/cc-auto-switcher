// test/switcher.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switcher-test-'))
}

function freshModules(configDir, claudeJsonPath) {
  process.env.CC_SWITCHER_DIR = configDir
  process.env.CC_SWITCHER_CLAUDE_JSON = claudeJsonPath
  for (const mod of ['../src/config', '../src/tracker', '../src/providers', '../src/switcher']) {
    delete require.cache[require.resolve(mod)]
  }
  return require('../src/switcher')
}

test('switchTo writes correct fields for anthropic and updates activeProvider', () => {
  const dir = makeTmpDir()
  const claudeJson = path.join(dir, 'claude.json')
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  const { writeConfig } = require('../src/config')
  writeConfig({
    activeProvider: null,
    priority: ['anthropic'],
    providers: {
      anthropic: { apiKey: 'sk-ant-test', monthlyTokenLimit: 1000000, warningThreshold: 0.9 }
    }
  })
  const { switchTo } = freshModules(dir, claudeJson)
  switchTo('anthropic')
  const written = JSON.parse(fs.readFileSync(claudeJson, 'utf8'))
  assert.equal(written.apiKey, 'sk-ant-test')
  assert.equal(written.useBedrock, false)
  assert.ok(!written.apiBaseUrl)
  delete require.cache[require.resolve('../src/config')]
  const { getActiveProvider } = require('../src/config')
  assert.equal(getActiveProvider(), 'anthropic')
  fs.rmSync(dir, { recursive: true })
})

test('switchTo throws when provider not configured', () => {
  const dir = makeTmpDir()
  const claudeJson = path.join(dir, 'claude.json')
  const { switchTo } = freshModules(dir, claudeJson)
  assert.throws(() => switchTo('anthropic'), /not configured/)
  fs.rmSync(dir, { recursive: true })
})

test('switchTo merges into existing ~/.claude.json without overwriting unrelated fields', () => {
  const dir = makeTmpDir()
  const claudeJson = path.join(dir, 'claude.json')
  fs.writeFileSync(claudeJson, JSON.stringify({ someOtherField: 'keep-me', apiKey: 'old' }))
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  const { writeConfig } = require('../src/config')
  writeConfig({
    activeProvider: null,
    priority: ['anthropic'],
    providers: { anthropic: { apiKey: 'sk-new', monthlyTokenLimit: 1000000, warningThreshold: 0.9 } }
  })
  const { switchTo } = freshModules(dir, claudeJson)
  switchTo('anthropic')
  const written = JSON.parse(fs.readFileSync(claudeJson, 'utf8'))
  assert.equal(written.someOtherField, 'keep-me')
  assert.equal(written.apiKey, 'sk-new')
  fs.rmSync(dir, { recursive: true })
})

test('selectNextProvider returns first provider under threshold', () => {
  const dir = makeTmpDir()
  const claudeJson = path.join(dir, 'claude.json')
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  delete require.cache[require.resolve('../src/tracker')]
  const { writeConfig } = require('../src/config')
  const { addTokens } = require('../src/tracker')
  writeConfig({
    activeProvider: 'anthropic',
    priority: ['anthropic', 'openrouter'],
    providers: {
      anthropic: { apiKey: 'sk-ant', monthlyTokenLimit: 1000, warningThreshold: 0.9 },
      openrouter: { apiKey: 'sk-or', monthlyTokenLimit: 1000, warningThreshold: 0.9 }
    }
  })
  addTokens('anthropic', 950, 0)
  const { selectNextProvider } = freshModules(dir, claudeJson)
  assert.equal(selectNextProvider(), 'openrouter')
  fs.rmSync(dir, { recursive: true })
})

test('selectNextProvider returns null when all providers exhausted', () => {
  const dir = makeTmpDir()
  const claudeJson = path.join(dir, 'claude.json')
  process.env.CC_SWITCHER_DIR = dir
  delete require.cache[require.resolve('../src/config')]
  delete require.cache[require.resolve('../src/tracker')]
  const { writeConfig } = require('../src/config')
  const { addTokens } = require('../src/tracker')
  writeConfig({
    activeProvider: 'anthropic',
    priority: ['anthropic'],
    providers: {
      anthropic: { apiKey: 'sk-ant', monthlyTokenLimit: 1000, warningThreshold: 0.9 }
    }
  })
  addTokens('anthropic', 950, 0)
  const { selectNextProvider } = freshModules(dir, claudeJson)
  assert.equal(selectNextProvider(), null)
  fs.rmSync(dir, { recursive: true })
})
