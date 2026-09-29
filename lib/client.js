window.__ModuleLoader__.load({
  id: '@workspace/dsh-ssh-manager',
  factory: (require) => {
    const module = { exports: {} }
    const React = require('react')
    const h = React.createElement
    const API = '/api/dsh-ssh-manager'
    const TAG_PATTERN = /^[\p{L}\p{N}._-]+$/u
    const CSS = `
.ssh-page{box-sizing:border-box;max-width:1000px;min-width:0;padding:20px 24px;color:var(--dsw-alias-label-primary);font-size:13px}
.ssh-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 16px}.ssh-head h2{margin:0;font-size:17px;font-weight:600}
.ssh-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px}.ssh-input{box-sizing:border-box;min-width:0;width:100%;padding:8px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font:inherit}
.ssh-search{max-width:280px}.ssh-btn{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;white-space:nowrap;cursor:pointer}
.ssh-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.ssh-btn:disabled{opacity:.55;cursor:not-allowed}
.ssh-primary{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted)}
.ssh-danger{color:var(--dsw-alias-state-error-primary)}.ssh-small{min-height:26px;padding:0 8px;font-size:12px}
.ssh-filters{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:0 0 12px}
.ssh-chip{display:inline-flex;align-items:center;gap:5px;min-height:26px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}
.ssh-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}.ssh-chip-on{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary-inverted)}
.ssh-count{opacity:.7}
.ssh-list{border-top:1px solid var(--dsw-alias-border-l1)}
.ssh-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:12px 4px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ssh-identity{flex:1 1 150px;min-width:0}.ssh-name{font-weight:600;overflow-wrap:anywhere}
.ssh-id,.ssh-meta{margin-top:3px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.ssh-id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssh-endpoint{flex:0 1 auto;min-width:0;overflow-wrap:anywhere}.ssh-status{flex:0 1 auto;min-width:0}
.ssh-actions{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-left:auto}
.ssh-rowtags{display:flex;flex-wrap:wrap;align-items:center;gap:5px;flex:1 1 100%;min-width:0}
.ssh-pill{display:inline-flex;align-items:center;max-width:160px;min-height:22px;padding:0 8px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssh-message{margin:12px 0;overflow-wrap:anywhere;color:var(--dsw-alias-label-secondary)}.ssh-error{color:var(--dsw-alias-state-error-primary)}
.ssh-mask{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.45)}
.ssh-dialog{box-sizing:border-box;width:min(460px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}
.ssh-dialog-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:15px;font-weight:600}
.ssh-fields{display:grid;gap:12px;padding:18px;overflow:auto}.ssh-field{display:grid;gap:5px;color:var(--dsw-alias-label-secondary)}
.ssh-grid{display:grid;grid-template-columns:minmax(0,1fr) 96px;gap:12px}.ssh-check{display:flex;align-items:center;gap:8px}
.ssh-tagbox{display:flex;flex-wrap:wrap;align-items:center;gap:5px;padding:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:6px;background:var(--dsw-alias-bg-base)}
.ssh-tagbox input{flex:1 1 120px;min-width:90px;border:0;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;outline:none}
.ssh-tagbox .ssh-pill{gap:5px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1)}
.ssh-pill button{border:0;background:transparent;color:inherit;cursor:pointer;font:inherit;line-height:1;padding:0}
.ssh-hint{color:var(--dsw-alias-label-tertiary);font-size:11px}
.ssh-suggest{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
.ssh-tagrow{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--dsw-alias-border-l1)}
.ssh-tagrow .ssh-input{flex:1 1 140px;width:auto}
.ssh-footer{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid var(--dsw-alias-border-l1)}
@media(max-width:760px){.ssh-page{padding:16px}}
`
    const request = async (path, action) => {
      const response = await fetch(API + path, action === undefined ? undefined : {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action), credentials: 'same-origin',
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || '请求失败')
      return body
    }
    const cleanTag = (value) => value.trim().toLowerCase()
    const tagProblem = (value) => {
      const tag = cleanTag(value)
      if (!tag) return '标签不能为空'
      if (tag.length > 32) return '标签最多 32 个字符'
      if (!TAG_PATTERN.test(tag)) return '标签只能包含中英文、数字、点、下划线和横线'
      return ''
    }

    function TagList({ tags, onChange }) {
      const [draft, setDraft] = React.useState('')
      const add = (value) => {
        const tag = cleanTag(value)
        if (tag && !tagProblem(tag) && !tags.includes(tag)) onChange([...tags, tag].sort())
        setDraft('')
      }
      return h('div', { className: 'ssh-tagbox' },
        tags.map((tag) => h('span', { className: 'ssh-pill', key: tag }, tag,
          h('button', {
            type: 'button', title: `移除 ${tag}`, 'aria-label': `移除 ${tag}`,
            onClick: () => onChange(tags.filter((item) => item !== tag)),
          }, '×'))),
        h('input', {
          value: draft, placeholder: '输入标签后回车', 'aria-label': '添加标签',
          onChange: (event) => setDraft(event.target.value),
          onKeyDown: (event) => {
            if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); add(draft) }
            if (event.key === 'Backspace' && draft === '' && tags.length) onChange(tags.slice(0, -1))
          },
          onBlur: () => add(draft),
        }))
    }

    function HostForm({ initial, suggestions, busy, save, cancel }) {
      const [form, setForm] = React.useState({
        name: initial?.name || '',
        host: initial?.host || '',
        username: initial?.username || '',
        port: initial?.port || 22,
        password: '',
        enabled: initial?.enabled ?? true,
      })
      const [tagList, setTagList] = React.useState(initial?.tags || [])
      const [visible, setVisible] = React.useState(false)
      const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
      const unused = (suggestions || []).filter((tag) => !tagList.includes(tag))
      const submit = (event) => {
        event.preventDefault()
        const data = { host: form.host.trim(), username: form.username.trim(), port: Number(form.port), enabled: form.enabled, tags: tagList }
        if (form.name.trim()) data.name = form.name.trim()
        if (initial) data.id = initial.id
        if (form.password !== '') data.password = form.password
        save(data)
      }
      return h('div', { className: 'ssh-mask', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) cancel() } },
        h('form', { className: 'ssh-dialog', onSubmit: submit, role: 'dialog', 'aria-modal': true, 'aria-label': initial ? '编辑 SSH 主机' : '新建 SSH 主机' },
          h('div', { className: 'ssh-dialog-head' }, initial ? '编辑主机' : '新建主机'),
          h('div', { className: 'ssh-fields' },
            h('label', { className: 'ssh-field' }, '名称', h('input', { className: 'ssh-input', value: form.name, maxLength: 128, onChange: (event) => set('name', event.target.value) })),
            h('div', { className: 'ssh-grid' },
              h('label', { className: 'ssh-field' }, 'IP / 地址', h('input', { className: 'ssh-input', value: form.host, maxLength: 253, onChange: (event) => set('host', event.target.value), required: true })),
              h('label', { className: 'ssh-field' }, '端口', h('input', { className: 'ssh-input', type: 'number', min: 1, max: 65535, value: form.port, onChange: (event) => set('port', event.target.value), required: true }))),
            h('label', { className: 'ssh-field' }, '账号', h('input', { className: 'ssh-input', value: form.username, maxLength: 128, onChange: (event) => set('username', event.target.value), required: true })),
            h('label', { className: 'ssh-field' }, initial ? '密码（留空保持原密码）' : '密码',
              h('input', { className: 'ssh-input', type: visible ? 'text' : 'password', value: form.password, autoComplete: 'new-password', onChange: (event) => set('password', event.target.value), required: !initial }),
              h('label', { className: 'ssh-check' }, h('input', { type: 'checkbox', checked: visible, onChange: (event) => setVisible(event.target.checked) }), '显示密码')),
            h('div', { className: 'ssh-field' }, '标签',
              h(TagList, { tags: tagList, onChange: setTagList }),
              unused.length ? h('div', { className: 'ssh-hint ssh-suggest' }, '已有标签：', unused.map((tag) => h('button', {
                type: 'button', className: 'ssh-chip', key: tag, onClick: () => setTagList([...tagList, tag].sort()),
              }, tag))) : null),
            h('label', { className: 'ssh-check' }, h('input', { type: 'checkbox', checked: form.enabled, onChange: (event) => set('enabled', event.target.checked) }), '允许远程操作')),
          h('div', { className: 'ssh-footer' },
            h('button', { type: 'button', className: 'ssh-btn', disabled: busy, onClick: cancel }, '取消'),
            h('button', { type: 'submit', className: 'ssh-btn ssh-primary', disabled: busy }, busy ? '保存中…' : '保存'))))
    }

    function TagManager({ tags, busy, rename, remove, cancel }) {
      const [drafts, setDrafts] = React.useState(() => Object.fromEntries(tags.map((tag) => [tag.name, tag.name])))
      return h('div', { className: 'ssh-mask', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) cancel() } },
        h('div', { className: 'ssh-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': '管理标签' },
          h('div', { className: 'ssh-dialog-head' }, '管理标签'),
          h('div', { className: 'ssh-fields' },
            h('div', { className: 'ssh-hint' }, '重命名会合并到同名标签；删除会从所有主机移除该标签。'),
            tags.map((tag) => h('div', { className: 'ssh-tagrow', key: tag.name },
              h('input', {
                className: 'ssh-input', value: drafts[tag.name] ?? tag.name, maxLength: 32, 'aria-label': `重命名 ${tag.name}`,
                onChange: (event) => setDrafts((current) => ({ ...current, [tag.name]: event.target.value })),
              }),
              h('span', { className: 'ssh-hint' }, `${tag.count} 台`),
              h('button', {
                type: 'button', className: 'ssh-btn ssh-small', disabled: busy || cleanTag(drafts[tag.name] ?? '') === tag.name,
                onClick: () => rename(tag.name, cleanTag(drafts[tag.name])),
              }, '重命名'),
              h('button', { type: 'button', className: 'ssh-btn ssh-small ssh-danger', disabled: busy, onClick: () => remove(tag.name) }, '删除')))),
          h('div', { className: 'ssh-footer' }, h('button', { type: 'button', className: 'ssh-btn', disabled: busy, onClick: cancel }, '关闭'))))
    }

    function Page() {
      const [hosts, setHosts] = React.useState(null)
      const [facets, setFacets] = React.useState([])
      const [selected, setSelected] = React.useState([])
      const [query, setQuery] = React.useState('')
      const [editing, setEditing] = React.useState(undefined)
      const [managing, setManaging] = React.useState(false)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [statuses, setStatuses] = React.useState({})
      const applyResult = (result) => {
        setHosts(result.hosts)
        const next = result.tags || []
        setFacets(next)
        // Renaming or deleting a tag invalidates a selection that no longer exists.
        setSelected((current) => current.filter((tag) => next.some((entry) => entry.name === tag)))
      }
      React.useEffect(() => {
        let live = true
        request('/hosts').then((result) => { if (live) applyResult(result) }).catch((failure) => { if (live) setError(failure.message) })
        return () => { live = false }
      }, [])
      const change = async (action, after) => {
        if (busy) return
        setBusy(true); setError('')
        try {
          const result = await request('/action', action)
          applyResult(result)
          if (after) after(result)
        } catch (failure) { setError(failure.message) }
        finally { setBusy(false) }
      }
      const test = (host) => change({ kind: 'test', id: host.id }, (result) => setStatuses((state) => ({
        ...state,
        [host.id]: result.result && result.result.connected ? '连接成功' : '连接失败',
      })))
      const toggle = (host, enabled) => change({ kind: 'save', host: { id: host.id, enabled } })
      const remove = (host) => { if (window.confirm('删除主机“' + host.name + '”？')) change({ kind: 'remove', id: host.id }) }
      const removeTag = (name) => { if (window.confirm('从所有主机移除标签“' + name + '”？')) change({ kind: 'removeTag', name }) }
      const renameTag = (from, to) => change({ kind: 'renameTag', from, to })
      const keyword = query.trim().toLowerCase()
      // Search matches tags too; chips narrow by intersection, so every selected tag must be present.
      const filtered = (hosts || []).filter((host) => {
        const tags = host.tags || []
        if (!selected.every((tag) => tags.includes(tag))) return false
        if (keyword === '') return true
        return `${host.name} ${host.id} ${host.host} ${host.username} ${tags.join(' ')}`.toLowerCase().includes(keyword)
      })
      const toggleTag = (name) => setSelected((current) => current.includes(name) ? current.filter((tag) => tag !== name) : [...current, name])
      return h('div', { className: 'ssh-page' },
        h('div', { className: 'ssh-head' },
          h('h2', null, 'SSH 主机'),
          h('button', { type: 'button', className: 'ssh-btn ssh-primary', disabled: busy, onClick: () => setEditing(null) }, '添加主机')),
        h('div', { className: 'ssh-tools' },
          h('input', { className: 'ssh-input ssh-search', value: query, placeholder: '搜索名称、IP、账号或标签', 'aria-label': '搜索主机', onChange: (event) => setQuery(event.target.value) }),
          h('span', { className: 'ssh-meta' }, hosts === null ? '正在加载…' : `${filtered.length} / ${hosts.length} 台主机`),
          facets.length ? h('button', { type: 'button', className: 'ssh-btn ssh-small', disabled: busy, onClick: () => setManaging(true) }, '管理标签') : null),
        facets.length ? h('div', { className: 'ssh-filters' },
          facets.map((tag) => h('button', {
            type: 'button', key: tag.name, 'aria-pressed': selected.includes(tag.name),
            className: 'ssh-chip' + (selected.includes(tag.name) ? ' ssh-chip-on' : ''),
            onClick: () => toggleTag(tag.name),
          }, tag.name, h('span', { className: 'ssh-count' }, tag.count))),
          selected.length ? h('button', { type: 'button', className: 'ssh-btn ssh-small', onClick: () => setSelected([]) }, '清除筛选') : null) : null,
        error ? h('div', { className: 'ssh-message ssh-error', role: 'alert' }, error) : null,
        h('div', { className: 'ssh-list' },
          filtered.length === 0
            ? h('div', { className: 'ssh-message' }, hosts === null ? '' : hosts.length === 0 ? '暂无主机，点击右上角「添加主机」手动创建，或让 Agent 从主机文件导入。' : '没有匹配的主机')
            : filtered.map((host) => {
              const tags = host.tags || []
              return h('div', { className: 'ssh-row', key: host.id },
                h('div', { className: 'ssh-identity' }, h('div', { className: 'ssh-name' }, host.name), h('div', { className: 'ssh-id' }, host.id)),
                h('div', { className: 'ssh-endpoint' }, `${host.username}@${host.host}:${host.port}`),
                h('div', { className: 'ssh-status' }, host.enabled ? '已启用' : '已停用', h('div', { className: 'ssh-meta' }, statuses[host.id] || (host.hasPassword ? '密码已设置' : '未设置密码'))),
                h('div', { className: 'ssh-actions' },
                  h('button', { type: 'button', className: 'ssh-btn ssh-small', disabled: busy || !host.enabled, onClick: () => test(host) }, '测试'),
                  h('button', { type: 'button', className: 'ssh-btn ssh-small', disabled: busy, onClick: () => setEditing(host) }, '编辑'),
                  h('button', { type: 'button', className: 'ssh-btn ssh-small ssh-danger', disabled: busy, onClick: () => remove(host) }, '删除'),
                  h('button', { type: 'button', className: 'ssh-btn ssh-small', disabled: busy, onClick: () => toggle(host, !host.enabled) }, host.enabled ? '停用' : '启用')),
                tags.length ? h('div', { className: 'ssh-rowtags' },
                  tags.slice(0, 4).map((tag) => h('span', { className: 'ssh-pill', key: tag }, tag)),
                  tags.length > 4 ? h('span', { className: 'ssh-pill' }, `+${tags.length - 4}`) : null) : null)
            })),
        editing === undefined ? null : h(HostForm, {
          key: editing ? editing.id : 'new', initial: editing, busy,
          suggestions: facets.map((tag) => tag.name),
          save: (host) => change({ kind: 'save', host }, () => setEditing(undefined)),
          cancel: () => setEditing(undefined),
        }),
        managing ? h(TagManager, { tags: facets, busy, rename: renameTag, remove: removeTag, cancel: () => setManaging(false) }) : null)
    }

    module.exports.inject = ['slots']
    module.exports.apply = (ctx) => {
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-ssh-manager'
      style.textContent = CSS
      ctx.effect(() => { document.head.appendChild(style); return () => style.remove() }, 'dsh-ssh-manager: styles')
      ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'ssh-hosts', order: 30, label: 'SSH 主机' }, Page))
    }
    return module.exports
  },
})
