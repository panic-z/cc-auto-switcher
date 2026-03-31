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

  async function menu(title, options) {
    console.log(chalk.cyan('\n' + title))
    options.forEach((opt, i) => console.log(`  ${i + 1}) ${opt}`))
    while (true) {
      const ans = (await ask(rl, `\n> `)).trim()
      const n = parseInt(ans)
      if (n >= 1 && n <= options.length) return n - 1
      console.log(chalk.yellow(`Please enter 1-${options.length}`))
    }
  }

  async function configureProvider(config, providerName, providerType) {
    const existing = config.providers[providerName] || {}
    console.log(chalk.cyan(`\n── Configure ${providerName} (${providerType}) ──`))

    if (providerType === 'bedrock') {
      const profile = (await ask(rl, `  AWS profile [${existing.awsProfile || 'default'}]: `)).trim()
      const region = (await ask(rl, `  AWS region [${existing.awsRegion || 'us-east-1'}]: `)).trim()
      const model = (await ask(rl, `  Model (optional)${existing.model ? ` [${existing.model}]` : ''}: `)).trim()
      const limitDefault = existing.monthlyTokenLimit || 5000000
      const limit = (await ask(rl, `  Monthly token limit [${limitDefault}]: `)).trim()

      if (!config.providers[providerName]) config.providers[providerName] = {}
      if (providerName !== providerType) config.providers[providerName].type = providerType
      config.providers[providerName].awsProfile = profile || existing.awsProfile || 'default'
      config.providers[providerName].awsRegion = region || existing.awsRegion || 'us-east-1'
      if (model) config.providers[providerName].model = model
      else if (existing.model) config.providers[providerName].model = existing.model
      config.providers[providerName].monthlyTokenLimit = Number(limit) || limitDefault
      config.providers[providerName].warningThreshold = existing.warningThreshold || 0.9
      console.log(chalk.green(`\nProvider '${providerName}' configured.`))
    } else {
      const keyLabel = existing.apiKey ? 'Auth token / API key [****]' : 'Auth token / API key'
      const apiKey = (await ask(rl, `  ${keyLabel}: `)).trim()

      const defaultBaseUrl =
        providerType === 'openrouter' ? 'https://openrouter.ai/api/v1' :
        providerType === 'openai' ? 'https://api.openai.com/v1' : ''
      const currentBaseUrl = existing.baseUrl || defaultBaseUrl
      const baseUrlPrompt = currentBaseUrl
        ? `  Base URL [${currentBaseUrl}]: `
        : `  Base URL (optional): `
      const baseUrl = (await ask(rl, baseUrlPrompt)).trim()

      const model = (await ask(rl, `  Model (optional)${existing.model ? ` [${existing.model}]` : ''}: `)).trim()
      const limitDefault = existing.monthlyTokenLimit ? String(existing.monthlyTokenLimit) : ''
      const limit = (await ask(rl, `  Monthly token limit${limitDefault ? ` [${limitDefault}]` : ''}: `)).trim()

      const resolvedKey = apiKey || existing.apiKey
      if (!resolvedKey) {
        console.log(chalk.yellow(`\nSkipped '${providerName}' (no auth token provided).`))
        return false
      }

      if (!config.providers[providerName]) config.providers[providerName] = {}
      if (providerName !== providerType) config.providers[providerName].type = providerType
      config.providers[providerName].apiKey = resolvedKey

      const resolvedBaseUrl = baseUrl || currentBaseUrl
      if (resolvedBaseUrl) config.providers[providerName].baseUrl = resolvedBaseUrl
      else delete config.providers[providerName].baseUrl

      if (model) config.providers[providerName].model = model
      else if (existing.model) config.providers[providerName].model = existing.model

      const resolvedLimit = limit ? Number(limit) : (existing.monthlyTokenLimit || undefined)
      if (resolvedLimit) config.providers[providerName].monthlyTokenLimit = resolvedLimit
      config.providers[providerName].warningThreshold = existing.warningThreshold || 0.9
      console.log(chalk.green(`\nProvider '${providerName}' configured.`))
    }

    if (!config.priority.includes(providerName)) config.priority.push(providerName)
    return true
  }

  console.log(chalk.bold('\ncc-switcher setup wizard'))

  const config = readConfig()

  while (true) {
    const existingNames = Object.keys(config.providers)
    const menuOptions = ['Add / edit a provider', 'Set active provider', 'Set priority order', 'Done']
    const choice = await menu('What would you like to do?', menuOptions)

    if (choice === 0) {
      if (existingNames.length > 0) {
        console.log(chalk.dim(`  Existing: ${existingNames.join(', ')}`))
      }
      const nameInput = (await ask(rl, '  Provider name (or leave blank to pick a built-in type): ')).trim()

      let providerName, providerType

      if (!nameInput) {
        const typeIdx = await menu('Select provider type:', PROVIDER_TYPES)
        providerType = PROVIDER_TYPES[typeIdx]
        providerName = providerType
      } else {
        providerName = nameInput
        if (PROVIDER_TYPES.includes(providerName)) {
          providerType = providerName
        } else {
          const existing = config.providers[providerName]
          const existingType = existing && existing.type
          const typeIdx = await menu(
            `Provider type for '${providerName}':`,
            PROVIDER_TYPES.map(t => (t === existingType ? `${t} (current)` : t))
          )
          providerType = PROVIDER_TYPES[typeIdx]
        }
      }

      await configureProvider(config, providerName, providerType)

    } else if (choice === 1) {
      const names = Object.keys(config.providers)
      if (names.length === 0) {
        console.log(chalk.yellow('  No providers configured yet.'))
        continue
      }
      const idx = await menu('Select active provider:', names.map(n => n === config.activeProvider ? `${n} (current)` : n))
      config.activeProvider = names[idx]
      console.log(chalk.green(`  Active provider: ${config.activeProvider}`))

    } else if (choice === 2) {
      const current = config.priority.length > 0 ? config.priority : Object.keys(config.providers)
      console.log(chalk.dim(`  Current: ${current.join(', ')}`))
      const input = (await ask(rl, '  Enter priority order (space-separated): ')).trim()
      if (input) {
        config.priority = input.split(/\s+/)
        console.log(chalk.green(`  Priority: ${config.priority.join(', ')}`))
      }

    } else {
      break
    }
  }

  if (!config.activeProvider) {
    const first = config.priority.find(n => config.providers[n]) || Object.keys(config.providers)[0]
    if (first) config.activeProvider = first
  }

  writeConfig(config)
  rl.close()
  console.log(chalk.green('\nConfiguration saved.'))
  if (config.activeProvider) {
    try {
      switchTo(config.activeProvider)
      console.log(`Active provider: ${config.activeProvider}`)
    } catch (err) {
      console.log(chalk.yellow(`Note: Could not apply provider: ${err.message}`))
      console.log(`Run: cc-switcher use ${config.activeProvider}`)
    }
  }
}

module.exports = { cmdConfigSet, cmdConfigPriority, cmdConfigInit }
