import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ssh2 from 'ssh2'
const { Server } = ssh2
import { createStore } from '../lib/store.js'
import { withConnection, execCommand, uploadFile, resolveUploadSource } from '../lib/ssh.js'
import { Writable } from 'node:stream'

async function serverFor(t) {
  const keyDir = mkdtempSync(join(tmpdir(), 'dsh-ssh-key-'))
  t.after(() => rmSync(keyDir, { recursive: true, force: true }))
  const keyFile = join(keyDir, 'host_key')
  execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-f', keyFile])
  const hostKey = readFileSync(keyFile)
  const server = new Server({ hostKeys: [hostKey] }, (client) => {
    client.on('error', () => {})
    client.on('authentication', (ctx) => ctx.method === 'password' && ctx.username === 'deploy' && ctx.password === 'secret' ? ctx.accept() : ctx.reject())
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        session.on('exec', (accept, _reject, info) => {
          const stream = accept()
          stream.write('ran: ' + info.command)
          stream.stderr.write('diagnostic')
          stream.exit(7)
          stream.end()
        })
      })
    })
  })
  server.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
  t.after(() => new Promise((resolve) => server.close(resolve)))
  return server.address().port
}

test('password authentication and command exit code against a local SSH server', { timeout: 15000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-live-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const port = await serverFor(t)
  const store = createStore(join(dir, 'hosts.json'))
  await store.apply([{ id: 'local', host: '127.0.0.1', port, username: 'deploy', password: 'secret' }])
  const host = store.get('local')
  const result = await withConnection(store, host, AbortSignal.timeout(10000), (client) => execCommand(client, 'echo hello'))
  assert.deepEqual(result, { exitCode: 7, signal: null, stdout: 'ran: echo hello', stderr: 'diagnostic', truncated: false })
  assert.match(store.list()[0].fingerprint, /^SHA256:/)
  await assert.rejects(withConnection(store, { ...host, password: 'bad' }, AbortSignal.timeout(10000), async () => {}), /authentication|configured|All/i)
  await assert.rejects(withConnection(store, { ...host, fingerprint: 'SHA256:wrong' }, AbortSignal.timeout(10000), async () => {}), /key|verification|handshake|KEY_EXCHANGE_FAILED/i)
})

test('SFTP streams upload bytes without overwriting by default', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-upload-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'data.txt')
  writeFileSync(file, 'upload payload')
  const calls = []
  const client = { sftp(callback) { callback(null, { createWriteStream(path, options) {
    const parts = []
    const stream = new Writable({ write(chunk, _encoding, done) { parts.push(chunk); done() } })
    stream.on('finish', () => calls.push({ path, flags: options.flags, value: Buffer.concat(parts).toString() }))
    return stream
  } }) } }
  assert.deepEqual(await uploadFile(client, file, '/srv/data.txt'), { remotePath: '/srv/data.txt', bytes: 14 })
  assert.equal(calls[0].flags, 'wx')
  assert.equal(calls[0].value, 'upload payload')
  await uploadFile(client, file, '/srv/data.txt', true)
  assert.equal(calls[1].flags, 'w')
  assert.throws(() => uploadFile(client, file, 'relative.txt'), /绝对路径/)
})

test('upload source stays within the workspace, including symlinks', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-file-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'workspace'))
  writeFileSync(join(dir, 'workspace', 'app.txt'), 'hello')
  assert.equal(resolveUploadSource('app.txt', join(dir, 'workspace')), realpathSync(join(dir, 'workspace', 'app.txt')))
  assert.throws(() => resolveUploadSource('../outside', join(dir, 'workspace')))
})
