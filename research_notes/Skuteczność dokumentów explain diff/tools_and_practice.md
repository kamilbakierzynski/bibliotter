# Agent-generated explanations of code changes: tools and practice (2025-2026)

As of 2026-11-07. Star and fork counts were read from the GitHub API on that date. Star counts show attention, not quality, and I did not audit them.

Evidence tags used throughout:
- **[E]** existence or behaviour checked by reading the repo, skill file or product docs
- **[M]** measured, with a stated method
- **[V]** vendor or author self-report with numbers, not independently checked
- **[C]** claim with no data
- **[A]** user anecdote (gist comments, Hacker News)
- **[S]** seen only in a search-result summary, primary page not opened

Coverage limit: the WebSearch budget ran out partway through. Cursor BugBot, Copilot PR summaries, Cursor video demos, the file-order research and Storey's primary post could not be researched, and they are listed under Gaps. After that point I read only sources already found.

Text from source pages is paraphrased rather than quoted, including prompts, apart from one short line in the last section. The linked pages hold the exact wording.

---

## Where did the "explain diff" style of prompt come from, and who writes about it?

### Takeaway
Geoffrey Litt named and popularised it: his gist (created 2026-06-28) and AI Engineer talk (2026-07-02) fixed the recipe of background, intuition, code walkthrough, quiz. The parts existed earlier, though. Cline shipped `/explain-changes` in December 2025, Simon Willison published walkthroughs and interactive explanations in February 2026, and Thariq argued for HTML in May 2026. All the primary writing is experience report. None of it measures comprehension.

### Cited Findings

**Timeline**
- 2025-11-04: Windsurf Codemaps launches, framed as understanding code before vibing it — [Cognition](https://cognition.com/blog/codemaps) **[E]**
- 2025-11-13: Google Code Wiki announced — [Google](https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/) **[E]**
- 2025-12-02: Cline v3.39 ships Explain Changes and `/explain-changes`, seven months before Litt's gist — [Cline](https://cline.bot/blog/cline-v3-39-explain-changes) **[E]**
- 2026-01-21: Devin Review launches — [Cognition](https://cognition.com/blog/devin-review) **[E]**
- 2026-02: Willison's Agentic Engineering Patterns guide launches (2026-02-23 per search summary) with Linear Walkthroughs and Interactive Explanations chapters. The chapter page itself shows no date; a search summary gives 2026-02-28 — [Linear walkthroughs](https://simonwillison.net/guides/agentic-engineering-patterns/linear-walkthroughs/), [Interactive explanations](https://simonwillison.net/guides/agentic-engineering-patterns/interactive-explanations/) **[E]**
- 2026-02-07: Cat Hicks's learning-opportunities repo created — [repo](https://github.com/DrCatHicks/learning-opportunities) **[E]**
- 2026-05: Thariq Shihipar's HTML post. The Claude blog version is dated 2026-05-20, while Willison's link-blog entry is 2026-05-08 per a search summary, so the original came first — [Claude blog](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html) **[E]**
- 2026-06-28: Litt's gist created; revisions run to 2026-07-01 — [gist](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524) **[E]**
- 2026-07-02: Litt's talk and thread — [blog](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html), [thread](https://threadreaderapp.com/thread/2072522251300409556.html) **[E]**

**Litt: the gist** — [gist](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524) **[E]**
- Two variants: `explain-diff-html` and `explain-diff-notion`. 179 forks and 26 comments (several are spam).
- Four sections:
  - Background, with a deep skippable part for beginners and a narrow part for this change.
  - Intuition, using toy data and many figures.
  - Code, a high-level walkthrough with changes grouped and ordered for understanding.
  - Quiz, five medium-difficulty questions that are not gotchas.
- HTML rules:
  - One self-contained file on one long page, with a table of contents.
  - Tabs are explicitly rejected for top-level structure.
  - Date-prefixed filename outside the repo, so files sort by time and stay out of version control.
  - No ASCII diagrams.
  - Reuse a small number of diagram families, with example data in them.
  - Write with the clarity of Martin Kleppmann, in classic style.
  - A self-check that every code block preserves newlines, which reads like a fix for a real failure.
- The gist's quiz is interactive multiple choice with feedback. Some secondary write-ups say the gist runs a free-response quiz in chat. That is wrong: it comes from a fork in the comments (see the next section).

**Litt: the talk** — [blog](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html), [thread](https://threadreaderapp.com/thread/2072522251300409556.html)
- Main argument: understanding is needed to participate, not only to verify. As agents verify their own work better, the case shifts to contributing the next idea in a long loop. **[C]**
- Three techniques: explainer documents, micro-worlds and shared spaces.
- Literate diff: changes shown as ordered prose with embedded snippets rather than file by file. He says this is faster to review, with no number. **[C]**
- His workflow is to read the explainer first and the diff second. He sometimes prints explainers to read at a café. **[A]**
- Quiz rule: he will not send code to others, or finish reviewing others' code, until he can pass the quiz. He calls it a speed regulator on the agent loop. **[A]**
- Micro-worlds:
  - An agent-built Prolog visual debugger with stepping, time scrubbing and stack inspection.
  - A click-through command center for a website migration, with old and new sites side by side. He reports understanding similar to doing the port by hand, but faster. **[A]**
- Research he cites is on learning, not AI code comprehension: Matuschak and Nielsen, Papert, Kay, plus cognitive debt from Storey and Willison.
- He discloses he works at Notion and calls his position a hot take. He gives no quantitative data.

**Willison** — [Linear walkthroughs](https://simonwillison.net/guides/agentic-engineering-patterns/linear-walkthroughs/), [Interactive explanations](https://simonwillison.net/guides/agentic-engineering-patterns/interactive-explanations/)
- Cognitive debt: code you do not understand slows later planning, much as technical debt does. Simple code rarely needs attention; core logic does.
- Linear walkthrough recipe: read the source, plan a linear walkthrough, learn Showboat from `--help`, then build `walkthrough.md` using `showboat note` for commentary and `showboat exec` with sed, grep or cat for snippets.
- The key trick: make the agent pull snippets through shell commands instead of retyping them, which reduces hallucinated code in the document.
- Real use: he generated a walkthrough of a vibe-coded SwiftUI presentation app he had not read and reports learning SwiftUI structure from it. **[A]**
- Escalation example, a Rust word cloud: the text report did not build intuition, and a linear walkthrough clarified structure but not placement logic. An animated `animated-word-cloud.html` with speed slider, pause and frame stepping finally did. **[A]**
- The walkthrough document was handed to the agent as input for the animation.

**Thariq** — [Claude blog](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html), [examples repo](https://github.com/ThariqS/html-effectiveness)
- HTML wins on density, readability via tabs and layout, shareability, two-way interaction such as sliders and copy-as-prompt, and data ingestion. He says he rarely reads Markdown files over about 100 lines. **[A]**
- PR review prompt pattern: name what you do not understand (his example is streaming and backpressure), then ask for the rendered diff with margin annotations colour-coded by severity. The reader's gap steers the document.
- Understanding prompt pattern: one explainer page with a flow diagram, three or four annotated snippets and a gotchas section, optimised for reading once.
- Example file sections **[E]**:
  - `03-code-review-pr.html`: what this PR does, risk map, files, suggested next steps
  - `04-code-understanding.html`: request path, callstack walkthrough, key files, gotchas
  - `17-pr-writeup.html`: why, file by file, where to focus, test plan, rollout
- Admitted costs: more tokens than Markdown, file sprawl, and a personal maximalist view. Evidence is illustrative, with no benchmarks.
- A rebuttal, The Unreasonable Ineffectiveness of HTML by Kurtis Redux, exists but I did not read it — [beginnersinai](https://beginnersinai.org/?p=29554) **[S]**

**Related framing**
- Mitchell Hashimoto's whiteboard defense: you should be able to defend any customer-facing system you shipped. Prototypes are exempt. I saw this only through grip's page because the X post did not load — [grip](https://guilyx.github.io/grip/whiteboard-defense/)
- Ghostty's AI policy requires disclosure of AI use — [AI_POLICY.md](https://raw.githubusercontent.com/ghostty-org/ghostty/main/AI_POLICY.md) **[S]**

### Inferences
- Litt's contribution is the composition, not any single element. He joined teaching order with a pass/fail personal rule, and the skill was short enough to fork.
- His participation argument survives better agents. The verification argument weakens as agents check their own work.
- Nothing I read shows Litt built on Thariq, though the no-ASCII rule and single-file HTML are close. Treat them as parallel unless shown otherwise.
- Willison's escalation (report, then walkthrough, then animation) suggests depth should be on demand. A static explainer may not be the end state for hard algorithms.

### Gaps
- Margaret Storey's primary post on cognitive debt was not read. Willison's tag page names it as the best explanation of the term — [tag page](https://simonwillison.net/tags/cognitive-debt/)
- I found no controlled study of explain-diff itself.
- The exact date of Hashimoto's post is unverified.

---

## Which published skills or prompts do this today, and how do they differ?

### Takeaway
The field forked in five directions: teaching depth, output form, quiz enforcement, reading order and verification. The most instructive work is in the forks of Litt's gist, where real users found multiple-choice quizzes trivially gameable. Several of the most careful skills now treat the model as an author feeding a deterministic builder, not as the generator of the final HTML.

### Cited Findings

**Comparison (all [E] unless noted)**

| Skill | Stars / created | Output | Distinctive idea |
|---|---|---|---|
| [Litt explain-diff](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524) | 179 forks / 2026-06 | HTML or Notion | The base recipe |
| [malav2110/explain-diff-html](https://github.com/malav2110/explain-diff-html) | 20 / 2026-09 | One HTML page | Flow order, verified `file:line`, validated Mermaid, provenance line |
| [Chris-Graffagnino/explain-diff](https://github.com/Chris-Graffagnino/explain-diff) | 24 / 2026-07 | Text, optional `--html` | Three modes: summary, teach-me, expert |
| [krishhgg/pr-walkthrough](https://github.com/krishhgg/pr-walkthrough) | 0 / 2026-10 | Local HTML per PR | Every changed line has a note, enforced by the builder |
| [warpdotdev pr-walkthrough](https://github.com/warpdotdev/common-skills) | 656 (whole repo) | Static D3 site | Four canvas views, each with a guided tour |
| [YunSinLee/pr-tour](https://github.com/YunSinLee/pr-tour) | 3 / 2026-09 | Offline three-pane HTML | Execution-flow steps, real diffs, definition previews |
| [nicobailon/visual-explainer](https://github.com/nicobailon/visual-explainer) | 10,821 / 2026-02 | HTML or slides | `/diff-review`, `/fact-check`, in-page fix decisions |
| [plannotator/effective-html](https://github.com/plannotator/effective-html) | 4,035 / 2026-06 | HTML artifacts | Eight general skills, none diff-specific |
| [awesome-copilot code-tour](https://github.com/github/awesome-copilot) | n/a | `.tour` JSON | 20 personas plus a validator |
| [DrCatHicks/learning-opportunities](https://github.com/DrCatHicks/learning-opportunities) | 2,544 / 2026-02 | Chat exercises | Learning-science rules with hard stops |
| [guilyx/grip](https://github.com/guilyx/grip) | 232 / 2026-09 | Terminal or browser whiteboard | Pre-push gate with free-response grading |
| [egma-ai/jev-code-reviewer](https://github.com/egma-ai/jev-code-reviewer) | 149 / 2026-09 | Chrome extension | Only P0 shown by default, logic shown in place of code |
| [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) | 91,114 / 2026-03 | Knowledge-graph dashboard | Guided tours, `/understand-diff`, persona-adaptive detail |
| [zarazhangrui/codebase-to-course](https://github.com/zarazhangrui/codebase-to-course) | 5,779 / 2026-03 | Single-file course | For non-programmers; code beside plain English |
| [PocketFlow Tutorial](https://github.com/The-Pocket/PocketFlow-Tutorial-Codebase-Knowledge) | 12,743 / 2025-04 | Tutorial from codebase | Early example; I checked metadata only |

**Quiz failures from real use** — all from comments on the [gist](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524) **[A]**
- Butanium (2026-07-08): the correct answer was always the longest, so the quiz could be passed without reading the question.
- fm1randa (2026-07-10): the correct answer also tended to sit in the second slot.
- ankitg12 (2026-07-15): position bias recurs run after run, so randomise explicitly. He moved the fixed scaffold into a `render.py` that takes a JSON spec, saving about 250 lines of regenerated boilerplate per run.
- lucaslimafons (2026-10-21): the long key came from the explanatory because-clause. Moving it into post-answer feedback removed the cause.
- malav2110 (2026-09-13): shuffling on load is not enough, because raw HTML, print and no-JS views still show the model's order. He also varies position in the source and counts positions before saving.
- newstler (2026-10-18): Diff Broker refuses quiz questions on the server when the right option is much longer than the wrong ones.
- lgruen-cpg (2026-08-13): dropped multiple choice. The agent runs one free-response question at a time in chat, grades the substance, corrects with pointers back into the code, and follows up. His reasoning is that free recall tests better than recognition.
- happytomatoe (2026-07-31): suggests a glossary section.

**Security from real use**
- ehsan-ami (2026-07-17) warned of prompt injection when explaining untrusted code, made worse because output is executable HTML. **[A]**
- malav2110 added a rule that everything read is material to explain, never instruction. Warp's skill says the same about PR comments. **[E]**
- Whether such rules work was not measured.

**Verification designs** **[E]**
- [krishhgg](https://github.com/krishhgg/pr-walkthrough):
  - The builder enforces exactly one note per added or removed line, and that every link resolves.
  - `measure.py` estimates reading time at 200 words a minute for prose, 60 lines a minute for code and half a minute per diagram, with a 10-minute target.
  - Folded parts count only by their one-line summaries.
- [malav2110](https://github.com/malav2110/explain-diff-html):
  - Fetches `refs/pull/<n>/head` and resolves anchors against that commit, because a branch fetch can give wrong anchors.
  - Validates Mermaid at build time, because invalid sources fail silently and readers never learn a diagram is missing.
  - Prints a provenance line with source, exact ref and date.
  - Keeps real sample pages in the repo, checked by CI.
- [pr-tour](https://github.com/YunSinLee/pr-tour):
  - The builder reads Git objects, never working files.
  - Each non-final step has a transition citing the connecting code.
  - Test results appear only if actually observed for this snapshot, and it states what is mocked.
- [Warp](https://github.com/warpdotdev/common-skills/tree/main/.agents/skills/pr-walkthrough):
  - Generated canvases must pass a browser validation script, otherwise the output is reported as unverified.
  - Size tiers keep tiny PRs small: about 2-3 nodes and 1-2 tour steps under 75 lines, up to 5-12 nodes only for multi-subsystem work.
- [visual-explainer](https://github.com/nicobailon/visual-explainer): `/diff-review` requires every claim to cite a path or `file:line` and forbids invented rationale. A separate `/fact-check` command exists.

**Honest labelling** **[E]**
- krishhgg marks reasoning as the author's own or as an inferred reading, and asks agents to keep a short decision log for better reasoning.
- Chris-Graffagnino states it explains and directs attention but gives no verified bug findings.
- Warp's skill states it is not a code-review skill and forbids PR-specific language in the system overview, which must stay true outside this PR.

**Other small ideas** **[E]**
- [sukiravenclaw/bloom_skills](https://github.com/sukiravenclaw/bloom_skills): `debt-check` has you predict first, compare alternatives, retrieve, and check blind spots, with a shared JSONL ledger.
- [EmanuelVogt/skills](https://github.com/EmanuelVogt/skills): `debt` logs cognitive debt to a personal ledger and `crash-course` writes a study document from an entry.
- [adlternative/what-you-did](https://github.com/adlternative/what-you-did) emits explanations as JSON for other tools to render, per the gist comment. **[A]**
- Amp's walkthrough has a community clone that outputs clickable Mermaid HTML — [alexanderop/walkthrough](https://github.com/alexanderop/walkthrough) **[S]**

### Inferences
- The long-answer flaw has a structural cause: models naturally justify the correct option. Shuffling treats the symptom, while moving the justification to feedback treats the cause.
- Any answer key shipped in a static page can be read from source. Free response graded by an agent avoids that.
- Depth is not settled. Litt explains the essence, krishhgg annotates every line, and Jev hides most changes. These suit different readers, which argues for modes rather than one fixed depth.
- Layout is also not settled: Litt rejects tabs, Thariq likes tabs, Warp rejects slideshows and uses toggled canvases, and pr-tour uses three panes. No one has compared them.
- Community repos with few stars can still hold the best engineering. Adoption and rigour do not track each other here.

### Gaps
- No skill publishes before/after comprehension data. krishhgg ships `evals/evals.json`, which I did not read.
- I did not inspect Understand-Anything's or PocketFlow's internals. The former's star count looks unusually high for its age.
- Empty `gh search` results for several queries may reflect search limits rather than absence.

---

## What do products offer for PR understanding?

### Takeaway
Most products spend their effort on finding bugs. The explanation-specific features worth noting are Devin Review's grouped, explained hunks, Copilot's change groups and CodeRabbit's walkthrough comment. No vendor I read publishes a comprehension metric, and the best numbers, from Anthropic, measure review comments rather than understanding.

### Cited Findings

**Devin Review** — [docs](https://docs.devin.ai/work-with-devin/devin-review), [launch 2026-01-21](https://cognition.com/blog/devin-review), [release notes](https://docs.devin.ai/release-notes/2026.md) **[E]**
- Groups related edits rather than sorting alphabetically, with an explanation beside each group, opening with an overview of behaviour and impact.
- Copy and move detection shows moved code cleanly instead of as a full delete plus insert.
- Finding classes: bugs (Severe, Non-severe), flags (Investigate, Informational), security (Critical, Warning). The Informational flag explains behaviour or confirms correctness and asks for no action, which makes explanation a finding type.
- Ask Devin can start from any comment, bug or flag. Findings can be quoted into chat. Chat can propose edits that you apply as a commit.
- Viewed tracking, whitespace hiding, rendered Markdown diffs, and a stacked-PR view with layer-scoped diffs.
- Older commit-pinned links do not auto-update and offer Switch to latest.
- URL trick: replace `github.com` with `devinreview.com`.
- Recent additions: word-level highlights (Oct 16) and a file tree and Smart diffs (Sep 21). `npx devin-review` was retired on Sep 21.
- Source conflicts: the launch post says free in early release, with red, yellow and gray flags. Current docs bill ACUs and use the classes above. The blog says hunks are ordered, while the docs describe only grouping.
- Evidence: the launch names a Lazy LGTM problem but gives no data. **[C]**

**GitHub Copilot change groups** — [changelog 2025-10-28](https://github.blog/changelog/2025-10-28-grouping-changes-in-a-pull-request-with-copilot-in-public-preview) **[E]**
- Groups a PR into related edits such as refactors, config updates or test improvements, in the new Files changed experience.
- Public preview for Copilot Enterprise and Pro+ at announcement. Current status not confirmed.

**CodeRabbit** — [docs](https://docs.coderabbit.ai/guides/code-review-overview)
- A structured comment at the top of each PR with summary, sequence diagrams and review effort. **[E]**
- Sequence diagrams date from May 2024, and are controlled by `reviews.sequence_diagrams`. A `generate sequence diagram` chat command exists — [docs repo](https://github.com/coderabbitai/coderabbit-docs) **[S]**
- Layer-based walkthroughs organise changes in the order they were made rather than alphabetically. Seen via an aggregator; the original URL I tried returned 404 — [aggregator](https://www.plushcap.com/content/coderabbit/blog/coderabbit-a-major-walkthrough-upgrade-explainable-prs-and-smarter-reviewer-routing) **[S]**
- A claim of inline Mermaid diagrams for PRs over five interdependent files comes from one third-party post, unconfirmed — [DEV](https://dev.to/bean_bean/coderabbit-for-developers-5-features-that-actually-changed-43g1) **[S]**

**Greptile** — [changelog](https://www.greptile.com/changelog?format=markdown) **[E]**
- 2024-12-10: plain-language summary with whole-codebase context.
- 2026-02-11: Greploop repeats fixes until a 5/5 confidence score with no unresolved comments.
- 2026-05-12: learns from reactions, replies and commits.
- 2026-06-26: auto-approve only after a clean 5/5.
- 2026-09-16: summaries redesigned with confidence score and verdict on top, and findings sorted by severity.
- Per-PR sequence diagrams appeared in search results, but the [page](https://www.greptile.com/sequence-diagrams) returned 404 when opened. **[S]**

**Anthropic Code Review** — [launch 2026-03-09](https://claude.com/blog/code-review), [docs](https://code.claude.com/docs/en/code-review) **[E]**
- Pipeline: find, verify, rank, post. A review never approves or blocks, and it does not build or run code.
- This is bug finding, not explanation. The docs offer no walkthrough.
- `REVIEW.md` is read from the base or default branch, never from the PR's own changes, which closes one injection path.
- Numbers **[V]**, all internal:
  - PRs with substantive comments rose from 16% to 54%.
  - 84% of PRs over 1,000 lines had findings, averaging 7.5 issues.
  - 31% of PRs under 50 lines had findings, averaging 0.5.
  - Under 1% of findings were marked incorrect.
  - About 20 minutes per review, and $15-25 on average.
- The post reports no comprehension metric. The under-1% figure counts findings engineers marked wrong, and unmarked does not mean correct.

**Google Code Wiki** — [Google 2025-11-13](https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/) **[E]**
- Regenerates docs after each change, for public repos in preview.
- Sections and chat answers link to files, classes and functions.
- Architecture, class and sequence diagrams track the code.
- A Gemini CLI extension for private repos was waitlisted at launch.
- Onboarding claims such as first commit on day one have no data. **[C]**

**Windsurf Codemaps** — [Cognition 2025-11-04](https://cognition.com/blog/codemaps) **[E]**
- Prompt-driven, AI-annotated maps of nested code groups.
- Each item jumps to exact lines, and Cognition says they are more densely linked than chat answers.
- A trace guide explains why lines are grouped, and maps can be referenced in chat as `@{codemap}`.
- Statistics cited are general industry figures. Cognition says benchmarking is still to come.

**Cline Explain Changes** — [blog 2025-12-02](https://cline.bot/blog/cline-v3-39-explain-changes), [docs](https://docs.cline.bot/features/explain-changes) **[E]**
- Streams explanations as inline comments into a multi-file diff.
- It uses the task conversation, so it can explain reasoning as well as behaviour.
- Each comment has a reply box, and complex threads move to main chat.
- VS Code only, and the button needs Checkpoints. No measurements of the feature.

**Amp Shareable Walkthroughs** — [Amp](https://ampcode.com/news/walkthrough), [community account](https://alexop.dev/posts/building-walkthrough-skill-claude-code/)
- Annotated interactive diagrams where each node holds context.
- Removed in an update dated 2026-04-22. The stated reason is that models became good enough at walkthroughs to need no product nudging. The page returned 404 when I opened it, so this rests on search text. **[S]**

**Graphite and Cursor** — [Yahoo Finance](https://finance.yahoo.com/news/cursor-continues-acquisition-spree-graphite-215122810.html) **[S]**
- Cursor announced the acquisition of Graphite in December 2025, with plans to merge Graphite's AI reviewer and BugBot. I found no feature-level detail.

**Devin Wiki / DeepWiki**
- Release notes confirm it exists with source citations — [notes](https://docs.devin.ai/release-notes/2026.md). Codemaps builds on it — [Cognition](https://cognition.com/blog/codemaps) **[E]**

### Inferences
- Grouping by logical change is now common: Devin, Copilot, Stage, Crit, Diff Broker and DiffLoupe all do it. Review order is becoming standard rather than a differentiator.
- Amp's removal suggests bare walkthrough generation is commoditised. Durable value probably sits in the reading surface and in verification.
- Confidence scores are a verdict, the opposite of building understanding. They may invite the rubber-stamping critics worry about.
- Greptile's Greploop and auto-approve show the industry also moving toward removing humans, which sharpens Litt's question about what humans are for.

### Gaps
- Cursor BugBot was not researched. Search ran out before I could.
- Copilot PR summaries beyond change groups were not researched.
- Graphite's review interface details were not researched.
- Current state of Code Wiki's private-repo extension is unknown.
- I read only part of the Devin release notes, roughly Sep-Oct 2026. A note on hunk ordering may exist in the rest.

---

## What guided-tour formats link explanation to exact lines?

### Takeaway
Microsoft's CodeTour extension looks dormant, but its `.tour` JSON format has gained a second life as an agent output. The new generation keeps the idea of ordered steps tied to lines, and adds revalidation when code moves.

### Cited Findings
- [microsoft/codetour](https://github.com/microsoft/codetour): 4,600 stars. Latest release v0.0.59 on 2023-03-24, and the latest default-branch commit I saw is 2025-08-07. **[E]**
- [awesome-copilot code-tour](https://github.com/github/awesome-copilot/blob/main/skills/code-tour/SKILL.md) **[E]**:
  - 20 personas, including new joiner, PR reviewer, security reviewer and vibecoder.
  - Step types: file and line, selection, pattern, uri, commands and view.
  - Tour fields `ref`, `isPrimary` and `nextTour`.
  - `validate_tour.py` checks that paths exist, lines are in bounds, patterns match, cross-references work, and the narrative arc holds.
  - `pattern` steps anchor by regex rather than line number, which should survive edits better.
- Agent-era tour tools:
  - [alirezarezvani/claude-skills](https://www.skills.sh/alirezarezvani/claude-skills/code-tour) has a code-tour skill. **[E]**
  - [krshrimali/codetours.nvim](https://github.com/krshrimali/codetours.nvim) asks any AI CLI to write the JSON file itself with its own edit tools, so nothing depends on parsing chat output. **[E]**
  - [jillesme/tourminal](https://github.com/jillesme/tourminal) follows tours from the terminal. **[E]**
- [Intraview](https://news.ycombinator.com/item?id=45837067), about November 2025:
  - The agent builds tours stored as flat JSON and reads batched inline feedback over a local MCP server.
  - When a tour reopens, the agent revalidates it and rebuilds if line ranges or text shifted.
  - One commenter could only get MCP working with Claude. Another doubted that generated docs replace good guides. **[A]**
- [pr-tour](https://github.com/YunSinLee/pr-tour) is the richest PR version: reading order, explanation with clickable line references and the diff in three panes. Its Starlette demo turns five changed files into eight steps and thirteen definition previews. **[E]**
- [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) orders guided tours by dependency. **[E]**
- [krishhgg](https://github.com/krishhgg/pr-walkthrough) places files beside the text in an editor-style pane, and clicking text opens the lines discussed. **[E]**

### Inferences
- A tour step is roughly anchor, prose and transition. pr-tour's explicit transitions are the part most tools omit, and they are what make a sequence a narrative.
- Regex or symbol anchors plus revalidation handle staleness better than line numbers. Pinned commits solve the same problem by freezing the target instead.
- The `.tour` format is a cheap interoperability option because agents already write it.

### Gaps
- I found no usage data on how often generated tours are actually followed.
- No study compares tours with prose explainers.

---

## Which review interfaces rethink the diff?

### Takeaway
Three ideas recur: reorder into chapters, change the unit from lines to entities, and hide what does not need attention. Evidence is thin, and HN critics make a strong point that chapters show what changed but not why, and that AI narrative can persuade rather than inform.

### Cited Findings

**Chapters and order**
- [Stage](https://news.ycombinator.com/item?id=47796818), about April 2026, 130 points and 111 comments:
  - Groups a PR into small ordered chapters, each with what changed and things to double-check.
  - Regenerates on each commit and syncs with GitHub.
  - Founders report early users adopted chapters as the review unit and asked for chapter-level viewed marks and comments. **[A]**
  - Criticisms **[A]**: no why or intent, AI narrative reads as promotional and can mislead, reviewers may check only flagged parts, and good commits already solve this.
  - One commenter liked the auto split because many PRs should really be five.
- [Stage CLI](https://github.com/ReviewStage/stage-cli), MIT, 277 stars. The local agent writes the chapters. Run in the same session it has the plan context; in a fresh session it does not — [HN](https://news.ycombinator.com/item?id=48050732) **[E/A]**
- [Crit story mode](https://github.com/tomasz-tomczyk/crit): thematic chapters, a prologue and a support bucket for noise. It describes itself as an explainer rather than a reviewer. Crit reports about $1-1.40 for complex PRs of 20-50 files with Opus 5. **[V]**
- [DiffLoupe](https://github.com/markerikson/diffloupe) **[E]**:
  - Groups files deterministically from code links: names defined and used across files, tests with sources, imports, shared directories.
  - A walkthrough pass adds chapters, stops and a start-here list.
  - It checks the change against stated intent.
  - Issues in code the change did not touch are tagged pre-existing and capped at three.
- [Diff Broker](https://www.diff.broker) **[E]**: prose chapters each followed by the real hunk, with mechanical edits set aside.
- [Critic](https://news.ycombinator.com/item?id=49834098), about late September 2026:
  - A plugin hooks the agent's turn and blocks it from ending until a narrative passes word-count and format checks.
  - Evidence such as screenshots is attached.
  - One commenter objected that those checks test shape, not truth. **[A]**

**Attention filtering**
- [Jev](https://github.com/egma-ai/jev-code-reviewer) **[E]**:
  - Classifies changes P0, P1, P2, and P1 and P2 start collapsed.
  - Natural-language logic replaces the code, with the original one toggle away.
  - Stale reports are never shown.
  - By default only the first 12 change units are analysed, so coverage is partial.

**Entity-level and semantic diff**
- [difftastic](https://github.com/Wilfred/difftastic): structural diff, 26,158 stars, active. **[E]**
- [Ataraxy-Labs/sem](https://github.com/Ataraxy-Labs/sem): entity-level diffs, blame and impact analysis across 28 languages via tree-sitter, with MCP. 3,442 stars. **[E]**
- Devin's copy and move detection and word-level highlights are the product equivalent. **[E]**

**Local review surfaces**
- [Hunk](https://github.com/modem-dev/hunk): terminal diff viewer with inline agent notes that start hidden and appear on a keypress. Built on Pierre diffs. 9,784 stars. **[E]**
- [difit](https://github.com/yoshiko-pg/difit): local GitHub-style diff view, 3,317 stars. **[E]**

**Stacked PRs**
- [github/gh-stack](https://github.com/github/gh-stack) is official, with 1,751 stars. Public preview from 2026-07-30 per a secondary source. **[E/S]**
- Sources disagree on required `gh` version: the README says v2.0+, while a secondary source says 2.90.0. I trust the README for the extension itself.
- krishhgg and Devin both handle stacks, separating a PR's own commits from its parent's. **[E]**

**Behaviour demos and evidence**
- [Showboat](https://github.com/simonw/showboat): executable demo documents mixing notes, code and captured output. `showboat verify` re-runs and diffs all code blocks, and `showboat image` embeds screenshots. 1,246 stars. **[E]**
- [Rodney](https://github.com/simonw/rodney): Chrome automation CLI from the same author, driving a persistent headless Chrome. **[E]**
- [visual-explainer `/diff-review`](https://github.com/nicobailon/visual-explainer): before/after of the same SVG with edges highlighted, and changed state machines replayed step by step. A `generate-video` command also exists. **[E]**
- [Warp](https://github.com/warpdotdev/common-skills) harvests screenshots, mocks and Figma frames from the PR into the walkthrough. **[E]**
- [Crit](https://github.com/tomasz-tomczyk/crit) reviews running apps through comments on CSS selectors. **[E]**

### Inferences
- The why is the hard part. Tools that run inside the authoring session (Cline, Stage CLI, Critic) can see it, while post-hoc tools must infer it.
- `showboat verify` is the strongest idea here because it turns a narrative claim into something re-runnable. A generated explainer could embed checks the same way.
- Deterministic grouping as DiffLoupe does it needs no model, which keeps cost down and makes results reproducible.
- Hiding parts of a diff creates the risk critics name: an error of classification removes code from view.

### Gaps
- I did not verify Cursor's video demos or any recorded-test-run product.
- Whether review order changes defect finding needs a primary source. I recall a study titled First Come First Served on file position in code review, by Fregnan and colleagues, but this is from memory and unverified.
- No evidence yet that chapters improve review outcomes beyond founder anecdotes.

---

## What do learning modes and comprehension gates look like?

### Takeaway
Comprehension gating exists as personal rules and small tools, not as established team practice. grip is the most developed, and it openly states that its effect is unmeasured. Cat Hicks's skill has the best-reasoned design, resting on learning science rather than on tests of the skill itself.

### Cited Findings

**Claude Code output styles** — [docs](https://code.claude.com/docs/en/output-styles) **[E]**
- Built-ins now include Proactive, Concise, Explanatory and Learning.
- Explanatory adds two or three point Insight blocks in the conversation, not in files.
- Learning adds those and leaves small real design decisions for you, marked `TODO(human)`, then stops and waits. It responds with an Insight on what you wrote.
- The docs state styles are instructions, not guarantees. Anything that must always happen belongs in a hook.
- Plugins can ship output styles in `output-styles/`, and `force-for-plugin` applies one automatically, overriding the user's setting.

**learning-opportunities** — [repo](https://github.com/DrCatHicks/learning-opportunities) **[E]**
- Offers an optional 10-15 minute exercise after new files, schema changes, refactors or unfamiliar patterns.
- Always asks first. It stops after a decline and after two exercises per session.
- Core rule: end the message immediately after the question, with no hints, sample answers or further teaching. The commitment is treated as part of the learning.
- Never credit the user with an insight they did not express. If they described what happens but not why, acknowledge only the what.
- Techniques: prediction, generation, retrieval practice, spaced repetition.
- Add-ons: `learning-opportunities-auto`, a post-commit hook, and `orient`, a repo orientation generator that can use Showboat and has a bibliography.
- malav2110 borrowed its rule that difficulty belongs in the stem rather than in near-identical options — [README](https://github.com/malav2110/explain-diff-html)

**grip** — [repo](https://github.com/guilyx/grip), [honest numbers](https://guilyx.github.io/grip/honest-numbers/) **[E]**
- Pre-push hook asking five questions from the diff: how it works, why this approach, where it fails, what could go wrong, how you know.
- Graded against a hidden rubric, with a default pass mark of 70 out of 100.
- `grip whiteboard` draws the change as parts and arrows with questions pinned to it, including what a malicious actor could do.
- Passed diffs are remembered, retries reuse questions, `grip skip` bypasses, and CI is skipped.
- Its own numbers page says no real-model data is committed, the pass mark is uncalibrated, gaming by agents is an honour system, and whether passing predicts fewer reverts or better recall is unmeasured. The offline fake grader passes any long answer.
- This is unusually candid and worth copying as a practice.

**Commit Comprehension Gate** — [post](https://dev.to/islandbytes/i-built-a-merge-gate-that-quizzes-developers-on-their-own-code-changes-heres-why-and-how-5460), [repo](https://github.com/islandbytesio/commit_comprehension_gate) **[E/V]**
- GitHub Action posting three multiple-choice questions, regenerated after each commit. All three correct unlocks merge via a required check.
- Only the PR author can pass, with unlimited retries.
- The answer key sits base64-encoded in a hidden comment on the PR.
- About $0.05-0.10 per PR. The post reports no usage results. It is dated April 9 with no year shown.

**Diff Broker** — [site](https://www.diff.broker) **[E]**
- Scores on first try with an 80% pass mark. The card shows whether you understood the current version.
- When the PR changes, the quiz asks only about what changed.
- A separate verifier pass checks that every claim is supported and every hunk covered.

**Explyt recommendations** — [post 2026-10-15](https://explyt.ai/en/blog/comprehension-debt-quiz-gate), vendor content
- Author explains intent, invariant, callers, failure path and scope without reopening the transcript.
- Treat a wrong answer as a reason to investigate, not an automatic failure.
- Scale by risk: skip formatting and docs, and raise rigour for security, data, concurrency and public APIs.
- Pilot for two weeks and keep it only if it surfaces real uncertainty. **[C]**
- It cites AIRELI, an ICPC 2026 study with 21 participants that identified an AI-steered pattern with fast first-task finish but shallow comprehension and later struggle. Explyt calls it exploratory. I could not open the [paper](https://doi.org/10.1145/3794763.3794804) (403), so this is second-hand.

**Tooling research**
- [Comprendia](https://arxiv.org/abs/2608.10290), ICSME 2026 tool demo: Eclipse dependency graph with LLM explanations tied to visible nodes. The abstract reports no user-study results. **[E]**

### Inferences
- Author gates and reviewer gates differ. Litt applies his rule to both, while grip and the Action gate only authors.
- Reviewer-side comprehension may be the more valuable and less served case.
- Unlimited multiple-choice retries with a readable key mainly demonstrate the ritual. They measure persistence at best.
- A soft signal, such as understood-this-version, fits a personal tool better than a blocking gate, given that no pass mark has been calibrated.
- A gate's questions are themselves generated, so they share the agent's blind spots. Nobody has addressed this.

### Gaps
- I found no primary account of a team using explaining-back-to-an-agent as a standing merge step. Search summaries found no evidence of mainstream adoption.
- No measured data on whether quiz gates reduce reverts or incidents.
- AIRELI not read directly.
- Learning modes in Codex, Cursor and Gemini were not researched.

---

## Which formats work for artifacts that reference live code?

### Takeaway
The working pattern is pinned-commit links, real diffs rendered by a library or builder rather than typed by the model, build-time validated diagrams, and everything inlined where possible. Several popular skills still load libraries from a CDN, which breaks offline use and is worth avoiding in a sandboxed viewer.

### Cited Findings

**Linking to code**
- [Warp's skill](https://github.com/warpdotdev/common-skills/tree/main/.agents/skills/pr-walkthrough) documents the scheme: PR URL plus `/files#diff-`, the lowercase hex SHA-256 of the file path, then `R<new line>` or `L<old line>`. It says to generate anchors with a helper, never by hand. **[E]**
- [malav2110](https://github.com/malav2110/explain-diff-html) resolves all anchors against one commit and prints that SHA in the provenance line. **[E]**
- [pr-tour](https://github.com/YunSinLee/pr-tour) uses pinned head and merge-base commits, and treats GitHub links as optional exits. **[E]**
- Devin's commit-pinned links show the trade-off: stable but stale, so a Switch to latest control is needed — [docs](https://docs.devin.ai/work-with-devin/devin-review) **[E]**

**Embedding diffs and highlighting**
- [`@pierre/diffs`](https://github.com/pierrecomputer/pierre/tree/main/packages/diffs), v1.6.4, Apache-2.0 **[E]**:
  - Diff and file rendering on Shiki, as vanilla JS and React.
  - Split or stacked layouts, an annotation framework, accept/reject UI, line selection.
  - The closest match to margin notes on a diff. npm unpacked size 11.5 MB.
- [diff2html](https://github.com/rtfpessoa/diff2html), v3.4.56, 3,431 stars: older and simple. The UI bundle is about 259 KB over the wire. **[E]**
- [Shiki](https://github.com/shikijs/shiki), v4.6.0 and [highlight.js](https://www.npmjs.com/package/highlight.js), v11.12.0. The highlight.js CDN bundle is about 38 KB over the wire. **[E]**
- pr-tour bundles offline highlighting and warns that syntax colours do not imply symbol resolution. **[E]**

**Diagrams**
- [Mermaid](https://github.com/mermaid-js/mermaid): latest npm 12.3.0, while `mermaid@11` min is about 745 KB over the wire. **[E]**
- malav2110 reports silent failure of invalid sources and validates at build time. It also limits Mermaid to a few structural shapes, loading it from a CDN only when one is present. **[E]**
- [D2](https://github.com/d2lang/d2), 25,802 stars, MPL-2.0. `@terrastruct/d2` npm unpacked is 59.8 MB, so rendering to static SVG at generation time looks more practical than shipping it in the page. **[E]**
- [D3](https://github.com/d3/d3): about 92 KB over the wire, loaded from a pinned CDN URL by Warp. **[E]**
- Litt asks for simple HTML diagrams and reused families. visual-explainer uses inline SVG with custom elements such as `<ve-stack>` and `<ve-bars>`. **[E]**

Sizes above are compressed transfer sizes I measured from jsDelivr on 2026-11-07, except where npm unpacked size is stated. They are rough guides, not bundle budgets.

**Scrollytelling and code stepping**
- [Scrollama](https://github.com/russellsamora/scrollama): 6,013 stars, last pushed 2025-11. **[E]**
- [Code Hike](https://github.com/code-hike/codehike): 5,396 stars, React and Markdown, last pushed 2026-03. **[E]**
- [shiki-magic-move](https://github.com/shikijs/shiki-magic-move): archived on GitHub. Avoid building on it. **[E]**
- [codebase-to-course](https://github.com/zarazhangrui/codebase-to-course): scroll modules with progress tracking, and code beside plain English. **[E]**
- Warp explicitly rejects the slideshow format, and Litt rejects tabs in favour of one long page. **[E]**

**Self-containment**
- pr-tour keeps all code, styles, scripts and definitions in the final HTML. **[E]**
- Warp requires `file://` loading and no `fetch()`, yet still loads D3 from a CDN, with a pinned version. **[E]**
- malav2110 loads Mermaid from a CDN at read time. **[E]**
- Litt prints explainers, and malav2110 notes print and no-JS views matter. **[A/E]**

### Inferences
- A builder that writes the diff from Git objects removes a whole class of hallucination, which matters more than the choice of renderer.
- For a local viewer, pre-rendering highlighted code and SVG at generation time gives the smallest and most robust file. Runtime Mermaid is the main exception to weigh, and it costs about 745 KB compressed.
- Line-number anchors go stale on any push. A pinned SHA plus a stale indicator in the viewer is the honest approach.

### Gaps
- I did not measure uncompressed sizes, or the real size of a minimal Shiki bundle. My CDN probe hit a stub file.
- I found no evidence on whether scrollytelling aids code comprehension.
- No comparison between diff libraries on large PRs. Stage CLI users did report slowness on very large commits, suggesting virtualisation matters — [HN](https://news.ycombinator.com/item?id=48050732) **[A]**

---

## What adds Q&A inside a document?

### Takeaway
True reply-in-place is rare. Cline gets closest for diffs, with a reply box on each inline explanation. For documents, Artifact Server has threaded MCP replies. Most other tools queue feedback for the agent or answer in a side panel. A viewer with anchored threads and an MCP reply tool sits in a well-defined and lightly occupied spot.

### Cited Findings

| Tool | How you ask | Where the answer lands | Source |
|---|---|---|---|
| Cline | Reply box on an inline comment | Same thread, promotable to main chat | [blog](https://cline.bot/blog/cline-v3-39-explain-changes) **[E]** |
| Artifact Server | Anchored comment | Threaded reply via MCP `comment_reply` | [repo](https://github.com/plannotator/artifact-server), [prior notes](../Narzędzia%20do%20dokumentów%20HTML%20agentów/bezposrednia_konkurencja.md) **[E]** |
| tdoc | Comment on a sentence, image or chart | Batch: `/tdoc edit` makes a new version and replies to each | [repo](https://github.com/tornado-doc/tdoc) **[E]** |
| Lavish | Annotate an element or text, or send a message | Agent long-polls `lavish-axi poll`, then answers with `reply` | [repo](https://github.com/kunchenguid/lavish-axi) **[E]** |
| Plannotator | Annotate, then Send Feedback; built-in AI questions in code review | Structured feedback to the session | [repo](https://github.com/backnotprop/plannotator) **[E]** |
| Crit | Click a line and comment | Agent acts on feedback in rounds | [repo](https://github.com/tomasz-tomczyk/crit) **[E]** |
| Diff Broker | Select a line, comment or paragraph | Chat tab; agent receives quote and source location | [site](https://www.diff.broker) **[E]** |
| Devin Review | Ask Devin from any item | Chat, with proposed edits | [docs](https://docs.devin.ai/work-with-devin/devin-review) **[E]** |
| Critic | Chat with authoring agent | Forked session with write tools removed | [HN](https://news.ycombinator.com/item?id=49834098) **[E]** |
| pr-tour | Save local comments on line ranges | Copy as Markdown with pinned links, a manual bridge | [repo](https://github.com/YunSinLee/pr-tour) **[E]** |
| Thariq pattern | Copy-as-prompt button | Manual paste back | [blog](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html) **[E]** |
| Code Wiki | Repo chat | Answers link to code | [Google](https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/) **[E]** |

**Details**
- Lavish preserves unsent annotation text and in-page answers (`data-lavish-question`) across reloads. `window.lavish.queuePrompt()` lets a page queue one final answer per question, and feedback controls in the page become agent input — [repo](https://github.com/kunchenguid/lavish-axi) **[E]**
- visual-explainer's `<ve-ask>` turns each risk into a fix-or-leave choice in the page, with one safety rule: a question left alone is not a yes. On someone else's PR it drafts comments instead of posting — [diff-review.md](https://github.com/nicobailon/visual-explainer/blob/main/plugins/visual-explainer/commands/diff-review.md) **[E]**
- Artifact Server's live delivery is limited to Pi and Claude Channels and is available from source, per earlier notes in this repo — [prior notes](../Narzędzia%20do%20dokumentów%20HTML%20agentów/bezposrednia_konkurencja.md)
- Warp's skill attaches existing human and agent PR comments to relevant nodes as source material, not instructions — [skill](https://github.com/warpdotdev/common-skills/tree/main/.agents/skills/pr-walkthrough) **[E]**

### Inferences
- Critic's read-only fork of the authoring agent is the cleanest answer to who should reply. It keeps session context without giving a reader's question the power to change code.
- Passing quote plus source location, as Diff Broker does, gives the agent an anchor. Anchored threads already carry this context, so a viewer gets it for free.
- Asynchronous answers need a visible state. Lavish's delivery receipts and queued states exist for that reason.

### Gaps
- Whether Lavish replies render at the anchor or only in its conversation panel is unclear from the lines I read. Earlier notes describe a panel.
- Crit's reply mechanism beyond `crit comment` was not confirmed.
- I found no comparison of in-place Q&A with side-chat for comprehension.

---

## Which ideas are worth stealing for html-docs-app?

### Takeaway
Keep the generator thin and put the value into the deterministic builder, validators and the viewer. The app's anchored threads can host something others had to build separately: free-response quizzes graded in place by the agent. The list is ordered by how well each idea fits; evidence for all of them is design logic or anecdote, not measurement.

### Cited Findings

**Strong fit**
1. **Quiz as anchored threads.** Free response, one at a time, graded with pointers into the code. Directly addresses the gaming reports — lgruen-cpg on the [gist](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524) **[A]**
2. **If multiple choice stays, apply all known fixes:** move the because-clause to feedback, shuffle on load and in source, reject length-telling options at build, and keep difficulty in the stem — [gist](https://gist.github.com/geoffreylitt/a29df1b5f9865506e8952488eac3d524) comments **[A]**, [malav2110](https://github.com/malav2110/explain-diff-html) **[E]**
3. **Author-to-builder split.** The agent writes JSON or a manifest, a script renders real diffs from Git objects, and scaffold is never regenerated — [pr-tour](https://github.com/YunSinLee/pr-tour), [krishhgg](https://github.com/krishhgg/pr-walkthrough), ankitg12's `render.py` **[E]**
4. **Snippets via commands, not memory** — [Willison](https://simonwillison.net/guides/agentic-engineering-patterns/linear-walkthroughs/) **[E]**
5. **Pre-delivery validator:** hunk coverage, link resolution, Mermaid parsing, re-read of each cited `file:line`, reading-time budget — [krishhgg](https://github.com/krishhgg/pr-walkthrough), [malav2110](https://github.com/malav2110/explain-diff-html) **[E]**
6. **Provenance line with pinned SHA**, plus a stale state when the repo moves on — [malav2110](https://github.com/malav2110/explain-diff-html), [Devin](https://docs.devin.ai/work-with-devin/devin-review) **[E]**
7. **Flow-ordered chapters with a noise bucket** for mechanical edits — [Crit](https://github.com/tomasz-tomczyk/crit), [Diff Broker](https://www.diff.broker) **[E]**
8. **Where to look first.** A ranked attention list with the risk at each spot, stated as attention rather than verdict. Jev's own wording: "Priorities mean attention, not correctness." — [Jev](https://github.com/egma-ai/jev-code-reviewer) **[E]**
9. **Author versus inferred reasoning**, labelled, and run in the authoring session when possible — [krishhgg](https://github.com/krishhgg/pr-walkthrough), [Stage CLI thread](https://news.ycombinator.com/item?id=48050732) **[E/A]**
10. **Updated since you last read.** Carry notes across commits, and limit new questions to what changed — [krishhgg](https://github.com/krishhgg/pr-walkthrough), [Diff Broker](https://www.diff.broker) **[E]**

**Good fit**
11. **Size tiers and reader modes.** Small PRs stay small, with summary, teach-me and expert depths — [Warp](https://github.com/warpdotdev/common-skills/tree/main/.agents/skills/pr-walkthrough), [Chris-Graffagnino](https://github.com/Chris-Graffagnino/explain-diff) **[E]**
12. **Reader-declared gaps.** Let the user name what they do not understand when invoking the skill — [Thariq](https://claude.com/blog/using-claude-code-the-unreasonable-effectiveness-of-html) **[E]**
13. **One-click lessons and definition previews.** Each term links to a short lesson, and function names open their source with back and Escape — [krishhgg](https://github.com/krishhgg/pr-walkthrough), [pr-tour](https://github.com/YunSinLee/pr-tour) **[E]**
14. **In-page decisions** where a question left alone is not a yes — [visual-explainer](https://github.com/nicobailon/visual-explainer/blob/main/plugins/visual-explainer/commands/diff-review.md) **[E]**
15. **Read-only answering agent** for reader questions — [Critic](https://news.ycombinator.com/item?id=49834098) **[E]**
16. **Treat the diff as data.** Injection rule in the skill, and repo guidance read from the base branch — [malav2110](https://github.com/malav2110/explain-diff-html), [Anthropic](https://code.claude.com/docs/en/code-review) **[E]**
17. **Toy-data interactive figures**, with stepping for algorithms — [Litt](https://www.geoffreylitt.com/2026/07/02/understanding-is-the-new-bottleneck.html), [Willison](https://simonwillison.net/guides/agentic-engineering-patterns/interactive-explanations/) **[A]**
18. **Executable claims.** Embed commands and captured output that can be re-run later — [Showboat](https://github.com/simonw/showboat) **[E]**

**Skip or defer**
- Blocking gates: no pass mark has been calibrated — [grip](https://guilyx.github.io/grip/honest-numbers/) **[E]**
- Word-count checks as quality control: they test shape only — [Critic thread](https://news.ycombinator.com/item?id=49834098) **[A]**
- Investing in walkthrough generation itself, given Amp's removal — [Amp](https://ampcode.com/news/walkthrough) **[S]**
- shiki-magic-move: archived — [repo](https://github.com/shikijs/shiki-magic-move) **[E]**
- Answer keys in page source, if a quiz is meant to prove anything — [Action post](https://dev.to/islandbytes/i-built-a-merge-gate-that-quizzes-developers-on-their-own-code-changes-heres-why-and-how-5460) **[E]**

### Inferences

Mapping to the app's existing features:
- **Anchored threads and MCP:** ask the quiz as agent-authored threads on the passage each question tests, answer in the thread, and let the agent grade with `reply_comment`. The answer key never needs to ship in the page, which removes the view-source problem. A thread-based quiz also leaves a record of what was misunderstood.
- **Split view and peek:** explanation on one side, code on the other, with click-to-open lines. Peek suits definitions and lessons. This matches pr-tour and krishhgg with no new interaction model.
- **Presenter pointer:** a step manifest with anchors and transitions could drive a tour. Exporting the steps as `.tour` is a low-cost compatibility option.
- **Library and full-text search:** past explainers become a searchable record of why changes happened. Litt's dated filenames already serve this. A library badge such as understood this version gives Diff Broker's signal without a blocking gate.
- **Sticky notes and highlighter:** a natural place for a personal cognitive-debt list of things not yet understood, as in the ledger skills. Speculative.
- **Plugin:** it could ship an output style, but `force-for-plugin` overrides user settings, so an opt-in is safer. A style cannot guarantee anything, so any must-run step needs a hook.

Decisions the user needs to make:
- Long page or panes. Litt's long page prints and reads well, while pr-tour's panes suit reviewing against code. A long page with a split-view option could serve both.
- Whether the skill runs in the authoring session by default. That gives better why at the cost of tying it to the session.
- Sandboxing. Generated HTML explaining untrusted code is executable output from untrusted input, so the viewer's sandbox matters more for this document type than for most.
- Spaced review of old quiz questions is a natural extension that no tool I found ties to explainers. It is untested here.

### Gaps
- All ranking here is my judgment. No idea on this list has controlled evidence, and the effectiveness literature is outside these notes.
- I did not test any of these skills on a real diff, so output quality is unverified. Generating two or three of them on one html-docs-app diff would be a cheap next step.
