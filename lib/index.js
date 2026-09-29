import { createStore } from './store.js'
import { deletionRisks } from './risk.js'
import { withConnection, execCommand, uploadFile, resolveUploadSource } from './ssh.js'

export const inject = ['tools', 'webServer', 'connection', 'approval', 'userQuestions']
const PREFIX = '/api/dsh-ssh-manager'
const output = { schema: { type: 'object' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] }
const required = (args, key) => {
  if (!args || typeof args !== 'object' || typeof args[key] !== 'string' || !args[key].trim()) throw new Error(`缺少 ${key}`)
  return args[key].trim()
}
const schema = (properties, fields) => ({ type: 'object', properties, required: fields, additionalProperties: false })
const str = (description) => ({ type: 'string', description })
const tags = (description) => ({ type: 'array', items: { type: 'string' }, description })
const hostFields = {
  id: str('Stable host ID; omit when creating a host to generate one.'),
  name: str('Display name.'), host: str('IP or DNS address.'), port: { type: 'integer', description: 'SSH port, default 22.' },
  username: str('SSH account.'), password: str('Plaintext login password; do not repeat it in the response.'),
  enabled: { type: 'boolean', description: 'Whether remote operations may use the host.' },
  tags: tags('Replace the host tag list. Lowercase, de-duplicated, at most 20 tags of 32 characters.'),
  addTags: tags('Add these tags without clearing the tags already stored on the host.'),
  removeTags: tags('Remove these tags from the host.'),
}
const hostInput = schema(hostFields, ['host', 'username', 'password'])

const showValue = (value) => value === undefined ? '—' : Array.isArray(value) ? `[${value.join(', ')}]` : String(value)

/**
 * Confirm a batch through one question. The change list travels as `detail`,
 * never as part of `question`: the card header renders `question` outside its
 * scroll seat (and `<h2>` collapses the newlines that would separate the
 * lines), so a batch of a few dozen hosts there pushes the footer actions —
 * including 保存 — out of the visible card. `detail` renders inside the
 * scrolling body, which keeps header and actions reachable at any batch size.
 */
async function confirmImport(ctx, exec, store, hosts) {
  if (!exec.agent) throw new Error('只有交互式主会话可以保存主机')
  const preview = store.preview(hosts)
  if (!preview.changes.length) return { changes: [], message: '主机配置未变化' }
  const lines = preview.changes.map((change) => {
    const fields = ['name', 'host', 'port', 'username', 'enabled', 'tags']
      .filter((field) => showValue(change.before?.[field]) !== showValue(change.after?.[field]))
      .map((field) => `${field}: ${showValue(change.before?.[field])} → ${showValue(change.after?.[field])}`)
    if (change.passwordChanged) fields.push('密码: 已设置/更新')
    return `${change.action === 'create' ? '新增' : '修改'} ${change.id}: ${fields.join('；')}`
  })
  const answer = await ctx.userQuestions.ask({ agent: exec.agent, signal: exec.signal, questions: [{
    id: 'ssh-host-save', header: 'SSH 主机', question: `保存以下 ${lines.length} 项主机变更？`,
    detail: lines.map((line) => `- ${line}`).join('\n'),
    options: [{ label: '保存', description: '应用上述主机配置变更' }, { label: '取消', description: '不保存' }],
  }] })
  if (!answer.answers.some((item) => item.id === 'ssh-host-save' && item.selected.includes('保存'))) throw new Error('用户未确认主机变更')
  return store.apply(hosts, preview.revision)
}

export function createTools(ctx, store) {
  return [
    {
      name: 'ssh_hosts', description: 'List SSH hosts configured in the plugin, with the tags each host carries and a `tags` summary of every tag in use. Reuse those tag names instead of inventing near-duplicates. Passwords are never returned.',
      parameters: schema({}, []), output, isConcurrencySafe: () => true,
      async execute() { return { hosts: store.list(), tags: store.tags() } },
    },
    {
      name: 'ssh_host_apply', description: 'Create or update up to 100 SSH hosts parsed from a user-provided file. Ask the user to confirm the changes before saving. Do not print passwords.',
      parameters: schema({ hosts: { type: 'array', items: hostInput, description: 'Parsed host records with IP, account and plaintext password.' } }, ['hosts']),
      output,
      async execute(args, exec) { return confirmImport(ctx, exec, store, args?.hosts) },
    },
    {
      name: 'ssh_host_create', description: 'Create one password SSH host from the supplied connection fields; require user confirmation.',
      parameters: schema(hostFields, ['host', 'username', 'password']), output,
      async execute(args, exec) {
        const preview = store.preview([args])
        if (preview.changes[0]?.action !== 'create') throw new Error('主机已存在，请使用 ssh_host_update')
        return confirmImport(ctx, exec, store, [args])
      },
    },
    {
      name: 'ssh_host_update', description: 'Update one configured SSH host, changing only supplied fields; require user confirmation. Omit password to keep the saved one. `tags` replaces the tag list while `addTags`/`removeTags` adjust it.',
      parameters: schema(hostFields, ['id']), output,
      async execute(args, exec) {
        const id = required(args, 'id')
        if (!store.list().some((host) => host.id === id)) throw new Error('主机不存在: ' + id)
        return confirmImport(ctx, exec, store, [args])
      },
    },
    {
      name: 'ssh_test', description: 'Connect and authenticate to a configured SSH host without running a command.',
      parameters: schema({ hostId: str('Configured host ID.') }, ['hostId']), output,
      async execute(args, exec) {
        const host = store.get(required(args, 'hostId'))
        return withConnection(store, host, exec.signal, async (_client, _signal, fingerprint) => ({ connected: true, hostId: host.id, fingerprint }))
      },
    },
    {
      name: 'ssh_exec', description: 'Run a non-interactive command on a configured SSH host. Common file-deleting commands require human approval before connecting; if approval is unavailable or disabled, the command is refused. Max runtime 30 seconds; output is bounded.',
      parameters: schema({ hostId: str('Configured host ID.'), command: str('Exact remote command to execute.') }, ['hostId', 'command']), output,
      timeoutMs: 35000,
      async execute(args, exec) {
        const host = store.get(required(args, 'hostId'))
        const command = required(args, 'command')
        if (command.length > 16000) throw new Error('命令过长')
        const risks = deletionRisks(command)
        if (risks.length) {
          if (!exec.agent) throw new Error('删除命令需要交互式会话审批')
          const decision = await ctx.approval.request({
            agent: exec.agent, toolName: 'ssh_exec', callId: exec.callId, signal: exec.signal,
            reason: `远程文件删除审核：${host.name} (${host.id})\n命中：${risks.join('、')}\n命令：${command}`,
          })
          if (decision !== 'allowed-once') throw new Error(`删除命令未获批准 (${decision})`)
        }
        const result = await withConnection(store, host, exec.signal, (client) => execCommand(client, command))
        return { hostId: host.id, ...result }
      },
      presentCall: (args) => ({ card: 'terminal', title: `SSH: ${args?.hostId || ''}`, description: args?.command || '' }),
      presentResult: (_args, result) => result.isError ? undefined : { card: 'terminal', output: result.content?.[0]?.text || '' },
    },
    {
      name: 'ssh_upload', description: 'Upload one workspace file to an absolute remote path via SFTP. Existing remote files are not overwritten unless overwrite=true.',
      parameters: schema({ hostId: str('Configured host ID.'), source: str('Local file in the session workspace.'), remotePath: str('Absolute destination path.'), overwrite: { type: 'boolean', description: 'Allow replacing an existing remote file; defaults to false.' } }, ['hostId', 'source', 'remotePath']), output,
      timeoutMs: 35000,
      async execute(args, exec) {
        const host = store.get(required(args, 'hostId'))
        const source = resolveUploadSource(required(args, 'source'), exec.agent?.session?.header?.cwd || process.cwd())
        const result = await withConnection(store, host, exec.signal, (client) => uploadFile(client, source, required(args, 'remotePath'), args.overwrite === true))
        return { hostId: host.id, ...result }
      },
    },
  ]
}

function send(res, status, result) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(result))
}

async function bodyOf(req) {
  let raw = ''
  for await (const part of req) {
    raw += part
    if (raw.length > 65536) throw new Error('请求过大')
  }
  return JSON.parse(raw)
}

export function createRoutes(store, connection) {
  // Connection owns the Host/Origin fence and browser authentication for this route,
  // exactly as it does for the built-in API. Re-checking Origin here rejected the
  // desktop client's same-origin POST, whose Origin header the fence already accepts.
  const authenticated = (req, res) => {
    const rejection = connection.requestRejection(req)
    if (rejection !== undefined) { send(res, rejection, { error: '未授权访问' }); return false }
    return true
  }
  return [
    { kind: 'exact', path: PREFIX + '/hosts', handler: (req, res) => {
      if (!authenticated(req, res)) return
      if (req.method !== 'GET') return send(res, 405, { error: '不支持的请求方法' })
      try { send(res, 200, { hosts: store.list(), tags: store.tags() }) } catch (error) { send(res, 500, { error: error.message }) }
    } },
    { kind: 'exact', path: PREFIX + '/action', handler: async (req, res) => {
      if (!authenticated(req, res)) return
      if (req.method !== 'POST') return send(res, 405, { error: '不支持的请求方法' })
      if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return send(res, 415, { error: '需要 JSON 请求' })
      try {
        const action = await bodyOf(req)
        let result
        if (action.kind === 'save') result = await store.apply([action.host])
        else if (action.kind === 'remove') result = await store.remove(action.id)
        else if (action.kind === 'renameTag') result = await store.renameTag(action.from, action.to)
        else if (action.kind === 'removeTag') result = await store.removeTag(action.name)
        else if (action.kind === 'test') {
          const host = store.get(action.id)
          result = await withConnection(store, host, AbortSignal.timeout(30000), async (_client, _signal, fingerprint) => ({ connected: true, fingerprint }))
        } else throw new Error('未知操作')
        send(res, 200, { ok: true, result, hosts: store.list(), tags: store.tags() })
      } catch (error) { send(res, 400, { error: error.message }) }
    } },
  ]
}

export function apply(ctx) {
  const store = createStore()
  for (const definition of createTools(ctx, store)) ctx.effect(() => ctx.tools.register(definition), `dsh-ssh-manager: ${definition.name}`)
  for (const route of createRoutes(store, ctx.connection)) ctx.effect(() => ctx.webServer.register(route), `dsh-ssh-manager: ${route.path}`)
}
