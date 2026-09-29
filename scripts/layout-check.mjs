// Real-browser layout check: are the row action buttons inside the visible panel?
// Usage: node scripts/layout-check.mjs <client.js path> [panelWidth]
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const playwright = await import(process.env.PLAYWRIGHT_ENTRY ?? 'playwright')
const { chromium } = playwright.default ?? playwright
const packageDir = (name) => dirname(require.resolve(name))
const reactUmd = readFileSync(join(packageDir('react'), 'umd/react.production.min.js'), 'utf8')
const reactDomUmd = readFileSync(join(packageDir('react-dom'), 'umd/react-dom.production.min.js'), 'utf8')
const clientScript = readFileSync(process.argv[2] ?? new URL('../lib/client.js', import.meta.url).pathname, 'utf8')
const panelWidth = Number(process.argv[3] ?? 600)

const browser = await chromium.launch(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : {})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.setContent('<!doctype html><html><head></head><body><div id="panel"></div></body></html>')
await page.addScriptTag({ content: reactUmd })
await page.addScriptTag({ content: reactDomUmd })

const report = await page.evaluate(async ({ script, width }) => {
  let entry
  window.__ModuleLoader__ = { load: (value) => { entry = value } }
  window.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    hosts: [{
      id: 'hdspdev001', name: 'hdspdev001', host: '172.23.16.57', port: 22, username: 'root',
      enabled: true, hasPassword: true, fingerprint: null,
      tags: ['production', 'database', 'critical', 'beijing', 'mysql', 'backup'],
    }],
    tags: ['production', 'database', 'critical', 'beijing', 'mysql', 'backup'].map((name) => ({ name, count: 1 })),
  }) })
  // eslint-disable-next-line no-eval
  ;(0, eval)(script)
  const plugin = entry.factory((name) => { if (name === 'react') return window.React; throw new Error(name) })
  let registration
  plugin.apply({
    effect: (create) => { create() },
    slots: { inject: (_n, cb) => cb(), register: (options, component) => { registration = { options, component }; return () => {} } },
  })
  const panel = document.getElementById('panel')
  panel.style.width = width + 'px'
  const root = window.ReactDOM.createRoot(panel)
  root.render(window.React.createElement(registration.component))
  await new Promise((resolve) => setTimeout(resolve, 50))
  const row = panel.querySelector('.ssh-row')
  const panelRect = panel.getBoundingClientRect()
  const buttons = [...panel.querySelectorAll('.ssh-actions button')].map((node) => {
    const rect = node.getBoundingClientRect()
    return {
      label: node.textContent,
      left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width),
      insidePanel: rect.left >= panelRect.left - 1 && rect.right <= panelRect.right + 1 && rect.width > 0,
    }
  })
  return {
    panelWidth: Math.round(panelRect.width),
    panelRight: Math.round(panelRect.right),
    rowScrollWidth: row ? row.scrollWidth : null,
    rowClientWidth: row ? row.clientWidth : null,
    buttons,
    hiddenButtons: buttons.filter((b) => !b.insidePanel).map((b) => b.label),
  }
}, { script: clientScript, width: panelWidth })

console.log(JSON.stringify(report, null, 2))
await browser.close()
