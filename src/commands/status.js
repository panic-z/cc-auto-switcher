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
