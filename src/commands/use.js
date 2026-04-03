// src/commands/use.js
'use strict'
const chalk = require('chalk')
const { switchTo } = require('../switcher')
const { readConfig } = require('../config')

function cmdUse(args) {
  const provider = args._[1]
  if (!provider) {
    console.error(chalk.red('Usage: cc-switcher use <provider>'))
    const config = readConfig()
    const names = Object.keys(config.providers)
    if (names.length) console.error(`Configured providers: ${names.join(', ')}`)
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
