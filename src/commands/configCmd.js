// src/commands/configCmd.js
'use strict'
const readline = require('readline')
const chalk = require('chalk')
const { setProviderConfig, readConfig, writeConfig, deleteProviderConfig } = require('../config')
const { PROVIDER_TYPES } = require('../providers')
const { switchTo, readClaudeJson } = require('../switcher')

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
  // Coerce numeric strings to numbers, but only if the value is a non-empty
  // string that parses entirely as a finite number.
  // Avoids Number('') === 0 turning empty-string values into the number 0.
  const num = Number(value)
  const coerced = (typeof value === 'string' && value.trim() !== '' && !isNaN(num) && isFinite(num))
    ? num
    : value
  // Reject nonsensical values for known numeric fields
  if (key === 'monthlyTokenLimit' && (typeof coerced !== 'number' || coerced <= 0)) {
    console.error(chalk.red('monthlyTokenLimit must be a positive integer'))
    process.exit(1)
  }
  if (key === 'warningThreshold' && (typeof coerced !== 'number' || coerced <= 0 || coerced > 1)) {
    console.error(chalk.red('warningThreshold must be a number between 0 (exclusive) and 1 (inclusive)'))
    process.exit(1)
  }
  // Single read-modify-write instead of 3 separate round-trips.
  // This reduces the TOCTOU window and eliminates redundant disk I/O.
  const config = readConfig()
  if (!config.providers[provider]) config.providers[provider] = {}
  config.providers[provider][key] = coerced

  // Add provider to priority list if not already present
  if (!config.priority.includes(provider)) {
    config.priority.push(provider)
  }

  // When registering a claude-pro provider, capture the current oauthAccount
  // from ~/.claude.json so it can be restored when switching back later
  if (key === 'type' && value === 'claude-pro') {
    const currentJson = readClaudeJson()
    if (currentJson.oauthAccount) {
      config.providers[provider].oauthAccount = currentJson.oauthAccount
      if (!config.savedOauthAccount) config.savedOauthAccount = currentJson.oauthAccount
    }
  }

  writeConfig(config)

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
  return new Promise((resolve) => {
    // If readline is already closed (e.g. stdin EOF was received), resolve
    // immediately with '' rather than hanging forever waiting for a callback
    // that rl.question() will never call on a closed interface.
    if (rl.closed) return resolve('')
    let answered = false
    const onClose = () => { if (!answered) { answered = true; resolve('') } }
    rl.once('close', onClose)
    rl.question(question, (answer) => {
      answered = true
      rl.removeListener('close', onClose)
      resolve(answer)
    })
  })
}

async function cmdConfigInit() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  async function menu(title, options) {
    console.log(chalk.cyan('\n' + title))
    options.forEach((opt, i) => console.log(`  ${i + 1}) ${opt}`))
    while (true) {
      const ans = (await ask(rl, `\n> `)).trim()
      // If stdin was closed mid-prompt, bail out cleanly instead of looping forever.
      if (rl.closed) throw new Error('Input closed unexpectedly. Exiting wizard.')
      const n = parseInt(ans)
      if (n >= 1 && n <= options.length) return n - 1
      console.log(chalk.yellow(`Please enter 1-${options.length}`))
    }
  }

  async function configureProvider(config, providerName, providerType) {
    const existing = config.providers[providerName] || {}
    console.log(chalk.cyan(`\n── Configure ${providerName} (${providerType}) ──`))

    if (providerType === 'claude-pro') {
      const currentJson = readClaudeJson()
      const oauthAccount = currentJson.oauthAccount
      if (!oauthAccount) {
        console.log(chalk.yellow(`\n  No active Claude Pro session found in ~/.claude.json.`))
        console.log(chalk.yellow(`  Make sure you're logged in (run: claude /login) before registering claude-pro.`))
        return false
      }
      if (!config.providers[providerName]) config.providers[providerName] = {}
      if (providerName !== providerType) config.providers[providerName].type = providerType
      config.providers[providerName].oauthAccount = oauthAccount
      if (!config.priority.includes(providerName)) config.priority.push(providerName)
      console.log(chalk.green(`\nProvider '${providerName}' registered (${oauthAccount?.emailAddress || JSON.stringify(oauthAccount)}).`))
      return true
    } else if (providerType === 'bedrock') {
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
      // Validate the entered limit: blank = keep default, positive number = use it,
      // anything else (zero, negative, non-numeric) = warn and use default.
      let parsedLimit = limitDefault
      if (limit !== '') {
        const n = Number(limit)
        if (isNaN(n) || n <= 0) {
          console.log(chalk.yellow(`  Invalid limit "${limit}" — using default ${limitDefault}.`))
        } else {
          parsedLimit = n
        }
      }
      config.providers[providerName].monthlyTokenLimit = parsedLimit
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
      if (limit !== '' && (isNaN(resolvedLimit) || resolvedLimit <= 0)) {
        console.log(chalk.yellow(`  Invalid limit "${limit}" — skipped. Leave blank to keep existing value.`))
      } else if (resolvedLimit && resolvedLimit > 0) {
        config.providers[providerName].monthlyTokenLimit = resolvedLimit
      }
      config.providers[providerName].warningThreshold = existing.warningThreshold || 0.9
      console.log(chalk.green(`\nProvider '${providerName}' configured.`))
    }

    if (!config.priority.includes(providerName)) config.priority.push(providerName)
    return true
  }

  console.log(chalk.bold('\ncc-switcher setup wizard'))

  const config = readConfig()

  try {
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
  } finally {
    // Always close readline — even if an error is thrown mid-wizard — to release
    // stdin and allow the process to exit cleanly.
    rl.close()
  }
}

function cmdConfigDelete(args) {
  // cc-switcher config delete <provider>
  const provider = args._[2]
  if (!provider) {
    console.error(chalk.red('Usage: cc-switcher config delete <provider>'))
    const config = readConfig()
    const names = Object.keys(config.providers)
    if (names.length) console.error(`Configured providers: ${names.join(', ')}`)
    process.exit(1)
  }
  const removed = deleteProviderConfig(provider)
  if (!removed) {
    console.error(chalk.red(`Provider "${provider}" not found.`))
    process.exit(1)
  }
  console.log(chalk.green(`Deleted provider: ${provider}`))
}

function cmdConfigUse(args) {
  // cc-switcher config use <provider>  — immediately activate a configured provider
  const provider = args._[2]
  if (!provider) {
    console.error(chalk.red('Usage: cc-switcher config use <provider>'))
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

module.exports = { cmdConfigSet, cmdConfigPriority, cmdConfigInit, cmdConfigDelete, cmdConfigUse }
