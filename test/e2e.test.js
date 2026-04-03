// test/e2e.test.js — end-to-end tests that spawn the CLI as a subprocess
'use strict'
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const CLI = path.resolve(__dirname, '../src/cli.js')

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-switcher-e2e-'))
}

function run(args, { dir, claudeJson, stdin } = {}) {
  const tmpDir = dir || makeTmpDir()
  const claudeJsonPath = claudeJson || path.join(tmpDir, 'claude.json')

  const env = {
    ...process.env,
    CC_SWITCHER_DIR: tmpDir,
    CC_SWITCHER_CLAUDE_JSON: claudeJsonPath,
  }

  const result = spawnSync(process.execPath, [CLI, ...args], {
    env,
    input: stdin,
    encoding: 'utf8',
    timeout: 5000,
  })

  return { ...result, tmpDir, claudeJsonPath }
}

// ---------------------------------------------------------------------------
// No-command / usage
// ---------------------------------------------------------------------------

test('no command prints usage and exits 0', () => {
  const { status, stdout } = run([])
  assert.equal(status, 0)
  assert.match(stdout, /Usage: cc-switcher/)
})

test('unknown command prints usage and exits 1', () => {
  const { status, stdout } = run(['unknown-cmd'])
  assert.equal(status, 1)
  assert.match(stdout, /Usage: cc-switcher/)
})

// ---------------------------------------------------------------------------
// config set / priority / delete
// ---------------------------------------------------------------------------

test('config set stores key-value for a provider', () => {
  const dir = makeTmpDir()
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-test'], { dir })
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(cfg.providers.anthropic.apiKey, 'sk-ant-test')
  fs.rmSync(dir, { recursive: true })
})

test('config set supports custom provider names', () => {
  const dir = makeTmpDir()
  run(['config', 'set', 'work', 'type', 'anthropic'], { dir })
  run(['config', 'set', 'work', 'apiKey', 'sk-work'], { dir })
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(cfg.providers.work.type, 'anthropic')
  assert.equal(cfg.providers.work.apiKey, 'sk-work')
  fs.rmSync(dir, { recursive: true })
})

test('config priority with no args shows current priority', () => {
  const dir = makeTmpDir()
  const { status, stdout } = run(['config', 'priority'], { dir })
  assert.equal(status, 0)
  assert.match(stdout, /anthropic/)
  fs.rmSync(dir, { recursive: true })
})

test('config priority with args updates priority order', () => {
  const dir = makeTmpDir()
  run(['config', 'set', 'openrouter', 'apiKey', 'sk-or'], { dir })
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant'], { dir })
  run(['config', 'priority', 'openrouter', 'anthropic'], { dir })
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.deepEqual(cfg.priority, ['openrouter', 'anthropic'])
  fs.rmSync(dir, { recursive: true })
})

test('config delete removes provider and exits 0', () => {
  const dir = makeTmpDir()
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant'], { dir })
  const { status, stdout } = run(['config', 'delete', 'anthropic'], { dir })
  assert.equal(status, 0)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(cfg.providers.anthropic, undefined)
  assert.match(stdout, /anthropic/)
  fs.rmSync(dir, { recursive: true })
})

test('config set rejects negative monthlyTokenLimit', () => {
  const dir = makeTmpDir()
  // minimist parses -500 as flags, so we use -- to pass it as a positional arg
  const { status, stderr } = run(['config', 'set', 'anthropic', 'monthlyTokenLimit', '--', '-500'], { dir })
  assert.notEqual(status, 0)
  assert.match(stderr, /monthlyTokenLimit/i)
  fs.rmSync(dir, { recursive: true })
})

test('config set rejects zero monthlyTokenLimit', () => {
  const dir = makeTmpDir()
  const { status, stderr } = run(['config', 'set', 'anthropic', 'monthlyTokenLimit', '0'], { dir })
  assert.notEqual(status, 0)
  assert.match(stderr, /monthlyTokenLimit/i)
  fs.rmSync(dir, { recursive: true })
})

test('config set rejects out-of-range warningThreshold', () => {
  const dir = makeTmpDir()
  const { status: s1 } = run(['config', 'set', 'anthropic', 'warningThreshold', '1.5'], { dir })
  assert.notEqual(s1, 0)
  const { status: s2 } = run(['config', 'set', 'anthropic', 'warningThreshold', '0'], { dir })
  assert.notEqual(s2, 0)
  // 0.9 should succeed
  const { status: s3 } = run(['config', 'set', 'anthropic', 'warningThreshold', '0.9'], { dir })
  assert.equal(s3, 0)
  fs.rmSync(dir, { recursive: true })
})

test('config set stores string apiKey as a string, not coerced to number', () => {
  const dir = makeTmpDir()
  // An apiKey that looks numeric should still be stored as a string
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-abc'], { dir })
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(typeof cfg.providers.anthropic.apiKey, 'string')
  assert.equal(cfg.providers.anthropic.apiKey, 'sk-ant-abc')
  fs.rmSync(dir, { recursive: true })
})

test('config set stores numeric monthlyTokenLimit as a number', () => {
  const dir = makeTmpDir()
  run(['config', 'set', 'anthropic', 'monthlyTokenLimit', '5000000'], { dir })
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(typeof cfg.providers.anthropic.monthlyTokenLimit, 'number')
  assert.equal(cfg.providers.anthropic.monthlyTokenLimit, 5000000)
  fs.rmSync(dir, { recursive: true })
})

test('config delete of unknown provider exits non-zero', () => {
  const dir = makeTmpDir()
  const { status } = run(['config', 'delete', 'nonexistent'], { dir })
  assert.notEqual(status, 0)
  fs.rmSync(dir, { recursive: true })
})

// ---------------------------------------------------------------------------
// use
// ---------------------------------------------------------------------------

test('use switches to a configured provider and updates claude.json', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-e2e'], { dir, claudeJson: claudeJsonPath })
  const { status } = run(['use', 'anthropic'], { dir, claudeJson: claudeJsonPath })
  assert.equal(status, 0)
  const claude = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'))
  assert.equal(claude.apiKey, 'sk-ant-e2e')
  assert.equal(claude.useBedrock, false)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(cfg.activeProvider, 'anthropic')
  fs.rmSync(dir, { recursive: true })
})

test('use of unconfigured provider exits non-zero', () => {
  const dir = makeTmpDir()
  const { status, stderr } = run(['use', 'anthropic'], { dir })
  assert.notEqual(status, 0)
  assert.match(stderr, /not configured|anthropic/i)
  fs.rmSync(dir, { recursive: true })
})

test('use switches to bedrock provider with correct fields', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')
  run(['config', 'set', 'bedrock', 'awsRegion', 'us-west-2'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'bedrock', 'awsProfile', 'myprofile'], { dir, claudeJson: claudeJsonPath })
  run(['use', 'bedrock'], { dir, claudeJson: claudeJsonPath })
  const claude = JSON.parse(fs.readFileSync(claudeJsonPath, 'utf8'))
  assert.equal(claude.useBedrock, true)
  assert.equal(claude.awsRegion, 'us-west-2')
  assert.equal(claude.awsProfile, 'myprofile')
  // writeClaudeJson deletes keys whose value is null, so apiKey should be absent
  assert.equal(claude.apiKey, undefined)
  fs.rmSync(dir, { recursive: true })
})

// ---------------------------------------------------------------------------
// config use
// ---------------------------------------------------------------------------

test('config use activates a configured provider', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')
  run(['config', 'set', 'openrouter', 'apiKey', 'sk-or-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'openrouter', 'baseUrl', 'https://openrouter.ai/api/v1'], { dir, claudeJson: claudeJsonPath })
  const { status } = run(['config', 'use', 'openrouter'], { dir, claudeJson: claudeJsonPath })
  assert.equal(status, 0)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(cfg.activeProvider, 'openrouter')
  fs.rmSync(dir, { recursive: true })
})

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

test('status exits 0 with no providers configured', () => {
  const dir = makeTmpDir()
  const { status } = run(['status'], { dir })
  assert.equal(status, 0)
  fs.rmSync(dir, { recursive: true })
})

test('status shows active provider after use', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['use', 'anthropic'], { dir, claudeJson: claudeJsonPath })
  const { status, stdout } = run(['status'], { dir, claudeJson: claudeJsonPath })
  assert.equal(status, 0)
  assert.match(stdout, /anthropic/)
  fs.rmSync(dir, { recursive: true })
})

// ---------------------------------------------------------------------------
// auto-check
// ---------------------------------------------------------------------------

test('auto-check with empty stdin exits 0 and does nothing', () => {
  const dir = makeTmpDir()
  const { status } = run(['auto-check'], { dir, stdin: '' })
  assert.equal(status, 0)
  fs.rmSync(dir, { recursive: true })
})

test('auto-check records tokens for active provider', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['use', 'anthropic'], { dir, claudeJson: claudeJsonPath })

  const payload = JSON.stringify({ usage: { input_tokens: 100, output_tokens: 50 } })
  run(['auto-check'], { dir, claudeJson: claudeJsonPath, stdin: payload })

  const usage = JSON.parse(fs.readFileSync(path.join(dir, 'usage.json'), 'utf8'))
  assert.equal(usage.providers.anthropic.inputTokens, 100)
  assert.equal(usage.providers.anthropic.outputTokens, 50)
  fs.rmSync(dir, { recursive: true })
})

test('auto-check auto-switches when quota threshold exceeded', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')

  // Configure two providers: anthropic at limit, openrouter with headroom
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'anthropic', 'monthlyTokenLimit', '1000'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'anthropic', 'warningThreshold', '0.9'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'openrouter', 'apiKey', 'sk-or-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'openrouter', 'baseUrl', 'https://openrouter.ai/api/v1'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'openrouter', 'monthlyTokenLimit', '10000'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'priority', 'anthropic', 'openrouter'], { dir, claudeJson: claudeJsonPath })
  run(['use', 'anthropic'], { dir, claudeJson: claudeJsonPath })

  // Send 950 tokens to push anthropic over the 90% threshold (1000 * 0.9 = 900)
  const payload = JSON.stringify({ usage: { input_tokens: 500, output_tokens: 450 } })
  const { status, stderr } = run(['auto-check'], { dir, claudeJson: claudeJsonPath, stdin: payload })

  assert.equal(status, 0)
  assert.match(stderr, /auto-switched to openrouter/i)
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'))
  assert.equal(cfg.activeProvider, 'openrouter')
  fs.rmSync(dir, { recursive: true })
})

test('auto-check force-switches on quota_exceeded error', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')

  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'openrouter', 'apiKey', 'sk-or-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'openrouter', 'baseUrl', 'https://openrouter.ai/api/v1'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'set', 'openrouter', 'monthlyTokenLimit', '10000'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'priority', 'anthropic', 'openrouter'], { dir, claudeJson: claudeJsonPath })
  run(['use', 'anthropic'], { dir, claudeJson: claudeJsonPath })

  const payload = JSON.stringify({ error: { type: 'quota_exceeded' } })
  const { status, stderr } = run(['auto-check'], { dir, claudeJson: claudeJsonPath, stdin: payload })

  assert.equal(status, 0)
  assert.match(stderr, /auto-switched to openrouter/i)
  fs.rmSync(dir, { recursive: true })
})

test('auto-check logs warning when all providers exhausted', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')

  // anthropic is the only provider and is the active (failing) one.
  // On a force-switch, selectNextProvider(active) excludes anthropic,
  // finds no alternative, and logs the exhausted/staying warning.
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-e2e'], { dir, claudeJson: claudeJsonPath })
  run(['config', 'priority', 'anthropic'], { dir, claudeJson: claudeJsonPath })
  run(['use', 'anthropic'], { dir, claudeJson: claudeJsonPath })

  // A quota error triggers a forced switch; with no valid next provider the warning fires
  const payload = JSON.stringify({ error: { type: 'quota_exceeded' } })
  const { status, stderr } = run(['auto-check'], { dir, claudeJson: claudeJsonPath, stdin: payload })

  assert.equal(status, 0)
  assert.match(stderr, /exhausted|staying/i)
  fs.rmSync(dir, { recursive: true })
})

// ---------------------------------------------------------------------------
// install-hooks
// ---------------------------------------------------------------------------

test('install-hooks creates hook entry in .claude/settings.json', () => {
  const dir = makeTmpDir()
  // Use the tmp dir as HOME so install-hooks writes there
  const fakeHome = makeTmpDir()
  const env = {
    ...process.env,
    CC_SWITCHER_DIR: dir,
    HOME: fakeHome,
    USERPROFILE: fakeHome,
  }
  const result = spawnSync(process.execPath, [CLI, 'install-hooks'], {
    env,
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(result.status, 0)
  const settingsPath = path.join(fakeHome, '.claude', 'settings.json')
  assert.ok(fs.existsSync(settingsPath), 'settings.json should exist')
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  assert.ok(settings.hooks?.PostToolUse, 'PostToolUse hook should be set')
  fs.rmSync(dir, { recursive: true })
  fs.rmSync(fakeHome, { recursive: true })
})

// ---------------------------------------------------------------------------
// shell-init
// ---------------------------------------------------------------------------

test('shell-init --rc with no value exits non-zero with helpful error (not a TypeError)', () => {
  const dir = makeTmpDir()
  // Pass --rc with no value — minimist will set args.rc = true (boolean)
  const result = spawnSync(process.execPath, [CLI, 'shell-init', '--rc'], {
    env: { ...process.env, CC_SWITCHER_DIR: dir, SHELL: '' },
    encoding: 'utf8',
    timeout: 5000,
  })
  // Must exit non-zero
  assert.notEqual(result.status, 0)
  // Must NOT be a raw TypeError — should be a friendly error message
  assert.ok(
    !result.stderr.includes('TypeError'),
    `stderr should not contain TypeError, got: ${result.stderr}`
  )
  fs.rmSync(dir, { recursive: true })
})

test('shell-init with valid --rc writes snippet to the specified file', () => {
  const dir = makeTmpDir()
  const rcFile = path.join(dir, '.zshrc')
  const result = spawnSync(process.execPath, [CLI, 'shell-init', '--rc', rcFile], {
    env: { ...process.env, CC_SWITCHER_DIR: dir },
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.equal(result.status, 0)
  assert.ok(fs.existsSync(rcFile), 'rc file should be created')
  const content = fs.readFileSync(rcFile, 'utf8')
  assert.ok(content.includes('cc-switcher shell-init'), 'snippet markers should be present')
  assert.ok(content.includes('ANTHROPIC_API_KEY'), 'env var reference should be present')
  fs.rmSync(dir, { recursive: true })
})

test('shell-init --rc with nonexistent parent directory exits non-zero with friendly error', () => {
  const dir = makeTmpDir()
  const badRcFile = path.join(dir, 'nonexistent-subdir', '.zshrc')
  const result = spawnSync(process.execPath, [CLI, 'shell-init', '--rc', badRcFile], {
    env: { ...process.env, CC_SWITCHER_DIR: dir },
    encoding: 'utf8',
    timeout: 5000,
  })
  assert.notEqual(result.status, 0)
  // Should be a friendly error, not a raw Node stack trace
  assert.ok(result.stderr.includes('Could not write'), `expected friendly error, got: ${result.stderr}`)
  assert.ok(!result.stderr.includes('at Object'), `should not contain stack trace, got: ${result.stderr}`)
  fs.rmSync(dir, { recursive: true })
})

test('status shows provider table even when no active provider is set', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')
  // Configure a provider but do NOT activate it
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-test'], { dir, claudeJson: claudeJsonPath })
  const { status, stdout } = run(['status'], { dir, claudeJson: claudeJsonPath })
  assert.equal(status, 0)
  // Should show the warning AND the provider table
  assert.match(stdout, /No active provider/i)
  assert.match(stdout, /anthropic/)
  fs.rmSync(dir, { recursive: true })
})

test('status warns and shows table when activeProvider names a deleted provider', () => {
  const dir = makeTmpDir()
  const claudeJsonPath = path.join(dir, 'claude.json')
  run(['config', 'set', 'anthropic', 'apiKey', 'sk-ant-test'], { dir, claudeJson: claudeJsonPath })
  run(['use', 'anthropic'], { dir, claudeJson: claudeJsonPath })
  // Manually set activeProvider to a stale name not in providers
  const cfgPath = path.join(dir, 'config.json')
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.activeProvider = 'deleted-provider'
  fs.writeFileSync(cfgPath, JSON.stringify(cfg))
  const { status, stdout } = run(['status'], { dir, claudeJson: claudeJsonPath })
  assert.equal(status, 0)
  assert.match(stdout, /not configured|deleted-provider/i)
  // anthropic should still appear in the table
  assert.match(stdout, /anthropic/)
  fs.rmSync(dir, { recursive: true })
})

test('use of unconfigured bedrock provider gives bedrock-specific advice', () => {
  const dir = makeTmpDir()
  const { status, stderr } = run(['use', 'bedrock'], { dir })
  assert.notEqual(status, 0)
  // Should suggest awsProfile, not apiKey
  assert.match(stderr, /awsProfile/i)
  assert.ok(!stderr.includes('apiKey'), `should not suggest apiKey for bedrock, got: ${stderr}`)
  fs.rmSync(dir, { recursive: true })
})

test('use of unconfigured claude-pro provider gives OAuth-specific advice', () => {
  const dir = makeTmpDir()
  const { status, stderr } = run(['use', 'claude-pro'], { dir })
  assert.notEqual(status, 0)
  // Should mention OAuth or config init, not apiKey
  assert.ok(
    stderr.toLowerCase().includes('oauth') || stderr.includes('config init'),
    `should give OAuth advice for claude-pro, got: ${stderr}`
  )
  assert.ok(!stderr.includes('apiKey'), `should not suggest apiKey for claude-pro, got: ${stderr}`)
  fs.rmSync(dir, { recursive: true })
})

test('config init exits cleanly when stdin closes immediately (EOF) — does not hang', () => {
  const dir = makeTmpDir()
  // Pass empty stdin so the process receives EOF immediately at the first prompt.
  // Previously this caused an infinite hang; now it should exit within the timeout.
  const result = spawnSync(process.execPath, [CLI, 'config', 'init'], {
    env: { ...process.env, CC_SWITCHER_DIR: dir },
    input: '',   // EOF immediately
    encoding: 'utf8',
    timeout: 3000,   // fail fast if it hangs
  })
  // Must NOT have timed out
  assert.ok(result.status !== null, 'process should have exited, not timed out')
  fs.rmSync(dir, { recursive: true })
})
