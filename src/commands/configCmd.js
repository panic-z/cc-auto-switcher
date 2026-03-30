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
  // Coerce numeric strings to numbers
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
