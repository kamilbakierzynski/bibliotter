'use strict'
/*
 * Części dokumentu planu: kroki z zależnościami, mapa plików, decyzje, ryzyka, szkice
 * i plan w pigułce. Wszystko powstaje z doc.json, a build sprawdza to, co da się sprawdzić
 * w Gicie: plik „nowy” nie może już istnieć, a „zmieniany” musi istnieć w stanie wyjściowym.
 */
const { readFileSync } = require('node:fs')
const { basename, dirname } = require('node:path')

const CHANGES = ['new', 'changed', 'removed']
const LEVELS = { low: 1, mid: 2, high: 3, 1: 1, 2: 2, 3: 3 }

/* Ta sama postać identyfikatora co slugOf w src/main/markdown.ts. Pilnuje tego test kitu. */
function slugOf(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-')
}

/* Tekst nagłówka bez znaczników Markdownu, jak textRenderer w marked. */
function headingText(raw) {
  return raw
    .replace(/\s+#+\s*$/, '')
    .replace(/!?\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/!?\[\[([^\]]+)\]\]/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\\([\\`*_{}[\]()#+\-.!])/g, '$1')
    .trim()
}

/* Nagłówki pliku planu z identyfikatorami, które nada im arkusz Markdownu w apce. */
function readHeadings(source) {
  const lines = source.replace(/^﻿/, '').replace(/\r/g, '').split('\n')
  let start = 0
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0 && /^[\w-]+:/.test(lines[1] ?? '')) start = end + 1
  }
  const used = new Map()
  const headings = []
  let fence = null
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index]
    const open = /^ {0,3}(`{3,}|~{3,})/.exec(line)
    if (open) {
      if (!fence) fence = open[1][0]
      else if (line.trim().startsWith(fence)) fence = null
      continue
    }
    if (fence) continue
    let depth = 0
    let text = ''
    const atx = /^ {0,3}(#{1,6})\s+(.*)$/.exec(line)
    if (atx) {
      depth = atx[1].length
      text = headingText(atx[2])
    } else if (index > start && /^ {0,3}(=+|-+)\s*$/.test(line) && lines[index - 1].trim() && !/^ {0,3}([#>*+-]|\d+\.)/.test(lines[index - 1])) {
      depth = line.trim()[0] === '=' ? 1 : 2
      text = headingText(lines[index - 1])
    }
    if (!depth) continue
    const slug = slugOf(text)
    const seen = used.get(slug) ?? 0
    used.set(slug, seen + 1)
    headings.push({ depth, text, id: seen === 0 ? slug : `${slug}-${seen}`, line: atx ? index : index - 1 })
  }
  for (const [i, heading] of headings.entries()) {
    const next = headings.slice(i + 1).find((other) => other.depth <= heading.depth)
    heading.end = next ? next.line : lines.length
  }
  return { lines, headings }
}

module.exports = function planKit(ctx) {
  const { doc, T, escape, problem, warn, fileAt, commitLine } = ctx
  const steps = Array.isArray(doc.steps) ? doc.steps : []
  const decisions = doc.decisions ?? {}
  const risks = Array.isArray(doc.risks) ? doc.risks : []
  const sketches = doc.sketches ?? {}
  const placed = { roadmap: false, files: false, risks: false, steps: [], decisions: [] }
  const levelOf = (value) => LEVELS[value] ?? 0

  /* Plik planu w Markdownie: skąd go czytamy i dokąd prowadzą odnośniki. */
  let planMd = null
  function attachPlan(info) {
    if (!info) return
    try {
      const source = readFileSync(info.path, 'utf8')
      planMd = { ...info, source, ...readHeadings(source) }
    } catch {
      problem(`"plan": cannot read ${info.path}`)
    }
  }
  function planSection(heading, where) {
    if (!planMd) {
      // Brak pliku planu zgłosił już build; kolejne błędy o każdym odnośniku tylko by go zasłoniły.
      if (!doc.plan) problem(`${where}: points into the plan, but doc.json has no "plan" file`)
      return null
    }
    // Nagłówek można podać tak, jak stoi w Markdownie (z `kodem` i **wyróżnieniem**), jako tekst albo jako kotwicę.
    const wanted = String(heading).trim().replace(/^#+\s*/, '')
    const plain = headingText(wanted)
    const found =
      planMd.headings.find((item) => item.text === plain || item.id === wanted) ??
      planMd.headings.find((item) => item.text.toLowerCase() === plain.toLowerCase())
    if (!found) {
      const names = planMd.headings.slice(0, 40).map((item) => `"${item.text}"`).join(', ')
      problem(`${where}: no heading "${wanted}" in ${basename(planMd.path)}. Headings: ${names}${planMd.headings.length > 40 ? ', …' : ''}`)
      return null
    }
    return { ...found, href: `${planMd.href}#${found.id}` }
  }
  const planLink = (section, text) => `<a class="plan-link" href="${escape(section.href)}">§ ${escape(text ?? section.text)}</a>`

  /* Kroki: numer to kolejność w doc.json, a krok bez "after" idzie po poprzednim. */
  const byId = new Map()
  steps.forEach((step, index) => {
    const where = `step "${step.id ?? index + 1}"`
    if (!step.id || !/^[\w-]+$/.test(step.id)) problem(`${where}: "id" is required and may hold only letters, digits, - and _`)
    if (byId.has(step.id)) problem(`${where}: id is used twice`)
    if (!step.title) problem(`${where}: "title" is required`)
    if (!step.goal) warn(`${where}: add "goal", one sentence saying what is true once the step is done`)
    if (!step.verify) warn(`${where}: add "verify", how you will know the step is done`)
    if (step.size && !['S', 'M', 'L'].includes(step.size)) problem(`${where}: "size" is S, M or L`)
    if (step.status && !['todo', 'doing', 'done'].includes(step.status)) problem(`${where}: "status" is todo, doing or done`)
    step.n = index + 1
    step.explicitAfter = Array.isArray(step.after)
    step.deps = step.explicitAfter ? step.after : index > 0 ? [steps[index - 1].id] : []
    step.files = (step.files ?? []).map((file) => (typeof file === 'string' ? { path: file, change: 'changed' } : { ...file, change: file.change ?? 'changed' }))
    for (const file of step.files) {
      if (!CHANGES.includes(file.change)) problem(`${where}: file ${file.path} has change "${file.change}"; use new, changed or removed`)
      else ctx.checkFile(file.path, file.change, where)
    }
    if (step.commit) step.commitText = commitLine(step.commit, where)
    if (step.plan) step.planSection = () => planSection(step.plan, where)
    byId.set(step.id, step)
  })
  for (const step of steps) for (const dep of step.deps) if (!byId.has(dep)) problem(`step "${step.id}": "after" names unknown step "${dep}"`)
  const level = new Map()
  const visiting = new Set()
  function depth(step) {
    if (level.has(step.id)) return level.get(step.id)
    if (visiting.has(step.id)) {
      problem(`steps: "${step.id}" depends on itself through "after"`)
      return 0
    }
    visiting.add(step.id)
    const value = step.deps.filter((dep) => byId.has(dep)).reduce((max, dep) => Math.max(max, depth(byId.get(dep)) + 1), 0)
    visiting.delete(step.id)
    level.set(step.id, value)
    return value
  }
  for (const step of steps) step.level = depth(step)
  const stages = []
  for (const step of steps) (stages[step.level] ??= []).push(step)
  const parallel = stages.some((stage) => stage && stage.length > 1)
  // W planie z równoległymi etapami układ nie mówi, po którym kroku idzie dany krok, więc karta to pisze.
  const showDeps = (step) => step.deps.length > 0 && (step.explicitAfter || parallel)

  /* Pliki zebrane ze wszystkich kroków. Plik tworzony w planie zostaje nowy, choć później się zmienia. */
  const files = new Map()
  for (const step of steps) {
    for (const file of step.files) {
      const entry = files.get(file.path) ?? { path: file.path.replace(/\\/g, '/'), change: file.change, steps: [] }
      if (entry.change !== 'new' && file.change === 'removed') entry.change = 'removed'
      if (!entry.steps.includes(step.n)) entry.steps.push(step.n)
      files.set(file.path, entry)
    }
  }
  const counts = { new: 0, changed: 0, removed: 0 }
  for (const entry of files.values()) counts[entry.change] += 1
  const glyph = (change) => `<i class="fs ${change}" role="img" aria-label="${escape(T.fileChange[change])}"></i>`

  const decisionIds = Object.keys(decisions)
  const decisionNumber = (id) => decisionIds.indexOf(id) + 1
  const isOpen = (item) => !item.decided
  for (const [id, item] of Object.entries(decisions)) {
    const where = `decision "${id}"`
    const options = item.options ?? []
    if (!item.question || !item.title) problem(`${where}: "title" and "question" are required`)
    if (options.length < 2 || options.length > 4) problem(`${where}: needs 2-4 options`)
    if (options.some((option) => !option.text)) problem(`${where}: every option needs "text"`)
    const recommended = options.filter((option) => option.recommended).length
    if (recommended > 1) problem(`${where}: recommend at most one option`)
    if (recommended === 0 && !item.decided) warn(`${where}: no option is recommended; say which way you would go and why`)
    if (recommended === 1 && !item.why) warn(`${where}: add "why", the reason for the recommended option`)
    if (item.decided) {
      const chosen = typeof item.decided.option === 'number' ? item.decided.option : options.findIndex((option) => option.text === item.decided.option)
      if (chosen < 0 || chosen >= options.length) problem(`${where}: "decided.option" must be an option index or its exact text`)
      item.chosen = chosen
      if (!item.decided.source) warn(`${where}: "decided.source" should name a said source with the user's words`)
      else if (doc.sources?.[item.decided.source]?.kind !== 'said') problem(`${where}: "decided.source" must name a source of kind said`)
    }
  }

  risks.forEach((risk, index) => {
    const where = `risk ${index + 1}`
    if (!risk.text) problem(`${where}: "text" is required`)
    if (!levelOf(risk.likelihood) || !levelOf(risk.impact)) problem(`${where}: "likelihood" and "impact" are low, mid or high`)
    if (!risk.mitigation) warn(`${where}: add "mitigation", what the plan does about it`)
    if (risk.step && !byId.has(risk.step)) problem(`${where}: "step" names unknown step "${risk.step}"`)
  })
  const score = (risk) => levelOf(risk.likelihood) * levelOf(risk.impact)
  const band = (value) => (value >= 6 ? 3 : value >= 3 ? 2 : 1)

  const stepLink = (id) => {
    const step = byId.get(id)
    return step ? `<a class="xref" href="#krok-${escape(id)}">${step.n}</a>` : ''
  }

  return {
    attachPlan,
    planSection,
    get planMd() {
      return planMd
    },
    hasSteps: steps.length > 0,

    /* {{step:id}} i {{decision:id}} wstawiają numer z odnośnikiem. */
    refs(text) {
      return String(text).replace(/\{\{\s*(step|decision)\s*:\s*([\w-]+)\s*\}\}/g, (_, kind, id) => {
        if (kind === 'step') {
          if (!byId.has(id)) problem(`{{step:${id}}} names a step that is not in doc.json`)
          return stepLink(id) || '?'
        }
        if (!decisions[id]) {
          problem(`{{decision:${id}}} names a decision that is not in doc.json`)
          return '?'
        }
        return `<a class="xref" href="#decyzja-${escape(id)}">${decisionNumber(id)}</a>`
      })
    },

    roadmap() {
      if (steps.length === 0) {
        problem('<!--roadmap--> needs "steps" in doc.json')
        return ''
      }
      placed.roadmap = true
      const card = (step) => {
        const meta = [
          step.status && step.status !== 'todo' ? `<span class="st">${T.stepStatus[step.status]}</span>` : '',
          step.files.length ? T.files(step.files.length) : '',
          showDeps(step) ? T.after(step.deps.map((dep) => byId.get(dep)?.n ?? '?')) : ''
        ]
          .filter(Boolean)
          .join(' · ')
        return `<a class="card" data-status="${step.status ?? 'todo'}" href="#krok-${escape(step.id)}"><span class="card-top"><span class="sn">${step.n}</span>${step.size ? `<span class="pill">${step.size}</span>` : ''}</span><b>${step.title}</b>${step.goal ? `<span class="goal">${step.goal}</span>` : ''}${meta ? `<span class="meta">${meta}</span>` : ''}</a>`
      }
      const rows = stages
        .filter(Boolean)
        .map((stage) => `<li class="stage${stage.length > 1 ? ' together' : ''}"><span class="rail"></span>${stage.length > 1 ? `<span class="stage-note">${T.parallel}</span>` : ''}<div class="cards${stage.length === 1 ? ' single' : ''}" style="--n:${Math.min(stage.length, 3)}">${stage.map(card).join('')}</div></li>`)
        .join('')
      const caption = doc.roadmapCaption ?? `${T.roadmapCaption}${parallel ? ` ${T.roadmapParallel}` : ''}`
      return `<figure class="fig roadmap wide" id="kroki"><ol class="road">${rows}</ol><figcaption>${caption}</figcaption></figure>`
    },

    step(id) {
      const step = byId.get(id)
      if (!step) {
        problem(`<!--step:${id}--> names a step that is not in doc.json`)
        return ''
      }
      if (placed.steps.includes(id)) problem(`step "${id}" is placed twice`)
      placed.steps.push(id)
      const status = step.status && step.status !== 'todo' ? `<span class="st">${T.stepStatus[step.status]}${step.commitText ? ` · ${escape(step.commitText)}` : ''}</span>` : ''
      const after = showDeps(step) ? `<span>${T.after(step.deps.map((dep) => stepLink(dep)))}</span>` : ''
      const section = step.planSection?.()
      const fileList = step.files.length
        ? `<ul class="step-files">${step.files.map((file) => `<li>${glyph(file.change)}<code>${escape(file.path)}</code><span class="what">${T.fileChange[file.change]}</span>${file.note ? `<span class="fnote">${file.note}</span>` : ''}</li>`).join('')}</ul>`
        : ''
      return `<section class="step" id="krok-${escape(id)}" data-status="${step.status ?? 'todo'}"><p class="step-head"><span class="step-n">${T.stepOf(step.n, steps.length)}</span>${step.size ? `<span class="pill">${step.size}</span>` : ''}${after}${status}${section ? planLink(section) : ''}</p><h3>${step.title}</h3>${step.goal ? `<p class="step-goal">${step.goal}</p>` : ''}${fileList}${step.verify ? `<p class="step-verify"><span class="label">${T.doneWhen}</span>${step.verify}</p>` : ''}</section>`
    },

    files() {
      if (files.size === 0) {
        problem('<!--files--> needs steps with "files"')
        return ''
      }
      placed.files = true
      const groups = new Map()
      for (const entry of [...files.values()].sort((a, b) => a.path.localeCompare(b.path))) {
        const dir = entry.path.includes('/') ? `${dirname(entry.path)}/` : './'
        groups.set(dir, [...(groups.get(dir) ?? []), entry])
      }
      const sum = CHANGES.filter((change) => counts[change] > 0)
        .map((change) => `<span class="key">${glyph(change)}${T.filesSum[change](counts[change])}</span>`)
        .join('')
      const list = [...groups]
        .map(([dir, entries]) => `<p class="dir">${escape(dir)}</p><ul>${entries.map((entry) => {
          const size = entry.change === 'new' ? '' : T.lines(fileAt(entry.path).lines)
          return `<li class="f ${entry.change}">${glyph(entry.change)}<span class="name">${escape(basename(entry.path))}</span><span class="in">${T.stepsShort(entry.steps.map((n) => `<a class="xref" href="#krok-${escape(steps[n - 1].id)}">${n}</a>`))}</span><span class="size">${size}</span></li>`
        }).join('')}</ul>`)
        .join('')
      return `<figure class="fig files" id="pliki"><p class="files-sum">${sum}</p><div class="files-list">${list}</div><figcaption>${T.filesCaption}</figcaption></figure>`
    },

    decision(id) {
      const item = decisions[id]
      if (!item) {
        problem(`<!--decision:${id}--> names a decision that is not in doc.json`)
        return ''
      }
      if (placed.decisions.includes(id)) problem(`decision "${id}" is placed twice`)
      placed.decisions.push(id)
      const letters = 'ABCD'
      const options = (item.options ?? [])
        .map((option, index) => {
          const cls = [option.recommended ? 'rec' : '', item.chosen === index ? 'chosen' : '', item.decided && item.chosen !== index ? 'dropped' : ''].filter(Boolean).join(' ')
          const pros = (option.pros ?? []).map((text) => `<li class="pro">${text}</li>`).join('')
          const cons = (option.cons ?? []).map((text) => `<li class="con">${text}</li>`).join('')
          const tag = item.chosen === index ? `<span class="pill solid">${T.chosen}</span>` : option.recommended && !item.decided ? `<span class="pill solid">${T.recommend}</span>` : option.recommended ? `<span class="pill">${T.recommend}</span>` : ''
          // Plakietka stoi nad nazwą, bo przy trzech opcjach w wierszu zabierałaby nazwie miejsce.
          return `<div class="dec-opt${cls ? ` ${cls}` : ''}">${tag ? `<p class="dec-tag">${tag}</p>` : ''}<p class="dec-name"><span class="dec-mark">${letters[index]}</span><span>${option.text}</span></p>${option.detail ? `<p class="dec-detail">${option.detail}</p>` : ''}${pros || cons ? `<ul class="dec-pc">${pros}${cons}</ul>` : ''}</div>`
        })
        .join('')
      const recIndex = (item.options ?? []).findIndex((option) => option.recommended)
      const why = item.why ? `<p class="dec-why"><span class="label">${T.whyOption(letters[recIndex] ?? '')}</span>${item.why}</p>` : ''
      const section = item.plan ? planSection(item.plan, `decision "${id}"`) : null
      const state = item.decided
        ? `${T.decisionDone}: ${letters[item.chosen] ?? '?'}${item.decided.source ? ` {{${item.decided.source}}}` : ''}`
        : T.decisionOpen
      const hint = item.decided ? '' : `<p class="dec-hint">${T.answerHint}</p>`
      return `<section class="decision" id="decyzja-${escape(id)}" data-state="${item.decided ? 'decided' : 'open'}"><p class="dec-label"><span>${T.decision} ${decisionNumber(id)}</span><span>${state}</span>${section ? planLink(section) : ''}</p><p class="dec-q">${item.question}</p><div class="dec-opts" style="--n:${Math.min((item.options ?? []).length, 3)}">${options}</div>${why}${hint}</section>`
    },

    risks() {
      if (risks.length === 0) {
        problem('<!--risks--> needs "risks" in doc.json')
        return ''
      }
      placed.risks = true
      const meter = (value, words) => `<span class="lvl" data-l="${levelOf(value)}" aria-label="${escape(words[levelOf(value) - 1] ?? '')}"><i></i><i></i><i></i></span><span class="lvl-w">${words[levelOf(value) - 1] ?? ''}</span>`
      const rows = [...risks]
        .sort((a, b) => score(b) - score(a))
        .map((risk) => `<tr><td>${risk.text}${risk.step && byId.has(risk.step) ? ` <span class="r-step">${T.stepWord} ${stepLink(risk.step)}</span>` : ''}</td><td class="m">${meter(risk.likelihood, T.likelihood)}</td><td class="m">${meter(risk.impact, T.impact)}</td><td>${risk.mitigation ?? ''}</td></tr>`)
        .join('')
      return `<figure class="fig risks" id="ryzyka"><table class="risk"><thead><tr>${T.riskHead.map((head) => `<th>${head}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></figure>`
    },

    sketch(id, number) {
      const spec = sketches[id]
      if (!spec) {
        problem(`<!--sketch:${id}--> names a sketch that is not in doc.json "sketches"`)
        return ''
      }
      if (!spec.file) {
        problem(`sketch "${id}": "file" with the sketch code is required`)
        return ''
      }
      let lines
      try {
        lines = ctx.readWork(spec.file).trimEnd().split('\n')
      } catch {
        problem(`sketch "${id}": ${spec.file} not found in the work folder`)
        return ''
      }
      if (lines.length > 16) warn(`sketch "${id}" has ${lines.length} lines; a sketch shows the shape, keep it under 16`)
      const target = spec.target ? spec.target.replace(/\\/g, '/') : ''
      const exists = target ? fileAt(target).exists : false
      const where = target ? (exists ? T.sketchChange(target) : T.sketchNew(target)) : ''
      const phrase = where ? `${escape(where)}, ${T.sketchNote}` : T.sketchNote
      return `<figure class="listing sketch"><span class="sketch-tag">${T.sketch}</span>${ctx.sketchBlock(lines, target || spec.file)}<figcaption>${T.sketch} ${number}. ${phrase[0].toUpperCase()}${phrase.slice(1)}.${spec.caption ? ` ${spec.caption}` : ''}</figcaption></figure>`
    },

    /* Plan w pigułce pod streszczeniem: kafle z liczbami, każdy prowadzi do swojej części. */
    glance() {
      if (steps.length === 0) return ''
      const done = steps.filter((step) => step.status === 'done').length
      const dots = steps.map((step) => `<i data-status="${step.status ?? 'todo'}"></i>`).join('')
      const tile = (href, label, value, sub, extra = '') => `<a class="tile" href="${href}"><span class="t-label">${label}</span><span class="t-value">${value}</span>${extra}<span class="t-sub">${sub}</span></a>`
      const tiles = [
        tile(placed.roadmap ? '#kroki' : `#krok-${escape(steps[0].id)}`, T.glance.steps, steps.length, done ? T.glance.done(done) : T.glance.stages(stages.filter(Boolean).length), `<span class="dots">${dots}</span>`)
      ]
      if (files.size > 0) tiles.push(tile(placed.files ? '#pliki' : '#kroki', T.glance.files, files.size, CHANGES.filter((change) => counts[change]).map((change) => T.filesSum[change](counts[change])).join(', ')))
      if (decisionIds.length > 0) {
        const open = decisionIds.filter((id) => isOpen(decisions[id])).length
        const first = decisionIds.find((id) => isOpen(decisions[id])) ?? decisionIds[0]
        tiles.push(tile(`#decyzja-${escape(first)}`, T.glance.decisions, open || decisionIds.length, open ? T.glance.open(open) : T.glance.closed))
      }
      if (risks.length > 0) {
        // Od najpoważniejszych: ile ryzyk wysokich, średnich i niskich.
        const byBand = [3, 2, 1].map((level) => [level, risks.filter((risk) => band(score(risk)) === level).length]).filter(([, count]) => count > 0)
        tiles.push(tile('#ryzyka', T.glance.risks, risks.length, byBand.map(([level, count]) => T.glance.band(level, count)).join(', ')))
      }
      return `<section class="glance" aria-label="${T.glance.label}"><h2>${T.glance.label}</h2><div class="tiles" style="--n:${tiles.length}">${tiles.join('')}</div></section>`
    },

    progress() {
      const done = steps.filter((step) => step.status === 'done').length
      const doing = steps.filter((step) => step.status === 'doing').length
      return done || doing ? T.progressLine(done, steps.length) : ''
    },

    finish() {
      if (steps.length === 0 && ctx.isPlan) problem('a plan needs "steps" in doc.json')
      for (const step of steps) if (!placed.steps.includes(step.id)) warn(`step "${step.id}" is not placed; add <!--step:${step.id}--> where the text explains it`)
      for (const id of decisionIds) if (!placed.decisions.includes(id)) warn(`decision "${id}" is not placed; add <!--decision:${id}-->`)
      if (ctx.isPlan && steps.length > 1 && !placed.roadmap) warn('add <!--roadmap--> so the reader sees the order of the steps at once')
      if (risks.length > 0 && !placed.risks) warn('risks are defined but <!--risks--> is not placed')
      const order = placed.steps.map((id) => byId.get(id)?.n ?? 0)
      if (order.some((n, i) => i > 0 && n < order[i - 1])) warn('steps are placed out of their order in doc.json; numbers would jump')
    }
  }
}
module.exports.slugOf = slugOf
module.exports.readHeadings = readHeadings
