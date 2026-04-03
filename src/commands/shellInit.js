// src/commands/shellInit.js
'use strict'
const fs = require('fs')
const path = require('path')
const os = require('os')
const chalk = require('chalk')

const MARKER_START = '# >>> cc-switcher shell-init >>>'
const MARKER_END   = '# <<< cc-switcher shell-init <<<'

const SNIPPET = `${MARKER_START}
# Load the active cc-switcher provider credentials (ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL)
# Respects CC_SWITCHER_DIR if set; falls back to ~/.cc-switcher
_cc_switcher_env="\${CC_SWITCHER_DIR:-$HOME/.cc-switcher}/env"
[ -f "$_cc_switcher_env" ] && . "$_cc_switcher_env"
unset _cc_switcher_env
${MARKER_END}`

function detectShellRc() {
  const shell = process.env.SHELL || ''
  if (shell.includes('zsh'))  return path.join(os.homedir(), '.zshrc')
  if (shell.includes('bash')) {
    // On macOS bash uses .bash_profile for login shells (which is what Terminal opens)
    const bp = path.join(os.homedir(), '.bash_profile')
    return fs.existsSync(bp) ? bp : path.join(os.homedir(), '.bashrc')
  }
  return null
}

function cmdShellInit(args) {
  // args.rc may be `true` (boolean) if --rc was passed with no value by minimist;
  // only accept it when it's a non-empty string.
  const rcArg = typeof args?.rc === 'string' && args.rc.trim() !== '' ? args.rc : null
  const rcFile = rcArg || detectShellRc()

  if (!rcFile) {
    console.error(chalk.red('Could not detect shell config file.'))
    console.error('Pass the target file explicitly: cc-switcher shell-init --rc ~/.zshrc')
    process.exit(1)
  }

  let current = ''
  try { current = fs.readFileSync(rcFile, 'utf8') } catch { /* file may not exist yet */ }

  if (current.includes(MARKER_START)) {
    console.log(chalk.yellow(`Shell hook already present in ${rcFile}`))
    return
  }

  const newline = current.endsWith('\n') || current === '' ? '' : '\n'
  try {
    fs.appendFileSync(rcFile, `${newline}\n${SNIPPET}\n`)
  } catch (err) {
    console.error(chalk.red(`Could not write to ${rcFile}: ${err.message}`))
    console.error('Make sure the directory exists and you have write permission.')
    process.exit(1)
  }
  console.log(chalk.green(`Shell hook installed in ${rcFile}`))
  console.log(`Run ${chalk.cyan(`source ${rcFile}`)} (or open a new terminal) to activate.`)
  console.log(`From then on, ANTHROPIC_API_KEY will be set automatically whenever you open a shell.`)
}

module.exports = { cmdShellInit }
