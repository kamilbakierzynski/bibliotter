# Work folder format

The build script reads one folder:

```
explain-<slug>/
  doc.json        metadata, sources, questions, listings, appendix
  essay.html      the chapters
  runs/*.txt      saved outputs of your experiments
  harness.cjs     the experiment script, any name and language
  style.css       optional, styles for your own figures
  script.js       optional, your own visualisation
```

Build with `node <kit>/build.cjs <folder>`. Flags: `--check` validates without writing, `--out <file.html>` overrides the path, `--repo <path>` sets the repository when `doc.json` has no `repo`, `--no-exclude` leaves `.git/info/exclude` alone.

## doc.json

```json
{
  "lang": "pl",
  "repo": "C:/path/to/repo",
  "change": { "rev": "59b338c" },
  "slug": "dwie-miniatury",
  "title": "Dlaczego jeden dokument ma dwie miniatury",
  "subtitle": "Jak arkusz Markdownu nauczył się ciemnego motywu",
  "writtenBy": "Claude Opus 5.5",
  "abstract": ["First paragraph.", "Second paragraph with the thesis."],
  "sources": { "stamp": { "kind": "code", "note": "...", "file": "src/main/thumbnails.ts", "anchor": "private stampOf", "count": 6 } },
  "checks": {},
  "listings": {},
  "annex": [{ "title": "Experiment script", "file": "harness.cjs", "note": "How to run it and what it stubs." }]
}
```

- `change`: `{ "rev": "<commit>" }`, `{ "range": "main..HEAD" }` or `{ "worktree": true }`. It sets the default revision of every excerpt and of the byline.
- `slug`: stable file name. The output is `<main checkout>/explain/<branch>/<slug>.html`.
- `branch`: optional. By default `<branch>` is the branch checked out now. Set it when the commit you explain belongs to another branch.
- `lang`: `pl` or `en`. It also sets the kit's own labels.
- `abstract`, question texts, `why` texts and appendix notes may contain inline HTML such as `<code>` or `<kbd>`. Source notes are plain text.
- Paths in `run` sources and in `annex` are relative to the work folder.

## Sources

Every source needs `kind` and `note`. The note is one sentence saying what this source shows, and it is printed in the bibliography and the preview.

| kind | fields | shows |
|---|---|---|
| `code` | `file`, `anchor` or `lines`, `count`, `before`, `nth`, `rev`, `expect` | an excerpt from Git |
| `test` | same as `code` | an excerpt of a test |
| `commit` | `rev` (default: the change) | the commit message |
| `git` | `args`, `maxLines`, `width` | output of `git grep`, `log`, `show`, `diff`, `blame` or `ls-files`; lines longer than `width` (default 160) are cut |
| `run` | `file` (one path or a list), `command` | a saved experiment output; labelled Experiment A, B... in citation order. A list keeps several output files of one experiment under one letter |
| `said` | `quote`, `who`, `when` | the user's exact words from this conversation, for intent |
| `doc` | `href`, `title` | another document, usually from the library |
| `web` | `url`, `title`, `accessed`, `quote` | documentation of a library or platform; quote one sentence at most |

Excerpt fields:

- `anchor`: text that the first line contains. Prefer it over line numbers, because the script then finds the line itself and fails when it is gone. `before` moves the start up or down (`-1` includes the line above), `count` is the number of lines, and `nth` picks a later match.
- `lines`: `[from, to]` when no anchor fits. Add `expect` with a fragment the excerpt must contain.
- `rev`: `change` (default), `parent` (the state before the change), `worktree` (the files on disk now) or any Git revision. Excerpts from `parent` and `worktree` are marked in the margin. A `worktree` excerpt of a file with uncommitted changes cannot be checked later, so the build warns; quote `HEAD` or a commit unless the uncommitted state is the point.
- Several excerpts in one source: `"parts": [{ "file": "...", "anchor": "..." }, { ... }]`.
- In `git` args, every `{change}` and `{parent}` is replaced by the revisions.

## essay.html

Blocks are separated by a blank line. Each block becomes a row with its sources in the margin.

- `<h2>Title</h2>` starts a chapter and is numbered automatically. Use `<h3>` inside a chapter if needed.
- `{{id}}` cites a source. The first citation gives the number and the margin note.
- `{{exp:id}}` prints only the letter of the experiment `id`, without a citation: `w eksperymencie {{exp:race}}`. It also works in the abstract, questions, `why` texts and notes. Letters follow the order of first citation, so never type them by hand.
- `<!--listing:id-->` places a listing defined in `doc.json` `listings`, with the same fields as a code excerpt plus an optional `caption`.
- `<!--check:id-->` places a question defined in `doc.json` `checks`.
- A block whose first element has the class `wide` spans the margin too, which suits figures.
- A block whose first element has the class `nocite` makes no claim about the code, such as the list of what you did not verify. The build then does not ask for a source. The open question (`id="otwarte"`) and the recap line are exempt on their own.
- No `<script>`, `<style>`, `<link>`, `<iframe>`, Shadow DOM or remote resources. Images must be `data:` URIs. Do not hide text with `display: none`; fold it with `<details>`, which search can still reach.

Kit classes for your own blocks:

- `<div class="note"><span class="label">Łatwo przeoczyć</span><p>...</p></div>` corrects a likely misreading.
- `<table class="compare">` with a header row shows the same input before and after.
- `<figure class="fig wide">...<figcaption>Rysunek 1. ...</figcaption></figure>` holds a figure. A table with a caption goes into the same figure, and the caption may cite sources.
- `.plate` lays out a grid of states: one row per variant, one column per step. `--cols` is the number of steps. The grid starts with an empty head cell, then one `.head` per step, then for each row a `.side` followed by one `.cell` per step. A `.cell` holds your own drawing (styled in `style.css`) and a `.tag` with the state in words, so the figure is readable without the drawing:

```html
<figure class="fig plate wide" style="--cols:2" role="group" aria-label="Before the change the sheet stays light; after it the sheet follows the theme.">
<div class="grid">
<div class="head blank"></div><div class="head">Open in light</div><div class="head">Press T</div>
<div class="side">Before</div><div class="cell"><div class="tag"><b>1 picture</b> light</div></div><div class="cell"><div class="tag"><b>1 picture</b> light</div></div>
<div class="side">After</div><div class="cell"><div class="tag"><b>1 picture</b> light</div></div><div class="cell"><div class="tag"><b>2 pictures</b> dark</div></div>
</div>
<figcaption>Figure 1. The same steps before and after, from experiments {{exp:before}} and {{exp:after}}.</figcaption>
</figure>
```
- Figures with a `<figcaption>` are numbered by the build, so `Rysunek 1.` at the start of a caption is optional. Give a figure an `id` and write `{{fig:id}}` to refer to its number.
- `<!--figure:id-->` places a flow or sequence diagram defined in `doc.json` `figures`, laid out by the build. The format is in the Figures section of `../explain-plan/reference.md`. In an explanation of a change, a `file` on a node is checked against the change: `new` means the change adds the file, `removed` that it deletes it.
- Colours: the document is black and white with Geist. Do not use orange, paper colours or amber, because the app gives them fixed meanings. Colours you draw as part of the subject, such as a dark theme, are fine in `style.css`.

## Questions

```json
"checks": {
  "q1": {
    "title": "ile zdjęć powstanie",
    "question": "Otwierasz dokument w jasnym motywie i trzy razy wciskasz <kbd>T</kbd>. Ile zdjęć zrobi aplikacja?",
    "options": [
      { "text": "Jedno", "why": "Tak było przed zmianą." },
      { "text": "Dwa", "why": "Jedno jasne i jedno ciemne, potem odczyt z dysku.", "correct": true },
      { "text": "Trzy", "why": "Po powrocie stempel znów pasuje do pliku." }
    ]
  }
}
```

The reader picks an option, with the mouse or a digit key, or presses "I don't know". Then every "why" appears and the chosen one is emphasised. Answers stay in the browser and survive a reload. `title` is the short name used in the recap.

## The open question at the end

End the last chapter with a question and a paragraph saying how to answer, then an empty recap line:

```html
<p id="otwarte">Odpowiedz własnymi słowami, bez przewijania: po co kod liczy stempel drugi raz?</p>

<p>Zaznacz zdanie powyżej, wciśnij <kbd>C</kbd>, wybierz odbiorcę Agent i napisz odpowiedź w uwadze. Potem poproś agenta w czacie o sprawdzenie. Agent odpowie w tym samym wątku.</p>

<p class="recap" id="recap"></p>
```

In English: "Select the sentence above, press <kbd>C</kbd>, choose Agent as the recipient and write your answer in the comment. Then ask the agent in the chat to check it." The recap line fills in with the results of the questions along the way.

## Experiments

- Load the code from Git at the revision you explain, not from the working tree, unless you explain uncommitted work.
- Stub only what cannot run outside the app. Say in the appendix note what is stubbed.
- Make the harness wait for real completion instead of fixed sleeps, and run it twice to confirm the output is stable.
- Print tables a reader can scan: one line per step, with the state that matters.
- A mutation is a copy of the source with one change applied by the harness, which fails loudly when the text to change is not found.
- One harness may write several output files. If they belong to one experiment, give the `run` source a list in `file`, so they share one letter.
- On Windows PowerShell 5.1, read and write files with `-Encoding UTF8`; the default code page breaks names with diacritics.
