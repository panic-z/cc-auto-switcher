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
