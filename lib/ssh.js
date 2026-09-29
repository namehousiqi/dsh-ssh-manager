import ssh2 from 'ssh2'
const { Client } = ssh2
import { createHash } from 'node:crypto'
import { createReadStream, statSync, realpathSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'
import { pipeline } from 'node:stream/promises'

const MAX_OUTPUT = 65536
const MAX_UPLOAD = 100 * 1024 * 1024
const TIMEOUT_MS = 30000

function clippedAppend(chunks, chunk, count) {
  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
  if (count < MAX_OUTPUT) chunks.push(bytes.subarray(0, MAX_OUTPUT - count))
  return count + bytes.length
}

export async function withConnection(store, host, signal, operation, ClientType = Client) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const client = new ClientType()
  let fingerprint
  let onAbort
  const aborted = new Promise((_, reject) => {
    onAbort = () => {
      client.destroy()
      reject(new Error(signal?.aborted ? 'SSH 操作已取消' : 'SSH 操作超时'))
    }
    combined.addEventListener('abort', onAbort, { once: true })
    if (combined.aborted) onAbort()
  })
  const ready = new Promise((accept, reject) => {
    client.once('ready', accept)
    client.once('error', reject)
    client.once('close', () => reject(new Error('SSH 连接关闭')))
  })
  // Keep a listener while the connection shuts down; connection errors also reject active channel operations.
  client.on('error', () => {})
  client.on('keyboard-interactive', (_name, _instructions, _lang, prompts, finish) => {
    finish(prompts.map(() => host.password))
  })
  try {
    if (combined.aborted) throw new Error('SSH 操作已取消')
    client.connect({
      host: host.host, port: host.port, username: host.username, password: host.password,
      readyTimeout: 10000, tryKeyboard: true,
      hostVerifier: (key) => {
        fingerprint = 'SHA256:' + createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
        return !host.fingerprint || host.fingerprint === fingerprint
      },
    })
    await Promise.race([ready, aborted])
    await store.pin(host.id, fingerprint, `${host.host}:${host.port}`)
    return await Promise.race([operation(client, combined, fingerprint), aborted])
  } finally {
    combined.removeEventListener('abort', onAbort)
    client.destroy()
  }
}

export function execCommand(client, command) {
  return new Promise((resolveResult, reject) => {
    client.exec(command, { pty: false }, (error, stream) => {
      if (error) return reject(error)
      const stdout = [], stderr = []
      let outBytes = 0, errBytes = 0
      stream.on('data', (part) => { outBytes = clippedAppend(stdout, part, outBytes) })
      stream.stderr.on('data', (part) => { errBytes = clippedAppend(stderr, part, errBytes) })
      stream.on('error', reject)
      stream.on('close', (code, signal) => resolveResult({
        exitCode: code ?? null, signal: signal || null,
        stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8'),
        truncated: outBytes > MAX_OUTPUT || errBytes > MAX_OUTPUT,
      }))
    })
  })
}

export function uploadFile(client, localPath, remotePath, overwrite = false) {
  if (typeof remotePath !== 'string' || !remotePath.startsWith('/') || remotePath.includes('\0') || remotePath.length > 4096) throw new Error('远程路径必须是绝对路径')
  return new Promise((resolveResult, reject) => {
    client.sftp(async (error, sftp) => {
      if (error) return reject(error)
      try {
        await pipeline(createReadStream(localPath), sftp.createWriteStream(remotePath, { flags: overwrite ? 'w' : 'wx' }))
        resolveResult({ remotePath, bytes: statSync(localPath).size })
      } catch (failure) { reject(failure) }
    })
  })
}

export function resolveUploadSource(source, cwd) {
  if (typeof source !== 'string' || !source.trim()) throw new Error('本地源文件不能为空')
  const root = realpathSync(cwd)
  const file = realpathSync(resolve(root, source))
  const rel = relative(root, file)
  if (rel === '..' || rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) || isAbsolute(rel)) throw new Error('上传源文件必须位于会话工作区内')
  const stat = statSync(file)
  if (!stat.isFile() || stat.size > MAX_UPLOAD) throw new Error('仅支持工作区内不超过 100 MiB 的普通文件')
  return file
}
