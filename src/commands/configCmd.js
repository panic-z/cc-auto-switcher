// src/commands/configCmd.js
'use strict'
const readline = require('readline')
const chalk = require('chalk')
const { setProviderConfig, readConfig, writeConfig } = require('../config')
const { PROVIDER_TYPES } = require('../providers')
const { switchTo } = require('../switcher')

function cmdConfigSet(args) {
  // cc-switcher config set <provider> <key> <value>
  const [, , provider, key, value] = args._
  if (!provider || !key || value === undefined) {
    console.error(chalk.red('Usage: cc-switcher config set <provider> <key> <value>'))
    console.error(`Built-in types: ${PROVIDER_TYPES.join(', ')}`)
    console.error('Example: cc-switcher config set anthropic apiKey sk-ant-...')
    console.error('Example: cc-switcher config set anthropic-work type anthropic')
    process.exit(1)
  }
  // If setting the type field, validate it's a known type
  if (key === 'type' && !PROVIDER_TYPES.includes(value)) {
    console.error(chalk.red(`Unknown provider type: ${value}`))
    console.error(`Valid types: ${PROVIDER_TYPES.join(', ')}`)
    process.exit(1)
  }
  // Coerce numeric strings to numbers
  const coerced = isNaN(Number(value)) ? value : Number(value)
  setProviderConfig(provider, key, coerced)
  console.log(chalk.green(`Set ${provider}.${key}`))
}

function cmdConfigPriority(args) {
  // cc-switcher config priority <p1> <p2> ...
  const providers = args._.slice(2)
  if (providers.length === 0) {
    const config = readConfig()
    console.log('Current priority:', config.priority.join(', '))
    return
  }
  const config = readConfig()
  config.priority = providers
  writeConfig(config)
  console.log(chalk.green(`Priority set: ${providers.join(', ')}`))
}

function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve))
}

async function cmdConfigInit() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log(chalk.bold('\ncc-switcher setup wizard'))
  console.log('Press Enter to skip a provider.\n')

  const config = readConfig()

  for (const name of PROVIDER_TYPES) {
    console.log(chalk.cyan(`\n── ${name} ──`))
    if (name === 'bedrock') {
      const profile = await ask(rl, `  AWS profile [default]: `)
      const region = await ask(rl, `  AWS region [us-east-1]: `)
      const model = await ask(rl, `  Model (optional): `)
      const limit = await ask(rl, `  Monthly token limit [5000000]: `)
      if (profile || region || model || limit) {
        if (!config.providers.bedrock) config.providers.bedrock = {}
        config.providers.bedrock.awsProfile = profile || 'default'
        config.providers.bedrock.awsRegion = region || 'us-east-1'
        if (model) config.providers.bedrock.model = model
        config.providers.bedrock.monthlyTokenLimit = Number(limit) || 5000000
        config.providers.bedrock.warningThreshold = 0.9
      }
    } else {
      const apiKey = await ask(rl, `  API key: `)
      const defaultBaseUrl = name === 'openrouter' ? 'https://openrouter.ai/api/v1' : name === 'openai' ? 'https://api.openai.com/v1' : ''
      const baseUrlPrompt = defaultBaseUrl ? `  Base URL [${defaultBaseUrl}]: ` : `  Base URL (optional): `
      const baseUrl = await ask(rl, baseUrlPrompt)
      const model = await ask(rl, `  Model (optional): `)
      const limit = await ask(rl, `  Monthly token limit: `)
      if (apiKey) {
        if (!config.providers[name]) config.providers[name] = {}
        config.providers[name].apiKey = apiKey
        config.providers[name].baseUrl = baseUrl || defaultBaseUrl || undefined
        if (!config.providers[name].baseUrl) delete config.providers[name].baseUrl
        if (model) config.providers[name].model = model
        if (limit) config.providers[name].monthlyTokenLimit = Number(limit)
        config.providers[name].warningThreshold = 0.9
      }
    }
  }

  const firstConfigured = PROVIDER_TYPES.find(n => config.providers[n])
  if (firstConfigured && !config.activeProvider) {
    config.activeProvider = firstConfigured
  }

  writeConfig(config)
  rl.close()
  console.log(chalk.green('\nConfiguration saved.'))
  if (config.activeProvider) {
    try {
      switchTo(config.activeProvider)
      console.log(`Active provider: ${config.activeProvider}`)
    } catch (err) {
      console.log(chalk.yellow(`Note: Could not apply provider to Claude Code: ${err.message}`))
      console.log(`Run: cc-switcher use ${config.activeProvider}`)
    }
  }
}

module.exports = { cmdConfigSet, cmdConfigPriority, cmdConfigInit }
