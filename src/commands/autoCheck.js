// src/commands/autoCheck.js
'use strict'
const { getActiveProvider } = require('../config')
const { addTokens } = require('../tracker')
const { switchTo, selectNextProvider } = require('../switcher')
const { isQuotaExceededError } = require('../providers')

async function readStdin() {
  // Resolve immediately on a TTY — no data will be piped from the hook runner.
  // Do this BEFORE attaching listeners to avoid dangling 'data'/'end' handlers
  // that would keep the event loop alive and prevent a clean process exit.
  if (process.stdin.isTTY) return ''
  return new Promise((resolve) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => { data += chunk })
    process.stdin.on('end', () => resolve(data))
    // Safety timeout: if the pipe is never closed (e.g. hook runner crash),
    // resolve with whatever we have so the process doesn't hang forever.
    setTimeout(() => resolve(data), 5000).unref()
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
  // When force-switching due to a quota error, exclude the current (failing) provider
  // so we don't "switch" right back to the provider that just errored.
  const next = forceSwitch ? selectNextProvider(active) : selectNextProvider()

  // No switch needed: not forced and either no next provider or already on the best one
  if (!forceSwitch && (!next || next === active)) return

  // Nothing to switch to
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
