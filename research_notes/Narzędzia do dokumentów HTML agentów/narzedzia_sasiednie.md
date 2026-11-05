# Adjacent tools: adopt or extend instead of building from scratch (as of 5 November 2026)

Evidence conventions used throughout. "Cited Findings" are what a source says. Most were read through page fetches or search summaries, so GitHub star and commit counts are point-in-time captures. GitHub pages did not expose last-commit dates in the capture, so "maintenance" is stated only where a date was actually seen. "Inferences" are my reasoning, or background knowledge not checked this session, and are labelled as such.

## Overall verdict: does an existing platform plus plugins, or an open-source component, get most of the way?

### Takeaway
No platform gets most of the way. Obsidian with a custom plugin is the closest host, but it only supplies the shell (library, rendering, agent bridge, git). The differentiating parts (persistent anchored threads on live interactive HTML, stickies, render diff, backlinks from HTML) would still be custom code. The better reuse is at component level: anchoring logic from Hypothesis or Apache Annotator, pixelmatch or odiff for pixels, Playwright for capture, and a DOM-aligned diff in the style of acoyfellow/visual-diff.

### Cited Findings
- Requirement coverage, summarised from the sections below:

| Requirement | Best existing option | Status |
|---|---|---|
| Local library grouped by project | Obsidian vault folders; [HTML Reader-plus](https://community.obsidian.md/plugins/html-reader-plus) | Available |
| Run interactive HTML | Obsidian plugins with JS enabled, Notion HTML blocks (cloud), Trilium render notes | Available, with limits |
| Threaded comments anchored to elements | None persistent and local. [VS Code](https://code.visualstudio.com/updates/v1_132) and [Cursor](https://cursor.com/docs/agent/design-mode) comments are prompts to the agent | Gap |
| Personal sticky notes | tldraw as a separate board; [Zotero](https://guides.lib.sussex.ac.uk/zotero/notes) sticky notes only on JS-stripped snapshots | Gap on live HTML |
| Version history | [Obsidian Git](https://github.com/Vinzent03/obsidian-git), or plain git | Available for source, not for renders |
| Render-level visual diff | [@acoyfellow/visual-diff](https://github.com/acoyfellow/visual-diff), [vlmkit](https://github.com/mizchi/vrt) | Components only |
| Links and backlinks between HTML docs | [HTML Direct Reader](https://community.obsidian.md/plugins/html-direct-reader) navigation only | Backlinks are a gap |
| Readable by coding agent | [Obsidian Local REST API MCP](https://github.com/coddingtonbear/obsidian-local-rest-api), or plain files | Available |

### Inferences
- Comment-on-element-to-agent is becoming a commodity inside editors (VS Code, Cursor, Windsurf, Agentation). Durable review memory attached to a document library is the unfilled part, so that is where custom work is justified.
- Building on Obsidian adds real constraints (see the Obsidian section). A standalone local app that reuses components gives up Obsidian's shell but keeps full control of the render surface, which is what anchoring and diffing most depend on.
- A cheap interim path exists if the user wants to test the workflow first: plain folder plus git, HTML Reader-plus in Obsidian, Local REST API MCP. This covers viewing and agent access only, not comments or diff.

### Gaps
- No hands-on test was run on any tool. Every feasibility claim about combining tools is unproven until a small spike is done.

## Obsidian: how close can it get, and what is impossible?

### Takeaway
Core Obsidian does not render interactive HTML; plugins do, and JS execution is well covered on desktop. No plugin provides annotation on live JS-running HTML. Annotator is the nearest, but it is based on a forked Hypothesis, its last release was January 2024, and web support is described as "in theory". A custom plugin looks feasible but would have to write nearly all the differentiating features itself.

### Cited Findings
**Rendering and JS**
- Obsidian needs "Show all file types" enabled to surface `.htm` and `.html` — [Lightweight HTML Reader](https://github.com/autonomouswork/lightweight_html_reader).
- HTML Reader (nuthrash, about 61k downloads per [search summary](https://community.obsidian.md/plugins/obsidian-html-plugin)): five modes. Balance is the default and blocks scripting. Even Unrestricted Mode warns external scripts may not run, and local images generally do not load. Auto-reload on external change is on by default. Optional form-state persistence writes JSON into the HTML file itself — [repo](https://github.com/nuthrash/obsidian-html-plugin). That write-back would pollute agent-generated documents if enabled (inference).
- HTML Reader-plus: opens files in a separate desktop web view as `file:` URLs. React, Vue, ES modules and import maps work. Context isolation, sandbox and web security are on, Node integration is off. Relative resources can reach outside the vault, and page storage can be shared across files in the same vault partition. Desktop only, version 1.3.1, created about two months ago, 742 downloads, MIT, no annotation features — [listing](https://community.obsidian.md/plugins/html-reader-plus).
- Lightweight HTML Reader: sandboxed iframe on desktop, Shadow DOM on mobile, scripts need Unrestricted plus "Allow scripts", also renders JSX/TSX, 0BSD, 1 star, and describes itself as a way to view local Claude Artifacts — [repo](https://github.com/autonomouswork/lightweight_html_reader).
- HTML Direct Reader inlines local CSS, images, fonts and scripts, works on desktop and mobile, has scripts off by default, and intercepts links between vault HTML pages with back and forward navigation — [listing](https://community.obsidian.md/plugins/html-direct-reader). Style HTML Viewer resolves relative paths to vault URIs and intercepts links to other local files — [listing](https://www.obsidianstats.com/plugins/style-html-viewer).
- Only one view can claim the `.html` extension; load order decides which wins when two HTML viewers are enabled — [HTML Prototype Viewer stats page](https://www.obsidianstats.com/plugins/html-prototype-viewer).

**Canvas and embedding**
- Core Canvas does not render uploaded HTML the way it renders URLs, and a reply says this is intentionally unsupported. The thread is about two years old — [forum](https://forum.obsidian.md/t/html-files-dont-render-in-canvas-the-way-urls-do/93094).
- HTML Docs opens HTML in tabs, embeds and canvas cards, but cookies, localStorage, sessionStorage and IndexedDB are intentionally unavailable — [listing](https://community.obsidian.md/plugins/html-docs).
- HTML Canvas renders in an iframe with scripts off by default — [listing](https://community.obsidian.md/plugins/html-canvas). HTML Embed runs JS with `allow-scripts allow-same-origin allow-forms allow-popups`, for trusted files only — [listing](https://community.obsidian.md/plugins/html-embed). Embed HTML enables `![[file.html]]` — [listing](https://community.obsidian.md/plugins/embed-html).

**Annotation**
- Obsidian Annotator is based on Hypothesis, modified to store annotations in a local markdown file. A `web` target "in theory" works with any site, but some work better than others and link navigation does not work. Last changelog entry is 0.2.11, dated 2024-01-06 — [repo](https://github.com/elias-sundqvist/obsidian-annotator). Last push 2024-01-08 and 568k downloads — [ecosyste.ms and listing](https://awesome.ecosyste.ms/projects/github.com%2Felias-sundqvist%2Fobsidian-annotator).
- No community plugin was found that combines live JS HTML with anchored comments. Absence from searches, not proof.

**Version history and agent access**
- Obsidian Git has been developed by Vinzent03 since March 2021 — [repo mirror history](https://github.com/denolehov/obsidian-git).
- Local REST API: local HTTPS with API key, CRUD on any vault file including binary, targeted PATCH, full-text and JsonLogic search, `/events/` SSE, and a built-in Streamable HTTP MCP server at `/mcp/` with about 22 tools. Other plugins can register their own routes, MCP tools and events. 3.1k stars — [repo](https://github.com/coddingtonbear/obsidian-local-rest-api).

**Custom plugin feasibility**
- `getResourcePath` returns URLs loadable in iframes, images and scripts, usable only inside Obsidian — [forum](https://forum.obsidian.md/t/what-are-the-differences-between-these-adapter-methods-getbasepath-getfullpath-getrealpath-getfullrealpath/32622). Iframes without strict isolation share the app's origin, and the plugin offers removing `allow-same-origin` as an option — [HTML Prototype Viewer](https://community.obsidian.md/plugins/html-prototype-viewer).
- Mobile Obsidian does not run on Electron, which is what allows iframes and webviews with few restrictions — [Custom Frames README](https://git.ellpeck.de/Ellpeck/ObsidianCustomFrames/blame/branch/master/README.md).

### Inferences
- Concrete blocker: Obsidian does not run JS in `.html` files without a plugin, and of the plugins seen, most need an explicit opt-in. HTML Reader-plus is the most capable for agent-produced apps.
- A custom plugin could plausibly own the `.html` view, inject an overlay into the rendered document, store comments in sidecar files, and register MCP tools through Local REST API's extension points. Injection is simple in a same-origin iframe, but that is the mode with the weakest isolation from the app. A webview needs a preload or message channel. This is the central design trade-off and is untested.
- Impossible or very costly on stock Obsidian: threaded anchored comments in a third-party viewer plugin (no extension point seen), backlinks from HTML in the native Backlinks pane. Background knowledge, not verified: Obsidian's link index comes from its markdown parser, so a plugin would need its own HTML link index, or generate stub `.md` notes that carry the links.
- Reliance on a two-month-old plugin with 742 downloads is a risk. A custom plugin would remove that dependency but adds tracking of Obsidian updates. Annotator needed a rendering fix for Obsidian 1.5.3, which illustrates the risk.

### Gaps
- Surfing and Webpage HTML Export were not individually researched. Custom Frames only appeared via its README on Electron.
- Whether the File Recovery core plugin snapshots `.html` was not found. Background knowledge suggests it is markdown-focused, unconfirmed.
- The core Web Viewer plugin's handling of local files was not confirmed.
- Obsidian's licensing terms for a commercial plugin or product built on it were not checked.

## VS Code, Cursor, Windsurf: previews with comments

### Takeaway
All three now let you point at rendered elements and send that context to an agent, and VS Code and Cursor added element notes in 2026. These notes are prompt inputs, not a persistent threaded record. The VS Code Comments API does not reach inside webviews, so an extension must draw its own comment UI.

### Cited Findings
- Comment threads display in visible text editors and the Comments panel — [API docs](https://vscode-api.js.org/interfaces/vscode.CommentController.html). A webview-rendered panel loses built-in commenting; the request for an API was closed as not planned — [#200371](https://github.com/microsoft/vscode/issues/200371).
- A PR to vscode-pull-request-github adds comments to Markdown preview by reusing the comment widget, not comments inside the webview, and is desktop only — [PR #9074](https://github.com/microsoft/vscode-pull-request-github/pull/9074).
- Live Preview provides a local server, in-editor preview and live refresh. It is still a pre-release (icon URL suggests 0.5.2026092301), with no comments or annotation mentioned — [Marketplace](https://marketplace.visualstudio.com/items?itemName=ms-vscode.live-server).
- VS Code's integrated browser arrived in 1.109 with "Add element to chat" — [release notes](https://code.visualstudio.com/updates/v1_109). Agent browser tools came in 1.110 — [notes](https://code.visualstudio.com/updates/v1_110). Range selection came in 1.121 — [notes](https://code.visualstudio.com/updates/v1_121). Commenting on page elements came in 1.132 (August 2026), where comments are added per element before sending to chat — [notes](https://code.visualstudio.com/updates/v1_132).
- Cursor Design Mode lets you click an element, mark an area or edit text, and the agent edits code. Annotate needs Cursor 3.24.18+. Each note sends element details and a screenshot. Batch edits stay as numbered pins until sent or cleared. The docs mention no threads or persistence across sessions — [official docs](https://cursor.com/docs/agent/design-mode).
- Cursor cloud agents can build interactive canvases and share them by URL (16 October 2026) — [changelog](https://cursor.com/changelog). Its browser tool keeps storage per workspace across sessions — [docs](https://cursor.com/docs/agent/browser).
- Windsurf Previews have a "Send element" button that inserts an `@ mention` into the Cascade prompt, and work in Chromium browsers too — [docs](https://docs.windsurf.com/windsurf/previews). The same content appears under [Devin Desktop docs](https://docs.devin.ai/desktop/previews), which suggests a rebrand.

### Inferences
- A VS Code extension could implement this in a custom webview with its own overlay and a sidecar store, using nothing from the Comments API. That leaves it as the same build effort as a standalone app, inside a more constrained host.
- These editors are complementary rather than competing: the user can review in the new tool and let the agent read comments from files or MCP.

### Gaps
- Nothing newer than VS Code 1.132 was found, so September to November 2026 changes may be missing.
- Whether VS Code's integrated browser opens `file://` URLs, and whether any note survives a restart, was not confirmed.
- Windsurf's current product name and status were not established.
- A dedicated marketplace extension for HTML preview comments was not found in searches, which does not prove none exists.

## Website annotation and review products, and reusable libraries

### Takeaway
The commercial tools are SaaS and fail the solo-and-local requirement, and none was found shipping a reusable library. The reusable parts are Hypothesis client (BSD-2), Apache Annotator code (archived) and Recogito Text Annotator (BSD-3). All of these anchor text; none anchors non-text elements such as charts or canvases. Agentation has the right interaction model, but it is React-only with a restrictive licence.

### Cited Findings
**Hypothesis**
- The client is BSD-2 with third-party components, can be embedded in pages, 15,659 commits, 743 stars — [repo](https://github.com/hypothesis/client).
- The `services` config points the client at alternative services using `apiUrl`, `authority`, `grantToken`, and is marked experimental — [docs](https://h.readthedocs.io/projects/client/en/latest/publishers/config.html).
- The h server is BSD-2. A packaged template bundles PostgreSQL, Elasticsearch and RabbitMQ, and by default loads the client from Hypothesis's CDN — [Zeabur template](https://zeabur.com/templates/JPAKBM).
- Local PDFs work through the Chrome extension with file URL access or a Firefox bookmarklet, matched by PDF fingerprint — [help](https://web.hypothes.is/help/annotating-locally-saved-pdfs/). Web pages have no such fingerprint unless `rel="canonical"` is set — [forum reply](https://groups.google.com/g/hypothesis-forum/c/Cz8VvAXyeAg).
- Anchoring model (2013 post, may be dated): RangeSelector, TextPositionSelector and TextQuoteSelector with context-first fuzzy search using a modified google-diff-match-patch — [Fuzzy Anchoring](https://web.hypothes.is/blog/fuzzy-anchoring/). TextQuoteSelector can be ambiguous on repeated text — [Jon Udell](https://blog.jonudell.net/2021/09/03/notes-for-an-annotation-sdk/). W3C slides propose orphan, half-orphan and anchored states with re-anchoring on DOM change — [slides](https://www.w3.org/2014/04/annotation/slides/RobustAnchoring.pdf).
- Via HTML is a proxy that embeds the client into third-party pages — [viahtml](https://github.com/hypothesis/viahtml).

**Libraries**
- Apache Annotator was archived on 13 August 2025 and is read-only, Apache-2.0, focused on identifying text fragments in browsers, with no releases shown — [repo](https://github.com/apache/incubator-annotator).
- Recogito Text Annotator: BSD-3, `createTextAnnotator(element)`, data model close to W3C Web Annotation, 106 stars, persistence appears left to the app — [repo](https://github.com/recogito/text-annotator-js).
- Annotorious is image annotation, BSD-3, 870 stars — [repo](https://github.com/annotorious/annotorious).

**Agent-oriented annotation**
- Agentation: click elements and attach notes, capturing selectors, computed styles and identifiers, output via copy-paste or local MCP with two-way resolve — [listing](https://hunted.space/product/agentation). It is PolyForm Shield 1.0.0, requires React 18+, has 5.3k stars, and its selector-based example is `.sidebar > button.primary` — [repo](https://github.com/benjitaylor/agentation). Selector drift on DOM change was raised by a launch commenter with no answer in the results — [launch page](https://hunted.space/dashboard/agentation/launches/agentation).

**Commercial**
- Vercel comments are on by default on preview deployments and need the toolbar active. Local development comments are linked to a preview deployment — [docs](https://vercel.com/docs/comments/using-comments), [localhost docs](https://vercel.com/docs/vercel-toolbar/in-production-and-localhost.md).
- BugHerd works on internal and local domains when added in project settings, and needs the JS snippet and a logged-in user — [help](https://support.bugherd.com/en/articles/11425125-using-bugherd-on-internal-websites-or-localhost), [install](https://support.bugherd.com/en/articles/33871).
- Markup.io reportedly ended its free plan, and one source quotes $79/mo versus an older $25/mo — [third-party](https://launchthedamnthing.squarespace.com/blog/markup-alternatives-for-client-website-design-feedback). Markup.io and Ruttl use a proxy — [comparison](https://bugsmash.io/blog/?p=641). Pastel's free tier limits comments to a 72-hour window — [SimpleCommenter, a competitor](https://www.simplecommenter.com/alternatives/pastel-alternatives). Ruttl has a free plan — [SourceForge](https://sourceforge.net/software/product/ruttl).

### Inferences
- Hypothesis on `file://` HTML is unproven and a poor fit: the identity of a document is its URL, so a moving or versioned local file breaks the link, and the full server is heavy for a solo install. Serving from a local origin and pointing `services` at a small h-compatible shim is the plausible route. Annotator shows that re-pointing storage is possible, by forking.
- Best reuse: adopt the W3C selector data model and the anchoring algorithm, not the Hypothesis product. Since Apache Annotator is archived, treat it as vendored code. Hypothesis's own anchoring code is maintained but tied to its client.
- For interactive documents, a hybrid anchor is needed, combining a stable element ID or CSS selector, a text quote, and an optional relative x/y position. Generated HTML could also carry stable `data-` IDs if the agent is told to emit them. No library surveyed provides this; it is new work, though small.
- Agentation is an interaction reference only. PolyForm Shield restricts competing use, so legal review would be needed before reusing code, and its React requirement does not suit arbitrary HTML.

### Gaps
- Hypothesis client's behaviour on `file://` HTML, and whether a minimal shim needs to implement the full h API, were not confirmed.
- Pastel, Ruttl and Markup.io localhost support, and all Superflow details, were not found. Any open-source libraries from these vendors were not found.
- The current state of Hypothesis's anchoring code differs possibly from the 2013 description. The source was not read.

## Visual-diff components

### Takeaway
Pixel libraries do not handle content shift: pixelmatch needs equal sizes, and odiff accepts differing layouts but documents no alignment. The more useful approach for HTML is DOM-aligned diffing, because the DOM is available. acoyfellow/visual-diff is the closest ready-made design but is very small; vlmkit is broader and busier but needs Node 24+.

### Cited Findings
- Pixel-by-pixel comparison makes one change at the top look like a whole-page change — [Tugboat docs](https://docs.tugboatqa.com/visual-diffs/using-visual-diffs/).
- pixelmatch: ISC, no dependencies, 7.0k stars, requires same dimensions, with windowed counts aimed at noise rather than displacement — [repo](https://github.com/mapbox/pixelmatch). Threshold default 0.1 differs from Playwright's 0.2 — [guide](https://camoa.github.io/dev-guides/testing/visual-regression/pixelmatch/pixelmatch-overview/).
- odiff: MIT, `odiff-bin` npm with `compare()` and `ODiffServer`, anti-aliasing detection, ignore regions, supports images with different layouts, `failOnLayoutDiff`. No shift compensation described. Self-reported 1.2 s versus 7.7 s for pixelmatch on one page — [repo](https://github.com/dmtrKovalenko/odiff). Windows support is not stated on the page.
- @acoyfellow/visual-diff: MIT, three tiers: DOM element multisets, aligned per-element computed style, then pixelmatch. Fail-closed verdict. Shift shows up indirectly as style deltas. Uses Playwright Chromium, with CLI `--report` and `--json`. 13 commits, 19 stars — [repo](https://github.com/acoyfellow/visual-diff).
- @mizchi/vrt was renamed @mizchi/vlmkit from 0.6.0, uses pixelmatch v7 with heatmaps, masking, Node 24+ — [pkgstats](https://www.pkgstats.com/pkg:@mizchi/vlmkit). MIT, 1,040 commits, 40 stars, `diff html`, `diff elements`, `diff png`, with a demo of a header that grew 48px and pushed content down. Region classification needs a key — [repo](https://github.com/mizchi/vrt).
- Percy isolates pixels responsible for a page shift — [Percy](https://www.browserstack.com/blog/introducing-percy-visual-engine/?nab=1). Lastest uses fuzzy row matching for vertical insertions and can fall back to a DOM diff — [wiki](https://sourceforge.net/p/lastest/wiki/Visual%20Diffing/).
- diffDOM (`diff-dom`): LGPL-3.0, produces an applicable and undoable diff, prefers moving nodes — [repo](https://github.com/fiduswriter/diffDOM).
- morphdom: MIT, 3.6k stars, patches a DOM in place and gives hooks, not a diff report — [repo](https://github.com/patrick-steele-idem/morphdom).
- node-htmldiff: MIT, 0.9.4, about 11.8k weekly downloads, `<ins>`/`<del>` output, health score 50/100, and last-update sources conflict (one year ago versus August 2022) — [Socket](https://socket.dev/npm/package/node-htmldiff), [Depscope](https://depscope.dev/pkg/npm/node-htmldiff). The mild-blue fork was last pushed in May 2024 — [ecosyste.ms](https://awesome.ecosyste.ms/projects/github.com%2Fmild-blue%2Fhtmldiff.js).

### Inferences
- Suggested pipeline: Playwright to freeze and capture both versions; match elements across versions using diff-dom or a stable ID; compare bounding boxes and computed styles to separate "moved" from "changed"; run pixelmatch or odiff per matched element crop; show text changes with htmldiff. This addresses shift by aligning elements rather than pixels.
- Interactive pages need deterministic states before capture (fixed viewport, frozen time and animations, seeded random, defined interaction steps). None of the libraries surveyed solves this for arbitrary agent-generated JS. Canvas and WebGL content has no DOM, so it falls back to pixel diff.
- diff-dom's LGPL matters only if the app is distributed. It is usually manageable as an unmodified npm dependency, but check it.
- Reimplementing a Lastest-style row alignment is a reasonable fallback for full-page visual comparison.

### Gaps
- Playwright's `toHaveScreenshot` details and current version were not researched separately. Background knowledge: it wraps pixelmatch and needs equal dimensions, unverified here.
- Last-release dates for pixelmatch, odiff, diff-dom and morphdom were not visible. Lastest's licence was not confirmed.

## Other document spaces

### Takeaway
Notion's HTML block (2026) is the most striking development, but it is cloud-based. Trilium has the most capable local HTML model, but in a note database. tldraw can be a sticky board around live iframes, though not a library. None has anchored comments on rendered HTML. No tool treats rich HTML as a first-class doc with agent integration in the sense this workflow needs.

### Cited Findings
**tldraw (user already owns it)**
- Embeds are created only for URLs matching allowed hostnames, and others become bookmarks. Raw pasted `<iframe>` can target any `src` with a stricter sandbox. `EmbedShapeUtil.configure()` adds definitions with `overridePermissions`. Interaction needs double-click or Enter to enter editing mode, and exits on Escape — [docs](https://tldraw.dev/sdk-features/embed-shape).
- Custom shapes render via `component(shape)` with `HTMLContainer` — [docs](https://tldraw.dev/docs/shapes).
- SDK production use needs a licence key, the editor stops rendering after five seconds without one, and development hosts work without a key. Hobby licences are discretionary and keep a watermark — [docs](https://tldraw.dev/sdk-features/license-key).
- The desktop offline app has a local HTTP server (default port 7236) with document listing, screenshots, JS execution and live scripts, and custom shapes via `config.js`, per community skill docs, not official docs — [Hermes skill](https://hermes-agent.nousresearch.com/docs/user-guide/skills/optional/creative/creative-tldraw-offline).
- A GitHub issue reports that dropping an `.html` file was treated as image or video — [#2200](https://github.com/tldraw/tldraw/issues/2200).

**Notion, Coda**
- Notion HTML blocks render custom HTML, CSS and JS. Uploading a Claude-generated HTML file is one route. Viewing works on all plans. Code cannot be edited in place, so changes require re-upload — [Matthias Frank, July 2026](https://matthiasfrank.de/en/notion-html-blocks/). A 5 MB free-plan file cap may apply, unconfirmed for HTML blocks — [Fast.io](https://fast.io/resources/notion-file-upload-limit/).
- Coda does not support direct HTML preview for security reasons, and URL embed via a host is the workaround — [community](https://connect.superhuman.com/t/preview-html-code-in-coda/43071). The Itsy Pack is display-only — [thread](https://connect.superhuman.com/t/itsy-a-free-pack-for-writing-web-apps-that-run-in-coda/33088).

**Trilium**
- Render notes display HTML from a linked code note, or Preact JSX, and scripts use `api.$container` — [docs](https://docs.triliumnotes.org/user-guide/note-types/render-note). Isolation is not documented there.
- MCP servers exist: tan-yong-sheng's lists the `render` type — [docs](https://glama.ai/mcp/servers/@tan-yong-sheng/triliumnext-mcp/blob/92e064f96dae4facc5972cbfeedb9309b0a11012/docs/manage-notes-examples/index.md); also [radonx](https://github.com/radonx/mcp-trilium) and [pwelty](https://github.com/pwelty/mcp_trilium), the last noting the original Trilium is in maintenance mode.

**TiddlyWiki, Logseq, AFFiNE**
- TiddlyWiki MCP plugin supports Node-hosted versions only and is read-only by default — [tiddly-mcp](https://github.com/rryan/tiddly-mcp). WikiLabs' plugin is experimental and needs TW 5.4.0+ — [forum](https://talk.tiddlywiki.org/t/wikilabs-tw-mpc-server-plugin-experimental/15142).
- Logseq can embed a local or remote HTML file with a raw iframe tag — [forum](https://discuss.logseq.com/t/embed-a-html-file/14813).
- AFFiNE is built on BlockSuite with custom blocks — [guide](https://betterstack.com/community/guides/linux/affine/). Its embed iframe block is provider-based, with no sign of arbitrary local HTML — [commit mirror](https://gitea.jaydenha.uk/Jayden/AFFiNE-Mirror/commits/commit/e086fd2a43a0d7696f21acd97a94ed5cfe9f67b6/blocksuite/affine/shared/src).

### Inferences
- tldraw is useful as an optional personal board, and iframe shapes plus sticky notes could give spatial stickies around a document. Stickies would sit over the iframe and not track content inside it, so they are board-level notes, not element anchors. Double-click-to-interact also adds friction. Local `file://` iframe loading is the first thing to test.
- Using the tldraw SDK inside a shipped standalone app requires a licence. Personal use of the owned desktop app is a different matter, not covered by that page.
- Notion fails the local requirement and has no version or diff support for these blocks that I could find. It shows that "drop agent HTML into a doc space" is now mainstream, which is competitive context.
- Trilium keeps notes in a database (background knowledge, unverified here), which works against a plain-files workflow where agents read documents directly.

### Gaps
- Anytype, Slite, Fibery and Zettlr: no results on HTML support. Treated as unknown, with no evidence they would fit.
- Trilium HTML note sandboxing and TiddlyWiki HTML tiddler sandboxing were not found.
- Official Notion docs on HTML block sandboxing, limits and comments were not found.
- Whether tldraw desktop can load local HTML in an iframe was not tested.

## Static-document managers

### Takeaway
Zotero has mature annotation but strips JavaScript, so it fails on interactive documents. ArchiveBox is an archiver, not a review tool, and is awkward on Windows. They are useful only for frozen-snapshot ideas.

### Cited Findings
- Zotero 7 can annotate web snapshots with highlights, underlines and sticky notes, plus comments and tags — [Sussex guide](https://guides.lib.sussex.ac.uk/zotero/notes).
- Snapshots are single-file static copies with all JavaScript stripped, capturing the rendered state — [forum](https://forums.zotero.org/discussion/85306/available-for-beta-testing-improved-webpage-snapshots). Annotations are stored in separate files, per a user report — [forum](https://forums.zotero.org/discussion/comment/461293). Pages with many scripts may break highlighting — [forum](https://forums.zotero.org/discussion/comment/21132/). No reliable way to carry annotations to a replaced snapshot was given — [forum](https://forums.zotero.org/discussion/comment/517748/).
- ArchiveBox: about 29k stars, MIT, install points at pre-release `archivebox>=0.9.0rc0`. Outputs include SingleFile HTML, a 1440x900 screenshot, WARC, PDF, DOM dump. It has a CLI, REST API (alpha) and Python API (beta), no annotation or MCP mentioned, and Windows only via an Electron app needing Docker Desktop — [repo](https://github.com/ArchiveBox/ArchiveBox).
- HTML Reader for Obsidian can open SingleFileZ files — [repo](https://github.com/nuthrash/obsidian-html-plugin).

### Inferences
- The patterns worth borrowing are sidecar annotation storage and archiving a frozen rendered snapshot alongside each version, which gives a stable baseline for diffing and for re-anchoring. Sidecars also keep agent-generated HTML unmodified.
- Zotero's lack of annotation carry-over between snapshots shows that re-anchoring across versions is a real unsolved need, and this workflow requires it.

### Gaps
- Calibre: the search returned nothing on HTML rendering or scripts, so it is unassessed. As an e-book manager it is unlikely to fit (inference).
- SingleFile's own handling of scripts, and whether Zotero keeps them on SingleFile-saved imports, were not confirmed.
