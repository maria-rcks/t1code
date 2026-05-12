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
- Project path context action: align with upstream `ce463a53` by adding a
  sidebar project context-menu action that copies the project workspace path.
- macOS project context-menu drag guard: align with upstream `64d21bd6` by
  treating Ctrl-primary-click as a context-menu gesture on macOS and preventing
  it from arming sidebar project drag.
- Settings Escape navigation: adapt upstream `c4264522` by letting Escape leave
  the settings page, with a router fallback when there is no browser history.
- Git branch column parsing: align with upstream `19eb9e72` by passing
  `--no-column` when listing branches so `column.ui=always` cannot merge
  multiple branch names into one parsed row.
- Mobile sidebar dismissal: adapt upstream `a4298f1c` by closing the mobile
  sidebar after plain thread selection, keyboard thread activation, or sidebar
  new-thread creation.
- Git actions header sizing: align with upstream `2aa11ae0` by preventing the
  Git actions group from shrinking into the terminal toggle.
- Changed-files collapse scroll anchoring: align with upstream `d4178198` by
  ignoring changed-file tree toggles as scroll anchors and avoiding virtualizer
  scroll correction for rows intersecting the viewport.
- Stale send spinner guard: adapt upstream `48481aa9` in shared session logic
  so a completed latest turn is settled even if the session status briefly
  remains `running`.
- Hidden thread status indicator: partially align with upstream `d5f23331` by
  showing the aggregated status for hidden preview threads beside the sidebar
  "Show more" control.
- Worktree branch publishing refspec: align with upstream `d2822a88` by using
  `HEAD:refs/heads/<branch>` when first pushing a branch with upstream setup,
  avoiding ambiguous slashed branch names from linked worktrees.
- Markdown code block copy spacing: align with upstream `1bf048eb` by reserving
  space for the web markdown copy button so long code does not render under the
  control.
- Pending approval projection guard: align with upstream `d22c6f52` by ignoring
  non-approval activities that carry `requestId`, such as user-input requests,
  when populating pending approval rows.
- Terminal global shortcut bypass: align with upstream `39ca3ee8` by passing
  resolved keybindings into the terminal viewport and letting global terminal
  and diff shortcuts bypass xterm handling while focused.
- External markdown link safety: align with upstream `73b2f255` by opening
  external chat markdown links with `rel="noopener noreferrer"`; this behavior
  already has ChatMarkdown regression coverage in this fork.
- Diff turn strip fade: align with upstream `57d7746a` by replacing absolute
  overlay gradients with a `mask-image` fade on the scrollable turn strip.
- Terminal shortcut capture phase: align with upstream `0f184c28` by installing
  the ChatView global shortcut handler in capture phase so terminal-focused
  Ctrl+J can still toggle the terminal on Windows.
- Composer command menu highlighting: align with upstream `63584449` by
  disabling automatic menu highlighting and using the composer's controlled
  active item state for hover styling.
- Claude Ultrathink effort switching: adapt upstream `61f98309` by allowing the
  traits picker to strip an injected `Ultrathink:` prefix when selecting a
  normal effort, while preserving a warning when the prompt body contains
  user-authored ultrathink text.
- Sidebar empty project state: align with upstream `7b676b76` by showing a
  muted "No threads yet" row when an expanded project has no threads.
- Branch selector hover state: align with upstream `fc650706` by letting
  selected/highlighted combobox item states own the active branch styling
  instead of forcing a static active background.
- Claude prompt stream shutdown: align with upstream `0a503d0c` by converting
  prompt-queue interrupt causes into an empty SDK prompt stream during session
  stop.
- Codex stderr warning projection: align with upstream `83eb396c` by emitting
  classified process stderr as notifications and mapping them to
  `runtime.warning` instead of active-turn runtime errors.
- Chat message typography: align with upstream `7c0849fe` by using proportional
  text for user-message bodies, slightly stronger timestamp metadata, compact
  work-entry labels, and snug/smaller markdown code blocks.
- Sidebar selection rerenders: partially align with upstream `7455472c` by
  reading selection presence imperatively in sidebar click/global-dismiss
  handlers so those callbacks do not resubscribe to selection-size changes.
- Atomic config writes: partially align with upstream `e25db3a5` by adding a
  UUID temp-directory based atomic writer and using it for the local keybindings
  config writer, avoiding timestamp temp-path collisions.
- WebSocket stale lifecycle events: adapt upstream `dbebc387` by marking the
  currently active socket as soon as a connection attempt starts and ignoring
  stale open/message/close/error events from superseded sockets after reconnect.
- Pull request checkout references: partially align with upstream `d8a485ea`
  by accepting `gh pr checkout ...` inputs in PR reference parsing and keeping
  the synthetic checkout-PR branch picker item visible for those queries, with
  matching dialog placeholder and validation copy.
- Pull request reference canonicalization: align with upstream `cd7980b4` by
  normalizing `#123` inputs to the raw numeric PR reference before resolving or
  preparing a PR thread.
- Composer command menu active scroll: align with upstream `4a4795e5` by
  scrolling the controlled active command/menu item into view as keyboard
  navigation changes the active item.
- Provider session cwd resume: partially align with upstream `188df6da` by
  reusing persisted cwd when `ProviderService.startSession` resumes an existing
  provider binding without an explicit cwd, preventing workspace drift.
- Claude durable resume ids: partially align with upstream `188df6da` by
  ignoring transient Claude resume hook `session_id`s when updating the resume
  cursor and provider thread id.
- Web React dependency pins: partially align with upstream `b83e9c95` by
  pinning the web app to React/React DOM 19.2.6, React type packages, and the
  stable React compiler package.
- Provider instance contracts: partially align with upstream `08e6d4cf` by
  adding open provider driver slugs, provider instance ids, config envelopes,
  and environment-variable contracts as a foundation for multi-provider backend
  routing.
- Provider snapshot contracts: partially align with upstream `08e6d4cf` by
  adding rich server provider snapshots, model capabilities, slash commands,
  availability shadows, version advisories, and update-state schemas alongside
  the fork's existing legacy provider status payload.
- Provider status cache: partially align with upstream `008ac5c3` and
  `08e6d4cf` by adding atomic read/write helpers for rich provider snapshots,
  instance-correlated hydration, and deterministic provider snapshot ordering.
- Shared semver helpers: align with upstream provider-maintenance prerequisites
  by adding semver normalization, comparison, and lightweight range checking to
  `@t3tools/shared/semver`.
- Shared command path resolution: partially align with upstream shell helpers
  by adding `resolveCommandPath`/`isCommandAvailable` for provider maintenance
  install-source detection.
- Provider maintenance advisories: partially align with upstream `08e6d4cf` by
  adding provider maintenance capability resolution, npm latest-version
  advisory enrichment, update command selection for npm/bun/pnpm/vite-plus,
  Homebrew, native installers, and manual/custom binaries.
- Provider snapshot scaffolding: partially align with upstream `08e6d4cf` by
  adding managed server-provider snapshot sources, provider snapshot helpers,
  byte-capped stream collection, and model-capability cloning for open provider
  drivers.
- Provider driver scaffolding: partially align with upstream `08e6d4cf` by
  adding the provider driver/instance SPI, provider-instance environment
  merging, provider snapshot source typing, and unavailable shadow snapshot
  helpers.
- Provider instance registry: partially align with upstream `08e6d4cf` by
  adding the live provider instance registry/mutator, per-instance scopes,
  same-driver multi-instance boot, unknown-driver shadow snapshots, and
  reconcile teardown semantics.
- Provider registry aggregation: partially align with upstream `08e6d4cf` by
  adding rich provider snapshot aggregation over live instances, unavailable
  shadows, cache hydration/persistence, refresh routing, stream subscriptions,
  and volatile provider update state.
- Provider settings contracts: partially align with upstream `08e6d4cf` by
  adding server/client settings schemas, per-driver provider setting schemas,
  instance-based model selections, and legacy option-selection decoding for the
  next provider driver and settings UI slices.
- Shared server settings helpers: partially align with upstream `08e6d4cf` by
  adding lenient settings JSON parsing, deep settings patch merging,
  instance-based model-selection helpers, and observability settings extraction.
- Server secret store: partially align with upstream `08e6d4cf` by adding a
  filesystem-backed secret store and derived settings/secrets config paths for
  redacted provider environment variables.
- Server settings service: partially align with upstream `08e6d4cf` by adding
  the server-authoritative settings runtime with JSON persistence, patch
  updates, settings streams, text-generation provider fallback, and provider
  environment secret materialization/redaction.
- Provider event loggers service: partially align with upstream `08e6d4cf` by
  adding the shared native/canonical provider event logger service expected by
  provider drivers and the normalized provider runtime.
- Provider home layout helpers: partially align with upstream `08e6d4cf` by
  adding Codex shared/shadow home materialization and Claude HOME resolution,
  continuation keys, and capabilities cache keys for built-in driver instances.
- Claude provider snapshot wrapper: partially align with upstream `08e6d4cf`
  by adding Claude model capabilities, provider snapshot construction,
  pending snapshots, CLI effort normalization, API model id resolution, and
  SDK initialization capability probing for the new driver path.
- Codex app-server client package: partially align with upstream `08e6d4cf` by
  adding the generated Codex app-server schema/rpc/protocol client package,
  adapting it to this fork's Effect 4 `Stdio` and `ServiceMap` APIs, and
  covering the JSON-RPC transport with focused protocol/client tests.
- Codex provider snapshot wrapper: partially align with upstream `08e6d4cf`
  by adding app-server backed Codex provider probing, account/model/skill
  projection, custom model fallbacks, CODEX_HOME expansion, and pending/error
  snapshot coverage for the new driver path.
- Provider text-generation core: partially align with upstream `08e6d4cf` by
  adding instance-routed text-generation service contracts, shared prompt
  builders, text-generation policies/presets, contract-level
  `TextGenerationError`, and focused registry/prompt regression tests.
- Codex text generation: partially align with upstream `08e6d4cf` by adding
  per-instance `codex exec` text generation with model option forwarding,
  CODEX_HOME expansion, structured output decoding, attachment image
  materialization, cleanup, and focused fake-binary coverage.
- Claude text generation: partially align with upstream `08e6d4cf` by adding
  per-instance `claude -p` structured-output text generation with effort,
  fast-mode/thinking settings, Claude HOME environment resolution, schema
  decoding, and focused fake-binary coverage.

## Remaining upstream groups

1. Runtime and provider protocol parity
   - Effect 4 catalog migration and patch.
   - `effect-acp` package.
   - ACP/Cursor provider support and OpenCode lifecycle fixes.
   - Built-in driver catalog and provider registry integration with current
     server/WebSocket config surfaces.
   - Provider update execution runners/coordinators and newer provider snapshot
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
