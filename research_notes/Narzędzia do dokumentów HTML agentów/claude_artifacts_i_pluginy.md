# Claude Artifacts, Claude Code and the plugin system vs. the agent-HTML-docs workflow (as of 5 November 2026)

Method and evidence labels used below:
- **[Docs]** official documentation or changelog.
- **[Tool]** text returned by Anthropic's own tools in this session: the `claude-artifacts` MCP server (`guide`, `describe_capabilities`, tool descriptions) and Claude Desktop's tool schemas. Authoritative for what those tools do, but not published documentation.
- **[Observed]** seen directly on this machine. Undocumented, so it could change.
- **[3rd-party]** community or vendor source.
- Latest Claude Code changelog entry at time of research: 2.1.318 — [CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).

## Claude Artifacts: how far do they go?

### Takeaway
Artifacts already cover hosted publishing, versions at one stable URL, a personal gallery, threaded comments that Claude can read and answer, watch-for-comments, and a per-artifact database. They do not cover local-only storage, organization by repo/branch/PR, private sticky markers as a built-in feature, or any documented visual diff between versions. The remaining gap is the library and review layer around the documents, not rendering or hosting.

### Cited Findings

**What an artifact is, and where it lives**
- An artifact is "a live, interactive web page that Claude Code publishes from your session to a private URL on claude.ai"; a new artifact "is visible only to you" until shared — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- Unless a location is named, Claude writes the source to an HTML or Markdown file in a temporary directory outside the project, then publishes it — [Artifacts docs](https://code.claude.com/docs/en/artifacts). So the local file is transient by default and the hosted copy is the durable one.
- Content is stored on Anthropic-operated infrastructure. Owners can set retention separately for private and shared artifacts — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- Requirements: Pro, Max, Ultra, Team or Enterprise; a claude.ai login (API key, gateway token or cloud credentials cannot publish); Anthropic API provider (not Bedrock, Agent Platform or Foundry); no CMEK, HIPAA or ZDR on the org; CLI or Desktop 1.13576.0+. Off by default in `-p`, the Agent SDK, the GitHub Action and MCP-server contexts — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- There is no local-file mode for artifacts. When a requirement fails, Claude "writes a local HTML file or says it cannot publish instead" — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- In September 2026 artifacts were reworked: legacy artifacts from before 16 September 2026 keep working but new ones can't be created — [What are artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them).

**Gallery, listing, organization**
- Gallery at claude.ai/code/artifacts "lists every artifact you have created" — [Artifacts docs](https://code.claude.com/docs/en/artifacts). The launch post says it lets you "browse and manage" artifacts — [Claude blog, 18 June 2026](https://claude.com/blog/artifacts-in-claude-code).
- The Artifacts tab in the Claude sidebar shows everything you've made and lets you start from a template and "organize" them; the article does not explain what organizing means — [What are artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them).
- `/artifacts` in Claude Code lists owned and shared artifacts, this session's first, with keys to open, copy link, attach or delete. It reads from the claude.ai account, so it works in a new session — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- A user can pin an artifact to their own claude.ai sidebar; pins are private to that user — [Tool: `pin_artifact` description].
- A session keeps its artifacts on a `⧉` pill; a *different* session creates a new artifact unless given the URL or attachment — [Artifacts docs](https://code.claude.com/docs/en/artifacts). So "same doc, next session" depends on the agent knowing the URL.

**Versions**
- "Each publish becomes a version," and from the **Share** control you choose which version viewers see, with an "Always share latest version" toggle and a version picker visible in the docs' screenshot description — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- "Every publish is a new version at the same link, with version history so you can restore at any time" — [Claude blog](https://claude.com/blog/artifacts-in-claude-code).
- Publishes use optimistic concurrency: a stale `base_version` is refused — [Tool: `guide` pages topic], and editors' stale publishes are refused and merged — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- **Visual diff between versions: no documentation found.** The blog post, the Claude Code page and the support article say nothing about compare or diff. Absence in docs is not proof of absence in the UI — see Gaps.
- The Compliance API exposes per-version content: `GET /v1/compliance/apps/code/artifacts/{artifact_id}/versions/{version_id}` — [Artifacts docs](https://code.claude.com/docs/en/artifacts). This is an admin API, not a developer API.
- One blog claims the Compliance API exposes only about the 20 most recent versions — [Nimbalyst, 3rd-party](https://nimbalyst.com/blog/claude-code-artifacts-guide/). Not verified officially.

**Comments**
- People you share with inside your organization can comment; Claude reads comments when asked, or when someone who can edit sends a comment to Claude ("Send to Claude") or mentions `@claude`. Needs v2.1.221+ — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- "Claude can reply to or resolve only an activated thread." Others stay open until a person resolves them. Replies show as Claude, via you — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- The MCP tool `read_comments` returns only threads "that the user has sent to Claude", with an anchor for where the thread sits on the page, plus `author_access` and `claude_may_edit` flags — [Tool: `read_comments` description]. The Claude Code docs' wording ("Claude lists each thread and marks the comments ... sent to it") suggests the built-in Artifact tool can see more threads than the MCP server does. This difference is unresolved.
- **Watch:** after publishing, a session watches the artifact and comments sent to Claude "reach your session right away"; needs v2.1.228+. Behaviour depends on permission mode (auto-reply vs. waits). Limit: stops auto-replying after 60 sent comments or activations per artifact per hour. Watches can end after several hours idle — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- A local session can watch up to 25 artifacts at once — [CHANGELOG](https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md).
- The `watch` MCP tool says "Only a cloud session can be woken" — [Tool: `watch` description]. So this differs between the MCP server and the built-in Claude Code tool.
- Access levels are Can view (read comments), Commenter (add comments), and Can edit. Invited outsiders can't mention people or ask Claude, get no comment emails, and can't comment if the artifact is also public — [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts).
- Public-link viewers can't see or add comments — [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts).
- Pages can integrate with commenting: the `comments` capability opens the shell's composer for an element or range, and supports custom anchors. It is "WRITE-ONLY: the shell renders every thread — never build the page's own list" — [Tool: `describe_capabilities`].
- Conflict on scope: the Claude Code docs describe comments only for org sharing, while the support article describes Commenter access for invitees, and lists email invitations for Pro/Max/Ultra. How comments and "Send to Claude" work for a solo Pro/Max owner is not spelled out — see Gaps.

**Shared database and storage**
- Consumer-facing storage: personal and shared storage, 20 MB per artifact, text only, Pro and up, with a confirmation before first shared use — [What are artifacts](https://support.claude.com/en/articles/17153992-what-are-artifacts-and-how-do-i-use-them).
- Developer-facing `db` capability: document/collection model with `get/set/update/delete`, `where/orderBy/limit`, `onSnapshot`, per-path access rules (`view < interact < admin < owner`, plus `self`), and private per-person paths at `data/users/<id>/` that are private "even from the owner" — [Tool: `describe_capabilities` db].
- Claude can read and write it through `db_get`, `db_list`, `db_query`, `db_write`, and only on an artifact whose published page declares a database — [Tool: server instructions and `db_query` description].
- The `db` is per artifact. No documented cross-artifact database was found — see Gaps.
- Other declared capabilities: `artifact`, `assets`, `comments`, `db`, `downloads`, `files` (reads a Claude Code project's files as the viewer, using a project id), `mcp`, `room` (live presence), `sample` (asks Claude), `user` — [Tool: `describe_capabilities`, runtime contract 0.2.96]. Only part of this is in public docs.

**Sharing**
- Team/Enterprise: specific people, everyone in the org, groups on Enterprise. Public link is off until an Owner enables External sharing — [Artifacts docs](https://code.claude.com/docs/en/artifacts), [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts).
- Pro/Max/Ultra: only you or anyone with the link, plus email invitations (beta) — [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts).
- Up to 50 outside invitees per artifact; pending invitations expire after 30 days — [Share artifacts](https://support.claude.com/en/articles/9547008-share-artifacts).
- The June launch post says artifacts "cannot be made public", which is out of date; current docs describe public sharing — [Claude blog](https://claude.com/blog/artifacts-in-claude-code) vs. [Artifacts docs](https://code.claude.com/docs/en/artifacts).

**Interactivity, network and limits**
- HTML, CSS and inline JS work. Rendered page limit 16 MiB; source must be `.html`, `.htm` or `.md`; strict CSP; no backend; sandboxed `*.claudeusercontent.com` origin — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- `fetch`, XHR and WebSocket reach only the page's own origin and Google Fonts hosts. External images are blocked. Libraries come only from allowlisted CDNs — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- Small conflict: docs say five CDN hosts; the MCP guide also lists `cdn.plot.ly` and specific jsDelivr paths (pyodide, python-visualization) — [Tool: `guide` pages topic].
- Sandbox: `alert`, `confirm`, `prompt`, `window.print`, page-started downloads, service workers, WebRTC, `<object>`, `<embed>`, iframes of other sites, and clipboard reads are refused — [Tool: `guide` pages topic].
- `localStorage` and IndexedDB keep data in one viewer's browser only and may be missing — [Tool: `guide` pages topic].
- Only a plain `#name` hash passes between artifact URL and page; `#/path`, `#key=value`, pushState paths and query strings don't. Several names are reserved, including `comment-*` — [Tool: `guide` pages topic].
- Links: `<a href>` to other sites opens outside the page; `window.open` fails for most viewers — [Tool: `guide` pages topic]. No built-in doc-to-doc link model or backlinks was found.
- Conflict on multi-file: Claude Code docs say "Single page: Relative links do not resolve" — [Artifacts docs](https://code.claude.com/docs/en/artifacts). The artifacts MCP server has `publish_files` and says "A page published from files may also load its own files by relative path" — [Tool: `guide` pages topic]. So multi-file exists in the MCP path but is not described in the Claude Code page.
- Connectors: pages can call the viewer's claude.ai connectors, but "Local MCP servers ... can supply data while Claude builds the page, but the published page can't call them" (v2.1.209+) — [Artifacts docs](https://code.claude.com/docs/en/artifacts).
- Publishes that declare capabilities ask for approval — [Artifacts docs](https://code.claude.com/docs/en/artifacts).

### Inferences
- Artifacts are a strong *hosting and comment backend* but a weak *library*: the listing is a flat personal gallery, with no documented project, repo, branch or PR fields.
- A custom tool can coexist with artifacts rather than replace them. For example it could store the mapping of `artifact URL ↔ repo/branch/PR/session` itself. Whether artifacts expose enough to do that without user sign-in is unclear, because the public API surface for developers is limited to the Compliance API (admin only) and Claude's own tools.
- "Personal sticky markers" could be built *inside a page* with `db` at `data/users/<id>/`, but every page would need that code plus declared capabilities, which require approval on publish. That suits a template, not arbitrary agent output.
- Anything needing strict local storage (client code, ZDR orgs, Bedrock or Vertex users, API-key sessions) falls outside artifacts entirely. This is the clearest positioning gap for a local-first tool.
- Interactive docs using arbitrary network calls, multi-route navigation or query-string state will not port cleanly to artifacts.

### Gaps
- Could not confirm from documentation whether the gallery has search, tags, folders or sort. The support article just says "organize". I did not open the signed-in UI.
- No official statement on visual diff or compare between versions. Worth checking directly in the Share/version UI at claude.ai.
- Whether version history has a retention cap for users is undocumented; the "20 versions" figure is third-party and concerns the Compliance API.
- Whether a solo Pro/Max user gets the full comment-to-Claude loop is not explicit.
- No documented public REST API for listing or reading artifacts outside admin use. Not found, rather than confirmed absent.
- No documented cross-artifact shared database.

## Claude Code desktop app: Browser pane, artifacts pane, file pane, comments, mods

### Takeaway
The Code tab can already open local HTML in a built-in Browser pane, drive it with agent tools, show a session's artifacts in a pane, and accept line comments on code diffs. There is no documented comment-on-preview for HTML. Mods are real, officially documented, and can add panes, bands, commands and tools across terminal, Desktop and VS Code. But they draw a restricted element tree, not arbitrary HTML, so a mod cannot host the rendered library in a pane as far as the documentation shows.

### Cited Findings

**Browser, files, diff, artifacts**
- "In a local session, click an HTML, PDF, or video path in the chat to open it in the Browser pane" — [Desktop docs](https://code.claude.com/docs/en/desktop).
- Claude can start a dev server and open it in the Browser pane; config lives in `.claude/launch.json`; a config with `url` and no command attaches to a server already running — [Desktop docs](https://code.claude.com/docs/en/desktop). A plugin-launched local server could therefore be attached to as long as `launch.json` is set up, though that file lives in the project.
- A localhost `url` in `launch.json` must be origin only, with no path or query, and the port must match — [Desktop docs](https://code.claude.com/docs/en/desktop). Deep links need a follow-up navigation.
- The Browser pane's tools aren't available in SSH sessions — [Desktop docs](https://code.claude.com/docs/en/desktop).
- The pane has an element-select shortcut (Cmd+Shift+S) — [Desktop docs](https://code.claude.com/docs/en/desktop). The shortcut table gives no further detail about what selecting does. It may feed the chat, but this was not confirmed.
- Line comments exist in the **diff view** only: hover a line, click **+**, submit all with Cmd/Ctrl+Enter — [Desktop docs](https://code.claude.com/docs/en/desktop). A grep of the full `desktop.md` found no annotate or comment feature for Browser pane content.
- Panes: chat, diff, browser, terminal, file editor, plan, tasks, subagent, and iOS Simulator on macOS. Panes can be dragged and popped out; pane layout requires Desktop v1.2581.0+ — [Desktop docs](https://code.claude.com/docs/en/desktop).
- File pane is editable in local sessions and view-only in cloud, SSH and WSL — [Desktop docs](https://code.claude.com/docs/en/desktop).
- A pane named `artifact`, showing "the artifacts this session published", exists — [Tool: `mcp__ccd_view__show_pane` schema]. A grep of `desktop.md` found no mention of "artifact" panes, so this is undocumented in public docs. It only shows *this session's* artifacts, not a library.
- `show_pane` also offers `diff`, `file`, `terminal`, `pr`, `tasks`, `plan`, `preview` — [Tool: same schema]. This is a host tool for the agent, not a documented plugin API.
- `mcp__ccd_pr__get_status` reads the PR bound to a session: number, URL, state, branches, CI — [Tool: schema]. Desktop tracks session-to-PR binding, but this is exposed as a tool for the agent, not to plugins as a documented API.
- Inline widgets: this session has a `show_widget` tool that renders SVG/HTML "inline alongside your text response", with `sendPrompt()` — [Tool: `mcp__visualize__show_widget` description]. It is agent-only and undocumented for third parties.

**Mods**
- "A mod is a plugin that changes how Claude Code looks and behaves," made of JS/TS event handlers running inside Claude Code — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md).
- On by default: terminal v2.1.287+, Desktop's embedded copy from v2.1.286, VS Code drawing with extension 2.1.299+ — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md), [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md).
- Where drawing appears: terminal (including JetBrains' terminal) yes; Code tab yes, except WSL; VS Code panel yes; `-p` and SDK no; Remote Control only in the local terminal; cloud sessions no — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md).
- Can draw: `Pane`, `AbovePrompt` (band), message rows, tool rows, spinner, and more. API includes `$.ui.open`, toast, status, notify, `$.ui.ask`, and `$.command`, `$.tool`, `$.agent`, `$.model`, `$.prompt`, `$.session`, `$.fs`, `$.store`, `$.http`, `$.process`, `$.mcp`, `$.clock` — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md).
- Elements: `Box`, `Text`, `Button`, `Link`, `Code` (including `format: 'diff'`), `Markdown`, `Input`, `Select`; `Svg` on Desktop and VS Code; `Client` on terminal and Desktop; `Raster` and `Image` in terminal only — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md).
- `Client` is "a region drawn by a second file of yours, for animation and pointer input", with no mods API, talking through `ui.message` — [Mods interface](https://code.claude.com/docs/en/plugins/mods/interface.md). The type declarations say it runs on the drawing thread and its elements come from the terminal table — [claude-code.d.ts](https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts). Nothing mentions a webview, iframe or DOM.
- "A hooks module runs in an environment of its own: no DOM, no Node" — [claude-code.d.ts](https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts). I read only the first 100,000 characters of a 517,000-character file.
- In Desktop and VS Code, a `Link` works only for an `https:` URL or an `http://localhost` URL — [Mods interface](https://code.claude.com/docs/en/plugins/mods/interface.md). So a mod pane can act as a launcher to a localhost UI.
- Mods can run processes (`$.process.spawn` streams long-running commands), fetch over HTTP, and run timers — [Mods API](https://code.claude.com/docs/en/plugins/mods/api.md).
- Key limits: 10 s hook execution, `$.process.run` 30 s default and 10 min max, 4 MiB for fs read/write and HTTP bodies, `$.store` 4 MiB total, 100,000 characters of text per tree, 20,000 elements per tree, Svg source up to 131,072 characters — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md).
- `$.store` is shared by every session on the machine — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md).
- A mod can start a turn with `$.prompt.submit` — [Mods API](https://code.claude.com/docs/en/plugins/mods/api.md). That lets a mod push "the user left a comment" into a session.
- Security: mods are "not sandboxed", run with user permissions, and can see prompts and tool calls — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md).
- Admin controls can stop them: `allowManagedModsOnly`, `allowManagedHooksOnly`, `disableAllHooks` — [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md). Mods are listed in Anthropic's directory for Claude Code only — [Platform support](https://claude.com/docs/plugins/platform-support).
- Anthropic's sample mods include `token-weather`, `blast-radius`, `replay-theater`; they are shared as-is without support — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md).

### Inferences
- A mod could give the tool a useful **companion surface**: a pane listing docs for the current branch, a band showing "3 new comments", `/docs` commands, and click-through `Link`s to `http://localhost:<port>`.
- A mod is **not** a way to render the interactive HTML itself in a pane. Rendering still needs the Browser pane, an external browser, or an artifact.
- Practical Desktop path: plugin starts a local server, the agent opens it in the Browser pane through `launch.json` or `preview_start`, and a mod pane shows status. The agent-driven step depends on Desktop's own tools, which plugins don't call directly.
- The diff comment pattern (`+` on a line, batch-submit) is a good UX precedent, but it is not reusable for HTML.
- Comment-on-preview remains a real gap, and is one of the most defensible features for a third-party tool.

### Gaps
- Did not test `Client` on Desktop. Whether it can do anything richer than the element table isn't documented. `$.ui.blit` appears in the type file with `requestId: 'browser'` in an example; I did not read further, so it is a lead only.
- No documented way for a plugin or mod to open the Browser pane directly. Not proven impossible.
- `artifact` pane behaviour and whether MCP Apps can render in the Code tab were not tested in the UI.

## Claude Code plugin system: what can a third party ship?

### Takeaway
A plugin can ship everything the agent side needs: skills, subagents, hooks, MCP servers, mods, `bin/` executables and background monitors. Claude Code itself loads the same plugin in terminal, Desktop local/SSH sessions and VS Code. Plain plugins render no UI; mods do. A local web server is not a first-class component, but it can be launched by supported components. The human-facing library UI should therefore stay separate, with the plugin as the agent bridge.

### Cited Findings

**What a plugin can ship**
- Components: skills, commands (legacy), agents, hooks, MCP servers (including `.mcpb`/`.dxt` bundles and remote URLs), LSP servers, output styles, workflows, themes, monitors, channels, `bin/`, `settings.json`, `userConfig`, mods via `modules` in `hooks/hooks.json` — [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md), [Plugin components](https://code.claude.com/docs/en/plugins/components.md).
- `experimental` holds `themes`, `monitors` and `evals`, whose "manifest shape may still change" — [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md).
- Plugin settings: only `agent` and `subagentStatusLine` take effect — [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md).
- Reserved names: names starting with `claude-`, `anthropic-` or `cc-plugin-` are errors — [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md).
- Persistent state: `${CLAUDE_PLUGIN_DATA}` is `~/.claude/plugins/data/<id>/`, kept across updates, but deleted by default on final uninstall (`--keep-data` exists); `${CLAUDE_PLUGIN_ROOT}` changes on update so don't write state there — [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md).
- A `CLAUDE.md` at the plugin root isn't loaded; use a skill — [Plugin components](https://code.claude.com/docs/en/plugins/components.md).

**Rendering UI**
- Comparison table: skills, settings hooks and MCP servers cannot draw in the interface; mods can — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md).

**Local web server**
- There is no `server` component type in the manifest — [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md).
- Supported ways to keep a process running:
  - **stdio MCP server**: "When you enable a plugin, Claude Code starts its MCP servers automatically" — [MCP docs](https://code.claude.com/docs/en/mcp). A stdio server process can also bind an HTTP port, but that is the author's design, not a documented pattern. It lives and dies with the session and is closed on exit — [MCP docs](https://code.claude.com/docs/en/mcp).
  - **Monitor**: persistent background shell command for the session, in `monitors/monitors.json`, with stdout delivered to Claude as notifications; doesn't start in `-p`; `when: "on-skill-invoke:<skill>"` is available; experimental key — [Plugin components](https://code.claude.com/docs/en/plugins/components.md).
  - **SessionStart hook** spawning a detached daemon: hooks are documented, but detaching a daemon from one is not a documented pattern — [Hooks](https://code.claude.com/docs/en/hooks).
  - **Mod**: `$.process.spawn` from `session.start` — [Mods API](https://code.claude.com/docs/en/plugins/mods/api.md).
  - **`bin/` CLI**: on the Bash tool's PATH while enabled, and a sandboxed PowerShell command doesn't find it — [Plugin components](https://code.claude.com/docs/en/plugins/components.md).
- Sandbox: a monitor runs outside the sandbox — [Plugin components](https://code.claude.com/docs/en/plugins/components.md); a process a mod starts also runs outside it — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md).

**Distribution**
- Marketplaces: GitHub `owner/repo`, any git URL, local path, hosted `marketplace.json`. Install: `/plugin install name@marketplace`, or in one step with `--marketplace` (v2.1.275+ in session, v2.1.292+ in shell) — [Install plugins](https://code.claude.com/docs/en/plugins/install.md).
- Anthropic's directory: submission portal; `/plugin directory` from v2.1.287; also claude.com/marketplace — [Platform support](https://claude.com/docs/plugins/platform-support), [Install plugins](https://code.claude.com/docs/en/plugins/install.md).
- Auto-update is on by default only for official marketplaces and those added from claude.ai; off for third-party ones. Users get `Plugin updated ... Run /reload-plugins` — [Install plugins](https://code.claude.com/docs/en/plugins/install.md).
- Marketplace entries can include a `command` source, which shows the command and asks for acceptance — [Install plugins](https://code.claude.com/docs/en/plugins/install.md).
- Plugin Node dependencies: eligible ones install automatically when cached; or install into `${CLAUDE_PLUGIN_DATA}` from a SessionStart hook — [Plugin components](https://code.claude.com/docs/en/plugins/components.md).

**Cross-surface behaviour**

| Surface | Plugin loads? | Notes |
| --- | --- | --- |
| Terminal CLI | Yes | `/plugin` |
| Desktop Code tab, local or SSH | Yes | Plugin manager UI; not in WSL sessions — [Desktop docs](https://code.claude.com/docs/en/desktop) |
| VS Code extension | Yes | `/plugins`; same settings files as terminal and Desktop — [Install plugins](https://code.claude.com/docs/en/plugins/install.md) |
| JetBrains | Yes | Runs in IDE terminal — [Install plugins](https://code.claude.com/docs/en/plugins/install.md) |
| Cloud session / claude.ai/code | No, unless org-managed | Doesn't load locally installed plugins or those in repo settings — [Install plugins](https://code.claude.com/docs/en/plugins/install.md) |
| `claude -p` / Agent SDK | Yes | Installed plugins load; SDK via plugin option; monitors don't start — [Install plugins](https://code.claude.com/docs/en/plugins/install.md) |
| claude.ai chat | Partial | Skills load; hooks, agents, LSP, local MCP ignored — [Platform support](https://claude.com/docs/plugins/platform-support) |
| Cowork | Partial | Skills, agents, hooks load; local MCP when on your computer — [Platform support](https://claude.com/docs/plugins/platform-support) |

- A top-level `bin/` makes chat and Cowork refuse the whole plugin — [Platform support](https://claude.com/docs/plugins/platform-support). This matters for packaging.

### Inferences
- The agent side fits a plugin well:
  - a skill teaches conventions for generating docs (decision doc, explain-diff, quiz) and includes template assets;
  - an MCP server exposes `register_doc`, `list_docs`, `get_doc`, `read_comments`, `reply_comment`, `resolve_comment`, `add_version`, `link_docs`;
  - a PostToolUse hook auto-registers generated HTML;
  - a SessionStart hook injects "docs for this branch" and "unanswered threads";
  - a channel or monitor pushes new comments.
- Do not rely on `${CLAUDE_PLUGIN_DATA}` for the library itself, because uninstalling deletes it by default. Put the library in a stable user directory or hosted store.
- Don't treat the plugin as the product's only surface. The person also needs to browse without Claude running, so the web UI or server should run independently of a session, with the plugin connecting to it.
- Avoid a top-level `bin/` if Cowork or chat distribution matters, or publish a split plugin. An MCP server can often replace the CLI.
- Third-party marketplaces default to no auto-update, so version skew between plugin and server needs handling.

### Gaps
- No official pattern found for a long-lived localhost server shared across sessions. It is possible but not sanctioned. Lifecycle handling (port conflicts, multi-session, daemon cleanup) would be on the author. This is the "possible by hack" area.
- Whether Windows detached processes from hooks survive session end was not tested.

## Can a PostToolUse hook auto-register generated HTML with repo, branch, PR and session ID?

### Takeaway
Yes for most of it. A `PostToolUse` hook on `Write|Edit` gets `session_id`, `cwd`, the file path and the tool use ID, which is enough to detect `.html` and register it. Repo, branch and PR are not in the hook input, so the hook must derive them with `git` and `gh`. Files written through Bash won't match, so a robust design adds a `FileChanged` or end-of-turn sweep.

### Cited Findings
- Common hook input fields: `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir` (v2.1.257+), `permission_mode`, `effort`, `hook_event_name`, plus `agent_id` and `agent_type` in subagents — [Hooks](https://code.claude.com/docs/en/hooks).
- PostToolUse adds `tool_name`, `tool_input`, `tool_response`, `tool_use_id`, optional `duration_ms` — [Hooks](https://code.claude.com/docs/en/hooks).
- Example `Write`: `tool_input: { file_path, content }`, `tool_response: { filePath, type: "create" }` — [Hooks](https://code.claude.com/docs/en/hooks).
- "For file tools, `tool_input.file_path` is always absolute and uses native separators, so backslashes on Windows" — [Hooks](https://code.claude.com/docs/en/hooks).
- A matcher plus `if` filter is supported, e.g. `"matcher": "Edit|Write"` with `"if": "Edit(*.ts)"` — [Hooks](https://code.claude.com/docs/en/hooks). So `Write(*.html)` is the natural form, assuming `if` works the same for Write.
- **No git branch, PR or repo fields appear in hook inputs**: a grep of the full `hooks.md` for `git_branch`, `gitBranch`-style, `pull request` and `pr_number` found nothing — [Hooks](https://code.claude.com/docs/en/hooks).
- Status line input does have this data: `workspace.repo.host/owner/name`, `workspace.git_worktree`, `pr.number`, `pr.url`, `worktree.branch` — [Status line](https://code.claude.com/docs/en/statusline). It goes only to the status line command, not hooks. A status line script could cache it to a file, which would be a hack, and a user can have only one status line.
- Mods have `$.session.repo`, but the type lines read only showed `internal`. It returns null outside a repo — [claude-code.d.ts](https://raw.githubusercontent.com/anthropics/claude-code/main/mods/types/claude-code.d.ts). `$.process.run(['gh','pr','checks',...])` is a documented example — [Mods API](https://code.claude.com/docs/en/plugins/mods/api.md).
- Transcripts contain `gitBranch` on lines — [Observed in local `.jsonl` transcripts]. This is undocumented and read from `transcript_path`. A sample had value `HEAD`, i.e. detached HEAD, so it is not reliable alone.
- Async: `"async": true` on command hooks runs in the background; `additionalContext` and `systemMessage` are delivered on the next turn — [Hooks](https://code.claude.com/docs/en/hooks). Suits slow `gh pr view` lookups.
- `additionalContext` can tell Claude the doc was registered and give its URL. Strings over 10,000 characters are saved to a file — [Hooks](https://code.claude.com/docs/en/hooks).
- Plugin hook env: `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_OPTION_<KEY>` — [Plugin manifest reference](https://code.claude.com/docs/en/plugins/manifest-reference.md). `CLAUDE_PROJECT_DIR` stays fixed even if Claude enters a worktree, so use `cwd` for branch lookup — [Hooks](https://code.claude.com/docs/en/hooks).
- Default timeout is 600 s for most events — [Hooks](https://code.claude.com/docs/en/hooks).
- `FileChanged` works for any change, including Bash or external processes, but its matcher is **literal filenames in the working directory, not globs**, and dynamic paths come from `watchPaths`. Input has `file_path` and `event` (`change`, `add`, `unlink`) — [Hooks](https://code.claude.com/docs/en/hooks). `watchPaths` is "Absolute paths" with no documented glob or directory support, so catching "any new HTML in a tree" isn't clearly supported.
- `Artifact` is a named tool usable in hook matchers — [Tools reference](https://code.claude.com/docs/en/tools-reference.md). A `PostToolUse` matcher on `Artifact` should therefore capture publishes. The tool's `tool_input` and `tool_response` shape was not found in docs.
- `Stop` and `SessionEnd` exist for sweeps, and SessionEnd has a short default budget of 1.5 s — [Hooks](https://code.claude.com/docs/en/hooks), [Mods reference](https://code.claude.com/docs/en/plugins/mods/reference.md).

### Inferences
Recommended capture design:
1. `PostToolUse` on `Write|Edit` filtered to `.html`/`.htm` under agreed paths. Normalize Windows backslashes first.
2. Same hook on `Artifact` to link local source and hosted URL. Inspect the payload in a real session first.
3. Async `gh pr view --json number,url` and `git rev-parse` from `cwd`, plus `git rev-parse --abbrev-ref HEAD` and `HEAD` SHA. Record the commit SHA too, so the doc stays tied to an exact state after rebases.
4. `Stop` sweep with `git status --porcelain --ignored` or a directory scan, to catch HTML written through Bash.

Concerns:
- HTML output is also created by build tools and test reports, so filter by location, or by a marker the skill places in the file (`<meta name="generator">`), to avoid junk entries.
- Docs live outside the repo by default for artifacts (temp directory), so filter rules must include the temp directory or the `Artifact` tool path.
- The PR often doesn't exist when the doc is generated, so PR association needs late binding, by branch-name lookup at view time.
- For uncommitted branch work in a linked worktree, branch can be computed from `cwd`, but the doc must be stored outside the worktree so it survives removal.

### Gaps
- `Artifact` tool hook payload not documented; needs a live test.
- Whether `if` supports path globs on `Write` not verified against that exact form.
- Not tested end-to-end on Windows.

## MCP Apps / MCP UI: can an MCP server render interactive UI inside Claude?

### Takeaway
Yes in Claude chat on web and in the desktop app, but not in Claude Code. Anthropic's docs state that Claude Code uses such servers as text only. Whether the Desktop Code tab renders MCP Apps isn't documented, and I found no evidence that it does. MCP Apps aren't a dependable way to show the library inside Claude Code.

### Cited Findings
- MCP Apps (SEP-1865, extension `io.modelcontextprotocol/ui`) lets a tool bound to a `ui://` resource render HTML in a sandboxed frame — [Build quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart), [Support matrix](https://modelcontextprotocol.io/extensions/client-matrix). Launched 26 January 2026 — [MCP blog](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/).
- "Rendering the UI takes a host that supports MCP Apps, such as the Claude desktop app. Claude Code calls the tool as text and doesn't render the UI." — [Build quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart).
- Claude Code docs mention UI resources only to say they're "pages for a host application to render rather than content for Claude to read", omitted from `@` suggestions and resource lists, while reading by URI still works — [MCP docs](https://code.claude.com/docs/en/mcp).
- Open feature request: [issue #95149](https://github.com/anthropics/claude-code/issues/95149), filed 17 September 2026, says Claude Code doesn't advertise the extension and drops the UI. Labeled duplicate; no maintainer reply visible. Reporter's workaround: return an image block, which renders but isn't interactive.
- Desktop chat flow: Claude asks permission to display, then "the MCP App renders inline in the conversation" — [Get started with MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started).
- Local stdio works through `claude_desktop_config.json`, and example servers run with `npx` — [Get started with MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started).
- Custom connectors added by URL reach servers from Anthropic's infrastructure, so localhost needs a tunnel or public host — [Build quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart).
- Sandbox: default frame runs only inline or same-origin scripts, with `_meta.ui.csp.resourceDomains` to extend. Claude's `ui.domain` is a hash of the server URL under `.claudemcpcontent.com` — [Build quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart), [Get started with MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started).
- The same MCP App can target other hosts with `registerAppTool()`, `registerAppResource()` and `App.connect()` — [Get started with MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started).
- One search summary said the official list names Claude, Claude Desktop, VS Code GitHub Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam and Archestra.AI, without Claude Code. The matrix page's check marks did not survive fetching, so I could not read cells directly — [Support matrix](https://modelcontextprotocol.io/extensions/client-matrix).
- Codex plugins: MCP servers "can optionally include custom UI" — [ChatGPT learn docs](https://learn.chatgpt.com/docs/plugins).

### Inferences
- MCP Apps could give a light **viewer in Claude chat and Cowork-adjacent surfaces**, but the target user generates docs in Claude Code, where UI is dropped.
- The tool's MCP server should return useful text and `structuredContent` regardless, then add a `ui://` view as an optional extra for chat hosts.
- A chat-side MCP App needs a remote URL or Desktop config; a localhost-only product wouldn't reach claude.ai without a tunnel.

### Gaps
- No official statement on the Desktop **Code tab** specifically. The docs say "Claude Code" (a table elsewhere defines that as including the Code tab), so the safe reading is text-only.
- No roadmap for Claude Code support found.
- MCP matrix cell values unread; the list above is from a search summary.

## Portability: Cursor, Codex, Gemini CLI, AGENTS.md, Agent Skills

### Takeaway
Portability is strong at the skills and MCP layers and weak at hooks and UI. A design built as Agent Skill + MCP server + small per-agent hook adapter could cover the major agents, with mods treated as Claude-only polish.

### Cited Findings
- Agent Skills: a folder with `SKILL.md` (name and description at minimum) and optional `scripts/`, `references/`, `assets/`, originally from Anthropic, released as an open standard, loaded by progressive disclosure — [agentskills.io](https://agentskills.io).
- Adopter counts vary: 32 listed in March 2026 and about 40 products in June 2026, including Claude, Codex, Copilot, VS Code, Cursor, Gemini CLI — secondary sources in [Agent Skills ecosystem report](https://agentman.ai/blog/agent-skills-ecosystem-report-2026) and [Serenities guide](https://serenitiesai.com/articles/agent-skills-guide-2026). The client page didn't render in my fetch, so I could not confirm the current list — [Client showcase](https://agentskills.io/clients.md).
- Claude Code loads `AGENTS.md` as project instructions through a built-in mod (`cc-plugin-agents-md`) — [Mods overview](https://code.claude.com/docs/en/plugins/mods/overview.md).
- **Cursor** plugins bundle rules, skills, agents, commands, MCP servers and hooks, through a Marketplace with manual review, plus team marketplaces. Skills and MCP also work in Agent Plugins. Plugins can ship prebuilt canvases, but no general custom-UI API is described. "MCP Apps deeplinks" on that page are only install links — [Cursor plugin docs](https://cursor.com/docs/plugins).
- **Codex** plugins include skills, MCP servers, browser extensions and hooks, with repo marketplaces and workspace sync; hooks aren't supported in cloud-orchestrated ChatGPT Work — [ChatGPT learn docs](https://learn.chatgpt.com/docs/plugins). `developers.openai.com/codex/plugins` now redirects to learn.chatgpt.com.
- **Gemini CLI** extensions package prompts, MCP servers, custom commands, themes, hooks, sub-agents and agent skills, installed from GitHub URL or local path, with a gallery — [Gemini CLI extensions](https://geminicli.com/docs/extensions/).
- Community precedent for one source generating per-agent packages: [wshobson/agents](https://github.com/wshobson/agents) [3rd-party].
- Skills-over-MCP is an official MCP extension — [Support matrix](https://modelcontextprotocol.io/extensions/client-matrix).

### Inferences
- Portable core: templates and instructions as Agent Skill; library and comments as MCP tools; HTML files on disk or at a URL.
- Per-agent adapter: hook payload formats differ, so "file written → register" must be adapted for each. Hook payload compatibility across agents was not researched here.
- A generic fallback that doesn't depend on hooks: the skill instructs the agent to call `register_doc` after writing. This works on any MCP-capable agent, and hooks become a safety net.
- A CLI companion (`docs register file.html`) gives agents without MCP support a path.

### Gaps
- AGENTS.md's governance and current adopter list weren't confirmed from a primary source in this research.
- Cursor's canvas format and any extension API weren't examined.
- Per-agent hook input schemas not compared.

## Workflow coverage matrix (synthesis, all cells derived from the sections above)

| Workflow need | Artifacts | Claude Code / Desktop | Third-party plugin can add |
| --- | --- | --- | --- |
| Many interactive HTML docs | Yes, with strict CSP | Local file + Browser pane | Templates, skills |
| Library by project | Flat gallery; "organize" undefined | Session's artifact pill and `/artifacts` | Yes, needs own store and UI |
| Link to repo/branch/PR without committing | No documented metadata | Desktop binds session to PR internally | Yes, by hook + git/gh |
| Threaded comments | Yes | Diff lines only | Comments on arbitrary local HTML needs own overlay |
| Agent reads and answers comments | Yes, on activated threads; watch | Yes, for artifacts | Yes, by MCP tools; channel or monitor for push |
| Personal sticky markers | Not built in; `db` private path could support it per page | No | Yes, in own viewer |
| Version history | Yes, restore, version picker | git for local files | Yes |
| Visual diff between versions | Not documented | Code diff only | Yes, own feature |
| Links between docs | Plain URLs only | No | Yes, own link graph |
| Works without Anthropic login or hosting | No | Local HTML yes | Yes, local-first |
| Render UI in Claude Code | Separate page or artifact pane | Browser pane | Mod pane for lists and status, not HTML |

Officially supported vs. possible by hack, for building this as a plugin:
- **Officially supported:** skills; MCP tools; PostToolUse, SessionStart, Stop and FileChanged hooks; async hooks; mods (panes, bands, commands, tools, `Link` to localhost); monitors (experimental key); channels (needs `--channels` opt-in); `bin/`; marketplaces.
- **Possible but not a documented pattern:** long-lived localhost server spawned from a hook, mod or stdio MCP process; reading `gitBranch` from transcripts; caching status line JSON for hooks to read; using `.claude/launch.json` written by a plugin to attach the Browser pane.
- **Not available:** arbitrary HTML in a mod pane; MCP Apps in Claude Code; plugin-level access to Desktop's `ccd_*` and Browser tools (agent-only; not documented for plugins); comment-on-preview in the Browser pane.
