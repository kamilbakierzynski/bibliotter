# Work folder format for a plan

The build script is the same as for explain-diff. `"kind": "plan"` switches it to a plan:

```
plan-<slug>/
  doc.json        metadata, sources, figures, steps, decisions, risks, sketches
  essay.html      the chapters
  plan.md         the Markdown plan, when it does not live anywhere else
  runs/*.txt      saved outputs of your experiments
  harness.cjs     the experiment script, any name and language
  sketches/*.ts   short sketches of new code
  style.css       optional, styles for your own figures
```

Build with `node <kit>/build.cjs <folder>`. Flags: `--check` validates without writing, `--out <file.html>` overrides the path, `--repo <path>` sets the repository when `doc.json` has no `repo`, `--no-exclude` leaves `.git/info/exclude` alone.

## doc.json

```json
{
  "kind": "plan",
  "lang": "pl",
  "repo": "C:/path/to/repo",
  "base": { "rev": "HEAD" },
  "plan": "C:/Users/me/.claude/plans/heading-jump.md",
  "slug": "skok-do-naglowka",
  "title": "Skok do nagłówka z palety",
  "subtitle": "Jak paleta nauczy się rozdziałów",
  "writtenBy": "Claude Opus 5.5",
  "abstract": ["What is missing today.", "The approach in one sentence and what the reader decides."],
  "sources": {},
  "figures": {},
  "steps": [],
  "decisions": {},
  "risks": [],
  "sketches": {},
  "listings": {},
  "annex": [{ "title": "Experiment script", "file": "harness.cjs", "note": "How to run it and what it stubs." }]
}
```

- `base`: the state the plan starts from. `{ "rev": "HEAD" }` (default) or any commit, or `{ "worktree": true }` when the plan builds on uncommitted work. Every excerpt defaults to it, and the file checks of steps and figures run against it. With a commit as the base, the build warns when a quoted file has uncommitted changes, because the starting point may then be different from what the user has.
- `plan`: the Markdown plan. A relative path is looked up first in the work folder, then in the repository, so `"plan": "plan.md"` finds the plan you wrote next to `doc.json`. Give `{ "file": "...", "copy": true }` to force a copy. When the file lies outside the folders Bibliotter scans, or in a folder the scanner skips such as `~/.claude`, the build copies it to `plan-<slug>.md` next to the document and puts a line at the top of the copy that links back. The document's header links to the plan, and its `<meta name="bibliotter-plan">` names it. Rebuild after the plan changes, because the copy and the section links are made at build time.
- `slug`: stable file name. The output is `<main checkout>/explain/<branch>/plan-<slug>.html`; the `plan-` prefix is added when missing.
- `branch`: optional. By default the branch checked out now.
- `abstract`, question texts, step and decision texts may contain inline HTML such as `<code>` or `<kbd>`. Source notes are plain text.

## Sources

Every source needs `kind` and `note`, one sentence saying what this source shows.

| kind | fields | shows |
|---|---|---|
| `code` | `file`, `anchor` or `lines`, `count`, `before`, `nth`, `rev`, `expect` | an excerpt of today's code |
| `test` | same as `code` | an excerpt of a test |
| `commit` | `rev` | a commit message |
| `git` | `args`, `maxLines`, `width` | output of `git grep`, `log`, `show`, `diff`, `blame` or `ls-files`; `{base}` is replaced by the starting revision and dropped for `worktree` |
| `run` | `file` (one path or a list), `command` | a saved experiment output, lettered A, B... in citation order |
| `plan` | `heading`, `count` | a section of the Markdown plan; the citation links to that heading in the plan file |
| `said` | `quote`, `who`, `when`, `label` | the user's exact words, for intent and decisions; `label` replaces "rozmowa" in the margin, e.g. for a note from project memory |
| `web` | `url`, `title`, `accessed`, `quote` | documentation of a library or platform; quote one sentence at most |
| `doc` | `href`, `title` | another document, usually from the library |

- `anchor` is text that the first line contains; prefer it over `lines` (`[from, to]`), because the build then fails when the code is gone. `count` is the number of lines and defaults to 1. `before` shifts the start: `-2` starts two lines above the anchor, `3` three lines below it. `nth` picks the nth match, counted from 1; the build warns when an anchor matches several lines, which happens when it is a substring of another line. `expect` is a fragment the excerpt must contain. `rev` defaults to the base.
- `heading` in a `plan` source names a heading of the Markdown plan: copied as written (with `#`, `` `code` `` or `**bold**`), as its plain text, or as its anchor id. The excerpt shows the start of that section, `count` lines (default 14).
- When a proposal relies on something that exists today, such as calling an existing function, cite that code too. The build asks for it when a paragraph names an existing identifier in `<code>` and cites nothing.

## essay.html

Blocks are separated by a blank line. Each block becomes a row with its sources in the margin.

- `<h2>Title</h2>` starts a chapter, numbered automatically. `<h3>` inside a chapter if needed.
- `{{id}}` cites a source. `{{exp:id}}` prints an experiment's letter. `{{step:id}}` prints a step's number as a link, `{{decision:id}}` a decision's number, `{{fig:id}}` a figure's number. They also work in the abstract, captions and step texts. Never type these numbers by hand.
- Markers, each on its own block:

| marker | places |
|---|---|
| `<!--figure:id-->` | a flow or sequence figure from `figures` |
| `<!--roadmap-->` | the order of the steps, with steps that can run in parallel side by side |
| `<!--step:id-->` | a step's card: number, size, dependencies, files, link into the plan, "done when" |
| `<!--files-->` | every file the steps touch, grouped by folder, with line counts at the base |
| `<!--decision:id-->` | a decision with its options |
| `<!--risks-->` | the risk table, worst first |
| `<!--sketch:id-->` | a sketch of new code from `sketches` |
| `<!--listing:id-->` | a short listing of today's code from `listings` |
| `<!--check:id-->` | a comprehension question from `checks`, as in explain-diff; use one at most |

- Figures with a `<figcaption>` are numbered by the build, in the order they appear. `{{fig:id}}` works for every figure: a figure from `figures` is known by its key, a hand-made one by its `id` attribute. The roadmap is `kroki` and the file map `pliki`.
- The build warns about figures, listings, sketches, steps and decisions that are defined but never placed.
- A block whose first element has the class `wide` spans the margin too. A block whose first element has the class `nocite` makes no claim about the code, such as the list of what you did not verify.
- No `<script>`, `<style>`, `<link>`, `<iframe>`, Shadow DOM or remote resources. Images must be `data:` URIs. Fold long content with `<details>`, never `display: none`.
- `<div class="note"><span class="label">Łatwo przeoczyć</span><p>...</p></div>` corrects a likely misreading.
- `<table class="compare">` with a header row shows the same case today and after the plan.
- `<figure class="fig plate wide" style="--cols:2">` with a `.grid` lays out states: an empty `.head.blank`, one `.head` per column, then per row a `.side` and one `.cell` per column, each cell holding your drawing (styled in `style.css`) and a `.tag` with the state in words. The full example is in the explain-diff reference.
- Colours: black and white with Geist. State is carried by mass: new is solid, changed has a thick outline, removed is dashed, unchanged is a thin grey line. Do not use orange, paper colours or amber.

## Figures

Both figure types take `caption` (inline HTML, may cite) and `alt`, a sentence for screen readers; without `alt` the caption is used. Every node, actor, edge and message takes `state`: `same` (default), `changed`, `new` or `removed`. A node or actor may name a `file`. The build then checks it against the base: a `new` file must not exist yet, any other state needs the file to exist.

### Flow

Boxes in lanes. Lanes are columns, ideally the boundaries that matter: Electron processes, services, client and server. Rows go down and are set by hand.

```json
"today": {
  "type": "flow",
  "caption": "Zapytanie z palety idzie przez most do wątku biblioteki. Nowy jest tylko indeks nagłówków.",
  "lanes": ["Okno", "Preload", "Proces główny", "Wątek biblioteki"],
  "nodes": [
    { "id": "pal", "label": "Paleta", "sub": "Palette.tsx", "lane": 0, "row": 0, "state": "changed", "file": "src/renderer/src/ui/Palette.tsx" },
    { "id": "lib", "label": "Indeks treści", "sub": "searchIndex.ts", "lane": 3, "row": 0 },
    { "id": "heads", "label": "Indeks nagłówków", "lane": 3, "row": 1, "state": "new" }
  ],
  "edges": [
    { "from": "pal", "to": "lib", "label": "search(q)" },
    { "from": "lib", "to": "pal", "label": "wyniki" },
    { "from": "lib", "to": "heads", "label": "przy skanie", "state": "new" }
  ]
}
```

- `label` is a word or three, `sub` a file or function in mono. Two nodes cannot share a lane and row.
- An unchanged connection is a thin grey line, a changed one a thin black line and a new one a thick black line; the legend lists the states the figure uses, for boxes and for lines.
- Edges between boxes in one row run straight; two edges between the same pair are drawn apart, with their labels above and below (or left and right in one lane). An edge between rows goes down first, then sideways into the target; `"route": "hv"` goes sideways first. `"both": true` puts an arrowhead on each end, and `"dashed": true` marks something that is not a call, such as an event or a file read.
- The build warns when an edge crosses another box or runs along another edge; move a node to another row or change `route`.
- Leave out what the argument does not turn on. Four lanes and six to eight nodes is plenty.

### Sequence

Actors in columns and messages from top to bottom, numbered, for the order of calls across a boundary.

```json
"query": {
  "type": "sequence",
  "caption": "Jedno zapytanie po zmianie. Nowe są kroki 3 i 4.",
  "actors": [
    { "id": "r", "label": "Paleta", "sub": "renderer" },
    { "id": "w", "label": "Wątek biblioteki", "sub": "libraryWorker" },
    { "id": "h", "label": "Indeks nagłówków", "state": "new" }
  ],
  "messages": [
    { "from": "r", "to": "w", "label": "palette:query('rozdział')" },
    { "note": "Wątek łączy dwa źródła wyników w jedną listę.", "over": ["w", "h"] },
    { "from": "w", "to": "h", "label": "headings(q)", "state": "new" },
    { "from": "h", "to": "w", "label": "12 nagłówków", "reply": true, "state": "new" },
    { "from": "w", "to": "w", "label": "scal i posortuj" },
    { "divider": "gdy użytkownik wciśnie Enter" },
    { "from": "w", "to": "r", "label": "wyniki", "reply": true }
  ]
}
```

- `reply` draws a dashed return. A message to the same actor draws a loop. `note` with `over` (one or two actor ids) explains a moment; `divider` separates phases.

## Steps

```json
"steps": [
  {
    "id": "index",
    "title": "Zbierz nagłówki w wątku biblioteki",
    "goal": "Każdy dokument w indeksie ma listę nagłówków z identyfikatorami.",
    "size": "M",
    "plan": "Krok 1: indeks nagłówków",
    "files": [
      { "path": "src/main/headings.ts", "change": "new", "note": "czyta <code>h1</code>–<code>h3</code>" },
      "src/main/searchIndex.ts"
    ],
    "verify": "Nowy test <code>tests/headings.test.ts</code> przechodzi w <code>npm test</code>.",
    "status": "todo"
  },
  { "id": "palette", "title": "...", "after": ["index"] }
]
```

- Steps are numbered in the order of the list. A step without `after` follows the previous one; `"after": []` means it depends on nothing, and a list of ids names its dependencies. Steps whose dependencies are done at the same time stand side by side in the roadmap.
- `files`: a path means `changed`; an object takes `change` (`new`, `changed`, `removed`) and an optional `note`. The build fails when a new file already exists or a changed one does not, so a typo in a path cannot pass.
- `plan`: a heading of the Markdown plan; the card links to it.
- `goal` is what is true once the step is done, `verify` how anyone can see it. `size` is S, M or L.
- `status` (`todo`, `doing`, `done`) and `commit` (a revision) show progress while you implement. The header then shows how many steps are done.

## Decisions

```json
"decisions": {
  "store": {
    "title": "Gdzie trzymać nagłówki",
    "question": "Czy nagłówki mają trafić do indeksu, czy powstawać przy każdym otwarciu palety?",
    "plan": "Otwarte pytania",
    "options": [
      { "text": "W indeksie", "detail": "Raz przy skanie, potem tylko zapytanie.", "pros": ["szybkie zapytanie"], "cons": ["większa baza"], "recommended": true },
      { "text": "Przy otwarciu palety", "detail": "Czytamy tylko otwarty dokument.", "pros": ["bez migracji"], "cons": ["tylko bieżący dokument"] }
    ],
    "why": "Skaner i tak czyta każdy plik.{{scan}}"
  }
}
```

- Two to four options, at most one `recommended`, and `why` for it, which may cite. Options have similar weight; do not set up a straw man.
- Decisions are numbered in the order of `decisions`, so place them in that order.
- An open decision shows how to answer: select the question, press <kbd>C</kbd>, choose Agent and write. When the user decides, add a `said` source with their words and set `"decided": { "option": 0, "source": "said-id" }`; `option` is the index or the exact text.

## Risks

```json
"risks": [
  { "text": "Indeks rośnie w dużych bibliotekach.", "likelihood": "mid", "impact": "mid", "mitigation": "Tylko <code>h1</code>–<code>h3</code>, zmierzone w eksperymencie {{exp:size}}.{{size}}", "step": "index" }
]
```

`likelihood` and `impact` are `low`, `mid` or `high`. The table sorts by both. `step` links the risk to a step. Name real risks you found while reading and running, not a generic list.

## Sketches

```json
"sketches": {
  "hit": { "file": "sketches/hit.ts", "target": "src/shared/types.ts", "caption": "Kształt wyniku w palecie." }
}
```

The file lives in the work folder; `target` is where the code will go. The sketch is drawn in a dashed frame and labelled as code that does not exist yet. Keep it under 16 lines.

## Listings, questions and the appendix

Listings show today's code in the text. Same fields as a `code` source, plus `caption`; keep them at 12 lines or fewer, the bibliography can hold longer excerpts:

```json
"listings": { "jump": { "file": "src/preload/outline.ts", "anchor": "export function jumpToHeading", "count": 9, "caption": "Spis treści przewija tak samo." } }
```

A question stops the reader to check a behaviour, with 2-4 options of similar length, exactly one `correct`, and a `why` for each. A plan uses one at most:

```json
"checks": { "q1": { "title": "co przewija", "question": "...", "options": [{ "text": "...", "why": "..." }, { "text": "...", "why": "...", "correct": true }] } }
```

The appendix holds files from the work folder in full, usually the experiment harness: `"annex": [{ "title": "Skrypt eksperymentu {{exp:size}}", "file": "harness/size.cjs", "note": "How to run it and what it stubs." }]`. Titles and notes may use `{{exp:id}}`; the build warns about experiment letters typed by hand, because letters follow the order of first citation.

## The end of the document

End the last chapter with how to respond, then the list of what you did not verify:

```html
<p>Na decyzje odpowiedz uwagą przy pytaniu: zaznacz je, wciśnij <kbd>C</kbd>, wybierz odbiorcę Agent i napisz. Uwagę możesz zostawić przy każdym kroku, tu albo w pliku planu. Potem poproś agenta w czacie, żeby przeczytał odpowiedzi i poprawił plan.</p>

<ul class="nocite"><li>Nie mierzyłem ...</li></ul>
```

In English: "Answer a decision with a comment at its question: select it, press <kbd>C</kbd>, choose Agent as the recipient and write. You can comment on any step, here or in the plan file. Then ask the agent in the chat to read the answers and revise the plan."

## Experiments

- Load the code at the base: from Git for a commit, from disk for `worktree`. Stub only what cannot run outside the app and say so in the appendix note.
- Wait for real completion instead of fixed sleeps, and run twice to confirm the output is stable.
- Print tables a reader can scan: one line per case, with the number that matters.
- A mutation is a copy of the source with one change applied by the harness, which fails loudly when the text to change is not found.
- On Windows PowerShell 5.1, read and write files with `-Encoding UTF8`.
