import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

// Test release ordering/failure handling with command fixtures, never real Docker/SSH.
const source = readFileSync(new URL('./deploy.sh', import.meta.url), 'utf8')
const sha = 'a'.repeat(40)
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash'
function runRelease(failure) {
  const root = mkdtempSync(join(tmpdir(), 'totekeeper-release-test-'))
  try {
    const normalized = root.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => '/' + drive.toLowerCase())
    const bin = join(root, 'bin')
    mkdirSync(bin)
    mkdirSync(join(root, 'shared'))
    mkdirSync(join(root, 'releases', sha, 'apps/web/dist'), { recursive: true })
    writeFileSync(join(root, 'shared/.env'), '', { mode: 0o600 })
    writeFileSync(join(root, 'releases', sha, 'apps/web/dist/index.html'), 'fixture')
    writeFileSync(join(root, 'deploy.sh'), source.replace('base=/opt/totekeeper', `base='${normalized}'`))
    const mock = (name, text) => writeFileSync(join(bin, name), '#!/usr/bin/env bash\nset -eu\n' + text, { mode: 0o755 })
    mock('docker', `printf '%s\\n' "$*" >> "$TEST_LOG"
case "$*" in
  *'config --quiet'*) [[ "$TEST_FAILURE" != config ]] ;;
  *pg_dump*) [[ "$TEST_FAILURE" != backup ]]; printf 'backup-fixture' ;;
  *'pg_restore --list'*) cat > /dev/null ;;
  *'migrate --noinput'*) [[ "$TEST_FAILURE" != migration ]] ;;
  *'exec -T app python -c'*) echo https://portal.example.invalid ;;
  *'exec -T proxy printenv WEB_DOMAIN'*) echo web.example.invalid ;;
esac
`)
    mock('curl', `if [[ "$*" == *not-a-real-endpoint* ]]; then
  if [[ "$TEST_FAILURE" == routing ]]; then printf 200; else printf 404; fi
else
  [[ "$TEST_FAILURE" != health ]]
fi
`)
    mock('stat', 'echo 600\n')
    mock('ln', 'echo publish >> "$TEST_LOG"\n')
    mock('mv', ':\n')
    const result = spawnSync(bash, ['-c', 'export PATH="$TEST_BIN:$PATH"; bash "$TEST_SCRIPT" "$TEST_SHA"'], {
      encoding: 'utf8',
      env: { ...process.env, TEST_BIN: normalized + '/bin', TEST_SCRIPT: normalized + '/deploy.sh', TEST_SHA: sha, TEST_LOG: normalized + '/commands', TEST_FAILURE: failure },
    })
    if (result.error) throw result.error
    assert.ok(result.status !== null, result.stderr)
    if (!existsSync(join(root, 'commands'))) throw new Error(result.stderr || result.stdout || 'No mock commands ran')
    return { status: result.status, log: readFileSync(join(root, 'commands'), 'utf8'), stderr: result.stderr }
  } finally {
    // Only remove the verified test directory created by mkdtemp under OS temp.
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep))
    assert.ok(root.includes('totekeeper-release-test-'))
    rmSync(root, { recursive: true, force: true })
  }
}
test('successful release stops writers, backs up, migrates and publishes in order', () => {
  const result = runRelease('none')
  assert.equal(result.status, 0, result.stderr)
  const markers = ['stop proxy worker app', 'pg_dump', 'pg_restore --list', 'migrate --noinput', 'up -d --wait --force-recreate', 'publish']
  let previous = -1
  for (const marker of markers) {
    const position = result.log.indexOf(marker)
    assert.ok(position > previous, marker)
    previous = position
  }
})
test('preflight failure leaves existing application running', () => {
  const result = runRelease('config')
  assert.notEqual(result.status, 0)
  assert.ok(!result.log.includes('stop proxy'))
})
for (const failure of ['backup', 'migration', 'health', 'routing']) {
  test(`${failure} failure never publishes a successful revision`, () => {
    const result = runRelease(failure)
    assert.notEqual(result.status, 0)
    assert.ok(!result.log.includes('publish'))
    if (failure === 'backup') assert.ok(!result.log.includes('migrate --noinput'))
    if (failure === 'migration') assert.ok(!result.log.includes('up -d --wait --force-recreate'))
  })
}
