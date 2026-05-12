# Upstream T3Code Parity Plan

Source: `pingdotgg/t3code` at `a41f4895` (`upstream-t3code/main`).
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
- Composer draft image hydration: align persisted image hydration helper naming.
- Markdown file URI links: rewrite `file://...` markdown hrefs into clickable
  local file paths.
- Windows shell command display: unwrap PowerShell/cmd/bash wrappers while
  preserving the raw command in a tooltip.
- Proposed plan copy action: add clipboard copy to the plan card action menu.
- Sidebar logo navigation: make the sidebar wordmark link back to the thread
  list.
- New-thread plan consumption: mark proposed plans as consumed when
  implementation starts in a new thread.
- Markdown highlight stability: keep code highlighting hook order stable across
  cache hits and uncached renders.
- Long user message collapse: collapse verbose user prompts by default while
  keeping copy/revert controls available.
- Sidebar thread preview count: add configurable visible thread count per
  project and replace the hard-coded sidebar limit.
- Composer skill mention placeholder: mention `$use skills` in the composer
  empty-state prompt.
- Sticky changed-files header: keep timeline changed-files controls visible and
  tinted to match their card background while scrolling.
- Mobile command dialog scrolling: allow touch panning inside command-style
  dialogs and shared scroll areas.
- Mobile sidebar actions: reserve space for project header actions, keep the
  new-thread action visible on touch layouts, and close the mobile sidebar when
  opening settings.
- Collapsible file diffs: add per-file collapse controls in the diff panel and
  align `@pierre/diffs` on the upstream catalog pin.
- Codex auth probe timeout: give `codex login status` a 10 second timeout while
  keeping CLI reachability checks fast, with virtual-clock regression coverage.
- Diff whitespace toggle: add the default "hide whitespace changes" setting,
  diff panel override, query cache key, contracts, and git diff flag plumbing.
- Right diff panel sizing: narrow the inline and sheet diff panel widths and
  delay sheet mode until narrower viewports.
- Background fetch askpass: suppress SSH askpass prompts during upstream status
  refreshes so background git checks cannot steal focus or hang waiting for UI
  credentials.

## Remaining upstream groups

1. Runtime and provider protocol parity
   - Effect 4 catalog migration and patch.
   - `effect-acp` and `effect-codex-app-server` packages.
   - ACP/Cursor provider support and OpenCode lifecycle fixes.
   - Provider maintenance/update advisories and newer provider snapshot
     architecture.

2. Terminal and shell state parity
   - Archived shell snapshot support.
   - Latest terminal manager changes in `apps/server/src/terminal`.
   - Thread terminal drawer updates in `apps/web`.
   - Terminal cleanup and URL/path link updates not already applied.

3. Source control parity
   - Pluggable VCS foundation.
   - GitLab, Bitbucket, and Azure DevOps source control providers.
   - Faster VCS diff loading and PR state fixes.
   - Configurable automatic git fetch interval setting and UI.
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
   - Diff renderer updates beyond collapsible file sections, whitespace
     filtering, and panel sizing.
   - Skill chips and broader composer action refactors.
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
