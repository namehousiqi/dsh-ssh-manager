import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { createStore, normalizeTags, tagFacets } from '../lib/store.js'
import { createTools, createRoutes } from '../lib/index.js'

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-tags-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return { store: createStore(join(dir, 'hosts.json')), dir }
}

const host = (id, tags = []) => ({ id, host: `${id}.example.com`, username: 'root', password: 'secret', tags })

test('normalizeTags trims, lowercases, dedupes and sorts', () => {
  assert.deepEqual(normalizeTags([' Prod ', 'prod', 'DB', '生产']), ['db', 'prod', '生产'])
  assert.deepEqual(normalizeTags([]), [])
  assert.throws(() => normalizeTags('prod'), /必须是数组/)
  assert.throws(() => normalizeTags([1]), /必须都是字符串/)
  assert.throws(() => normalizeTags(['bad tag']), /只能包含/)
  assert.throws(() => normalizeTags(['a'.repeat(33)]), /1 到 32/)
  assert.throws(() => normalizeTags(Array.from({ length: 21 }, (_, index) => `t${index}`)), /最多 20 个/)
  // Duplicates collapse before the limit is applied.
  assert.equal(normalizeTags(Array.from({ length: 40 }, () => 'same')).length, 1)
})

test('tags replace, add and remove independently of other fields', async (t) => {
  const { store } = fixture(t)
  await store.apply([host('a', ['prod', 'db'])])
  assert.deepEqual(store.list()[0].tags, ['db', 'prod'])
  await store.apply([{ id: 'a', tags: ['dev'] }])
  assert.deepEqual(store.list()[0].tags, ['dev'])
  await store.apply([{ id: 'a', addTags: ['Prod', 'cache'] }])
  assert.deepEqual(store.list()[0].tags, ['cache', 'dev', 'prod'])
  await store.apply([{ id: 'a', removeTags: ['dev'] }])
  assert.deepEqual(store.list()[0].tags, ['cache', 'prod'])
  // A name-only update must not clear tags, and an identical re-apply is not a change.
  await store.apply([{ id: 'a', name: '甲' }])
  assert.deepEqual(store.list()[0].tags, ['cache', 'prod'])
  const again = await store.apply([{ id: 'a', name: '甲', tags: ['prod', 'cache'] }])
  assert.deepEqual(again.changes, [])
  assert.throws(() => store.preview([{ id: 'a', addTags: ['bad tag'] }]), /只能包含/)
})

test('a stored host without tags reads as an empty list', async (t) => {
  const { store, dir } = fixture(t)
  const path = join(dir, 'hosts.json')
  writeFileSync(path, JSON.stringify({ revision: 3, hosts: [{ id: 'legacy', name: '旧主机', host: '1.2.3.4', port: 22, username: 'root', password: 'p', enabled: true }] }))
  assert.deepEqual(store.list()[0].tags, [])
  assert.deepEqual(store.tags(), [])
})

test('renameTag merges and removeTag clears the tag across hosts', async (t) => {
  const { store } = fixture(t)
  await store.apply([host('a', ['prod']), host('b', ['prod', 'db']), host('c', ['dev'])])
  const renamed = await store.renameTag('Prod', 'production')
  assert.deepEqual(renamed, { affected: 2, from: 'prod', to: 'production' })
  assert.deepEqual(store.list().find((entry) => entry.id === 'b').tags, ['db', 'production'])
  // Renaming onto a tag a host already carries merges instead of duplicating.
  const merged = await store.renameTag('production', 'db')
  assert.equal(merged.affected, 2)
  assert.deepEqual(store.list().find((entry) => entry.id === 'b').tags, ['db'])
  assert.equal((await store.renameTag('missing', 'other')).affected, 0)
  await assert.rejects(store.renameTag('db', 'db'), /相同/)
  await assert.rejects(store.renameTag('db', 'bad tag'), /只能包含/)
  const removed = await store.removeTag('DB')
  assert.equal(removed.affected, 2)
  assert.deepEqual(store.tags(), [{ name: 'dev', count: 1 }])
  assert.equal((await store.removeTag('db')).affected, 0)
})

test('tagFacets counts every host and orders by count then name', () => {
  assert.deepEqual(tagFacets([
    { tags: ['prod', 'db'] }, { tags: ['prod'] }, { tags: ['cache', 'db', 'prod'] }, { tags: [] },
  ]), [{ name: 'prod', count: 3 }, { name: 'db', count: 2 }, { name: 'cache', count: 1 }])
})

test('ssh_hosts exposes tags and tag facets for reuse', async (t) => {
  const { store } = fixture(t)
  await store.apply([host('a', ['prod', 'db']), host('b', ['prod'])])
  const tools = new Map(createTools({}, store).map((tool) => [tool.name, tool]))
  const listed = await tools.get('ssh_hosts').execute({}, {})
  assert.deepEqual(listed.tags, [{ name: 'prod', count: 2 }, { name: 'db', count: 1 }])
  assert.deepEqual(listed.hosts.map((entry) => entry.tags), [['db', 'prod'], ['prod']])
  assert.deepEqual(Object.keys(tools.get('ssh_host_apply').parameters.properties.hosts.items.properties).includes('addTags'), true)
})

test('confirmation preview shows tag changes without the password', async (t) => {
  const { store } = fixture(t)
  await store.apply([host('a', ['prod'])])
  let asked
  let previewed
  const ctx = {
    userQuestions: { ask: async (request) => { asked = request.questions[0].question; previewed = request.questions[0].detail; return { answers: [{ id: 'ssh-host-save', selected: ['保存'] }] } } },
    approval: { request: async () => 'rejected' },
  }
  const tools = new Map(createTools(ctx, store).map((tool) => [tool.name, tool]))
  const exec = { agent: { id: 'test' }, signal: new AbortController().signal, callId: 'call' }
  await tools.get('ssh_host_update').execute({ id: 'a', addTags: ['cache'] }, exec)
  assert.match(previewed, /tags: \[prod\] → \[cache, prod\]/)
  assert.doesNotMatch(previewed, /secret/)
  // The change list stays out of the question: the card header renders it
  // outside the scroll seat, where a long batch hides the footer actions.
  assert.equal(asked, '保存以下 1 项主机变更？')
  assert.doesNotMatch(asked, /prod/)
  assert.deepEqual(store.list()[0].tags, ['cache', 'prod'])
})

test('tag management routes rename, merge and delete', async (t) => {
  const { store } = fixture(t)
  await store.apply([host('a', ['prod']), host('b', ['prod', 'db'])])
  const routes = createRoutes(store, { requestRejection: () => undefined })
  const action = routes.find((route) => route.path.endsWith('/action'))
  const hostsRoute = routes.find((route) => route.path.endsWith('/hosts'))
  const respond = () => ({ writeHead(status) { this.status = status }, end(body) { this.value = JSON.parse(body) } })
  const post = async (payload) => {
    const res = respond()
    await action.handler(Object.assign(Readable.from([JSON.stringify(payload)]), {
      method: 'POST', headers: { 'content-type': 'application/json' },
    }), res)
    return res
  }
  const renamed = await post({ kind: 'renameTag', from: 'prod', to: 'production' })
  assert.equal(renamed.status, 200)
  assert.deepEqual(renamed.value.tags, [{ name: 'production', count: 2 }, { name: 'db', count: 1 }])
  const bad = await post({ kind: 'renameTag', from: 'production', to: 'bad tag' })
  assert.equal(bad.status, 400)
  const removed = await post({ kind: 'removeTag', name: 'db' })
  assert.deepEqual(removed.value.tags, [{ name: 'production', count: 2 }])
  const listed = respond()
  await hostsRoute.handler({ method: 'GET', headers: {} }, listed)
  assert.deepEqual(listed.value.tags, [{ name: 'production', count: 2 }])
})
