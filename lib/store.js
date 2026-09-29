import { readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync, existsSync, unlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'

export const defaultStorePath = () => process.env.DSH_SSH_HOSTS_FILE || join(homedir(), '.dsh', 'ssh-manager', 'hosts.json')

const fail = (message) => { throw new Error(message) }
const text = (value, label, max = 512) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : fail(`${label}不能为空或过长`)
const validId = (value) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value)
const TAG_LIMIT = 20
const TAG_LENGTH = 32

/**
 * Normalize one tag list: trim, lowercase, reject unsupported characters, dedupe and sort.
 * @param value - Candidate tag list from a tool argument, UI request, or stored record.
 * @param label - Field name used in validation messages.
 * @returns Sorted, de-duplicated tags; an empty input list yields an empty result.
 */
export function normalizeTags(value, label = '标签') {
  if (!Array.isArray(value)) fail(`${label}必须是数组`)
  const tags = new Set()
  for (const entry of value) {
    if (typeof entry !== 'string') fail(`${label}必须都是字符串`)
    const tag = entry.trim().toLowerCase()
    if (!tag || tag.length > TAG_LENGTH) fail(`每个${label}需要 1 到 ${TAG_LENGTH} 个字符`)
    if (!/^[\p{L}\p{N}._-]+$/u.test(tag)) fail(`${label}只能包含中英文、数字、点、下划线和横线`)
    tags.add(tag)
  }
  if (tags.size > TAG_LIMIT) fail(`${label}最多 ${TAG_LIMIT} 个`)
  return [...tags].sort()
}

const storedTags = (host) => Array.isArray(host?.tags) ? host.tags : []

const sameField = (left, right) => Array.isArray(left) && Array.isArray(right)
  ? left.length === right.length && left.every((value, index) => value === right[index])
  : left === right

/**
 * Count each tag across hosts for filter chips and Agent tag reuse.
 * @param hosts - Projected hosts carrying a `tags` array.
 * @returns Entries ordered by descending count, then name.
 */
export function tagFacets(hosts) {
  const counts = new Map()
  for (const host of hosts) for (const tag of storedTags(host)) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}


function hostId(input) {
  if (input.id !== undefined && input.id !== '') return validId(input.id) ? input.id : fail('主机 ID 只能包含字母、数字、点、下划线和横线')
  const name = `${input.username}-${input.host}-${input.port}`.toLowerCase().replace(/[^a-z0-9._-]/g, '-').replace(/^-+/, '').slice(0, 60)
  return `${name || 'host'}-${createHash('sha256').update(`${input.username}@${input.host}:${input.port}`).digest('hex').slice(0, 8)}`
}

export function normalizeHost(raw, previous) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('主机配置必须为对象')
  const host = text(raw.host ?? raw.ip ?? previous?.host, 'IP / 主机地址', 253)
  if (!/^[a-zA-Z0-9.:-]+$/.test(host)) fail('主机地址只能使用 IP 或 DNS 名称')
  const username = text(raw.username ?? raw.user ?? raw.account ?? previous?.username, '账号', 128)
  if (!/^[^\s\x00-\x1f]+$/.test(username)) fail('账号不能包含空白或控制字符')
  const port = raw.port ?? previous?.port ?? 22
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('端口必须介于 1 和 65535')
  const id = previous?.id ?? hostId({ id: raw.id, username, host, port })
  const password = raw.password === undefined || (raw.password === '' && previous) ? previous?.password : raw.password
  if (typeof password !== 'string' || !password || password.length > 8192) fail('密码不能为空或过长')
  const name = raw.name === undefined ? previous?.name || `${username}@${host}` : text(raw.name, '名称', 128)
  const enabled = raw.enabled ?? previous?.enabled ?? true
  if (typeof enabled !== 'boolean') fail('enabled 必须是布尔值')
  // `tags` replaces the stored list; `addTags`/`removeTags` adjust it without clearing it.
  const base = raw.tags === undefined ? storedTags(previous) : normalizeTags(raw.tags)
  const merged = new Set(base)
  for (const tag of raw.addTags === undefined ? [] : normalizeTags(raw.addTags, '新增标签')) merged.add(tag)
  for (const tag of raw.removeTags === undefined ? [] : normalizeTags(raw.removeTags, '移除标签')) merged.delete(tag)
  const tags = [...merged].sort()
  if (tags.length > TAG_LIMIT) fail(`标签最多 ${TAG_LIMIT} 个`)
  return {
    id, name, host, port, username, password, enabled, tags,
    fingerprint: previous && previous.host === host && previous.port === port ? previous.fingerprint : undefined,
  }
}

export function publicHost(host) {
  return {
    id: host.id, name: host.name, host: host.host, port: host.port,
    username: host.username, enabled: host.enabled, hasPassword: !!host.password,
    tags: storedTags(host), fingerprint: host.fingerprint || null,
  }
}

function readState(path) {
  if (!existsSync(path)) return { revision: 0, hosts: [] }
  const value = JSON.parse(readFileSync(path, 'utf8'))
  if (!Number.isSafeInteger(value.revision) || !Array.isArray(value.hosts)) fail('SSH 主机存储文件格式错误')
  return value
}

function writeState(path, state) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temp = resolve(dirname(path), `.hosts-${randomUUID()}.tmp`)
  try {
    writeFileSync(temp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
    renameSync(temp, path)
    chmodSync(path, 0o600)
  } catch (error) {
    try { if (existsSync(temp)) unlinkSync(temp) } catch { /* leave original file intact */ }
    throw error
  }
}

function prepare(state, inputs) {
  if (!Array.isArray(inputs) || !inputs.length || inputs.length > 100) fail('每次需要提供 1 到 100 台主机')
  const next = state.hosts.map((host) => ({ ...host }))
  const seen = new Set()
  const changes = []
  for (const raw of inputs) {
    if (!raw || typeof raw !== 'object') fail('主机配置格式错误')
    const existing = raw.id ? next.find((entry) => entry.id === raw.id) : next.find((entry) => entry.host === (raw.host ?? raw.ip) && entry.username === (raw.username ?? raw.user ?? raw.account) && entry.port === (raw.port ?? 22))
    const host = normalizeHost(raw, existing)
    if (seen.has(host.id)) fail(`重复主机 ID: ${host.id}`)
    seen.add(host.id)
    if (!existing && next.some((entry) => entry.id === host.id)) fail(`重复主机 ID: ${host.id}`)
    const changed = !existing || Object.keys(host).some((key) => !sameField(host[key], existing[key]))
    if (changed) {
      const item = { id: host.id, action: existing ? 'update' : 'create', before: existing ? publicHost(existing) : null, after: publicHost(host), passwordChanged: !existing || host.password !== existing.password }
      changes.push(item)
      if (existing) next[next.indexOf(existing)] = host
      else next.push(host)
    }
  }
  return { changes, next }
}

export function createStore(path = defaultStorePath()) {
  let tail = Promise.resolve()
  const serial = (fn) => {
    const value = tail.then(fn, fn)
    tail = value.then(() => undefined, () => undefined)
    return value
  }
  return {
    list: () => readState(path).hosts.map(publicHost),
    tags: () => tagFacets(readState(path).hosts.map(publicHost)),
    get: (id) => {
      const host = readState(path).hosts.find((entry) => entry.id === id)
      if (!host || !host.enabled) fail(`主机不存在或已停用: ${id}`)
      return { ...host }
    },
    preview: (hosts) => {
      const state = readState(path)
      const { changes } = prepare(state, hosts)
      return { revision: state.revision, changes }
    },
    apply: (hosts, expectedRevision) => serial(() => {
      const state = readState(path)
      if (expectedRevision !== undefined && state.revision !== expectedRevision) fail('主机列表已更改，请重新预览')
      const { changes, next } = prepare(state, hosts)
      if (changes.length) writeState(path, { revision: state.revision + 1, hosts: next })
      return { changes }
    }),
    remove: (id) => serial(() => {
      const state = readState(path)
      if (!state.hosts.some((host) => host.id === id)) fail(`主机不存在: ${id}`)
      writeState(path, { revision: state.revision + 1, hosts: state.hosts.filter((host) => host.id !== id) })
    }),
    /**
     * Rename one tag on every host, merging into the target when a host already carries it.
     * @param from - Existing tag name.
     * @param to - Replacement tag name; must differ from `from`.
     * @returns Affected host count and the normalized names.
     */
    renameTag: (from, to) => serial(() => {
      const source = normalizeTags([from], '原标签')[0]
      const target = normalizeTags([to], '新标签')[0]
      if (source === target) fail('原标签与新标签相同')
      const state = readState(path)
      let affected = 0
      const hosts = state.hosts.map((host) => {
        const tags = storedTags(host)
        if (!tags.includes(source)) return host
        affected++
        return { ...host, tags: [...new Set(tags.map((tag) => tag === source ? target : tag))].sort() }
      })
      if (affected) writeState(path, { revision: state.revision + 1, hosts })
      return { affected, from: source, to: target }
    }),
    /**
     * Remove one tag from every host that carries it.
     * @param name - Tag to delete.
     * @returns Affected host count and the normalized name.
     */
    removeTag: (name) => serial(() => {
      const tag = normalizeTags([name], '标签')[0]
      const state = readState(path)
      let affected = 0
      const hosts = state.hosts.map((host) => {
        const tags = storedTags(host)
        if (!tags.includes(tag)) return host
        affected++
        return { ...host, tags: tags.filter((entry) => entry !== tag) }
      })
      if (affected) writeState(path, { revision: state.revision + 1, hosts })
      return { affected, name: tag }
    }),
    pin: (id, fingerprint, address) => serial(() => {
      const state = readState(path)
      const host = state.hosts.find((entry) => entry.id === id)
      if (!host || `${host.host}:${host.port}` !== address) fail('主机连接信息已变更')
      if (host.fingerprint && host.fingerprint !== fingerprint) fail('远程主机指纹不匹配')
      if (!host.fingerprint) {
        host.fingerprint = fingerprint
        writeState(path, { revision: state.revision + 1, hosts: state.hosts })
      }
    }),
  }
}
