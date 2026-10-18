import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '..')
const windows = process.platform === 'win32'
const localPython = resolve(root, 'apps/api/.venv', windows ? 'Scripts/python.exe' : 'bin/python')
const python = process.env.PYTHON || (existsSync(localPython) ? localPython : 'python')
const children = []
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  process.exitCode = code
}
function start(command, args, cwd, env = {}) {
  const child = spawn(command, args, { cwd: resolve(root, cwd), stdio: 'inherit', env: { ...process.env, ...env } })
  children.push(child)
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => stop(code || 0))
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
const mode = process.argv[2]
const env = { DEBUG: ['true', 'false'].includes(process.env.DEBUG) ? process.env.DEBUG : 'true', USE_SQLITE: process.env.USE_SQLITE || 'true' }
if (!mode || mode === 'api') start(python, ['manage.py', 'runserver', '127.0.0.1:8000', '--noreload'], 'apps/api', env)
if (!mode || mode === 'worker') start(python, ['manage.py', 'run_jobs'], 'apps/api', env)
if (!mode) start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1'], 'apps/web')
if (mode && !['api', 'worker'].includes(mode)) throw new Error('Expected api or worker')
