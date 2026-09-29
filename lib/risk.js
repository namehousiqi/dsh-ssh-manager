// Conservative text scan: false positives require a review; shell expansion can still hide a deletion.
const rules = [
  { label: 'rm / rmdir / unlink', pattern: /(^|[^a-zA-Z0-9_])(rm|rmdir|unlink|shred|srm|wipe)(?=$|[^a-zA-Z0-9_])/i },
  { label: 'find -delete', pattern: /\bfind\b[\s\S]*?\s-delete\b/i },
  { label: 'find -exec', pattern: /\bfind\b[\s\S]*?\s-(?:exec|execdir|ok|okdir)\b/i },
  { label: 'rsync --delete / --remove-source-files', pattern: /\brsync\b[\s\S]*?--(?:delete(?:-[a-z-]+)?|remove-source-files)\b/i },
  { label: 'git clean', pattern: /\bgit\s+(?:(?:-C|--git-dir|--work-tree)\s+\S+\s+)*clean\b/i },
  { label: 'trash', pattern: /\b(?:trash|trash-put|gio\s+trash)\b/i },
]

export function deletionRisks(command) {
  if (typeof command !== 'string') throw new Error('命令必须是字符串')
  const normalized = command.replace(/\\(?=[a-zA-Z])/g, '').replace(/(['"])\1/g, '')
  return rules.filter(({ pattern }) => pattern.test(normalized)).map(({ label }) => label)
}
