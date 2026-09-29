import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import * as React from 'react'

const script = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:19387/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement } = React
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')

// Load the browser half the way the Web module table does, then mount its registered section.
function mountSection(t, respond) {
  const container = dom.window.document.createElement('div')
  dom.window.document.body.appendChild(container)
  const calls = []
  const fetchStub = async (url, init) => {
    const payload = respond(String(url), init)
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : undefined })
    return { ok: true, status: 200, json: async () => payload }
  }
  let entry
  runInNewContext(script, {
    window: { ...dom.window, __ModuleLoader__: { load: (value) => { entry = value } }, confirm: () => true },
    document: dom.window.document,
    fetch: fetchStub,
    console,
  })
  const plugin = entry.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected client module request: ${name}`)
  })
  let registration, disposeStyle
  act(() => {
    plugin.apply({
      effect: (create) => { disposeStyle = create() },
      slots: {
        inject: (_name, callback) => callback(),
        register: (options, component) => { registration = { options, component }; return () => {} },
      },
    })
  })
  const root = createRoot(container)
  t.after(() => {
    act(() => root.unmount())
    container.remove()
  })
  act(() => { root.render(createElement(registration.component)) })
  return {
    document: dom.window.document,
    scope: container,
    options: registration.options,
    disposeStyle,
    flush: async () => { await act(async () => { await Promise.resolve() }) },
    click: (element) => act(() => { element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) }),
    change: (element, value) => act(() => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(element, value)
      element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    }),
    submit: (form) => act(() => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) }),
    key: (element, key) => act(() => { element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })) }),
    calls,
  }
}

const button = (ui, text) => [...ui.scope.querySelectorAll('button')].find((node) => node.textContent === text)

test('renders stored hosts and creates one manually', async (t) => {
  const stored = [{ id: 'staging', name: '预发布', host: '10.0.0.1', port: 22, username: 'deploy', enabled: true, hasPassword: true, fingerprint: null }]
  const ui = mountSection(t, (url) => url.endsWith('/hosts')
    ? { hosts: stored }
    : { hosts: [...stored, { id: 'dev', name: '开发机', host: '10.0.0.2', port: 2222, username: 'root', enabled: true, hasPassword: true }] })
  assert.equal(ui.options.id, 'ssh-hosts')
  await ui.flush()
  assert.match(ui.scope.textContent, /预发布/)
  assert.match(ui.scope.textContent, /deploy@10\.0\.0\.1:22/)
  assert.doesNotMatch(ui.scope.textContent, /pa55|密码[:：]\s*\S/)
  // Row actions must exist for a stored host; their on-screen visibility in a narrow
  // settings panel is measured by scripts/layout-check.mjs.
  for (const action of ['测试', '编辑', '删除', '停用']) assert.ok(button(ui, action), `row exposes ${action}`)

  ui.click(button(ui, '添加主机'))
  const form = ui.scope.querySelector('form')
  assert.ok(form, 'add-host dialog opens')
  const labels = [...ui.scope.querySelectorAll('label')].map((node) => node.childNodes[0]?.textContent)
  for (const field of ['IP / 地址', '端口', '账号', '密码']) assert.ok(labels.includes(field), `form exposes ${field}`)
  const [name, address, port, account, secret] = form.querySelectorAll('input')
  ui.change(name, '开发机')
  ui.change(address, '10.0.0.2')
  ui.change(port, '2222')
  ui.change(account, 'root')
  ui.change(secret, 'pa55word')
  ui.submit(form)
  await ui.flush()
  const saved = ui.calls.at(-1)
  assert.equal(saved.url, '/api/dsh-ssh-manager/action')
  assert.equal(saved.method, 'POST')
  assert.deepEqual(saved.body, { kind: 'save', host: { name: '开发机', host: '10.0.0.2', username: 'root', port: 2222, enabled: true, tags: [], password: 'pa55word' } })
  assert.match(ui.scope.textContent, /开发机/)
  ui.disposeStyle()
})

test('empty list explains how to add a host', async (t) => {
  const ui = mountSection(t, () => ({ hosts: [] }))
  await ui.flush()
  assert.match(ui.scope.textContent, /添加主机/)
  assert.match(ui.scope.textContent, /暂无主机/)
})

const tagged = [
  { id: 'a', name: '甲', host: '10.0.0.1', port: 22, username: 'root', enabled: true, hasPassword: true, tags: ['prod', 'db'] },
  { id: 'b', name: '乙', host: '10.0.0.2', port: 22, username: 'root', enabled: true, hasPassword: true, tags: ['prod'] },
  { id: 'c', name: '丙', host: '10.0.0.3', port: 22, username: 'root', enabled: true, hasPassword: true, tags: [] },
]
const facets = [{ name: 'prod', count: 2 }, { name: 'db', count: 1 }]
const rows = (ui) => ui.scope.querySelectorAll('.ssh-row').length
const chip = (ui, name) => [...ui.scope.querySelectorAll('.ssh-chip')].find((node) => node.textContent.startsWith(name))

test('tag chips narrow by intersection and search matches tags', async (t) => {
  const ui = mountSection(t, (url) => url.endsWith('/hosts') ? { hosts: tagged, tags: facets } : { hosts: tagged, tags: facets })
  await ui.flush()
  assert.equal(rows(ui), 3)
  // The row shows its tags as pills.
  assert.match(ui.scope.querySelector('.ssh-rowtags').textContent, /prod/)
  ui.click(chip(ui, 'prod'))
  assert.equal(rows(ui), 2)
  ui.click(chip(ui, 'db'))
  assert.equal(rows(ui), 1, 'two selected tags intersect')
  assert.equal(ui.scope.querySelector('.ssh-row .ssh-name').textContent, '甲')
  ui.click(button(ui, '清除筛选'))
  assert.equal(rows(ui), 3)
  ui.change(ui.scope.querySelector('.ssh-search'), 'db')
  assert.equal(rows(ui), 1)
  ui.change(ui.scope.querySelector('.ssh-search'), '丙')
  assert.equal(rows(ui), 1, 'name search still works')
})

test('the edit form adds tags and submits them', async (t) => {
  const ui = mountSection(t, (url) => url.endsWith('/hosts') ? { hosts: tagged, tags: facets } : { hosts: tagged, tags: facets })
  await ui.flush()
  ui.click([...ui.scope.querySelectorAll('.ssh-actions button')].find((node) => node.textContent === '编辑'))
  const form = ui.scope.querySelector('form')
  const box = form.querySelector('.ssh-tagbox')
  assert.match(box.textContent, /prod/, 'existing tags load into the editor')
  const input = box.querySelector('input')
  ui.change(input, ' Cache ')
  ui.key(input, 'Enter')
  assert.match(box.textContent, /cache/)
  ui.submit(form)
  const saved = ui.calls.at(-1).body
  assert.equal(saved.kind, 'save')
  assert.deepEqual(saved.host.tags, ['cache', 'db', 'prod'])
  assert.equal(saved.host.id, 'a')
})

test('tag manager renames a tag through the action route', async (t) => {
  const ui = mountSection(t, (url) => url.endsWith('/hosts') ? { hosts: tagged, tags: facets } : { hosts: tagged, tags: facets })
  await ui.flush()
  ui.click(button(ui, '管理标签'))
  const field = ui.scope.querySelector('[aria-label="重命名 prod"]')
  assert.ok(field, 'manager lists each tag')
  ui.change(field, 'production')
  const row = field.closest('.ssh-tagrow')
  ui.click([...row.querySelectorAll('button')].find((node) => node.textContent === '重命名'))
  assert.deepEqual(ui.calls.at(-1).body, { kind: 'renameTag', from: 'prod', to: 'production' })
})
