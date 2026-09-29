# DSH SSH Manager

DSH Web Host/Client plugin for managing password SSH servers. Users can add hosts from the Settings > SSH 主机 page, or ask an Agent to read a file of IP addresses, usernames and passwords and call `ssh_host_apply`. The plugin does not read user files itself. The Agent may extract fields from CSV, tables or plain text; it supplies normalized host objects to the tool.

## Setup

Install dependencies in this package with `pnpm install`. Package with `pnpm pack`, then install the resulting tarball as a DSH bundle; its `cordis.patch.yml` adds the Host/Client row. The profile installer may request explicit build permission for `ssh2@1.17.0` and `cpu-features@0.0.10`; neither package's install script runs until you approve it. Open **设置 > SSH 主机** after the bundle activates; the page lists saved hosts and its **添加主机** button creates one by hand (IP, port, account, password), alongside Agent-driven import. The package provides the Host entry `lib/index.js` and Web Client entry `lib/client.js`; it does not modify the DSH checkout. Run `pnpm check` for focused tests. Installation alone is not enough for a running GUI: replacing an already loaded bundle requires a DSH restart, otherwise the process keeps serving the previous Host and Client halves.

Saved hosts live at `~/.dsh/ssh-manager/hosts.json` (override with `DSH_SSH_HOSTS_FILE`). This file intentionally contains plaintext passwords as requested and is created with mode `0600`; its directory uses `0700`. The UI and read-only Tools never return passwords. Importing passwords via an Agent tool places the values in that session's tool arguments and persistent transcript.

## Tags

Each host carries `tags`: lowercase, de-duplicated, sorted, at most 20 tags of 32 characters drawn from letters, digits, `-`, `_` and `.`. A stored host without tags reads as an empty list, so existing files need no migration.

The page shows tag pills on each host row, a chip per existing tag with its host count, and a 管理标签 dialog that renames a tag (merging it into an existing name) or deletes it from every host. Selecting several chips narrows by **intersection** — every selected tag must be present — and the search box additionally matches tag names, so chips narrow while search locates. Tag chips are organizational only: they never grant or revoke access, which remains the `enabled` flag.

Agent-side, `ssh_hosts` returns each host's tags plus a `tags` summary of every tag in use; reuse those names instead of inventing near-duplicates. `ssh_host_apply`, `ssh_host_create` and `ssh_host_update` accept `tags` (replace the list), `addTags` and `removeTags` (adjust it). The confirmation preview names the tag change and never includes the password.


Example normalized Tool input:

```json
{
  "hosts": [
    { "host": "192.0.2.10", "username": "deploy", "password": "password from the supplied file", "name": "staging" },
    { "host": "192.0.2.11", "username": "root", "password": "another password", "port": 2222 }
  ]
}
```

`ssh_host_apply` validates all entries, previews created/changed hosts without passwords, asks the current root Agent's user for confirmation once, then saves the batch atomically. The tools `ssh_host_create` and `ssh_host_update` cover individual changes. The management page also edits, enables/disables, removes and tests hosts. Password-only changes are accepted, and leaving the password empty in the edit form retains the saved value.

`ssh_hosts`, `ssh_test`, `ssh_exec` and `ssh_upload` operate only on enabled stored host IDs. `ssh_exec` runs one non-interactive command with a 30-second limit and returns exit code, stdout and stderr (each capped at 64 KiB). `ssh_upload` sends one regular file from the current session workspace to an absolute remote path via SFTP, at most 100 MiB; replacement requires `overwrite: true`. Upload does not create remote directories.

The first successful SSH authentication records the server's SHA-256 host-key fingerprint (trust on first use); later changes are rejected. Editing the address or port clears the pin. Connect to a new host only after verifying the endpoint yourself if authenticity matters.

The settings page lays each host out as a wrapping flex row, so **测试 / 编辑 / 删除 / 停用** stay visible when the settings panel is narrow. `scripts/layout-check.mjs` measures that in a real browser: it renders the client bundle at a given panel width and reports whether every action button is inside the panel and whether the row overflows. It needs Playwright from a local checkout (`PLAYWRIGHT_ENTRY`) plus a Chromium build (`BROWSER_PATH`), so it is not part of `pnpm check`.

## File deletion review

The plugin scans `ssh_exec` commands for common file-deleting forms: `rm`, `rmdir`, `unlink`, `shred`, `find -delete/-exec`, `xargs rm`, `rsync --delete/--remove-source-files`, `git clean` and trash commands. Matches trigger DSH `approval.request` **before connecting**. Only `allowed-once` executes that exact command. A session with `never` approval policy or without an available approver refuses these commands. Docker, Kubernetes and database deletions are out of scope. The scan is heuristic: scripts, aliases, variables and arbitrary programs can delete files without matching; other SSH invocations outside this plugin are not intercepted.

## Known limitations

Only password authentication is implemented. First-use host keys are pinned after a successful login, not preverified against `known_hosts`. SFTP server support is required for uploads. Configuration file parsing is delegated to the Agent and so its original file format is not a fixed plugin contract. The management API applies DSH Connection browser authentication and Host/Origin checks before serving the same-origin settings page. There is no interactive PTY, download, directory sync or long-running background job support.
