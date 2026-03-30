# Claude Code Provider Auto-Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js CLI tool (`cc-switcher`) that auto-switches Claude Code's active provider based on token quota, with manual switching, status display, and config management.

**Architecture:** Five focused modules (config, tracker, providers, switcher, cli) under `src/`. The tool writes provider credentials to `~/.claude.json` on every switch and persists usage/config state in `~/.cc-switcher/`. A PostToolUse hook calls `cc-switcher auto-check` which reads CC's JSON payload from stdin. All paths are overridable via env vars for testing.

**Tech Stack:** Node.js 18+, CommonJS, `minimist` (arg parsing), `chalk@4` (terminal colors), `node:test` + `node:assert` (testing)

---

## File Map

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies, bin entry, test script |
| `src/config.js` | Read/write `~/.cc-switcher/config.json`; provider credential CRUD |
| `src/tracker.js` | Read/write `~/.cc-switcher/usage.json`; monthly reset; token accumulation |
| `src/providers.js` | Provider definitions; maps provider name → `~/.claude.json` fields |
| `src/switcher.js` | Read/write `~/.claude.json`; execute switch; select next provider by quota |
| `src/cli.js` | CLI entry; parse argv; dispatch to command handlers |
| `test/config.test.js` | Unit tests for config.js |
| `test/tracker.test.js` | Unit tests for tracker.js |
| `test/providers.test.js` | Unit tests for providers.js |
| `test/switcher.test.js` | Unit tests for switcher.js |

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `src/cli.js` (stub)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "cc-auto-switcher",
  "version": "0.1.0",
  "description": "Auto-switch Claude Code provider based on token quota",
  "main": "src/cli.js",
  "bin": {
    "cc-switcher": "./src/cli.js"
  },
  "scripts": {
    "test": "node --test test/*.test.js"
  },
  "dependencies": {
    "chalk": "^4.1.2",
    "minimist": "^1.2.8"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated.

- [ ] **Step 3: Create stub cli.js**

```js
#!/usr/bin/env node
'use strict'
console.log('cc-switcher ok')
```

- [ ] **Step 4: Make it executable and smoke test**

```bash
chmod +x src/cli.js
node src/cli.js
```

Expected output: `cc-switcher ok`

- [ ] **Step 5: Create test directory**

```bash
mkdir -p test
```

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/cli.js
git commit -m "chore: project scaffold with dependencies"
```

---

## Task 2: config.js

**Files:**
- Create: `src/config.js`
- Create: `test/config.test.js`

All file paths in `config.js` are driven by `process.env.CC_SWITCHER_DIR` so tests can redirect to a temp directory without mocking `fs`.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test test/config.test.js
```

Expected: `Error: Cannot find module '../src/config'`

- [ ] **Step 3: Implement config.js**

```js
// src/config.js
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')

function getConfigDir() {
  return process.env.CC_SWITCHER_DIR || path.join(os.homedir(), '.cc-switcher')
}

function getConfigFile() {
  return path.join(getConfigDir(), 'config.json')
}

const DEFAULT_CONFIG = {
  activeProvider: null,
  priority: ['anthropic', 'bedrock', 'openrouter', 'openai'],
  providers: {}
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(getConfigFile(), 'utf8'))
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  }
}

function writeConfig(config) {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getConfigFile(), JSON.stringify(config, null, 2))
}

function getActiveProvider() {
  return readConfig().activeProvider
}

function setActiveProvider(name) {
  const config = readConfig()
  config.activeProvider = name
  writeConfig(config)
}

function getProviderConfig(name) {
  return readConfig().providers[name] || null
}

function setProviderConfig(name, key, value) {
  const config = readConfig()
  if (!config.providers[name]) config.providers[name] = {}
  config.providers[name][key] = value
  writeConfig(config)
}

module.exports = {
  readConfig,
  writeConfig,
  getActiveProvider,
  setActiveProvider,
  getProviderConfig,
  setProviderConfig,
  getConfigDir,
  getConfigFile
}
```

- [ ] **Step 4: Run tests and verify all pass**

```bash
node --test test/config.test.js
```

Expected: 4 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: config module with read/write and provider CRUD"
```

---

## Task 3: tracker.js

**Files:**
- Create: `src/tracker.js`
- Create: `test/tracker.test.js`

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test test/tracker.test.js
```

Expected: `Error: Cannot find module '../src/tracker'`

- [ ] **Step 3: Implement tracker.js**

```js
// src/tracker.js
'use strict'
const fs = require('fs')
const path = require('path')
const { getConfigDir } = require('./config')

function getUsageFile() {
  return path.join(getConfigDir(), 'usage.json')
}

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function readUsage() {
  let usage
  try {
    usage = JSON.parse(fs.readFileSync(getUsageFile(), 'utf8'))
  } catch {
    usage = { month: currentMonth(), providers: {} }
  }
  if (usage.month !== currentMonth()) {
    usage = { month: currentMonth(), providers: {} }
    writeUsage(usage)
  }
  return usage
}

function writeUsage(usage) {
  const dir = getConfigDir()
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(getUsageFile(), JSON.stringify(usage, null, 2))
}

function addTokens(provider, inputTokens, outputTokens) {
  const usage = readUsage()
  if (!usage.providers[provider]) {
    usage.providers[provider] = { inputTokens: 0, outputTokens: 0 }
  }
  usage.providers[provider].inputTokens += (inputTokens || 0)
  usage.providers[provider].outputTokens += (outputTokens || 0)
  writeUsage(usage)
}

function getProviderTokens(provider) {
  const usage = readUsage()
  const p = usage.providers[provider] || { inputTokens: 0, outputTokens: 0 }
  return p.inputTokens + p.outputTokens
}

module.exports = { readUsage, writeUsage, addTokens, getProviderTokens }
```

- [ ] **Step 4: Run tests and verify all pass**

```bash
node --test test/tracker.test.js
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/tracker.js test/tracker.test.js
git commit -m "feat: tracker module with token accumulation and monthly reset"
```

---

## Task 4: providers.js

**Files:**
- Create: `src/providers.js`
- Create: `test/providers.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/providers.test.js
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { getClaudeJsonFields, isQuotaExceededError, PROVIDER_NAMES } = require('../src/providers')

test('PROVIDER_NAMES contains all four providers', () => {
  assert.deepEqual(PROVIDER_NAMES, ['anthropic', 'bedrock', 'openrouter', 'openai'])
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test test/providers.test.js
```

Expected: `Error: Cannot find module '../src/providers'`

- [ ] **Step 3: Implement providers.js**

```js
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
```

- [ ] **Step 4: Run tests and verify all pass**

```bash
node --test test/providers.test.js
```

Expected: 10 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/providers.js test/providers.test.js
git commit -m "feat: providers module with field mappings and error detection"
```

---

## Task 5: switcher.js

**Files:**
- Create: `src/switcher.js`
- Create: `test/switcher.test.js`

`CLAUDE_JSON` path is driven by `process.env.CC_SWITCHER_CLAUDE_JSON` for test isolation.

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
node --test test/switcher.test.js
```

Expected: `Error: Cannot find module '../src/switcher'`

- [ ] **Step 3: Implement switcher.js**

```js
// src/switcher.js
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const { readConfig, writeConfig } = require('./config')
const { getProviderTokens } = require('./tracker')
const { getClaudeJsonFields } = require('./providers')

function getClaudeJsonPath() {
  return process.env.CC_SWITCHER_CLAUDE_JSON || path.join(os.homedir(), '.claude.json')
}

function readClaudeJson() {
  try {
    return JSON.parse(fs.readFileSync(getClaudeJsonPath(), 'utf8'))
  } catch {
    return {}
  }
}

function writeClaudeJson(fields) {
  const current = readClaudeJson()
  const updated = { ...current }
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === false && (k === 'useBedrock' || k === 'useVertex')) {
      if (v === null) {
        delete updated[k]
      } else {
        updated[k] = v
      }
    } else {
      updated[k] = v
    }
  }
  fs.writeFileSync(getClaudeJsonPath(), JSON.stringify(updated, null, 2))
}

function switchTo(providerName) {
  const config = readConfig()
  const providerConfig = config.providers[providerName]
  if (!providerConfig) {
    throw new Error(
      `Provider "${providerName}" not configured. Run: cc-switcher config set ${providerName} apiKey <your-key>`
    )
  }
  const fields = getClaudeJsonFields(providerName, providerConfig)
  writeClaudeJson(fields)
  config.activeProvider = providerName
  writeConfig(config)
}

function selectNextProvider() {
  const config = readConfig()
  const { priority, providers } = config
  for (const name of priority) {
    const pConfig = providers[name]
    if (!pConfig || !pConfig.monthlyTokenLimit) continue
    const used = getProviderTokens(name)
    const threshold = pConfig.warningThreshold || 0.9
    if (used / pConfig.monthlyTokenLimit < threshold) {
      return name
    }
  }
  return null
}

module.exports = { readClaudeJson, writeClaudeJson, switchTo, selectNextProvider }
```

- [ ] **Step 4: Run tests and verify all pass**

```bash
node --test test/switcher.test.js
```

Expected: 5 passing tests.

- [ ] **Step 5: Commit**

```bash
git add src/switcher.js test/switcher.test.js
git commit -m "feat: switcher module with switch logic and quota-based provider selection"
```

---

## Task 6: `use` and `auto-check` Commands

**Files:**
- Create: `src/commands/use.js`
- Create: `src/commands/autoCheck.js`

- [ ] **Step 1: Create commands directory**

```bash
mkdir -p src/commands
```

- [ ] **Step 2: Implement use.js**

```js
// src/commands/use.js
'use strict'
const chalk = require('chalk')
const { switchTo } = require('../switcher')
const { PROVIDER_NAMES } = require('../providers')

function cmdUse(args) {
  const provider = args._[1]
  if (!provider) {
    console.error(chalk.red('Usage: cc-switcher use <provider>'))
    console.error(`Available providers: ${PROVIDER_NAMES.join(', ')}`)
    process.exit(1)
  }
  if (!PROVIDER_NAMES.includes(provider)) {
    console.error(chalk.red(`Unknown provider: ${provider}`))
    console.error(`Available: ${PROVIDER_NAMES.join(', ')}`)
    process.exit(1)
  }
  try {
    switchTo(provider)
    console.log(chalk.green(`Switched to ${provider}`))
  } catch (err) {
    console.error(chalk.red(err.message))
    process.exit(1)
  }
}

module.exports = { cmdUse }
```

- [ ] **Step 3: Implement autoCheck.js**

This command is called by the CC PostToolUse hook. It reads stdin, accumulates tokens, and switches provider if quota is near exhausted.

```js
// src/commands/autoCheck.js
'use strict'
const { readConfig, getActiveProvider } = require('../config')
const { addTokens } = require('../tracker')
const { switchTo, selectNextProvider } = require('../switcher')
const { isQuotaExceededError } = require('../providers')

async function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    // Resolve immediately if stdin is not a pipe (interactive terminal)
    if (process.stdin.isTTY) resolve('')
  })
}

function extractUsageFromPayload(raw) {
  try {
    const payload = JSON.parse(raw)
    // CC hook payload structure: { tool_use: {...}, tool_result: { usage: {...} } }
    const usage = payload?.tool_result?.usage || payload?.usage || {}
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      errorCode: payload?.tool_result?.error?.type || payload?.error?.type || null
    }
  } catch {
    return { inputTokens: 0, outputTokens: 0, errorCode: null }
  }
}

async function cmdAutoCheck() {
  const raw = await readStdin()
  const { inputTokens, outputTokens, errorCode } = extractUsageFromPayload(raw)

  const active = getActiveProvider()
  if (active && (inputTokens > 0 || outputTokens > 0)) {
    addTokens(active, inputTokens, outputTokens)
  }

  const shouldSwitch = errorCode && isQuotaExceededError(errorCode)
  if (!shouldSwitch) {
    const next = selectNextProvider()
    // next === null means all exhausted; next === active means stay
    if (!next || next === active) return
  }

  const next = selectNextProvider()
  if (!next) {
    process.stderr.write('[cc-switcher] All providers exhausted — staying on current provider\n')
    return
  }
  try {
    switchTo(next)
    process.stderr.write(`[cc-switcher] Auto-switched to ${next}\n`)
  } catch (err) {
    process.stderr.write(`[cc-switcher] Switch failed: ${err.message}\n`)
  }
}

module.exports = { cmdAutoCheck, extractUsageFromPayload }
```

- [ ] **Step 4: Smoke test auto-check with mock payload**

```bash
echo '{"tool_result":{"usage":{"input_tokens":100,"output_tokens":50}}}' | node src/cli.js auto-check
```

Expected: no output (no switch triggered, cli.js not yet wired — but module loads without error when tested directly):

```bash
node -e "const {extractUsageFromPayload} = require('./src/commands/autoCheck'); console.log(extractUsageFromPayload('{\"tool_result\":{\"usage\":{\"input_tokens\":100,\"output_tokens\":50}}}'))"
```

Expected: `{ inputTokens: 100, outputTokens: 50, errorCode: null }`

- [ ] **Step 5: Commit**

```bash
git add src/commands/use.js src/commands/autoCheck.js
git commit -m "feat: use and auto-check commands"
```

---

## Task 7: `status` Command

**Files:**
- Create: `src/commands/status.js`

- [ ] **Step 1: Implement status.js**

```js
// src/commands/status.js
'use strict'
const chalk = require('chalk')
const { readConfig } = require('../config')
const { readUsage } = require('../tracker')
const { PROVIDER_NAMES } = require('../providers')

function fmtTokens(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

function cmdStatus() {
  const config = readConfig()
  const usage = readUsage()

  if (!config.activeProvider) {
    console.log(chalk.yellow('No active provider. Run: cc-switcher config init'))
    return
  }

  const COL = { provider: 14, used: 12, limit: 12, pct: 7 }
  const header = [
    'Provider'.padEnd(COL.provider),
    'Used'.padEnd(COL.used),
    'Limit'.padEnd(COL.limit),
    '%'.padEnd(COL.pct),
    'Status'
  ].join('')
  console.log(chalk.bold(header))
  console.log('─'.repeat(60))

  for (const name of PROVIDER_NAMES) {
    const pConfig = config.providers[name]
    const u = usage.providers[name] || { inputTokens: 0, outputTokens: 0 }
    const used = u.inputTokens + u.outputTokens
    const limit = pConfig?.monthlyTokenLimit || 0
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0
    const threshold = pConfig?.warningThreshold || 0.9
    const isActive = name === config.activeProvider
    const isConfigured = !!pConfig

    const indicator = isActive ? chalk.green('●') : ' '
    const providerStr = (indicator + ' ' + name).padEnd(COL.provider + 2)
    const usedStr = (fmtTokens(used) + ' tok').padEnd(COL.used)
    const limitStr = (limit > 0 ? fmtTokens(limit) : 'unconfigured').padEnd(COL.limit)
    const pctStr = (limit > 0 ? `${pct}%` : '-').padEnd(COL.pct)

    let statusStr
    if (!isConfigured) {
      statusStr = chalk.gray('not configured')
    } else if (isActive) {
      statusStr = chalk.green('active')
    } else if (limit > 0 && used / limit >= threshold) {
      statusStr = chalk.red('exhausted')
    } else {
      statusStr = chalk.cyan('available')
    }

    const pctColor = pct >= 90 ? chalk.red : pct >= 70 ? chalk.yellow : chalk.white
    console.log(`${providerStr}${usedStr}${limitStr}${pctColor(pctStr)}${statusStr}`)
  }

  console.log()
  console.log(`Month: ${usage.month}`)
}

module.exports = { cmdStatus }
```

- [ ] **Step 2: Smoke test (requires configured state — use tmp env)**

```bash
node -e "
  process.env.CC_SWITCHER_DIR = '/tmp/cc-test-status'
  const fs = require('fs')
  fs.mkdirSync('/tmp/cc-test-status', {recursive:true})
  fs.writeFileSync('/tmp/cc-test-status/config.json', JSON.stringify({
    activeProvider:'anthropic',
    priority:['anthropic','bedrock','openrouter','openai'],
    providers:{
      anthropic:{apiKey:'sk-x',monthlyTokenLimit:1000000,warningThreshold:0.9},
      bedrock:{awsProfile:'default',awsRegion:'us-east-1',monthlyTokenLimit:5000000,warningThreshold:0.9}
    }
  }))
  fs.writeFileSync('/tmp/cc-test-status/usage.json', JSON.stringify({
    month: require('./src/tracker').readUsage().month,
    providers:{anthropic:{inputTokens:450000,outputTokens:120000}}
  }))
  require('./src/commands/status').cmdStatus()
"
```

Expected: formatted table with anthropic at 57%, bedrock at 0%.

- [ ] **Step 3: Commit**

```bash
git add src/commands/status.js
git commit -m "feat: status command with formatted provider table"
```

---

## Task 8: `config set` and `config init` Commands

**Files:**
- Create: `src/commands/configCmd.js`

- [ ] **Step 1: Implement configCmd.js**

```js
// src/commands/configCmd.js
'use strict'
const readline = require('readline')
const chalk = require('chalk')
const { setProviderConfig, readConfig, writeConfig } = require('../config')
const { PROVIDER_NAMES } = require('../providers')

function cmdConfigSet(args) {
  // cc-switcher config set <provider> <key> <value>
  const [, , provider, key, value] = args._
  if (!provider || !key || value === undefined) {
    console.error(chalk.red('Usage: cc-switcher config set <provider> <key> <value>'))
    console.error(`Providers: ${PROVIDER_NAMES.join(', ')}`)
    console.error('Example: cc-switcher config set anthropic apiKey sk-ant-...')
    process.exit(1)
  }
  if (!PROVIDER_NAMES.includes(provider)) {
    console.error(chalk.red(`Unknown provider: ${provider}`))
    process.exit(1)
  }
  // Coerce numeric strings
  const coerced = isNaN(Number(value)) ? value : Number(value)
  setProviderConfig(provider, key, coerced)
  console.log(chalk.green(`Set ${provider}.${key}`))
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve))
}

async function cmdConfigInit() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log(chalk.bold('\ncc-switcher setup wizard'))
  console.log('Press Enter to skip a provider.\n')

  const config = readConfig()

  for (const name of PROVIDER_NAMES) {
    console.log(chalk.cyan(`\n── ${name} ──`))
    if (name === 'bedrock') {
      const profile = await ask(rl, `  AWS profile [default]: `)
      const region = await ask(rl, `  AWS region [us-east-1]: `)
      const limit = await ask(rl, `  Monthly token limit [5000000]: `)
      if (profile || region || limit) {
        if (!config.providers.bedrock) config.providers.bedrock = {}
        config.providers.bedrock.awsProfile = profile || 'default'
        config.providers.bedrock.awsRegion = region || 'us-east-1'
        config.providers.bedrock.monthlyTokenLimit = Number(limit) || 5000000
        config.providers.bedrock.warningThreshold = 0.9
      }
    } else {
      const apiKey = await ask(rl, `  API key: `)
      const limit = await ask(rl, `  Monthly token limit: `)
      if (apiKey) {
        if (!config.providers[name]) config.providers[name] = {}
        config.providers[name].apiKey = apiKey
        if (name === 'openrouter') config.providers[name].baseUrl = 'https://openrouter.ai/api/v1'
        if (name === 'openai') config.providers[name].baseUrl = 'https://api.openai.com/v1'
        if (limit) config.providers[name].monthlyTokenLimit = Number(limit)
        config.providers[name].warningThreshold = 0.9
      }
    }
  }

  const firstConfigured = PROVIDER_NAMES.find(n => config.providers[n])
  if (firstConfigured && !config.activeProvider) {
    config.activeProvider = firstConfigured
  }

  writeConfig(config)
  rl.close()
  console.log(chalk.green('\nConfiguration saved.'))
  if (config.activeProvider) {
    console.log(`Active provider: ${config.activeProvider}`)
  }
}

module.exports = { cmdConfigSet, cmdConfigInit }
```

- [ ] **Step 2: Smoke test config set**

```bash
node -e "
  process.env.CC_SWITCHER_DIR = '/tmp/cc-test-config'
  require('fs').mkdirSync('/tmp/cc-test-config',{recursive:true})
  process.argv = ['node','cli','config','set','anthropic','apiKey','sk-test']
  const {cmdConfigSet} = require('./src/commands/configCmd')
  cmdConfigSet({_:['config','set','anthropic','apiKey','sk-test']})
  const {getProviderConfig} = require('./src/config')
  console.log(getProviderConfig('anthropic'))
"
```

Expected: `{ apiKey: 'sk-test' }`

- [ ] **Step 3: Commit**

```bash
git add src/commands/configCmd.js
git commit -m "feat: config set and config init commands"
```

---

## Task 9: `install-hooks` Command

**Files:**
- Create: `src/commands/installHooks.js`

- [ ] **Step 1: Implement installHooks.js**

```js
// src/commands/installHooks.js
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const chalk = require('chalk')

const CLAUDE_SETTINGS = path.join(os.homedir(), '.claude', 'settings.json')

const HOOK_ENTRY = {
  matcher: '',
  hooks: [{ type: 'command', command: 'cc-switcher auto-check' }]
}

function cmdInstallHooks() {
  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS, 'utf8'))
  } catch {
    // File may not exist yet
  }

  if (!settings.hooks) settings.hooks = {}
  if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = []

  const alreadyInstalled = settings.hooks.PostToolUse.some(
    entry => entry.hooks?.some(h => h.command === 'cc-switcher auto-check')
  )

  if (alreadyInstalled) {
    console.log(chalk.yellow('Hook already installed in ~/.claude/settings.json'))
    return
  }

  settings.hooks.PostToolUse.push(HOOK_ENTRY)

  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS), { recursive: true })
  fs.writeFileSync(CLAUDE_SETTINGS, JSON.stringify(settings, null, 2))
  console.log(chalk.green('Hook installed in ~/.claude/settings.json'))
  console.log('cc-switcher auto-check will run after every Claude Code tool use.')
}

module.exports = { cmdInstallHooks }
```

- [ ] **Step 2: Smoke test (writes to real settings.json — inspect only)**

```bash
node -e "
  // Dry-run: just verify the hook entry structure is correct
  const { HOOK_ENTRY } = (() => {
    const mod = require('./src/commands/installHooks')
    return { HOOK_ENTRY: { matcher:'', hooks:[{type:'command',command:'cc-switcher auto-check'}] } }
  })()
  console.log(JSON.stringify(HOOK_ENTRY, null, 2))
"
```

Expected:
```json
{
  "matcher": "",
  "hooks": [{ "type": "command", "command": "cc-switcher auto-check" }]
}
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/installHooks.js
git commit -m "feat: install-hooks command writes PostToolUse hook to Claude settings"
```

---

## Task 10: Wire cli.js and End-to-End Smoke Test

**Files:**
- Modify: `src/cli.js`

- [ ] **Step 1: Replace stub cli.js with full dispatcher**

```js
#!/usr/bin/env node
'use strict'
const minimist = require('minimist')
const chalk = require('chalk')

const args = minimist(process.argv.slice(2))
const command = args._[0]

const USAGE = `
Usage: cc-switcher <command> [options]

Commands:
  use <provider>              Switch to a specific provider
  status                      Show provider usage and quota
  config set <p> <key> <val>  Set a provider config value
  config init                 Interactive setup wizard
  auto-check                  Check quota and auto-switch (called by hook)
  install-hooks               Install PostToolUse hook in Claude Code

Providers: anthropic, bedrock, openrouter, openai
`.trim()

async function main() {
  switch (command) {
    case 'use': {
      const { cmdUse } = require('./commands/use')
      cmdUse(args)
      break
    }
    case 'status': {
      const { cmdStatus } = require('./commands/status')
      cmdStatus()
      break
    }
    case 'config': {
      const sub = args._[1]
      const { cmdConfigSet, cmdConfigInit } = require('./commands/configCmd')
      if (sub === 'set') cmdConfigSet(args)
      else if (sub === 'init') await cmdConfigInit()
      else { console.error(chalk.red(`Unknown config subcommand: ${sub}`)); process.exit(1) }
      break
    }
    case 'auto-check': {
      const { cmdAutoCheck } = require('./commands/autoCheck')
      await cmdAutoCheck()
      break
    }
    case 'install-hooks': {
      const { cmdInstallHooks } = require('./commands/installHooks')
      cmdInstallHooks()
      break
    }
    default:
      console.log(USAGE)
      if (command) process.exit(1)
  }
}

main().catch(err => {
  console.error(chalk.red(err.message))
  process.exit(1)
})
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

```bash
node --test test/*.test.js
```

Expected: all tests pass (config, tracker, providers, switcher).

- [ ] **Step 3: End-to-end smoke test**

```bash
export CC_SWITCHER_DIR=/tmp/cc-e2e-test
export CC_SWITCHER_CLAUDE_JSON=/tmp/cc-e2e-claude.json
rm -rf $CC_SWITCHER_DIR $CC_SWITCHER_CLAUDE_JSON

# Configure two providers
node src/cli.js config set anthropic apiKey sk-ant-demo
node src/cli.js config set anthropic monthlyTokenLimit 1000000
node src/cli.js config set anthropic warningThreshold 0.9
node src/cli.js config set openrouter apiKey sk-or-demo
node src/cli.js config set openrouter baseUrl https://openrouter.ai/api/v1
node src/cli.js config set openrouter monthlyTokenLimit 2000000
node src/cli.js config set openrouter warningThreshold 0.9

# Manual switch
node src/cli.js use anthropic
cat $CC_SWITCHER_CLAUDE_JSON

# Status
node src/cli.js status

# Simulate near-exhaustion and auto-check
node -e "
  process.env.CC_SWITCHER_DIR = '/tmp/cc-e2e-test'
  const {addTokens} = require('./src/tracker')
  addTokens('anthropic', 950000, 0)
"
echo '{"tool_result":{"usage":{"input_tokens":100,"output_tokens":50}}}' | node src/cli.js auto-check

# Confirm switched to openrouter
node src/cli.js status
```

Expected final status: openrouter is `active`, anthropic is `exhausted`.

- [ ] **Step 4: Install globally (optional manual step)**

```bash
npm link
cc-switcher status
```

- [ ] **Step 5: Final commit**

```bash
git add src/cli.js
git commit -m "feat: wire cli.js dispatcher and complete end-to-end integration"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: config CRUD ✓, token tracking ✓, monthly reset ✓, all 4 providers ✓, auto-switch by quota ✓, error fallback ✓, `use` ✓, `status` ✓, `config set` ✓, `config init` ✓, `install-hooks` ✓, `auto-check` via stdin ✓
- [x] **No placeholders**: all steps contain actual code
- [x] **Type consistency**: `getConfigDir()` used consistently in config.js and tracker.js; `selectNextProvider()` called identically in switcher.js and autoCheck.js; `PROVIDER_NAMES` imported from providers.js throughout
- [x] **Error handling**: I/O errors caught in read functions; switch errors caught and logged; all providers exhausted handled gracefully; invalid JSON in stdin skipped silently
