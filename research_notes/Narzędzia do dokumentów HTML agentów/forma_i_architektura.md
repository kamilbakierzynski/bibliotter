# Delivery form factor and architecture for a local-first viewer of agent-generated HTML documents

Status: current to 2026-11-05. Evidence labels used below: **[primary]** = vendor docs, specs, source code, registry or release data; **[secondary]** = blogs, CVE mirrors, third-party summaries; **[tested]** = run in this session (Chrome 156.0.8078.80, headless, Windows 11, probe pages on 127.0.0.1). Tested results apply to Chromium only. Firefox and Safari were not tested.

Release facts checked directly on 2026-11-05: Electron 45.2.3 (2026-11-04, Chromium 156.0.8078.80, Node 24.22.2) — [releases.electronjs.org](https://releases.electronjs.org/releases.json); Tauri 2.12.5 (2026-10-21) — [GitHub releases](https://github.com/tauri-apps/tauri/releases); Playwright 1.65.0 (2026-11-05) — [GitHub releases](https://github.com/microsoft/playwright/releases); chokidar 6.0.0 and @parcel/watcher 2.6.0 — [npm registry](https://registry.npmjs.org/chokidar/latest). Several blog sources quote older versions (for example Electron 44 on M152 and Tauri 2.11 in [tech-insider](https://tech-insider.org/tauri-vs-electron-desktop-app-framework-2026/)); treat those as stale.

## File System Access API (FSA) as of November 2026: can a pure web app do this job?

### Takeaway
FSA remains Chromium-only with no sign of change: Firefox and Safari do not support `showDirectoryPicker`, and WebKit formally opposes it. Handles can persist and a one-time "Allow on every visit" choice removes most re-prompts, but watching only runs while a tab is open, the observer has an unknown per-origin limit, and the page cannot be queried by an agent. A PWA cannot serve as the whole product for a tool that must work across browsers and expose CLI/MCP.

### Cited Findings
- **Support:** `showDirectoryPicker`: Chrome 86+, Edge mirrors Chrome, Firefox `false`, Safari `false`; flagged `experimental: true`. **[primary]** — [MDN browser-compat-data, Window.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Window.json)
- caniuse shows `y` for Chrome 157–160 and Edge 153–156 and `n` for Firefox 159–162, Safari 27.1–27.3 and TP, and iOS Safari 26.6–27.2. Its status is `unoff` and it notes "Parts of the API are still missing." **[primary]** — [caniuse data](https://raw.githubusercontent.com/Fyrd/caniuse/main/features-json/native-filesystem-api.json)
- **Vendor stance:** WebKit's position is "oppose" with a security concern. The rationale is that colleagues saw no way to grant local write access that protects users. WebKit does implement the Origin Private File System part, and the WebKit engineer said this matched Mozilla's conclusion. **[primary]** — [WebKit standards-positions #28](https://github.com/WebKit/standards-positions/issues/28)
- **FileSystemObserver:** Chrome 133+ (Edge and Opera mirror), Firefox and Safari `false`; `experimental: true`, `standard_track: false`. **[primary]** — [MDN BCD, FileSystemObserver.json](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/FileSystemObserver.json); ship plan in the [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/6oOaFmia2dc). Chrome's own blog post is stale and still describes the origin trial — [Chrome blog](https://developer.chrome.com/blog/file-system-observer).
- **Observer semantics:** `observe(dirHandle, {recursive: true})` is supported. Record types are `appeared`, `disappeared`, `modified`, `moved`, `unknown` (events were missed, re-enumerate) and `errored` (observation is dead, for example when the per-origin limit is reached). That limit depends on the OS, "isn't known in advance", and retrying may not help. `unobserve()` is not supported. On Windows, cross-directory moves arrive as `disappeared` + `appeared`. — [Chrome blog](https://developer.chrome.com/blog/file-system-observer)
- **Handle persistence and re-prompts:** handles can be stored in IndexedDB. Before Chrome's persistent permissions, access ended when the origin's last tab closed. From Chrome 122, a three-way prompt offers "Allow this time", "Allow on every visit", "Don't allow". On return, `requestPermission()` on a stored handle triggers that prompt, and it covers all previously granted handles. Installed PWAs keep permissions automatically with no three-way prompt. Permission can also be auto-revoked after a tab has been backgrounded for a while. — [Chrome blog](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- **Spec position:** handles from IndexedDB "will likely start in the prompt state". User agents are encouraged to expire grants except for well-trusted origins such as installed apps. Clearing browsing data revokes persisted handles. — [WICG spec](https://wicg.github.io/file-system-access/)
- **User activation:** `showDirectoryPicker` requires transient user activation, and secure context is required. Too-sensitive directories produce `AbortError`. **[primary]** — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- **Protected folders (Chromium source, main branch):** blocked with all children: `~/.ssh`, `~/.gnupg`, `~/.config`, `~/.cache`, `~/.local/share`, shell rc files, Program Files, `C:\Windows`, Roaming and Local AppData, ProgramData-style common app data, macOS `~/Library`, `/Applications`, Chrome's own dirs. The folder itself is blocked but children are allowed for: home, Desktop, Documents, Downloads, and on macOS CloudStorage, Containers and Mobile Documents. Write-blocked by suffix: `.git/hooks`, `.git/config`, `.git/modules`, `.mvn`. **[primary]** — [Chromium permission context source](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/file_system_access/chrome_file_system_access_permission_context.cc)
- **Hidden folders:** the spec does not mention hidden files or dotfiles. — [WICG spec](https://wicg.github.io/file-system-access/). Chromium's rules are path-based, not dot-prefix based (see source above).
- **Iframes:** web.dev advises treating the API as unavailable when the app runs inside an iframe. — [web.dev](https://web.dev/articles/files/open-a-directory)
- **Reach from pages:** on `http://127.0.0.1`, `isSecureContext` was true and both `showDirectoryPicker` and `FileSystemObserver` were present in a Chromium 152 shell. **[tested]**
- **Agent access:** raw sockets are unavailable to normal pages; Direct Sockets is restricted to Isolated Web Apps. **[primary]** — [Chrome docs](https://developer.chrome.com/docs/iwa/direct-sockets)

### Inferences
- Repo-level folders such as `C:\Users\x\projects\repo` are selectable. Picking `~` itself or a Documents root is not, and neither is anything under AppData, so a user cannot grant one parent folder over everything. "Many repos" means many handles, or one projects root with a recursive observer over all of `node_modules`.
- Watching stops when the last tab closes, so a PWA has no background capture. It must re-walk every granted tree on open to detect what changed. That is workable for a few repos and poor for dozens.
- Dotfolders such as `.claude` inside a repo should be enumerable, because the block is path-based. `~/.config`, `~/.cache` and AppData are not. Not tested through the picker because it needs a real user gesture.
- **Can an agent read comments from a pure web app?** Only by indirection. If the PWA has readwrite permission on a folder, it can write sidecar JSON there and Claude Code can read that with ordinary file tools. There is no way for a CLI or MCP server to query the page. The moment an MCP server exists there is a local process, so the architecture is no longer "pure web". The page also cannot run `git` or `gh`, so it would parse `.git/HEAD` by hand and have no PR lookup.
- FSA suits a "try it instantly, Chromium only" demo. It is not a foundation.

### Gaps
- Actual per-origin observer limit: undocumented, and it may vary by OS.
- Whether FileSystemObserver works on mapped network drives: no source found.
- Mozilla's position page rendered empty when fetched, so Mozilla's stance is known only through the WebKit thread's remark. caniuse/BCD confirm non-implementation.

## Sandboxing untrusted HTML while keeping overlay comments and doc JS working

### Takeaway
The robust pattern is a separate content origin, `<iframe sandbox="allow-scripts">`, a CSP delivered by response header (including the CSP `sandbox` directive), and a host-injected bootstrap script that talks to the parent over `postMessage`. **The doc's own CSP does not stop exfiltration by self-navigation: only the parent page's `frame-src` did in testing.** Storage throws in opaque origins, so either shim it or use a per-document origin.

### Cited Findings
- **Iframe basics:** without `allow-same-origin` the frame has a unique opaque origin; messages arrive with origin `"null"`, the parent must check `e.source`, and messages to it must target `"*"`. Combining `allow-scripts` and `allow-same-origin` on same-origin content lets the frame remove its own sandbox. — [web.dev](https://web.dev/articles/sandboxed-iframes); [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- MDN's warning is specifically for the case "when the embedded document has the same origin as the embedding page", so `allow-same-origin` on a *different* origin keeps the boundary. — [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- Sandboxed frames cannot navigate top unless allowed; without `allow-popups-to-escape-sandbox`, popups inherit the sandbox. — [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- `srcdoc` documents get `about:srcdoc` as location and use the embedder's URL as base URL, so relative URLs resolve against the host. — [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- MDN says CSP should be delivered by response header and that meta "does not support all CSP features". — [MDN CSP guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP)
- A meta CSP injected at the top of a `sandbox="allow-scripts"` iframe could not be removed, altered, or escaped by the frame's JS in Chromium and Firefox, and held across a `data:` navigation. Exfiltration was not reported in that write-up. — [Simon Willison, April 2026](https://simonwillison.net/2026/Apr/3/test-csp-iframe-escape/)
- **Probe results [tested], each with a control:**

| Case | Setup | External sink reached? |
|---|---|---|
| A (control) | `sandbox=allow-scripts`, `src`, no CSP, doc runs `location.href=sink` | Yes |
| B | Same, parent response header `frame-src <app origin>` | **No** |
| C (control) | Same via `srcdoc`, no CSP | Yes |
| D | `srcdoc`, parent header `frame-src` | **No** |
| E | `srcdoc` with doc-level meta `default-src 'none'`, no parent CSP | **Yes (leak)** |
| F (control) | `srcdoc` with `<img src=sink>`, no CSP | Yes |
| G | Same, parent header `img-src 'none'` | **No** (parent CSP is inherited by srcdoc) |

- Also **[tested]**: in an opaque-origin frame, `localStorage`, `sessionStorage` and `document.cookie` all threw `SecurityError`, and `self.origin` was `"null"`. The script then stopped at `indexedDB.open`, which is consistent with a throw there too, though the exception itself was not captured.
- Also **[tested]** in the Chromium 152 shell: `http://doc1.localhost:47811` framed with `sandbox="allow-scripts allow-same-origin"` from a `127.0.0.1` parent had working `localStorage` and kept its real origin; the parent got `SecurityError` reading the frame's DOM. The same page loaded in stock Chrome reached the server with Host `doc1.localhost:47811`.
- **`*.localhost` on Safari:** WebKit bug 160504 is still marked reopened. In September 2025 a maintainer said a fix landed in OS frameworks; users report failure on macOS 15.7 and success on macOS 26.0. No release note found. WebKit has voiced concern about subdomains working around localhost protections. — [WebKit bug 160504](https://bugs.webkit.org/show_bug.cgi?id=160504). Chrome's intent notes it ensures loopback resolution before treating `*.localhost` as secure. — [blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/RC9dSw-O3fE)
- **MCP Apps spec (the closest published analogue, stable version 2026-01-26):** "If the Host is a web page, it MUST wrap the View and communicate with it through an intermediate Sandbox proxy"; "The Host and the Sandbox MUST have different origins"; the sandbox has `allow-scripts allow-same-origin`, forwards messages, and enforces CSP from declared domains, with empty `connectDomains`/`resourceDomains` as the secure default. **[primary]** — [ext-apps spec](https://raw.githubusercontent.com/modelcontextprotocol/ext-apps/main/specification/2026-01-26/apps.mdx). Conflict: the [A2UI guide](https://a2ui.org/guides/mcp-apps-in-a2ui-surface) describes a same-origin proxy, and the spec's own sample CSP uses `connect-src 'self'` while its default says `'none'`. The normative "different origins" text should win.
- **Claude Artifacts:** described as confined by CSP headers and the iframe sandbox attribute, limiting localStorage and external fetch. **[secondary]** — [Simon Willison](https://simonwillison.net/tags/content-security-policy/). No Anthropic primary doc found.
- **ChatGPT apps:** widgets run on subdomains of `web-sandbox.oaiusercontent.com` in a double iframe with declared CSP; Google Fonts needs `fonts.googleapis.com` and `fonts.gstatic.com` declared. **[secondary]** — [dev.to](https://dev.to/cptrodgers/mcp-app-csp-explained-why-your-widget-wont-render-9n1); [dev.to reverse-engineering](https://dev.to/infoxicator/i-reverse-engineered-chatgpt-apps-iframe-sandbox-2ok3). Nothing specific found on canvas.
- **CodePen:** runs user code on a separate domain (`cdpn.io`) plus the sandbox attribute plus its own checks. It calls running user code on the main domain "essentially one massive XSS vulnerability". — [CodePen blog](https://blog.codepen.io/2019/10/03/changed-domains-for-iframe-previews/)
- **Figma:** rejected an iframe for plugin logic because serializing large documents took about 14 seconds on one large file; kept a null-origin iframe for plugin UI, message passing to a main-thread sandbox, later moved from Realms to a WASM-compiled JS VM after a Realms shim vulnerability. — [Figma engineering](https://www.figma.com/blog/how-we-built-the-figma-plugin-system/)
- **Google:** recommends isolated sandbox domains on the public suffix list for active content, and CSP `sandbox` with `default-src 'none'` for inactive content. — [Google Security Blog](https://security.googleblog.com/2023/04/securely-hosting-user-data-in-modern.html); [web.dev](https://web.dev/articles/securely-hosting-user-data)
- **Jupyter:** rendered nbconvert output gets a `sandbox allow-scripts` CSP directive by default, placing scripts in a unique origin. — [Jupyter Server security docs](https://jupyter-server.readthedocs.io/en/latest/operators/security.html)
- **VS Code:** historic design used a data: URI outer frame for a unique origin; the maintainer reported he could not get a unique origin and a service worker together. 2019 evidence, current behaviour unconfirmed. — [Matt Bierner blog](https://blog.mattbierner.com/vscode-webview-web-learnings/); [W3C list](https://lists.w3.org/Archives/Public/public-webapps-github/2019Jun/0650.html)
- **Desktop-only network control:** Electron `webRequest.onBeforeRequest` can cancel or redirect, with resource types including `subFrame`, `webSocket`, `font`, `xhr`, `ping`. — [Electron webRequest](https://www.electronjs.org/docs/latest/api/web-request). `will-frame-navigate` covers subframe navigation and can be cancelled. — [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents). Electron advises sandboxing, context isolation, custom protocols over `file://`, and denying unexpected navigation and windows. — [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- **Tauri:** `on_web_resource_request` is "currently only implemented for the tauri URI protocol" and not run for external URLs, so it is not a general network filter. — [docs.rs](https://docs.rs/tauri/2.0.0-beta.2/tauri/webview/struct.WebviewBuilder.html). CSP only applies if set in config. — [Tauri CSP docs](https://v2.tauri.app/security/csp/)

### Inferences
- **Delivery options compared:**

| Method | Origin | CSP delivery | localStorage | Fit |
|---|---|---|---|---|
| `srcdoc` | Opaque with sandbox | Inherits parent; can add meta | Throws, shim needed | Simplest; only option for a PWA; relative URLs resolve to host |
| `blob:` URL | Opaque with sandbox | Meta only (inherited; not tested here) | Throws, shim needed | No gain over srcdoc |
| Custom protocol (Electron/Tauri) | Scheme-based; can be per-doc in Electron | Header | Works if the origin is real | Best in a desktop shell; cross-webview quirks in Tauri |
| Separate content port on localhost | Real origin, or opaque with sandbox | Header | Shared between docs if `allow-same-origin` | Good baseline for a local server |
| Per-doc `*.localhost` subdomain | One real origin per doc | Header | Real and isolated per doc | Best fidelity in Chrome/Edge/Firefox; Safari depends on macOS version |

- **Recommended default for the local-server form:** an app shell on one origin and a read-only content server on another, serving `sandbox="allow-scripts"` frames and sending this header. The shell page also sends `frame-src <content origin>`, which is the piece that stops navigation exfiltration:

```
Content-Security-Policy: sandbox allow-scripts; default-src 'none';
  script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com;
  font-src https://fonts.gstatic.com data:; img-src data: blob:;
  connect-src 'none'; form-action 'none'; base-uri 'none'
```

  The `sandbox` directive matters because it also protects a doc opened directly as a top-level URL, where the iframe attribute does not apply.
- **Keeping doc JS working:** in opaque mode, inject a shim before doc scripts that defines `localStorage`/`sessionStorage` via `Object.defineProperty`, backed by memory and optionally persisted through the bridge. Offer per-doc origins as an upgrade only if real docs prove to need IndexedDB or cookies.
- **Overlay design:** the host injects a small bootstrap as the first script in `<head>`. It adds capture-phase pointer listeners, computes anchors (CSS path + text quote + bounding rect), reports scroll and resize, and sends them to the parent. The parent draws pins in its own layer above the iframe, so the doc cannot restyle or hide the comment UI. Passing a `MessagePort` at init avoids repeated `"*"` targeting.
- **The bridge shares a realm with doc JS.** A malicious doc can forge anchors or overwrite the bootstrap. So every bridge message is untrusted input with no privileges. The parent validates shape, checks `e.source`, and never executes payloads. Comment storage happens on the parent side only.
- **External links:** deny popups, intercept clicks in the bootstrap, and have the parent open validated `http(s)` URLs after a user action.
- **Allowing Google Fonts is a narrow leak.** A doc can encode data in font URLs to Google, but not to an arbitrary attacker. For agent-generated docs that is acceptable. A stricter option is to rewrite to fonts cached by the daemon.
- **Electron gives real defence in depth** (network-layer deny-by-default plus navigation hooks). A local server running in the user's browser depends on CSP alone. Tauri sits in between: same CSP dependency, no general request filter.
- Sibling `*.localhost` origins are cross-origin but likely same-site, so per-doc origins are weaker than PSL-registered domains against same-site attacks. Do not rely on cookies for anything there.

### Gaps
- Exfiltration channels not tested: WebRTC, DNS prefetch, link preconnect, and whether CSP covers them in each browser.
- `frame-src` behaviour was tested only in Chromium, and MDN does not spell out whether it governs later navigations in a nested context. **Test Firefox and Safari before relying on this.**
- `blob:` CSP inheritance was not tested. MDN's guide did not cover it.
- JSFiddle's isolation and ChatGPT canvas specifically: no reliable source found.
- No Anthropic or OpenAI primary documentation for their sandbox internals.

## Rendering screenshots for visual diffs

### Takeaway
Use a real browser engine, not DOM-to-canvas libraries. Electron can capture natively; a local server can drive system Chrome/Edge through `playwright-core` (14 MB) with no bundled browser; Tauri has no portable capture API. Determinism needs seeded `Math.random`, a fake clock and disabled animations, and seeding only helps if call order stays stable.

### Cited Findings
- **Electron:** `capturePage([rect, opts])` captures the visible page when `rect` is omitted. `stayHidden` keeps it hidden; a page counts as visible when the window is hidden and capturer count is non-zero. — [Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents)
- **Electron offscreen:** GPU-accelerated (shared texture or CPU bitmap) and software output via `disableHardwareAcceleration()`. No frames are generated on idle pages, only dirty regions are passed, and windows are frameless. — [Electron OSR](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering)
- **Tauri:** the Wry feature request for Rust-side capture (#1358, Sept 2024) is open; PR #1674 opened 2026-02-23 and its status is unconfirmed; Tauri #12879 "capturePage" is an open request. — [wry #1358](https://github.com/tauri-apps/wry/issues/1358); [tauri #12879](https://github.com/tauri-apps/tauri/issues/12879); [discussion #13029](https://github.com/tauri-apps/tauri/discussions/13029). The platform routes are WebView2 CapturePreview and WKWebView takeSnapshot. **[secondary]** — [kernal-api #19](https://github.com/zackees/kernal-api/issues/19). WebView2's method "Captures an image of what WebView is displaying". **[primary]** — [Microsoft](https://learn.microsoft.com/en-us/dotnet/api/microsoft.web.webview2.core.corewebview2.capturepreviewasync). A third-party Tauri plugin's macOS path is still a stub. — [tauri-plugin-hasgard](https://docs.rs/crate/tauri-plugin-hasgard/0.1.2/source/src/screenshot/native.rs)
- **Playwright:** `page.screenshot` has `animations: "disabled"` (stops CSS animations, transitions and Web Animations; finite ones fast-forward, infinite ones reset), `caret: "hide"`, `mask`, `style` (reaches Shadow DOM and inner frames), `fullPage`. `addInitScript` runs before page scripts, also on child-frame attach and navigation, and the docs name seeding `Math.random` as a use. **[primary]** — [Playwright Page API](https://playwright.dev/docs/api/class-page)
- **Playwright clock:** based on `@sinonjs/fake-timers`, installed per BrowserContext so it covers all pages and iframes; added in 1.45; default fakes include `setTimeout`, `setInterval` and `Date`; install before navigating. **[secondary, generated client docs]** — [rubydoc Clock](https://rubydoc.info/gems/playwright-ruby-client/Playwright/Clock)
- **Dependency size:** `channel: 'chrome'` or `'msedge'` uses a branded browser; Playwright's own Chromium is about 281 MB; enterprise policies may interfere with driving Chrome/Edge. — [Playwright browsers](https://playwright.dev/docs/browsers). `playwright-core` 1.65.0 is 13.97 MB unpacked. — [npm registry](https://registry.npmjs.org/playwright-core/latest)
- **html2canvas:** "does not actually take a screenshot", re-implements rendering from DOM properties. Unsupported: `box-shadow`, `filter`, `mix-blend-mode`, `object-fit`, `border-image`, `repeating-linear-gradient()`, `writing-mode`, `zoom`. Cross-origin content can taint. — [docs](https://html2canvas.hertzen.com/documentation.html); [features](https://html2canvas.hertzen.com/features)
- **modern-screenshot:** fork of html-to-image using canvas and SVG, warns "Partial embedding will fail due to CORS", cannot yet clone CSS counters. — [GitHub](https://github.com/qq15725/modern-screenshot)
- **HTML-in-canvas:** Chrome-only origin trial from M148, API changed in M150 and M155, end milestone inconsistent between documents. Not usable as a foundation yet. — [Chrome blog](https://developer.chrome.com/blog/html-in-canvas-ot-changes); [Intent to Extend](https://groups.google.com/a/chromium.org/g/blink-dev/c/BpWbzJ9P22s)

### Inferences
- **Library approaches fail the requirement.** They would run inside the sandbox, must fetch fonts under CORS, and redraw an approximation, so a diff would compare the library's output rather than the render. Use them for thumbnails at most.
- **Local server path:** `playwright-core` plus `channel: 'msedge'` or `'chrome'`, downloading Chromium only as a fallback, and only on first use of visual diff. Edge should exist on Windows, but a Mac with only Safari would need the 281 MB download.
- **Put the determinism shim in the daemon's injection step, not in Playwright.** The same bootstrap can then replace `Math.random` with a seeded PRNG (the sample doc calls it 13 times), freeze `Date`, and stub `crypto.getRandomValues` and `performance.now`. It would work unchanged in any capture backend.
- **Seeding has a limit.** It gives identical output for identical code, but if v2 adds one `Math.random` call, every later value shifts and unrelated elements change. Pair pixel diffs with a DOM or text diff, so that "same content, shifted random layout" can be labelled as noise.
- Also needed: wait for `document.fonts.ready`, fixed viewport and device scale, and locally cached font responses so Google Fonts changes do not create diffs.
- Only one state of an interactive doc gets captured unless the agent or user scripts more states.
- Diff screenshots from Chromium are not what a Firefox or Safari user sees. That is fine for version-to-version comparison.

### Gaps
- Full-page capture in Electron beyond the viewport is not covered by `capturePage` docs. CDP `Page.captureScreenshot` through `webContents.debugger` is likely the route but was not verified here.
- Whether `addInitScript` reaches opaque-origin sandboxed frames was not tested. The daemon-injection approach avoids the question.
- Exact default `toFake` list (including `requestAnimationFrame` and `performance`) was not confirmed in primary Playwright docs.

## Security of a localhost server

### Takeaway
Local servers are repeatedly exploited through the browser, and binding to loopback does not fix it. Each defence below has a CVE behind it. In this product **the threat also comes from inside**: a hostile doc on a localhost origin escapes Chrome's Local Network Access gate, and in testing its POST reached the API with `Origin: null`. Keep MCP on stdio, and keep the API on a separate, token-gated origin.

### Cited Findings
- **Vite CVE-2025-24010 (GHSA-vg6x-rcgg-rjx6, Moderate, CVSS v4 6.9):** "This vulnerability even applies to users that only run the Vite dev server on the local machine". Permissive default CORS, no Origin check on WebSockets, no Host check. Patched in 6.0.9, 5.4.12, 4.5.6. **[primary]** — [GitHub advisory](https://github.com/vitejs/vite/security/advisories/GHSA-vg6x-rcgg-rjx6). The fix added `server.allowedHosts`: `localhost`, `.localhost` subdomains and all IPs are allowed by default, the check is skipped under HTTPS, and setting it to `true` is documented as exposing the server to DNS rebinding. **[primary]** — [Vite server options](https://vite.dev/config/server-options)
- **MCP Inspector CVE-2025-49596 (CVSS 9.4 per SOCRadar):** no auth between client and proxy, chained with the "0.0.0.0 Day" browser flaw and CSRF for RCE from a website; fixed in 0.14.1. **[secondary]** — [SentinelOne](https://www.sentinelone.com/vulnerability-database/cve-2025-49596/); [SOCRadar](https://socradar.io/cve-2025-49596-flaw-anthropics-mcp-inspector-rce)
- **Claude Code IDE extensions CVE-2025-52882 (CVSS 8.8):** localhost WebSocket with no client auth; any visited site could connect. The fix uses an auth token stored in a local lock file. — [Datadog Security Labs](https://securitylabs.datadoghq.com/articles/claude-mcp-cve-2025-52882/); [OSV](https://osv.dev/vulnerability/CVE-2025-52882)
- **MCP TypeScript SDK CVE-2025-66414:** DNS rebinding protection off by default for HTTP servers; **stdio servers are not affected**; fixed in 1.24.0 with `hostHeaderValidation()`. The advisory still recommends authentication on localhost. — [GitHub advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w)
- **Zoom CVE-2019-13450:** any website could interact with Zoom's localhost web server and force a video join; the server survived uninstall. — [CVE record](https://cveawg.mitre.org/api/cve/CVE-2019-13450); [CERT-HR](https://cve.cert.hr/cve/CVE-2019-13450)
- **jupyter-mcp-server CVE-2026-77359 (CVSS 9.3):** some routes skipped the Host/Origin check; POST `/mcp` with forged headers got 421 while PUT `/api/connect` got 200. Lesson: apply checks as global middleware. **[secondary]** — [Pluto Security](https://pluto.security/blog/notebook-backdoor-jupyter-mcp-server/)
- **Jupyter Server CVE-2026-86049:** before 2.21.0, 5xx logging wrote token-bearing Referer values to logs. Lesson: avoid tokens in URLs. **[secondary]** — [Corgea](https://corgea.com/advisories/vulnerabilities/CVE-2026-86049); [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-86049). Also listed: `allow_origin_pat` bypass CVE-2026-40110, details not reviewed. — [Corgea](https://corgea.com/advisories/packages/pypi/jupyter-server)
- **Jupyter defences:** token auth on by default, disabling is strongly discouraged. — [security docs](https://jupyter-server.readthedocs.io/en/latest/operators/security.html). Default 403 on non-local Host headers to block DNS rebinding (`allow_remote_access=False`), `local_hostnames` defaults to `['localhost']`, loopback IPs allowed. — [config reference](https://jupyter-server.readthedocs.io/en/latest/other/full-config.html)
- **Chrome Local Network Access:** two permissions: `local-network` and `loopback-network` (public or local to loopback). **Checks apply only when moving to a more private address space; a page served from `http://localhost` connecting to localhost triggers no check by default.** Permissions are denied in insecure top-level contexts. PNA preflight headers should not be relied on. — [Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access)
- **LNA version conflict:** the prompt launched in Chrome 142 per [Chrome blog](https://developer.chrome.com/blog/local-network-access); an [Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/cwu_RUmBpzY) says 141. WebSocket gating slipped from M144 to M147. — [Intent to Extend](https://groups.google.com/a/chromium.org/g/blink-dev/c/lRnFRIfzDMU). Chrome 154 release notes add `targetAddressSpace` for WebSocket, which conflicts with the [guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access) that says the constructor throws on it. — [Chrome 154](https://developer.chrome.com/release-notes/154). A third-party blog says the opt-out policy goes away in Chrome 156; unconfirmed. — [superchargebrowser](https://www.superchargebrowser.com/library/chrome-156-local-network-access/)
- **[tested]** A doc in `sandbox="allow-scripts"` served from the same origin as the API sent `fetch(API, {method:'POST'})`. The request reached the server with `Origin: null` and `Sec-Fetch-Site: cross-site`. The server had no auth or Origin check, so the side effect would have happened whether or not the response was readable.

### Inferences
- **Minimum defence list, each traceable to a CVE above:**
  1. Bind `127.0.0.1` and `::1` only, never `0.0.0.0` (MCP Inspector).
  2. Strict Host allowlist as global middleware, covering all methods and WebSocket upgrades (Vite, jupyter-mcp-server).
  3. Require a per-install random token in an `Authorization` header. Keep it in a user-only lock file. Do not use query strings or cookies (Claude IDE fix, Jupyter log leak).
  4. Origin allowlist, reject `null` and any foreign origin, and reject `Sec-Fetch-Site: cross-site` on state-changing routes (probe).
  5. No wildcard CORS (Vite).
  6. Origin check on every WebSocket (Vite, Claude IDE).
  7. Separate origins for API and content. The content server is read-only and serves only registered docs.
  8. No OS-level persistence without clear uninstall (Zoom).
- **MCP should be stdio**: `mytool mcp` launched by Claude Code reads the same files as the UI. No HTTP MCP means no rebinding surface, and it works with the daemon off.
- **LNA helps against external websites but does not protect against docs.** Docs live on a loopback origin, so they are inside the gate. CSP `connect-src 'none'` and API auth must do that job. LNA also protects only Chromium users.
- A pure PWA has no localhost surface at all, and that is its real security advantage. Electron and Tauri can avoid a TCP port entirely by using custom protocols and IPC, which removes this whole section, provided no port is opened for the CLI.

### Gaps
- Firefox and Safari equivalents of LNA: not researched.
- NVD primary text for CVE-2025-49596 was not read. Browser-chain details rest on secondary sources.
- The CVE-2026-x records appear only in secondary databases. Verify before quoting in public.
- Whether an unauthenticated token-file design survives malware running as the same user: out of scope, since same-user malware already has the files.

## File watching, snapshot storage and repo/branch binding

### Takeaway
Use @parcel/watcher in the daemon, always with a periodic reconcile scan, because every OS watcher can drop events by design. Store snapshots in a content-addressed store outside the repo, with a small index. Bind docs to repos using `git rev-parse --git-common-dir` plus branch, and keep the sidecar out of the repo.

### Cited Findings
- **@parcel/watcher 2.6.0:** FSEvents on macOS, ReadDirectoryChangesW on Windows, prebuilt platform packages; events coalesced in C++ so `git checkout` arrives as one batch; `ignore` globs; `writeSnapshot` + `getEventsSince` for offline catch-up. On Windows that query is brute-force FindFirstFile unless Watchman is installed. Network drives are not covered. — [GitHub](https://github.com/parcel-bundler/watcher); [npm](https://registry.npmjs.org/@parcel%2Fwatcher/latest)
- **chokidar 6.0.0:** engines `node >= 22.22`, one dependency (`readdirp`), about 202 KB unpacked. — [npm](https://registry.npmjs.org/chokidar/latest). v6 (October 2026) is a complete rewrite with a new `fs.watch(recursive)` backend on macOS and Windows; stat polling is available for network and unusual filesystems; globs were removed in v4. **[primary]** — [chokidar README](https://github.com/paulmillr/chokidar). The machine used for this research runs Node 22.14.0, which is below that floor. **[tested]**
- **Field reports (anecdotal, conflicting):** one project replaced chokidar with @parcel/watcher, using its own per-path debounce instead of `awaitWriteFinish`. A review comment there warned that user-defined excludes might not be pruned at the watcher level, which could traverse large trees and hit OS limits; this is an unresolved concern in that PR, not a confirmed bug. — [relayfile PR #55](https://github.com/AgentWorkforce/relayfile/pull/55). Another project audited six watchers and chose chokidar v5 mainly for pure-JS cross-runtime parity, keeping Parcel as the alternative for monorepos above 100k files. — [codemap PR #46](https://github.com/stainless-code/codemap/pull/46). Both predate or ignore chokidar 6. No neutral benchmark was found.
- **Windows contract:** on buffer overflow `ReadDirectoryChangesW` still returns true, discards the entire buffer, and reports zero bytes; `ERROR_NOTIFY_ENUM_DIR` means changes could not all be recorded. In both cases the app must enumerate. — [Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw)
- **SQLite blobs:** reads are faster in the DB below about 100 KB and from files above it (2011 test, page updated 2022); page size 8192–16384 is best for large blobs; about 35% faster than file I/O for 10 KB blobs. — [SQLite](https://www.sqlite.org/intern-v-extern-blob.html)
- **node:sqlite:** Stability 1.2, release candidate as of v25.7.0. — [Node docs](https://nodejs.org/api/sqlite.html)
- **Git worktrees:** a linked worktree has a `.git` *file* pointing to `$GIT_DIR` under the main repo, `$GIT_COMMON_DIR` points to the shared dir. `HEAD` and `index` are per-worktree, and `refs/` are shared. Use `git rev-parse --git-path` rather than assuming paths. — [git-worktree](https://git-scm.com/docs/git-worktree)
- **`info/exclude`:** when `GIT_COMMON_DIR` is set, `$GIT_COMMON_DIR/info` is used, so it is shared across worktrees and never committed. — [gitrepository-layout](https://git-scm.com/docs/gitrepository-layout)
- **gh:** `gh pr list --head <branch>` filters by head branch, and `<owner>:<branch>` is **not supported**. `--state` accepts `open|closed|merged|all`; `--json` fields include `headRefName`, `headRepositoryOwner`, `number`, `state`, `url`. — [gh manual](https://cli.github.com/manual/gh_pr_list)

### Inferences
- **Why Parcel over chokidar here:** it has native backends, offline `getEventsSince`, and batching built in, while chokidar 6 is a month-old rewrite. Chokidar is the sensible fallback if native prebuilds become a problem, and its polling mode is useful for network paths. Keep the watcher behind an interface so this stays a cheap decision.
- **Many-folder strategy:** do not watch whole repos blindly. Register *library roots* plus directories of known docs, ignore `node_modules`, `.git`, `dist`, and treat only `*.html` as relevant. Better still, have the agent or CLI register docs (`mytool add path`), which reduces the watch surface and the risk of overflow in big monorepos.
- **Always reconcile.** On startup and every few minutes, compare size, mtime and hash. Watch events become a latency optimisation, not the source of truth. This also handles sleep and resume.
- **Storage comparison for 100–300 KB docs:**

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Hidden git repo per library | Delta compression, history tooling | Needs git; maintenance and `gc`; risk of confusing with user repos; awkward concurrent writes | Second choice |
| Content-addressed store (`sha256` → gzip file) + index | Trivial dedup and integrity, agent- and rsync-friendly, atomic writes, works on S3 later | No delta compression; needs own GC | **Pick** |
| SQLite for everything | One file, transactional | Docs sit at the size where SQLite stops winning; binary file is opaque to agents; native module or RC API | Use for index only |

- Screenshots (PNG) go in the same CAS.
- **Index format:** plain JSON/JSONL for comments keeps them readable by the agent with no tool at all. Add SQLite only if search or scale requires it. `node:sqlite` being RC argues against making it a hard dependency today.
- **Repo identity:** resolve `git rev-parse --git-common-dir` to a stable id, so all worktrees of a repo map to one key, then record `(repoId, relative path, branch, HEAD sha)`. Store the sidecar in the app data dir, keyed by that id and a hash of the path. This survives `git clean`, cannot be committed by accident, and needs no change to user repos. `info/exclude` is a good option only if a doc must sit inside the worktree untracked.
- **PR lookup:** `gh pr list --head "$branch" --state all --json number,url,state,headRepositoryOwner`, then filter by owner because forks can share branch names. Treat `gh` as optional: cache results and degrade to no PR link if it is missing or unauthenticated.

### Gaps
- macOS FSEvents behaviour across many roots and on sleep/resume: no primary source retrieved.
- No measured compression ratio for these docs. Measure on real samples before tuning.
- `git rev-parse --git-common-dir` is known from general git usage; the fetched page documents `$GIT_COMMON_DIR` and `--git-path` but does not name that flag.

## Cost for one developer, and migration paths

### Takeaway
The npm/CLI path has essentially no signing, notarization or update cost. Desktop shells add about $99/year for Apple plus $150–300/year for an OV certificate for an individual outside the US and Canada, and SmartScreen warnings remain either way. Electron's downloadable runtime is about 121–158 MB; Tauri's installer is far smaller, but its memory advantage on Windows is disputed, and it complicates a Node daemon.

### Cited Findings
- **Electron runtime size:** `electron-v45.2.3-win32-x64.zip` 158.2 MB, `darwin-arm64` 121.2 MB (compressed, before the app). **[primary]** — [GitHub release data](https://github.com/electron/electron/releases/tag/v45.2.3)
- **Node runtime size:** Node 24.11.0 `win-x64.zip` 36.4 MB; `darwin-arm64.tar.xz` 26.2 MB. **[primary]** — [nodejs.org/dist](https://nodejs.org/dist/v24.11.0/)
- **Tauri size:** Tauri "Hello World"-style 2.5 MB vs 85 MB for Electron, and typical 3–10 MB vs 120–200 MB. **[secondary, no primary benchmark]** — [noqta](https://noqta.tn/en/blog/tauri-2-desktop-apps-rust-web-technologies-2026)
- **Memory numbers conflict, flag rather than resolve:** Dawloom (23 Oct 2026, Windows 11, Tauri 2.12.3 vs Electron 44.4.5): 142 MB vs 149 MB, within 5%, reported only via [tech-insider](https://tech-insider.org/tauri-vs-electron-desktop-app-framework-2026/); Dawloom's original was not reachable. Hopp, six windows: about 172 MB vs 409 MB. — [dev.to/gethopp](https://dev.to/gethopp/tauri-vs-electron-performance-bundle-size-and-the-real-trade-offs-1el4). Generic 2026 blog claims: 40–80 MB vs 150–400 MB idle. — [noqta](https://noqta.tn/en/blog/tauri-2-desktop-apps-rust-web-technologies-2026). None is vendor-neutral and audited.
- **Apple:** $99/year account for notarization; free accounts cannot notarize; Developer ID certificate only by Account Holder; a Mac is needed to sign; ad-hoc signing does not remove the Gatekeeper prompt. — [Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/). Sequoia removed Control-click override; users must use System Settings. — [Apple news](https://developer.apple.com/news/?id=saqachfa)
- **Windows options (page dated 2026-08-29):** Azure Artifact Signing about $9.99/month, **organizations in USA, Canada, EU, UK; individuals USA and Canada only**. OV $150–300/year with HSM or token required. EV $400+/year and no longer bypasses SmartScreen since 2024. All signed options build reputation over time, "initial warnings expected". Microsoft Store MSIX: free, re-signed, no warnings. SignPath Foundation free for qualifying open source. **[primary]** — [Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options). Older posts promising instant trust conflict with this and appear outdated, for example [Moonbase 2025](https://moonbase.sh/articles/code-signing-audio-plugins-in-2025-a-round-up/).
- **Auto-update, Electron:** update.electronjs.org is free for public GitHub repos with Releases, and needs macOS code signing; static S3 or self-hosted are alternatives. — [Electron updates](https://www.electronjs.org/docs/latest/tutorial/updates)
- **Auto-update, Tauri:** signatures are mandatory and cannot be disabled; losing the private key strands installs; static JSON or a dynamic server. — [Tauri updater](https://v2.tauri.app/plugin/updater/)
- **Tauri sidecars:** external binaries are supported with target-triple naming and shell permissions; Node is the docs' example. — [Tauri sidecar](https://v2.tauri.app/develop/sidecar/)
- **Rendering consistency:** cross-webview inconsistency is a known Tauri trade-off. **[secondary]** — [tech-insider](https://tech-insider.org/tauri-vs-electron-desktop-app-framework-2026/)

### Inferences

| Form | Packaging | Signing cost/yr | Auto-update | Download footprint | Solo effort to first release |
|---|---|---|---|---|---|
| PWA | Static host | $0 | Free (redeploy) | Smallest | Low, then permanent workarounds |
| CLI + server | npm publish | $0 | `npx pkg@latest` | Small + optional browser | **Lowest** |
| Hybrid | As above, shell later | $0 until shell | As above | As above | **Lowest, same as above** |
| Electron | electron-builder/Forge, 2 OS | $99 + OV $150–300 (individual outside US/CA) | Free if public repo | ~120–160 MB+ | Medium |
| Tauri | Rust toolchain, 2 OS | Same | Own key management | ~3–10 MB (+36 MB compressed if Node sidecar) | Medium-high, two languages |
| Hosted + connector | Cloud **and** signed connector | Signing plus hosting | Both | Connector | **Highest** |

- If the developer is an individual in Poland or anywhere in the EU (the folder name suggests this, but it is unconfirmed), Artifact Signing is unavailable unless they operate as a registered organization. The OV path with a hardware token or cloud HSM is then the realistic one, or the Store.
- The npm path avoids browser-download reputation checks because the user runs a package manager rather than a downloaded installer. That is my reasoning and I found no source that states it. It requires Node on the machine. For a Claude Code audience that is common but not guaranteed, because Claude Code has a native installer.
- **`npx` has a cold-start cost and a supply-chain risk.** Prefer a global install or pinned version for daily use, publish with provenance, and keep dependencies few.
- **Avoid an OS service at first.** `mytool open` can start the daemon on demand and leave it to exit when idle, using a lock file. CLI and MCP read files directly, so the agent works with no daemon running. Add launchd or Task Scheduler only if always-on capture proves necessary. Zoom shows why uninstall must be clean.
- **Migration paths:**
  - **Web UI + Node daemon → Electron:** smallest step. The same Node code runs in Electron's main or utility process, the UI loads unchanged, and the custom protocol replaces the TCP port. Estimated at days to a couple of weeks plus signing setup.
  - **Web UI + Node daemon → Tauri:** the UI moves easily, but the daemon needs a Node sidecar (about 36 MB more compressed, plus signing of that binary), which undercuts Tauri's size win, or a Rust rewrite. WebKit on macOS also changes rendering, and capture needs a separate path.
  - **PWA → anything:** UI reusable, but file access, watching and git logic must be rewritten behind a new interface.
  - **Hosted → local:** hardest, since assumptions about accounts and server storage spread through the product.
- The key to all of this is an internal interface boundary: `DocSource`, `Store`, `Renderer`, `Capture`. Those seams should be set from the first version. The UI should speak only HTTP/WS or an equivalent bridge, so its transport can be swapped for IPC.

### Gaps
- No audited memory benchmark for this workload. Measure with a real 300 KB doc.
- Windows Firewall behaviour for a process binding only to 127.0.0.1: I expect no prompt, but found no Microsoft source.
- Electron-builder costs and macOS universal build size were not measured.
- Bun or Node single-executable builds as an alternative to requiring Node: not researched.

## External work file server: WebDAV, S3, SFTP

### Takeaway
A local daemon or Electron main process handles all three with little effort, because it is unconstrained by CORS and can open sockets. A PWA gets S3 only if the bucket owner enables CORS and cannot speak SFTP at all. Plan on polling, not change notifications, on every protocol.

### Cited Findings
- **S3:** browser JS needs a bucket CORS rule that matches origin, method and headers. — [AWS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/cors.html)
- **SFTP in the browser:** raw TCP requires Direct Sockets, which is limited to Isolated Web Apps. — [Chrome docs](https://developer.chrome.com/docs/iwa/direct-sockets)
- **rclone** offers `serve webdav`, `serve s3`, `serve sftp`, `serve http` and more. — [rclone serve](https://rclone.org/commands/rclone_serve/). `rclone mount` needs WinFsp on Windows, and macFUSE, FUSE-T or NFS on macOS. Remote changes appear within `--poll-interval` (default 1m) only if the backend supports polling; otherwise after `--dir-cache-time` (default 5m). — [rclone mount](https://rclone.org/commands/rclone_mount/)
- **Windows over network:** `ReadDirectoryChangesW` fails with `ERROR_INVALID_FUNCTION` if the redirector or target file system does not support it, and with `ERROR_INVALID_PARAMETER` if the buffer exceeds 64 KB over the network. Listed as supported on SMB 3.0. — [Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-readdirectorychangesw)
- **Share notifications** should be treated as a hint, with snapshot polling as the reliable path; a macOS SMB/NFS mount in practice sees only local changes. **[secondary, single blog, no Apple source]** — [startdebugging](https://startdebugging.net/de/2026/10/filesystemwatcher-vs-polling-for-detecting-file-changes-on-a-network-share-in-dotnet/)

### Inferences

| Architecture | S3 | WebDAV | SFTP | Mapped/SMB drive | Added complexity |
|---|---|---|---|---|---|
| PWA | Needs bucket CORS | Needs server CORS; IT unlikely to agree | Impossible | Maybe, via picker (untested) | High, often blocked |
| CLI + server / Hybrid | SDK | Client lib | Client lib | Normal path | **Low** |
| Electron | Same as daemon | Same | Same | Same | **Low** |
| Tauri | Rust crates or sidecar | Same | Same | Same | Medium |
| Hosted + connector | Cloud cannot reach internal servers, so the connector does it all | Same | Same | Same | **Highest**, plus data leaves the machine |

- Define `DocSource { list, stat, read, changesSince? }` with ETag or mtime polling as the universal fallback. Local filesystem is one implementation with watch as an accelerator.
- Remote docs raise the trust level of the sandbox question. A work server may hold documents authored by others and contain confidential data, so deny-by-default networking matters more. That is the strongest argument for moving to Electron later.
- Credentials must live in the OS keychain, never in sidecars the agent reads.
- Read-only access to the server, with comments and snapshots kept locally, avoids write conflicts and IT objections.

### Gaps
- Actual protocols on the user's work server: unknown, and this decides priority order.
- Corporate restrictions on running rclone or FUSE drivers: unknown.

## Ranked recommendation for this context

### Takeaway
**Build option 5: one web UI on a thin Node daemon, shipped first as a CLI (`npx`/global), with the agent reading files through CLI and stdio MCP, and a desktop shell deferred.** Electron is the planned upgrade if triggers appear. Do not start with Tauri, PWA or hosted.

### Cited Findings
- Supporting facts are cited in the sections above: FSA is Chromium-only with an unknown observer limit ([MDN BCD](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Window.json), [Chrome blog](https://developer.chrome.com/blog/file-system-observer)); Direct Sockets is IWA-only ([Chrome docs](https://developer.chrome.com/docs/iwa/direct-sockets)); stdio MCP is outside the rebinding CVE ([advisory](https://github.com/modelcontextprotocol/typescript-sdk/security/advisories/GHSA-w48q-cv73-mx4w)); Playwright can drive system browsers ([docs](https://playwright.dev/docs/browsers)); Tauri lacks a portable capture API ([wry #1358](https://github.com/tauri-apps/wry/issues/1358)); Electron has network-level control ([webRequest](https://www.electronjs.org/docs/latest/api/web-request)); LNA leaves loopback-to-loopback unchecked ([Chrome guide](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access)).

### Inferences

**Ranking**

| Rank | Architecture | Why | Main weakness |
|---|---|---|---|
| 1 | **Hybrid (5): web UI + thin Node daemon, CLI first, shell optional** | Any browser, Windows and macOS, zero signing cost at launch, native git/gh/watch/capture, agent access without a running UI, easy path to Electron, easy remote sources | CSP-only containment in the browser; needs Node; localhost hardening is mandatory |
| 2 | **Plain CLI + server (2)** | Same first release as rank 1 | Without deliberate seams, later wrapping costs more. Effectively rank 1 minus discipline |
| 3 | **Electron (3)** | Strongest sandbox (network deny + navigation hooks), native capture, no TCP port, same language as the daemon | ~120–160 MB, $99 + OV yearly, packaging work before the product is validated |
| 4 | **Tauri (4)** | Small installer, Rust core | No portable capture, no general request filter, two webviews to test, two languages, Node daemon needs a sidecar |
| 5 | **PWA (1)** | No install, no localhost attack surface | Chromium only, no background, no CLI/MCP surface, no git/gh, no SFTP |
| 6 | **Hosted + connector (6)** | Only if collaboration appears | Pays the costs of both worlds; hits the LNA prompt; contradicts local-first |

**Concrete v1 shape**
- Files are the source of truth, in an app data dir: CAS for snapshots and screenshots, JSON sidecars for comments and doc metadata.
- `mytool` CLI and `mytool mcp` (stdio) read and write those files directly, with no daemon needed.
- `mytool open` starts an on-demand daemon on 127.0.0.1 with two origins: app shell/API (token-gated) and read-only content.
- Doc iframe: `sandbox="allow-scripts"`, CSP by header, plus `frame-src` on the shell. Bootstrap injected for overlay, storage shim and determinism.
- Capture through `playwright-core` with system Edge/Chrome, lazy-loaded.
- Watching through @parcel/watcher with reconcile scans.

**What would change the recommendation**
- **Move up to Electron if:** non-developers must install it without Node; docs arrive from untrusted people or the work server, so CSP-only containment is not enough; a test shows `frame-src` or CSP is leaky in the browser you actually use; or a one-click packaged app becomes a sales or adoption requirement.
- **Consider Tauri instead of Electron if:** the daemon is written in Rust from the start or rewritten, installer size is a hard requirement, **and** Wry's capture API has shipped or visual diff can run through a headless browser.
- **Consider PWA-first only if:** the scope shrinks to a Chromium-only read-only viewer of a few folders, the agent reads sidecars from disk, and there is no visual diff or PR binding.
- **Consider hosted if:** multi-user review, sharing links or a team workspace become the core need. That is a different product.
- **Re-check periodically:** Safari or Firefox shipping FSA (unlikely given WebKit's stance), Chrome extending LNA to loopback-to-loopback, `node:sqlite` going stable, and Wry PR #1674.

**Must-validate spikes before committing (each about half a day)**
1. Repeat the `frame-src` and CSP probes in Firefox and Safari.
2. Run the storage shim against the sample doc, which also calls `Math.random` 13 times, and confirm two captures are byte-identical.
3. Test `*.localhost` on the target macOS version.
4. Test the watcher across the real number of repos, with `git checkout` and `npm install` storms on Windows.

### Gaps
- No user research on who installs this. The ranking assumes the solo developer and similar Claude Code users.
- Effort estimates are judgement, not measured.
- Whether Claude Code users reliably have Node available should be checked, because it decides how urgent a packaged binary is.
