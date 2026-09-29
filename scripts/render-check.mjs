// Scratch diagnostic: render the installed settings page and print its DOM.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { JSDOM } from 'jsdom'
import * as React from 'react'

const target = process.argv[2] || new URL('../lib/client.js', import.meta.url).pathname
const script = readFileSync(target, 'utf8')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1:19387/' })
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const { createElement } = React
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')

const hosts = [{ id: 'hdspdev001', name: 'hdspdev001', host: '172.23.16.57', port: 22, username: 'root', enabled: true, hasPassword: true, fingerprint: null }]
let entry
runInNewContext(script, {
  window: { ...dom.window, __ModuleLoader__: { load: (value) => { entry = value } }, confirm: () => true },
  document: dom.window.document,
  fetch: async () => ({ ok: true, status: 200, json: async () => ({ hosts }) }),
  console,
})
const plugin = entry.factory((name) => { if (name === 'react') return React; throw new Error(name) })
let registration
act(() => {
  plugin.apply({
    effect: (create) => { create() },
    slots: { inject: (_n, cb) => cb(), register: (options, component) => { registration = { options, component }; return () => {} } },
  })
})
const container = dom.window.document.createElement('div')
dom.window.document.body.appendChild(container)
const root = createRoot(container)
await act(async () => { root.render(createElement(registration.component)); await Promise.resolve() })
console.log('--- buttons found ---')
console.log([...container.querySelectorAll('button')].map((node) => JSON.stringify(node.textContent)).join(', '))
console.log('--- row html ---')
console.log(container.querySelector('.ssh-row')?.outerHTML ?? '(no .ssh-row)')
