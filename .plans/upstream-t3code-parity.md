# Upstream T3Code Parity Plan

Source: `pingdotgg/t3code` at `d15909af` (`upstream-t3code/main`).
Fork baseline: `b3bca04c`.

This fork intentionally preserves local TUI-only surfaces such as `apps/tui` and
`packages/client-core`. Upstream parity work must apply upstream behavior without
removing those fork surfaces unless a replacement has been implemented and wired.

## Verification gates

- `bun fmt`
- `bun lint`
- `bun typecheck`
- Focused package tests for each parity slice
- `bun run test` before declaring broad parity complete

## Completed slices

- Terminal fit dimensions: allow xterm-fit ultrawide dimensions.
- Browser chrome theme sync: keep document and mobile browser theme colors in
  sync with the app surface.
- Terminal path links: linkify Windows `C:/...` paths in terminal output.
- Provider model picker offset: keep provider submenus from overlapping their
  parent menu.
- Error toast copy action: make error details copyable from toast UI.
- Claude model reset guard: avoid re-sending the same Claude model to the SDK on
  every turn.
- Claude stream exit handling: handle SDK stream exits inside the forked stream
  effect.
- Windows line endings: enforce LF checkouts for format stability.
- Bootstrap fd fallback: read inherited bootstrap fds directly when fd-path
  duplication fails.
- Editor open parity: add VS Code Insiders, VSCodium, Trae, IntelliJ IDEA, Zed
  command aliases, and Windows launch argument quoting.
- Wrapped terminal links: resolve terminal URLs that wrap across physical buffer
  rows.

## Remaining upstream groups

1. Runtime and provider protocol parity
   - Effect 4 catalog migration and patch.
   - `effect-acp` and `effect-codex-app-server` packages.
   - ACP/Cursor provider support and OpenCode lifecycle fixes.
   - Provider maintenance/update advisories.

2. Terminal and shell state parity
   - Archived shell snapshot support.
   - Latest terminal manager changes in `apps/server/src/terminal`.
   - Thread terminal drawer updates in `apps/web`.
   - Terminal cleanup and URL/path link updates not already applied.

3. Source control parity
   - Pluggable VCS foundation.
   - GitLab, Bitbucket, and Azure DevOps source control providers.
   - Faster VCS diff loading and PR state fixes.
   - New source control docs and settings UI.

4. Settings and remote access parity
   - Settings route split and keybindings editor.
   - Hosted pairing UI and remote access contracts.
   - SSH and Tailscale packages and desktop integration.
   - Diagnostics views for process and trace capture.

5. Desktop app parity
   - Desktop app Effect refactor.
   - Backend/server exposure manager.
   - Electron 41.5.0 and desktop IPC split.
   - Update flow and packaging changes.

6. Web UI parity
   - Sidebar performance and grouping changes.
   - Collapsible file diffs, changed-files sticky header, and diff renderer
     updates.
   - Skill chips and composer placeholder skill mentions.
   - Mobile/iOS layout fixes.

7. Tooling and release parity
   - Oxlint plugin package and stricter Effect LSP rules.
   - Release workflow changes, Discord release notifications, and nightly tag
     behavior.
   - `packages/client-runtime` replacement/adaptation while preserving TUI
     compatibility.

## Commit strategy

- Apply one coherent upstream behavior per commit.
- Keep commits conventional.
- Preserve TUI and local package compatibility in every slice.
- When a browser-only test is blocked by missing local Playwright browsers, run
  the non-browser package tests and record the blocker.
