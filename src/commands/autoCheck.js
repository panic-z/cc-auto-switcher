// src/commands/autoCheck.js
'use strict'
const { getActiveProvider } = require('../config')
const { addTokens } = require('../tracker')
const { switchTo, selectNextProvider } = require('../switcher')
const { isQuotaExceededError } = require('../providers')

async function readStdin() {
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    if (process.stdin.isTTY) resolve('')
  })
}

function extractUsageFromPayload(raw) {
  try {
    const payload = JSON.parse(raw)
    const usage = payload?.tool_result?.usage || payload?.usage || {}
    return {
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      errorCode: payload?.tool_result?.error?.type || payload?.error?.type || null
    }
  } catch {
    return { inputTokens: 0, outputTokens: 0, errorCode: null }
  }
}

async function cmdAutoCheck() {
  const raw = await readStdin()
  const { inputTokens, outputTokens, errorCode } = extractUsageFromPayload(raw)

  const active = getActiveProvider()
  if (active && (inputTokens > 0 || outputTokens > 0)) {
    addTokens(active, inputTokens, outputTokens)
  }

  const forceSwitch = errorCode && isQuotaExceededError(errorCode)
  if (!forceSwitch) {
    const next = selectNextProvider()
    if (!next || next === active) return
  }

  const next = selectNextProvider()
  if (!next) {
    process.stderr.write('[cc-switcher] All providers exhausted — staying on current provider\n')
    return
  }
  try {
    switchTo(next)
    process.stderr.write(`[cc-switcher] Auto-switched to ${next}\n`)
  } catch (err) {
    process.stderr.write(`[cc-switcher] Switch failed: ${err.message}\n`)
  }
}

module.exports = { cmdAutoCheck, extractUsageFromPayload }
