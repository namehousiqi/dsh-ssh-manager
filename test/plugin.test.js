import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createStore } from '../lib/store.js'
import { deletionRisks } from '../lib/risk.js'
import { createTools, createRoutes } from '../lib/index.js'
import { Readable } from 'node:stream'

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const path = join(dir, 'hosts.json')
  return { store: createStore(path), path }
}

const sample = { id: 'staging', host: '127.0.0.1', username: 'deploy', password: 'some-secret', name: '预发布' }

test('batch host changes are atomic, redact passwords and preserve updates', async (t) => {
  const { store, path } = fixture(t)
  const preview = store.preview([sample])
  assert.equal(preview.changes[0].action, 'create')
  assert.doesNotMatch(JSON.stringify(preview), /some-secret/)
  await store.apply([sample], preview.revision)
  assert.equal(store.list()[0].hasPassword, true)
  assert.doesNotMatch(JSON.stringify(store.list()), /some-secret/)
  assert.equal(statSync(path).mode & 0o777, 0o600)
  assert.match(readFileSync(path, 'utf8'), /some-secret/)
  assert.equal(store.get('staging').password, 'some-secret')
  const changed = await store.apply([{ id: 'staging', enabled: false, name: '预发布 2' }])
  assert.equal(changed.changes[0].passwordChanged, false)
  assert.equal(store.list()[0].name, '预发布 2')
  assert.throws(() => store.get('staging'), /已停用/)
  await assert.rejects(store.apply([{ id: 'new', host: 'example.com', username: 'a', password: 'p' }, { host: 'invalid host', username: 'a', password: 'p' }]), /地址/)
  assert.equal(store.list().length, 1)
  await assert.rejects(store.apply([sample], preview.revision), /已更改/)
  await store.remove('staging')
  assert.deepEqual(store.list(), [])
})

test('management routes delegate trust to Connection and never mutate when it refuses', async (t) => {
  const { store } = fixture(t)
  // Mirrors the shipped Connection service: it fences Host/Origin, then authenticates.
  const connection = { requestRejection: (req) => {
    const origin = req.headers?.origin
    if (origin !== undefined && origin !== `http://${req.headers.host}`) return 403
    return req.headers?.cookie === 'authenticated' ? undefined : 401
  } }
  const routes = createRoutes(store, connection)
  const hostsRoute = routes.find((route) => route.path.endsWith('/hosts'))
  const actionRoute = routes.find((route) => route.path.endsWith('/action'))
  const respond = () => ({
    writeHead(status) { this.status = status },
    end(body) { this.value = JSON.parse(body) },
  })
  const post = (headers) => Object.assign(
    Readable.from([JSON.stringify({ kind: 'save', host: sample })]),
    { method: 'POST', headers: { host: 'localhost:19387', 'content-type': 'application/json', ...headers } },
  )
  const unauthorized = respond()
  await hostsRoute.handler({ method: 'GET', headers: {} }, unauthorized)
  assert.equal(unauthorized.status, 401)
  const foreign = respond()
  await actionRoute.handler(post({ cookie: 'authenticated', origin: 'http://elsewhere.invalid' }), foreign)
  assert.equal(foreign.status, 403)
  assert.deepEqual(store.list(), [])
  // A desktop same-origin POST carries no usable Origin header; refusing it broke every row action.
  const saved = respond()
  await actionRoute.handler(post({ cookie: 'authenticated' }), saved)
  assert.equal(saved.status, 200)
  assert.doesNotMatch(JSON.stringify(saved.value), /some-secret/)
  const listed = respond()
  await hostsRoute.handler({ method: 'GET', headers: { cookie: 'authenticated' } }, listed)
  assert.equal(listed.value.hosts.length, 1)
  assert.doesNotMatch(JSON.stringify(listed.value), /some-secret/)
})

test('common file deletion commands require review, including nested forms', () => {
  for (const command of [
    'rm -rf /srv/log', 'sudo rm -rf /srv/log', 'echo x && r\\m -rf old', 'find . -delete',
    'find . -exec rm {} \\;', 'cat files | xargs rm', 'rsync -a --delete src/ dst/',
    'rsync --remove-source-files src dst', 'git -C repo clean -fdx', 'unlink old', 'rmdir tmp', 'shred secret',
  ]) assert.ok(deletionRisks(command).length, `missed ${command}`)
  assert.deepEqual(deletionRisks('ls -la && cat readme'), [])
})

test('host import asks once and rejects a denied confirmation', async (t) => {
  const { store } = fixture(t)
  let asks = 0
  const ctx = {
    userQuestions: { ask: async (request) => {
      asks++
      assert.doesNotMatch(request.questions[0].question, /some-secret/)
      return { answers: [{ id: 'ssh-host-save', selected: ['保存'] }] }
    } },
    approval: { request: async () => 'rejected' },
  }
  const tools = new Map(createTools(ctx, store).map((tool) => [tool.name, tool]))
  const exec = { agent: { id: 'test' }, signal: new AbortController().signal, callId: 'call' }
  const imported = await tools.get('ssh_host_apply').execute({ hosts: [sample] }, exec)
  assert.equal(imported.changes[0].action, 'create')
  assert.equal(asks, 1)
  await tools.get('ssh_host_update').execute({ id: 'staging', name: '新名称' }, exec)
  assert.equal(store.list()[0].name, '新名称')
  await assert.rejects(tools.get('ssh_exec').execute({ hostId: 'staging', command: 'sudo rm -rf /tmp/cache' }, exec), /未获批准/)
  assert.equal(asks, 2)
  ctx.userQuestions.ask = async () => ({ answers: [{ id: 'ssh-host-save', selected: ['取消'] }] })
  await assert.rejects(tools.get('ssh_host_apply').execute({ hosts: [{ id: 'staging', host: 'another.com' }] }, exec), /未确认/)
  assert.equal(store.get('staging').host, sample.host)
})
