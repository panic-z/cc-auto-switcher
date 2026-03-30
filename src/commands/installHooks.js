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
