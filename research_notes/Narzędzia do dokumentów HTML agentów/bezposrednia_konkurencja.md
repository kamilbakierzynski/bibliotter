# Direct competitors: tools for reviewing, annotating and managing AI-agent-generated HTML documents (state as of 2026-11-05)

Method and evidence labels used throughout:

- Repo stats (stars, last push, creation date, license, release, commit count) come from the GitHub API, read on 2026-11-05. Base URL for each is the repo link given.
- **[R]** = stated in the project's README or official docs. **[S]** = stated in a spec or source file inside the repo. **[I]** = my inference.
- Nothing was installed or run. Every "yes" means "the project claims it", not "I confirmed it works".
- Scale: **Y** yes, **P** partial, **N** no (explicit, or the docs are detailed enough that silence means something), **?** unknown (docs too thin to tell). A feature is not counted without evidence.
- Features: A library/tree grouped into projects. B doc-to-repo+branch/PR link without committing. C threaded element-anchored comments. D agent reads and responds. E visual sticky markers including personal ones. F version history with render-level diff. G links/wiki-links/backlinks between docs. H shared style/skills shipped. I sandboxed interactive JS. J optional external hosting. K Windows and macOS.

## Does anything already cover most of the features? (attempt to disprove "nothing like this exists")

### Takeaway
The hypothesis is disproved for the core product. "Local library of projects + anchored comments + agent reply over MCP + immutable versions + sandboxed JS + optional hosting" exists and is actively maintained as **Artifact Server** (plannotator/artifact-server), with Plannotator OSS as its sibling. The hypothesis survives only for four features: no tool found does B (repo + branch/PR link), personal stickies (half of E), pixel-level visual diff for HTML (F), or wiki-links/backlinks between HTML docs (G).

### Cited Findings

**Summary matrix (top candidates).** Stats are stars / last push / license. Evidence for each cell is in the per-tool notes below.

| Tool | Stars | Last push | License | A | B | C | D | E | F | G | H | I | J | K |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Artifact Server](https://github.com/plannotator/artifact-server) | 260 | 2026-11-04 | MIT or Apache-2.0 | Y | N | Y | Y | P | P | N | P | Y | Y | P |
| [Plannotator OSS](https://github.com/backnotprop/plannotator) | 9,863 | 2026-11-05 | Apache-2.0 or MIT | P | P | P | P | P | Y (text only) | P | Y | Y | P | Y |
| [LiveFolio OSS](https://github.com/LiveFolio-Cloud/LiveFolio-oss) | 2 | 2026-10-05 | AGPL-3.0 | Y | N | P | Y | P | P | ? | Y | Y | Y | ? |
| [slashdocs](https://github.com/razorpay/slashdocs) | 410 | 2026-11-05 | MIT | Y | P | P | Y | N | P | ? | P | Y | Y | P |
| [Crit](https://github.com/tomasz-tomczyk/crit) | 1,276 | 2026-11-04 | MIT | P | P | Y | Y | N | P | N | P | P | Y | Y |
| [Artifact Studio](https://github.com/kaiketsu-labs/artifact-studio) | 1 | 2026-11-05 | none declared | Y | N | P | Y | N | P | ? | Y | Y | P | P |
| [tdoc](https://github.com/tornado-doc/tdoc) | 108 | 2026-11-05 | AGPL-3.0 + commercial | P | N | Y | Y | N | P | ? | Y | P | Y | P |
| [Lavish](https://github.com/kunchenguid/lavish-axi) | 4,408 | 2026-10-29 | MIT | N | N | P | Y | N | P | N | Y | Y | P | Y |
| [Imbas Artifact Vault](https://github.com/ObiJuanDeanobi/imbas-os) | 1 | 2026-06-24 | Apache-2.0 | Y | N | N | P | P | P | P | N | Y | N | Y |
| [web-artefacts](https://github.com/lbug/web-artefacts) | 0 | 2026-10-04 | MIT | P | P | P | Y | N | P | N | N | Y | N | P |
| [Reviewable HTML Workbench](https://github.com/u-ichi/reviewable-html-workbench) | 301 | 2026-09-10 | MIT | N | N | Y | Y | N | N | P | Y | P | P | ? |
| [Human Review](https://github.com/petergyang/human-review) | 1,444 | 2026-09-17 | MIT | N | N | P | Y | N | N | N | P | ? | N | ? |
| [Artifold](https://github.com/shubhamgoel27/artifold) | 16 | 2026-11-03 | MIT | Y | N | N | P | N | P | N | Y | ? | Y | P |
| [Claude Code Artifacts](https://code.claude.com/docs/en/artifacts) (first-party, hosted) | n/a | n/a | proprietary | P | N | P | Y | N | N | N | Y | Y | hosted only | Y |

**Artifact Server: per-feature evidence (closest overall).** 344 commits, created 2026-08-24, latest release v0.1.2 on 2026-09-24, repo pushed 2026-11-04.
- Positioned as "the open-source, self-hostable alternative to Claude Code artifacts", to "publish, review, comment on, version, and share"; it can "Run … on a laptop for one developer" — [README](https://github.com/plannotator/artifact-server).
- A: artifacts are stored by project — [README](https://github.com/plannotator/artifact-server); MCP has `project_list`, `project_create`, `project_rename`, `project_archive` — [docs/mcp.md](https://github.com/plannotator/artifact-server/blob/main/docs/mcp.md).
- B: no repo/branch/PR link found. The closest things are "linked artifacts" that index a file where it lives on disk, off by default and local-only — [local-workspace-spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/local-workspace-spec.md) — and optional Git history, which copies versions out to a private repo per artifact, the opposite direction — [git-history-spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/git-history-spec.md).
- C: threads on one exact version with one level of replies, resolve/reopen — [artifact-comments-spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/artifact-comments-spec.md). In-page review reuses Plannotator's `HtmlViewer`: crosshair pinpoint mode, hover outline, click to pin, element anchors with selector, text and point — same spec.
- D: MCP tools `comment_list`, `comment_get`, `comment_create`, `comment_reply`, `comment_update`, `comment_resolve`, `comment_delete` — [docs/mcp.md](https://github.com/plannotator/artifact-server/blob/main/docs/mcp.md). "Live session delivery is available from source for Pi and Claude Code Channels", and Claude Channels need a research-preview flag — [README](https://github.com/plannotator/artifact-server).
- E: numbered pins exist (spec above). No personal or not-for-agent note type found.
- F: comparison is file-level plus "a line comparison" for bounded text; "The first release has no image comparison interface, PDF comparison, media analysis, or archive inspection" — [product spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/artifact-server-product-spec.md). That makes it source-level, not render-level.
- G: not in the product spec or the MCP tool list.
- H: ships a portable Agent Skill for publishing and comment handling — [README](https://github.com/plannotator/artifact-server). Design skills live in the sibling repo [effective-html](https://github.com/plannotator/effective-html) (3,968 stars, MIT, pushed 2026-10-31).
- I: untrusted content is served from isolated version hosts separate from the app origin — [README](https://github.com/plannotator/artifact-server); browser tests cover hostile artifacts — [artifact-comments-spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/artifact-comments-spec.md).
- J: Cloudflare, Compose, Kubernetes, AWS, Google Cloud — [README](https://github.com/plannotator/artifact-server).
- K: CI has a "macOS portability" job on macos-14 — [ci.yml](https://github.com/plannotator/artifact-server/blob/main/.github/workflows/ci.yml). Windows has no documented support, but a bug "Publishing is impossible on Windows" was reported 2026-09-05 and closed — [issue #42](https://github.com/plannotator/artifact-server/issues/42). The local spec describes `O_NOFOLLOW`-based file serving for linked artifacts — [local-workspace-spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/local-workspace-spec.md).
- Source conflict: the [Plannotator docs page](https://docs.plannotator.ai/open-source/artifact-server) calls it "source-available, not OSI open source", experimental, with comments that are "for human reference only" and never sent to an agent, and describes no version history. The [repo](https://github.com/plannotator/artifact-server) is dual MIT/Apache with MCP comment tools and versions, and its [spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/local-workspace-spec.md) refers to an earlier "v0" with "no version history". I treat the repo as current and that docs page as stale.

**Plannotator OSS: per-feature evidence (most mature, most active).** 5,430 commits, release v0.28.50 on 2026-11-05.
- A: `plannotator annotate ./docs/` opens a per-session file browser for `.md`, `.mdx`, `.txt`, `.html`, `.htm` — [docs](https://docs.plannotator.ai/learn/annotate-any-web-page-or-html-file). Not a persistent library. The [Inbox](https://plannotator.ai/inbox/) groups threads by what they need from you, not by project.
- B: file histories are grouped under `<data-directory>/history/<project>/<history-key>/`, outside the repo — [version history docs](https://docs.plannotator.ai/open-source/workflows/version-history). For PRs it shows artifacts already posted in the conversation but "does not move the original files", and the gallery is absent for local diff reviews — [PR artifacts docs](https://docs.plannotator.ai/learn/code-review/review-pull-request-artifacts).
- C: text selection plus element "pinpoint" mode — [HTML docs](https://docs.plannotator.ai/open-source/workflows/html). The [feedback docs](https://docs.plannotator.ai/open-source/workflows/annotations-and-feedback) describe separate annotations and do not describe threads.
- D: Send Feedback returns structured annotations to the active session — [HTML docs](https://docs.plannotator.ai/open-source/workflows/html). No in-thread agent reply is documented for annotations, though the Inbox carries agent messages and replies — [Inbox](https://plannotator.ai/inbox/).
- E: pinpoint markers on the page; a separate App Notes browser extension keeps notes in extension storage for live pages — [docs](https://docs.plannotator.ai/learn/annotate-any-web-page-or-html-file). Docs do not mention private notes — [feedback docs](https://docs.plannotator.ai/open-source/workflows/annotations-and-feedback).
- F: best found for HTML. Reopening a changed file creates a version; "Show changes" renders the page with inline insertions and deletions, excluding script and style contents; a Version Browser picks any base — [HTML docs](https://docs.plannotator.ai/open-source/workflows/html), [version history docs](https://docs.plannotator.ai/open-source/workflows/version-history). Files opened from a folder do not create history — same page. This is a rendered text diff, not a pixel or layout diff.
- G: only plans saved to Obsidian with "backlinks for graph connectivity" — [README](https://github.com/backnotprop/plannotator).
- H: installer sets up skills, hooks and commands — [README](https://github.com/backnotprop/plannotator); [effective-html](https://github.com/plannotator/effective-html) is linked from it.
- I: sandboxed iframe with scripts allowed, but it "does not block outbound network requests" — [Claude artifacts page](https://docs.plannotator.ai/learn/ai-development/claude-artifacts); same point in [HTML docs](https://docs.plannotator.ai/open-source/workflows/html).
- J: encrypted short links with self-hostable paste service; link sharing is "moving to deprecated support" in favour of the hosted Workspaces waitlist product — [README](https://github.com/backnotprop/plannotator).
- K: PowerShell installer and Windows binary paths; Codex hooks on native Windows are experimental — [README](https://github.com/backnotprop/plannotator).

**LiveFolio OSS.** Local-first server with versions, sandbox, MCP and "zero accounts, zero telemetry"; installed with `npx @livefolio-cloud/cli` — [README](https://github.com/LiveFolio-Cloud/LiveFolio-oss).
- A: folios in a sidebar. D: `get_curated_brief`, `add_comment`. E/C: "reviewers pin comments directly on the rendered page", compiled into a brief; threading not stated. F: "compare and restore from the version rail", type of diff unstated. H: "140+ portable specs in `design-systems/`". J: on-demand Cloudflare tunnel, ngrok override. K: not stated. All from the same [README](https://github.com/LiveFolio-Cloud/LiveFolio-oss). Created 2026-09-10, 2 stars.

**slashdocs (Razorpay).** 264 commits, v0.4.1 on 2026-10-28.
- Sandboxed rendering on a separate render hostname, anchored comments with resolve/reopen, immutable versions, remote MCP, CLI with JSON mode, folder workflows — [README](https://github.com/razorpay/slashdocs).
- B: "GitHub-backed documents" let HTML fetch repo files at a branch, tag or commit through a bridge, which pulls content in rather than tagging a doc to a branch — [github-integration.md](https://github.com/razorpay/slashdocs/blob/main/docs/github-integration.md).
- Solo cost: needs Postgres, S3-compatible storage, and OIDC (compose bundles versitygw and Dex); Docker is the quickstart — [README](https://github.com/razorpay/slashdocs).

**Crit.** 1,024 commits, v0.23.2 on 2026-10-31.
- `crit landing.html` renders static HTML you can click and comment on; `crit comment --selector 'h1'` works on HTML previews; round-to-round diff has split and unified views — [README](https://github.com/tomasz-tomczyk/crit). Crit's site lists HTML artifacts among review targets — [crit.md](https://crit.md/).
- B: reviews live in `~/.crit/reviews`, listed with "branch or files, directory, age, and open comment count"; GitHub PR and GitLab MR sync via `crit pull` and `crit push` — [README](https://github.com/tomasz-tomczyk/crit). This is the strongest branch/PR link found, but for reviews rather than a managed doc.
- K: Windows exe documented; J: crit.md or a self-hosted target — [README](https://github.com/tomasz-tomczyk/crit).

**Artifact Studio.** 129 commits, v0.2.0 on 2026-11-05, created 2026-10-28.
- A: strongest UI found. Library home screen, projects with shared briefs, nested folders, filter and sort — [README](https://github.com/kaiketsu-labs/artifact-studio).
- D: stateless MCP over Streamable HTTP; agents read released feedback through MCP; Live or Batch modes — [README](https://github.com/kaiketsu-labs/artifact-studio).
- C: anchors to elements, text or image regions, but "The conversation belongs to the artifact", with `read_artifact_feedback` and no threaded replies described — [README](https://github.com/kaiketsu-labs/artifact-studio), [Getting Started](https://raw.githubusercontent.com/kaiketsu-labs/artifact-studio/main/docs/GETTING-STARTED.md).
- F: history timeline with thumbnails of saved content; compare exists for slide designs; no HTML visual comparison described — same sources.
- H: design packs, reference collections, workspace rules, learned preferences — [README](https://github.com/kaiketsu-labs/artifact-studio).
- K: Mac menu-bar app; Windows setup not described, though shortcut tables have a Windows/Linux column — [Getting Started](https://raw.githubusercontent.com/kaiketsu-labs/artifact-studio/main/docs/GETTING-STARTED.md).
- Risk: GitHub reports no license, and the README still says "access to this private repository" — [README](https://github.com/kaiketsu-labs/artifact-studio).

**tdoc.** 1,177 commits; AGPL-3.0 since 2026-08-28, previously MIT then Apache — [README](https://github.com/tornado-doc/tdoc).
- C: "Text selections and visual artifacts have their own threads, replies and reactions", and orphaned threads stay available to re-anchor — [USAGE](https://github.com/tornado-doc/tdoc/blob/main/docs/USAGE.md).
- D: `/tdoc edit` reads open comments, makes a new version, replies to each — [README](https://github.com/tornado-doc/tdoc).
- F: "Each revision is a full snapshot"; explicitly no "track-changes view" — [USAGE](https://github.com/tornado-doc/tdoc/blob/main/docs/USAGE.md).
- Local-work problem: "Published documents and comments live in remote storage"; local previews are working copies; tools need Bash, Node, Python and curl — [USAGE](https://github.com/tornado-doc/tdoc/blob/main/docs/USAGE.md).

**Lavish.** 276 commits, v0.1.96 on 2026-10-29.
- Sandboxed iframe with injected SDK, element and text annotation, conversation panel, `poll` and `reply` CLI, delivery receipts, Mermaid whiteboards, `design` and `playbook` guidance — [README](https://github.com/kunchenguid/lavish-axi).
- F: opt-in "Revisions legend" the agent declares in the artifact, max 6 rounds, with Reveal flashing changed blocks; not a computed diff — [README](https://github.com/kunchenguid/lavish-axi).
- A: "Sessions are keyed by the canonical HTML file path"; no library — [README](https://github.com/kunchenguid/lavish-axi).
- J: opt-in publish to third-party ht-ml.app; API base can be overridden; ht-ml.app has no delete endpoint — [README](https://github.com/kunchenguid/lavish-axi).
- K: platform badge macOS, Linux, Windows — [README](https://github.com/kunchenguid/lavish-axi).

**Imbas Artifact Vault.** The only tool found with library + backlinks + Windows installer, but dormant (see maintenance below).
- Electron app; `.exe`, `.dmg`, `.AppImage`; sandboxed `artifact://` viewer with network blocked by default; metadata, notes, snapshots with restore, "graph/backlink foundations across artifacts and Markdown pages", copyable AI context packages — [README](https://github.com/ObiJuanDeanobi/imbas-os). No comments on the document; agent exchange is manual copy/export.

**web-artefacts.** Smallest clean implementation of the loop.
- MCP tools `publish_artifact`, `read_comments`, `wait_for_comments`, `resolve_comments`; gallery with versions and diff; `<iframe sandbox="allow-scripts">` on its own origin with strict CSP; binds to 127.0.0.1 — [README](https://github.com/lbug/web-artefacts).
- B: "every artifact belongs to the project the agent works in: the name of its git repository", with data in `~/.local/share/web-artefacts`, so docs stay out of the repo; no branch or PR — [README](https://github.com/lbug/web-artefacts).
- K: "Tested on Linux and macOS. Windows is untested." — [README](https://github.com/lbug/web-artefacts).

**Reviewable HTML Workbench.** Comment threads with `needs_agent_review` / `needs_user_reply` / `resolved` states, `add-reply`, `watch-comments`, three skills, schema-driven document model — [README](https://github.com/u-ichi/reviewable-html-workbench). Limit: it reviews HTML it generated from its own model, so arbitrary agent HTML and JS are not its focus [I].

**Human Review.** Direct WYSIWYG edits plus anchored comments, batch Send, `poll` CLI; no account or database — [README](https://github.com/petergyang/human-review). Also a launch post: [Creator Economy](https://creatoreconomy.so/p/use-my-human-review-skill-to-edit-html-markdown-visually).

**Artifold.** `craft` design skill plus a local dashboard: indexes watched folders, thumbnails, search, version picker and diff view, one-click share to your own GitHub Pages. "Windows is untested". It skips cloned git repos by default — [README](https://github.com/shubhamgoel27/artifold). Alpha 0.14, 51 commits.

**Claude Code Artifacts (first-party).** Hosted on claude.ai, each publish becomes a version, gallery at claude.ai/code/artifacts, relative links do not resolve, single page only — [Claude Code docs](https://code.claude.com/docs/en/artifacts). Comments are described for artifacts shared "within your organization"; people on a public link "don't see its comments" — same docs. An open bug says comment reads return empty text — [issue #102872](https://github.com/anthropics/claude-code/issues/102872) (state: open, filed 2026-10-16). Reviewable HTML Workbench warns that this built-in tool can fire instead of local skills and send content to claude.ai, and shows how to disable it — [README](https://github.com/u-ichi/reviewable-html-workbench).

### Inferences
- Rough score, Y=1, P=0.5, N/?=0, out of 11: Artifact Server 7.0, Plannotator 7.0, slashdocs 6.5, Crit 6.5, LiveFolio 6.0, Artifact Studio 6.0, tdoc 6.0, Lavish 5.5. No tool passes 7/11 alone.
- Plannotator + Artifact Server together reach about 9/11 on paper, since one supplies F and the other A, C, D. They share the same org and UI code, and the repo holds a [plannotator-artifact-server-integration-spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/plannotator-artifact-server-integration-spec.md), which I did not read in full. They remain two products today.
- For a solo local user, hosted-first tools (tdoc, Markloop, Terrarium, byagent, open-artifact, coeditHTML, protopeek) fail the brief, because comments live on a server.
- Claude Code Artifacts' comment flow depends on org sharing, so a solo Pro/Max user probably cannot use it as a review loop. This is an inference from the docs' wording, not a stated limit.
- The real build-vs-adopt question is now "extend Artifact Server or build a narrower local app", not "is there a gap at all". Its comment anchor is opaque client JSON up to 16 KiB ([spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/artifact-comments-spec.md)), so sticky-note types could likely live client-side, but a personal note hidden from agents would need a server-side visibility rule because MCP lists all comments.

### Gaps
- No hands-on test of any tool, so Windows behaviour in particular is unverified everywhere except where a Windows binary is documented, and even then only claimed.
- Artifact Server folder or tree UI: the current README says "by project"; the tree is described only on the stale docs page.
- Whether web-artefacts', Artifold's, slashdocs', and LiveFolio's "diff" is source or rendered: READMEs do not say.

## Current state of the known candidates (Noteback, fileverse html-collab, Revi, Vibe Annotations, Roughdraft, DocsReader)

### Takeaway
None of the six is the closest fit. Noteback, fileverse html-collab, Revi and Roughdraft have had no pushes in 4 to 7 months; Vibe Annotations is active but targets running apps under a non-OSS license; DocsReader is active but Markdown-only with no comments.

### Cited Findings
| Tool | Stars | Last push | Created | License | Status | Core facts |
|---|---|---|---|---|---|---|
| [Noteback](https://github.com/alekkowalczyk/noteback) | 10 | 2026-06-23 | 2026-06-04 | MIT | Stale ~4.5 months, 58 commits | Local, no server. Text-quote anchors (W3C/Hypothesis style), copy feedback as Markdown, self-contained "feedback canvas" HTML, Chrome Web Store extension plus `npx noteback` skill. No threads, element pins, versions or library. Feedback goes by paste, not direct agent read. |
| [fileverse/html-collab](https://github.com/fileverse/html-collab) ("AI Feedback Loop") | 4 | 2026-06-19 | 2026-06-08 | GPL-3.0 | "focused proof of concept", stale | Sandbox render, pin notes to elements, 3 versions per file, "one project per browser at a time", share via Supabase, copy comments for the AI. Live at [html.fileverse.io](https://html.fileverse.io). |
| [Revi](https://github.com/YoRHa-Agents/Revi) (YoRHa-Agents) | 0 | 2026-04-05 | 2026-03-31 | none declared | Dormant 7 months | Rust + Vue. Workspace folder of plans, designs, prototypes; six anchor types; numbered image pins; `GET /api/export/{item_id}` JSON of open comments; resolve endpoint. Docs: [site](https://yorha-agents.github.io/Revi/). Binary named `revi-linux-x86_64` in README; Windows and macOS not confirmed. |
| [Vibe Annotations](https://github.com/RaphaelRegnier/vibe-annotations) | 196 | 2026-10-29 | 2025-07-16 | PolyForm Shield 1.0.0 | Active, badge claims 6K+ users | Chrome extension for localhost pages with an MCP server. For running apps, not a doc library. |
| [Roughdraft](https://github.com/Lex-Inc/roughdraft) | 457 | 2026-06-19 | 2026-04-22 | none declared on GitHub | Stale ~4.5 months | Markdown only. CriticMarkup in the file, replies via `re` pointers, blocking `roughdraft open`, experimental MCP with reply and resolve tools. Site: [roughdraft.page](https://www.roughdraft.page). A separate product named "RoughDraft" uses "RoughDraft Flavored Markdown" per [AICC docs](https://aicc-documentation.pages.dev/concepts/review-markup/); relation unverified. |
| [DocsReader](https://github.com/anbturki/docsreader) | 4 | 2026-10-20 | 2026-05-03 | none declared | Active, v0.11.1 | Tauri app for macOS, Linux, Windows. Markdown corpus with Docs, Memory and Tasks; bundled MCP server; tree, tags, split view, on-disk diffs, git status in the tree. No HTML rendering and no review comments in README. |

Name collision: [glendigity/html-collab](https://github.com/glendigity/html-collab) (22 stars, MIT, last push 2026-06-07) is a different project with suggested edits and threaded comments in a single review file.

### Inferences
- A cluster of projects started in May-June 2026 and stopped within weeks. Stale dates for tools this young likely mean they were weekend projects, not that they are "finished".
- Noteback's anchoring approach (W3C text quote with an "unanchored" fallback) is still worth copying regardless of adoption.

### Gaps
- Vibe Annotations' and Roughdraft's exact agent-reply semantics were not read beyond their READMEs.

## Other tools found: exhaustive list by category

### Takeaway
I found about 70 further projects, nearly all created after May 2026. They fall into clear categories, and almost every one solves a single slice: review loop only, shelf only, or publish only. The "library + review" combination is rare.

### Cited Findings

**Local HTML review loops (feedback to agent, no library)**
| Tool | Stars / push / license | Notes |
|---|---|---|
| [annotron](https://github.com/hueanmy/annotron) | 1 / 2026-08-04 / MIT | Element and text annotation, per-annotation threads in a sidecar file, history tab of rounds, agent auto-apply loop, VS Code package. |
| [Agent HTML Render](https://github.com/RiadMefti/agent-html-render) | 1 / 2026-11-03 / MIT | Stable anchors follow revisions; Review Changes verifies each request. **Linux only** ("fails closed on other operating systems"); authored JS blocked by default. Excluded for this user. |
| [canvas-flow](https://github.com/fernandomenuk/canvas-flow) | 20 / 2026-07-08 / NOASSERTION | Sandboxed iframe plus injected SDK, file-keyed sessions, very close to Lavish's design [I]. |
| [html-revisor](https://github.com/jessitron/html-revisor) | 1 / 2026-11-01 / CC0 | Directives stored in the HTML file as `<!-- @AI: … -->`, threads in the file. Loading a page reformats the file. |
| [bagel](https://github.com/1ppe1/bagel) | 0 / 2026-08-04 / MIT | Localhost-first push/pull; "Anchor Rebase" reattaches comments to the new DOM. Sync loop page is a demo, "Not yet wired to a real run". |
| [marginalia](https://github.com/vmlgtm/marginalia) | 1 / 2026-07-25 / MIT | Comments land in the existing agent session via a hook. |
| [agent-annotate](https://github.com/inosaint/agent-annotate) | 1 / 2026-08-25 / MIT | Click-to-note pins, region capture, send to agent. |
| [pinpoint](https://github.com/vinitkumargoel/pinpoint) | 4 / 2026-06-02 / MIT | Anchored comments on files and live pages for Claude Code. |
| [html-annotated-preview](https://github.com/myttttttt/html-annotated-preview) | 2 / 2026-05-23 / MIT | Text and rectangle annotations, AI pre-annotation, stored in `localStorage`. |
| [interactive-html](https://github.com/machbuilds/interactive-html) | 4 / 2026-06-19 / MIT | Highlight, ask, annotate; agent applies; page reloads. |
| [htmlpen](https://github.com/eshamanideep/htmlpen) | 0 / 2026-09-28 / MIT | Comment and edit local HTML, send review to agent. |
| [galley-lite](https://github.com/manqianc/galley-lite) | 0 / 2026-10-12 / MIT | Comment on local HTML; the building session edits in place. |
| [html-annotation](https://github.com/tonywang617-ui/html-annotation) | 1 / 2026-07-15 / MIT | Self-contained annotation layer skill. |
| [ai-html-annotation](https://github.com/Lisuiwen/ai-html-annotation) | 25 / 2026-10-23 / MIT | Skill for prototypes with live-DOM annotations; feedback copied to the AI. |
| [clickdoc](https://github.com/Juwebien/clickdoc) | 1 / 2026-05-17 / MIT | Folder of HTML becomes a doc site with SQLite annotations and an API. |
| [proofing-room](https://github.com/lucasyhzhu-debug/proofing-room) | 0 / 2026-08-11 / MIT | Drop-in wrapper with pins, in-place edits, drawing on page, JSON export. |
| [critique](https://github.com/miketdonahue/critique) | 0 / 2026-08-19 / MIT | Annotate in browser, CLI poll loop. |
| [eddie](https://github.com/2dryhands/eddie) | 0 / 2026-10-29 / MIT | Review canvas for plans and reports. |
| [html-review-kit](https://github.com/bharathnayak03/html-review-kit) | 2 / 2026-06-13 / none | Multi-strategy anchors (data ID, text quote, CSS, XPath) modeled on W3C Web Annotation; copy-paste prompt. Write-up: [DEV](https://dev.to/bharathnayakt/making-html-artifacts-collaborative-for-ai-workflows-3f20). |
| [Screenboard](https://github.com/Ibrahim-3d/screenboard) | 0 / 2026-11-04 / MIT | Pan/zoom canvas of routes and HTML mockups; numbered element-anchored pins with reply and resolve; `screenboard comments --json`; box snapshots. Stored in `.screenboard/` in the project. Closest found to a Figma-style board. |

**Local shelves and viewers (library, no comments)**
| Tool | Stars / push / license | Notes |
|---|---|---|
| [viewllm](https://github.com/yz671/viewllm) | 816 / 2026-06-24 / MIT | Single binary; file tree, live watching, unread state, tunnel sharing, browsing reports from a private GitHub repo. |
| [claude-artifact-viewer](https://github.com/claudecraft/claude-artifact-viewer) | 3 / 2026-09-16 / MIT | **Windows and macOS** app that watches a folder and renders files in tabs. One-way: "the viewer isn't aware of LLMs at all". |
| [artifacts-manager](https://github.com/ericmaster/artifacts-manager) | 4 / 2026-10-27 / none | Multi-repo hub; registry in `~/.artifacts-manager.json`, manifest in the project; sandboxed iframe; ships a skill. Generated artifacts use "a durable artifact project outside source worktrees" ([AGENTS.md](https://github.com/ericmaster/artifacts-manager/blob/main/AGENTS.md)). Closest shelf to feature B. |
| [tabless](https://github.com/starless0912/tabless) | 2 / 2026-07-30 / MIT | Windows, macOS, Linux badge; files by project and type; durable copies with dependency closure; no MCP. |
| [harbly](https://github.com/harbly-app/harbly) | 0 / 2026-08-09 / AGPL-3.0 | Tauri, Apple Silicon only. Plain-folder library, CSP sandbox. Version history UI was removed. |
| [artifact-vault](https://github.com/weeform/artifact-vault) | 1 / 2026-09-08 / MIT | One `index.html` in Chrome or Edge; read-only; scripts disabled; wikilinks only on roadmap. |
| [artiface](https://github.com/i207M/artiface) | 1 / 2026-10-16 / Apache-2.0 | Browser workspace across local and SSH hosts; Git status and text diffs; scripts blocked unless allowed per project. |
| [kcc-workbench](https://github.com/Dylan5237/kcc-workbench) | 3 / 2026-09-28 / MIT | Windows-only desktop GUI; artifact viewer, line diffs, checkpoint "time machine". |
| [prism](https://github.com/jakeryderv/prism) | 0 / 2026-09-30 / MIT | Pre-alpha Tauri, Linux first. |
| [Pagepod](https://github.com/QingYunA/Pagepod) | 7 / 2026-11-02 / MIT | Self-hosted gallery with hardened CSP sandbox and an upload API. |

**Publish and comment (hosted or self-hosted server)**
| Tool | Stars / push / license | Notes |
|---|---|---|
| [byagent](https://github.com/anup-a/byagent) | 1 / 2026-10-25 / AGPL-3.0 | Hosted plus self-host; projects as collections; versions with diff and rollback; `comments`, `mark`, `reply`, `resolve` CLI. |
| [open-artifact](https://github.com/iBala/open-artifact) | 7 / 2026-08-31 / NOASSERTION | Self-hosted; HTML element comments that keep position; skill. |
| [Terrarium plugin](https://github.com/nelsonsantryhkd/terrarium-plugin) | 2 / 2026-07-07 / none | Hosted; 7 MCP tools; typed threads; passage anchors. I could not verify the product independently; search results for the name pointed to an unrelated agent evaluation project ([shiporskip](https://shiporskip.io/compare/anthropic-claude-artifacts-sharing-platform-vs-terrarium-evolvent-ai-stateful-llm-agent-evaluation-engine-2026)). |
| [Markloop](https://markloop.io/blog/share-claude-code-artifacts) | closed / SaaS | Threads, version-tracked comments, `markloop_pull` MCP; Solo $19/mo, Team $49/mo, hosted in Europe. Source is a vendor blog. |
| [coeditHTML](https://github.com/Mason-Levyy/coedithtml-monorepo) | 1 / 2026-10-29 / MIT | Hosted; highlights, **sticky notes**, in-place edits; MCP `coedit_read_feedback` per [connect page](https://coedithtml.com/connect/). Only sticky-note tool found. Privacy of stickies not stated. |
| [protopeek](https://github.com/Brightwing-Systems-LLC/protopeek) | 0 / 2026-07-28 / MIT | Time-boxed links, pins with screenshots, five skills; hosted or self-hosted. |
| [orfc / rfc](https://github.com/titunian/rfc) | 8 / 2026-05-11 / MIT | Publish Markdown or HTML, pull inline comments. |
| [cloudreview](https://github.com/shtirlitsDva/cloudreview) | 0 / 2026-07-30 / none | Hosted review surface. |
| [Sideshow](https://github.com/modem-dev/sideshow) | 630 / 2026-09-07 / MIT | Live visual surface per agent session; per-post threads; sandboxed HTML with `sendPrompt()`; local Node or Workers. Conversation-shaped, not a doc library [I]. |
| [ArtifactFlow](https://github.com/Gadsotek/artifactflow) | 6 / 2026-11-05 / AGPL-3.0 | Self-hosted team workspace; MCP; compare source; opaque iframe sandbox; wiki links in Markdown. No comments in README. |
| [pergam](https://github.com/diesilveira/pergam), [docs-hub](https://github.com/Nitjsefnie-Harness-Commons/docs-hub), [htmldock](https://github.com/leeguooooo/htmldock), [agentboard](https://github.com/matthewdiy/agentboard), [open-artifacts](https://github.com/coda0HQ/open-artifacts), [glance](https://github.com/plivo-labs/glance), [just-html](https://github.com/kernel/just-html), [anvilnine/artifacts](https://github.com/anvilnine/artifacts), [prototype-bucket](https://github.com/tasmeet-iqbal/prototype-bucket) | 0 to 75 | Publish or host only; versioned URLs in several; no anchored review found in the parts I read. |

**Plan and Markdown review (feature set overlaps, HTML does not)**
- Markdown with comments and agents: [md-redline](https://github.com/dejuknow/md-redline) (47 stars, pushed 2026-11-04, MCP, Windows supported), [tether-md](https://github.com/tether-md/tether-md), [mdxg-redline](https://github.com/oubakiou/mdxg-redline), [redline](https://github.com/benthamite/redline), [margin](https://github.com/kmrinal19/margin), [claude-review](https://github.com/Ch00k/claude-review) (last push 2025-11-20), [mARC](https://github.com/notfounnd/marc-server).
- [Pentimento](https://github.com/lucastraba/pentimento) (1 star, 2026-10-22, MIT): worth studying. Markdown only, but it has word-level diffs, "Traces" showing the previous draft through the current one, `[[links]]` rendering, comments, approvals, and an Obsidian plugin. Agents' HTML mocks appear as screenshots.
- Plan review: [plan-live](https://github.com/yahav10/plan-live), [caret](https://github.com/macintacos/caret), [openplan](https://github.com/smithg09/openplan), [plan_viewer](https://github.com/mekalz/plan_viewer), [planmaxx](https://github.com/AlhasanIQ/planmaxx), [annotate-mcp](https://github.com/YannikG/annotate-mcp), [ryu-blueprint](https://github.com/amajorai/ryu-blueprint), [plannotator-tui](https://github.com/plannotator/plannotator-tui).

**Adjacent, not document tools**
- [Agentation](https://github.com/benjitaylor/agentation) (5,288 stars, 2026-09-22, PolyForm Shield): npm dev component with MCP for running apps.
- [Vibe Visual Editor](https://marketplace.visualstudio.com/items?itemName=andreyKats.vibe-visual-editor), [AgentEcho](https://www.producthunt.com/products/agentecho), [Notate](https://www.producthunt.com/products/notate-2), [vibepin](https://github.com/YIWANG3/vibepin): UI feedback for live apps. Notate and AgentEcho were seen only in search snippets.
- [univer-workspace](https://github.com/dream-num/univer-workspace) (2,273 stars): same idea for Office files; not checked further.
- [MD+HTML Reader](https://www.producthunt.com/products/md-html-reader): read-only macOS reader, seen only in a search snippet.

### Inferences
- Stickies are the emptiest area. Only coeditHTML advertises them, and it is hosted.
- Most small repos above have 0 to 5 stars and likely short lives. They are useful as design references, not dependencies.

### Gaps
- "Agentic HTML Visual Editor" appeared in one search summary, but a follow-up search found no such extension; treat as unverified.
- PreApp was named by a commenter on [DEV](https://dev.to/bharathnayakt/making-html-artifacts-collaborative-for-ai-workflows-3f20) and not investigated.
- Keyword-based reading of small repos may miss features stated only in deep docs.

## Follow-ups to Thariq Shihipar's HTML-over-Markdown post

### Takeaway
The post (May 2026) triggered a visible burst of projects, but most were generator skills. Review and library tools came next, and the strongest (Lavish) started within days.

### Cited Findings
- Simon Willison dates "Using Claude Code: The Unreasonable Effectiveness of HTML" to 2026-05-08 — [simonwillison.net](https://simonwillison.net/2026/May/8/unreasonable-effectiveness-of-html/). InfoQ covered it in June — [InfoQ](https://www.infoq.com/news/2026/06/anthropic-html-markdown-agent/).
- Repo creation dates right after it: viewllm and Imbas 2026-05-10, Lavish 2026-05-11, tdoc 2026-05-13, pergam 2026-05-14 — GitHub API, repos linked above.
- Generator skills in that wave: [Bloom](https://github.com/SunnyDevendranadh/Bloom) (explicitly captures the post's patterns), [html-it](https://github.com/robonuggets/html-it), [effective-html](https://github.com/plannotator/effective-html). A fork references dogum/html-artifacts — [effective-html fork](https://github.com/christianlarwood/effective-html). [visual-explainer](https://github.com/nicobailon/visual-explainer) (10,808 stars, created 2026-02-16) predates the post.
- Plannotator's author on HN: "Agents produce a lot of HTML now, so Plannotator renders those artifacts and lets you annotate them too" — [Show HN](https://news.ycombinator.com/item?id=48495970). Commenters in that thread named no competing annotation tools — same thread.
- Plannotator launched on Product Hunt on 2026-04-29 with 93 upvotes per aggregator [hunted.space](https://hunted.space/dashboard/plannotator) (aggregator, not primary).

### Inferences
- Timing suggests a causal link for the May cluster, but I found no direct statement from most authors except Bloom.

### Gaps
- Searches returned no usable Reddit or X threads, so community sentiment and any tools known only there are not represented. This is the largest coverage gap.
- Original post not read directly; only secondary coverage.

## Which tools are closest, what do they miss, and how well maintained are they?

### Takeaway
Adopt-or-extend shortlist: **Artifact Server** (closest architecture, permissive license, active), **Plannotator** (use now, best F and Windows), and **Crit** (best branch/PR handling). **Lavish** remains the strongest pure HTML loop. No tool covers B, E (personal), render-level F and G together, and those four are the actual reason to build anything.

### Cited Findings
Feature-by-feature best available:

| Feature | Best found | Gap remaining |
|---|---|---|
| A library | Artifact Studio, Artifact Server, slashdocs | Studio has no license |
| B repo + branch/PR, no commit | Crit (review keyed to branch, PR sync); web-artefacts (repo name only) | Nothing binds a managed doc to a branch or PR |
| C threaded element comments | Artifact Server, Crit, tdoc, annotron | Artifact Server threads tied to one exact version |
| D agent reads/responds | Artifact Server, web-artefacts, Lavish, slashdocs | Well covered |
| E sticky markers, personal ones | coeditHTML (hosted stickies), Screenboard (numbered pins) | No personal-only note type anywhere |
| F render-level diff | Plannotator "Show changes" | Text changes only; scripts and styles excluded; no pixel or layout diff |
| G links/backlinks | Imbas (foundations), Pentimento (Markdown), ArtifactFlow (Markdown) | Nothing active for HTML docs |
| H style/skills | effective-html, LiveFolio design systems, Artifact Studio design packs, Artifold `craft` | Well covered |
| I sandboxed JS | web-artefacts, Artifact Server, slashdocs, Lavish | Plannotator allows outbound requests |
| J hosting | Artifact Server, slashdocs, Crit | Well covered |
| K Windows + macOS | Plannotator, Crit, Lavish, tabless, Imbas | Many tools are Linux/macOS only or untested |

Maintenance (GitHub API, 2026-11-05):
- Very active, pushed this week: Plannotator (5,430 commits), Artifact Server (344), Crit (1,024), tdoc (1,177), slashdocs (264), Artifact Studio (129).
- Active, last pushed within about 5 weeks: Lavish 2026-10-29 (276 commits), LiveFolio 2026-10-05, web-artefacts 2026-10-04 (24 commits).
- Slowing: Human Review 2026-09-17, Reviewable HTML Workbench 2026-09-10.
- Stale or dormant: Roughdraft, Noteback, fileverse html-collab, viewllm (all June), Imbas (June; last release 2026-05-12), Revi (April).

License flags:
- PolyForm Shield (not OSI, restricts competing use): Agentation, Vibe Annotations.
- AGPL-3.0: tdoc, LiveFolio, byagent, ArtifactFlow, harbly.
- GPL-3.0: fileverse html-collab.
- No license declared: Artifact Studio, Revi, Roughdraft (GitHub reports none), DocsReader, artifacts-manager.

### Inferences
- For a solo user on Windows and macOS, a practical test order is: (1) Artifact Server running locally on Windows, because linked artifacts and Windows paths are the main risk; (2) Plannotator alongside it for HTML diff; (3) Lavish as a lighter fallback.
- If the differentiators (B, personal stickies, render diff, G) are what matter, a fork of Artifact Server or a new app reusing `@plannotator/ui`'s `HtmlViewer` (named in the [comments spec](https://github.com/plannotator/artifact-server/blob/main/project/spec/artifact-comments-spec.md)) may be cheaper than a full build. Artifact Server is multi-deployment and team-oriented, so a solo fork carries a lot of unused surface.
- A narrow build could also be justified on simplicity alone, for example Human Review reached 1,444 stars with 53 commits. That is a judgement, not a finding.
- Fast upstream motion is a risk for building on top: Plannotator shipped to v0.28.50 and Artifact Server's own docs already disagree with its repo.

### Gaps
- No evidence on real-world reliability, Windows quality, or how fast upstream reviews external PRs.
- I did not check whether Plannotator or Artifact Server have public roadmaps for B, E or G.
