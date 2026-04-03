// src/commands/status.js
'use strict'
const chalk = require('chalk')
const { readConfig } = require('../config')
const { readUsage } = require('../tracker')
const { getProviderType } = require('../providers')

function fmtTokens(n) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(n)
}

// ANSI escape codes are invisible but count toward String.length.
// padEnd() must account for the extra invisible bytes so visual columns align.
function visualPadEnd(str, width) {
  // Strip all ANSI CSI sequences to find the visible character count
  const visibleLen = str.replace(/\x1b\[[0-9;]*m/g, '').length
  const pad = width - visibleLen
  return pad > 0 ? str + ' '.repeat(pad) : str
}

function cmdStatus() {
  const config = readConfig()
  const usage = readUsage()

  if (!config.activeProvider) {
    console.log(chalk.yellow('No active provider. Run: cc-switcher config init'))
    // Don't return — still show any configured providers below so the user
    // can see what's available and choose what to activate.
    if (Object.keys(config.providers).length === 0) return
  } else if (!config.providers[config.activeProvider]) {
    // activeProvider names a provider that no longer exists in config (stale / manually edited)
    console.log(chalk.yellow(
      `Active provider "${config.activeProvider}" is not configured. Run: cc-switcher config init`
    ))
    if (Object.keys(config.providers).length === 0) return
  }

  // Show all configured providers in priority order, then any remaining
  const prioritySet = new Set(config.priority || [])
  const allNames = [
    ...(config.priority || []).filter(n => config.providers[n]),
    ...Object.keys(config.providers).filter(n => !prioritySet.has(n))
  ]

  const COL = { provider: 18, used: 12, limit: 12, pct: 7 }
  const header = [
    'Provider'.padEnd(COL.provider),
    'Used'.padEnd(COL.used),
    'Limit'.padEnd(COL.limit),
    '%'.padEnd(COL.pct),
    'Status'
  ].join('')
  console.log(chalk.bold(header))
  console.log('─'.repeat(64))

  for (const name of allNames) {
    const pConfig = config.providers[name]
    if (!pConfig) continue
    const type = getProviderType(name, pConfig)
    const u = usage.providers[name] || { inputTokens: 0, outputTokens: 0 }
    const used = (Number(u.inputTokens) || 0) + (Number(u.outputTokens) || 0)
    const limit = pConfig.monthlyTokenLimit || 0
    const pct = limit > 0 ? Math.round((used / limit) * 100) : 0
    const threshold = pConfig.warningThreshold || 0.9
    const isActive = name === config.activeProvider

    const indicator = isActive ? chalk.green('●') : ' '
    const label = name + (type !== name ? chalk.gray(` (${type})`) : '')
    // Use visualPadEnd so ANSI escape codes from chalk don't throw off column widths
    const providerTarget = COL.provider + 2 + (type !== name ? type.length + 3 : 0)
    const providerStr = visualPadEnd(indicator + ' ' + label, providerTarget)
    const usedStr = (fmtTokens(used) + ' tok').padEnd(COL.used)
    const limitStr = (limit > 0 ? fmtTokens(limit) : 'unconfigured').padEnd(COL.limit)
    const pctStr = (limit > 0 ? `${pct}%` : '-').padEnd(COL.pct)

    let statusStr
    if (isActive) {
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
  console.log(`Priority: ${(config.priority || []).join(', ')}`)
}

module.exports = { cmdStatus }
