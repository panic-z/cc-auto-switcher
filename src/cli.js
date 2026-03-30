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
