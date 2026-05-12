# Upstream T3Code Parity Plan

Source: `pingdotgg/t3code` at `b83e9c95` (`upstream-t3code/origin/main`).
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
- Hosted channel branding: recognize `VITE_HOSTED_APP_CHANNEL=latest|nightly`
  and surface the matching stage/display name in the web app; Vite forwards
  release-provided `APP_VERSION` and hosted-channel metadata into the bundle.
- Chat timeline timer updates: move streaming elapsed-time labels to
  self-updating text nodes so the chat view no longer commits every second
  while a turn is running.
- External app launching: remove the `open` package dependency and route
  browser/editor launches through Effect child-process spawning while retaining
  the fork's existing `Open` service and RPC contract names.
- Turbo release env forwarding: include hosted-release version/channel env vars
  in Turbo's global environment and pass through `PATHEXT` for Windows command
  lookup.
- Mobile input zoom prevention: align with upstream `9acf46a7` by keeping
  composer and thread rename inputs at 16px on mobile while preserving compact
  desktop sizing, preventing iOS Safari focus zoom.
- Git action dialog footer layout: align with upstream `4ceabac7` by letting
  default-branch dialog footer actions wrap and use full-width mobile buttons so
  long labels do not clip.
- Claude system prompt preset: align with upstream `cb8015a3` by starting Claude
  SDK sessions with the `claude_code` system prompt preset.
- Effect language service prepare hook: align with upstream `02dd47ea` by
  centralizing `effect-language-service patch` at the monorepo root so `bun
  install` does not run duplicate workspace prepare hooks.
- UI primitive context cleanup: partially align with upstream `b83e9c95` by
  using React 19 context shorthand and `React.use` in local shared UI
  primitives that map directly to this fork.
- Git and terminal test stabilization: align with upstream `25c9d267` by
  rewriting GitHub-looking test remotes to local bare repositories, shortening
  hook sleeps, and using a short default terminal shutdown grace in tests.
- Orchestration decider Effect idioms: partially align with upstream
  `1bcfc88f` by using Effect `DateTime.now` for generated orchestration event
  timestamps and removing stale module-load metadata defaults.
- Provider skill inline chips: partially align with upstream `11f40556` by
  adding provider skill contracts and rendering `$skill` references as inline
  chips in assistant markdown and user messages when the active provider
  advertises skills.
- Mobile safe-area chrome: partially align with upstream `d649ccf7` by enabling
  `viewport-fit=cover`/interactive keyboard resizing, adding safe-area
  utilities, applying safe insets to the mobile sidebar, and keeping the chat
  header/composer/branch toolbar clear of iOS browser chrome.
- Composer focus polish: align with upstream `bf1f3e1c` and `37cf0c11` by
  clearing the composer border after picker dismissal and giving the enabled
  send button pointer affordance while disabling pointer events when inactive.
- Localized Windows command errors: align with upstream `b0b7b38d` by matching
  localized `cmd.exe` command-not-found output in the shared process runner.
- Chat header flex distribution: align with upstream `02989fe6` by keeping the
  title/project badge area flexible and delaying header action labels until
  wider containers.
- Add-project icon parity: align with upstream `7da6522f` by using the folder
  add icon for the sidebar add-project action while preserving this fork's
  rotated plus cancel affordance while the path entry is open.
- Pending answer submit labels: align with upstream `28e481eb` by using
  singular "Submit answer" for one-question user input prompts and plural
  "Submit answers" only after multi-question progress.
- Diff panel close availability: align with upstream `86c94b48` by keeping the
  diff toggle enabled when a non-git project already has the diff panel open so
  users can close it.
- Select cursor affordance: align with upstream `047a0a69` by giving shared
  select triggers a pointer cursor.
- Composer footer overflow: align with upstream `0bc94bc2` by measuring footer
  content fit, compacting primary actions independently for wide states, and
  keeping the send/action cluster inside the composer at narrow widths.
- Composer footer focus rings: align with upstream `66d76b5d` and `f2205bdc`
  by allowing visible footer focus rings and padding the model-picker controls
  row so focus outlines are not clipped.
- Dynamic tool approvals: align with upstream `0ee302e2` by classifying
  `dynamic_tool_call` permission requests as command approvals in shared
  session logic.
- Pending user input digit shortcuts: adapt upstream `5467d119` by detecting
  nested contenteditable targets while preserving this fork's empty-editor
  number-key option shortcuts.
- Claude AskUserQuestion answer keys: align with upstream `44b39fe2` by using
  full question text as the UI answer id so Claude SDK answer lookup renders a
  non-empty tool result.
- Default-branch PR status: adapt upstream `69d9a659` by hiding stale
  merged/closed PR metadata when status is computed on common default branches.
- Windows provider health probes: adapt upstream `42ea7cfa` by treating
  Windows shell command-not-found exit results from Codex/Claude health probes
  as missing CLI errors instead of generic failed command output.
- Toast dismiss controls: partially align with upstream `3a1daa87` by adding
  dismiss buttons to standard and anchored toast bodies while leaving the
  broader stacked-toast helper migration for a later slice.
- Visited timestamp clock skew: align with upstream `22b7d8c5` by recording
  the server turn completion timestamp when marking an active thread visited,
  preventing local clock skew from hiding unread completions.
- Codex home tilde expansion: adapt upstream `aa2d385a` by expanding
  `CODEX_HOME=~/...` before Codex CLI version checks and app-server launches.

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
   - Skill discovery, composer skill autocomplete, and broader composer action
     refactors.
   - Remaining mobile/iOS layout fixes beyond safe-area chrome and input focus
     zoom prevention.

7. Tooling and release parity
   - Oxlint plugin package and stricter Effect LSP rules.
   - Release workflow changes, router-domain aliasing, Discord release
     notifications, and nightly tag behavior.
   - `packages/client-runtime` replacement/adaptation while preserving TUI
     compatibility.

## Commit strategy

- Apply one coherent upstream behavior per commit.
- Keep commits conventional.
- Preserve TUI and local package compatibility in every slice.
- When a browser-only test is blocked by missing local Playwright browsers, run
  the non-browser package tests and record the blocker.
