'use strict'
/*
 * Diagramy z danych: przepływ (pudełka w torach) i sekwencja (linie życia).
 * Układ liczy się przy budowie, więc dokument nie potrzebuje skryptu ani biblioteki.
 * Stan niesie masa, nie kolor: nowe to bryła, zmienione to gruba linia, usunięte przerywana.
 * Kolory pochodzą ze zmiennych kitu, więc rysunek sam przechodzi w ciemny motyw.
 */
const STATES = ['same', 'changed', 'new', 'removed']
const W = 900

/* Szerokość tekstu na oko. Geist nie ma stałej szerokości, więc liczymy grupy znaków. */
function textWidth(text, size, mono) {
  if (mono) return [...text].length * size * 0.6
  let width = 0
  for (const ch of text) {
    if (/[iljtfr.,:;'!|()[\]\s]/.test(ch)) width += 0.3
    else if (/[mwMW@%]/.test(ch)) width += 0.86
    else if (/[A-ZĄĆĘŁŃÓŚŹŻ0-9]/.test(ch)) width += 0.64
    else width += 0.54
  }
  return width * size
}

/* Łamie po słowach, a za długie słowo tnie najchętniej za znakiem : / . _ ( - */
function wrap(text, max, size, mono) {
  const lines = []
  let line = ''
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (!line || textWidth(next, size, mono) <= max) line = next
    else {
      lines.push(line)
      line = word
    }
    while (textWidth(line, size, mono) > max && line.length > 1) {
      let cut = line.length - 1
      while (cut > 1 && textWidth(line.slice(0, cut), size, mono) > max) cut -= 1
      const soft = Math.max(...[':', '/', '.', '_', '(', '-', ','].map((mark) => line.lastIndexOf(mark, cut - 1)))
      if (soft > cut - 9 && soft > 0) cut = soft + 1
      lines.push(line.slice(0, cut))
      line = line.slice(cut)
    }
  }
  if (line) lines.push(line)
  return lines
}

module.exports = function figures(ctx) {
  const { problem, warn, escape, T } = ctx
  // Klamry jako encje, żeby przypisy {{id}} nie trafiły do wnętrza rysunku.
  const svgText = (text) => escape(text).replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
  const plain = (html) => String(html ?? '').replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()

  function state(value, where) {
    const name = value ?? 'same'
    if (!STATES.includes(name)) problem(`${where}: state "${name}" is not one of ${STATES.join(', ')}`)
    return name
  }

  const markers = (id) =>
    STATES.map((name) => `<marker id="m-${id}-${name}" class="tip ${name}" viewBox="0 0 10 10" refX="9.2" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M0.5 1 L9.5 5 L0.5 9 Z"/></marker>`).join('')

  /* Wielowierszowy napis; anchor to środek albo lewa krawędź, y to linia bazowa pierwszego wiersza. */
  const lines = (list, x, y, step, cls, anchor = 'middle') =>
    `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${list.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : step}">${svgText(line)}</tspan>`).join('')}</text>`

  /* Napis krawędzi na tle papieru, żeby linia pod nim nie przecinała liter. */
  function edgeLabel(list, x, y, anchor) {
    if (list.length === 0) return ''
    const width = Math.max(...list.map((line) => textWidth(line, 10.5, true))) + 8
    const height = list.length * 13 + 4
    const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width + 4 : x - 4
    return `<rect class="bg" x="${left.toFixed(1)}" y="${(y - 11).toFixed(1)}" width="${width.toFixed(1)}" height="${height}" rx="3"/>${lines(list, x, y, 13, 'el', anchor)}`
  }

  /* Łamana z zaokrąglonymi narożnikami. */
  function path(points) {
    let d = `M${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`
    for (let i = 1; i < points.length; i += 1) {
      const [x, y] = points[i]
      if (i < points.length - 1) {
        const [px, py] = points[i - 1]
        const [nx, ny] = points[i + 1]
        const r = Math.min(9, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2)
        const ax = x - Math.sign(x - px) * r
        const ay = y - Math.sign(y - py) * r
        const bx = x + Math.sign(nx - x) * r
        const by = y + Math.sign(ny - y) * r
        d += ` L${ax.toFixed(1)} ${ay.toFixed(1)} Q${x.toFixed(1)} ${y.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`
      } else d += ` L${x.toFixed(1)} ${y.toFixed(1)}`
    }
    return d
  }

  /* Legenda: pudełka mówią o częściach, linie o połączeniach, więc mają osobne wpisy. */
  function legend(used, words) {
    const boxes = STATES.filter((name) => used.boxes.has(name))
    const links = STATES.filter((name) => name !== 'same' && used.lines.has(name))
    const showBoxes = boxes.some((name) => name !== 'same') ? boxes : []
    if (showBoxes.length === 0 && links.length === 0) return ''
    const keys = [
      ...showBoxes.map((name) => `<span class="key"><i class="fs ${name}"></i>${T.states[name]}</span>`),
      ...links.map((name) => `<span class="key"><i class="ls ${name}"></i>${words[name]}</span>`)
    ]
    return `<p class="legend">${keys.join('')}</p>`
  }

  function frame(id, spec, svg, height, used, words) {
    const label = spec.alt ?? plain(spec.caption)
    if (!spec.caption) warn(`figure "${id}": add a "caption" that says what to look at`)
    return `<figure class="fig diagram wide" id="${escape(id)}"><div class="canvas"><svg viewBox="0 0 ${W} ${Math.ceil(height)}" role="img" aria-label="${escape(label)}">${svg}</svg></div>${legend(used, words)}${spec.caption ? `<figcaption>${spec.caption}</figcaption>` : ''}</figure>`
  }

  /* Przepływ: tory to kolumny (np. procesy Electrona), wiersze ustawia autor. */
  function flow(id, spec) {
    const where = `figure "${id}"`
    const lanes = spec.lanes ?? []
    const nodes = (spec.nodes ?? []).map((node) => ({ ...node }))
    if (nodes.length === 0) {
      problem(`${where}: a flow needs "nodes"`)
      return ''
    }
    const used = { boxes: new Set(), lines: new Set() }
    const byId = new Map()
    const cells = new Map()
    for (const node of nodes) {
      if (!node.id || !node.label) problem(`${where}: every node needs "id" and "label"`)
      if (byId.has(node.id)) problem(`${where}: node "${node.id}" is defined twice`)
      byId.set(node.id, node)
      node.state = state(node.state, `${where} node "${node.id}"`)
      used.boxes.add(node.state)
      node.col = node.lane ?? node.col ?? 0
      node.row = node.row ?? 0
      if (lanes.length > 0 && (node.col < 0 || node.col >= lanes.length)) problem(`${where}: node "${node.id}" has lane ${node.col}, but there are ${lanes.length} lanes (counted from 0)`)
      const cell = `${node.col}:${node.row}`
      if (cells.has(cell)) problem(`${where}: nodes "${cells.get(cell)}" and "${node.id}" stand in the same lane and row`)
      cells.set(cell, node.id)
      if (node.file) ctx.checkFile(node.file, node.state, `${where} node "${node.id}"`)
    }
    const cols = Math.max(lanes.length, ...nodes.map((node) => node.col + 1))
    const rows = Math.max(...nodes.map((node) => node.row + 1))
    const colW = W / cols
    const gap = Math.min(118, Math.max(70, colW * 0.4))
    const boxW = Math.min(214, colW - gap)
    for (const node of nodes) {
      node.lines = wrap(node.label, boxW - 20, 13, false)
      node.subLines = node.sub ? wrap(node.sub, boxW - 20, 10.5, true) : []
      if (node.lines.length > 3) warn(`${where}: the label of node "${node.id}" takes ${node.lines.length} lines; shorten it`)
      node.h = 22 + node.lines.length * 17 + (node.subLines.length ? 3 + node.subLines.length * 14 : 0)
    }
    const top = lanes.length > 0 ? 46 : 14
    const rowH = Array.from({ length: rows }, (_, row) => Math.max(48, ...nodes.filter((node) => node.row === row).map((node) => node.h)))
    const rowY = []
    let y = top
    for (let row = 0; row < rows; row += 1) {
      rowY.push(y)
      y += rowH[row] + 50
    }
    const height = y - 50 + 18
    for (const node of nodes) {
      node.cx = colW * (node.col + 0.5)
      node.x = node.cx - boxW / 2
      node.y = rowY[node.row] + (rowH[node.row] - node.h) / 2
      node.cy = node.y + node.h / 2
    }

    let svg = `<defs>${markers(id)}</defs>`
    if (lanes.length > 0) {
      for (let col = 1; col < cols; col += 1) svg += `<line class="lane-sep" x1="${(colW * col).toFixed(1)}" y1="6" x2="${(colW * col).toFixed(1)}" y2="${(height - 6).toFixed(1)}"/>`
      lanes.forEach((name, col) => {
        if (textWidth(name, 11, true) > colW - 16) warn(`${where}: lane "${name}" is wider than its column; shorten it`)
        svg += `<text class="lane" x="${(colW * (col + 0.5)).toFixed(1)}" y="22" text-anchor="middle">${svgText(name)}</text>`
      })
    }

    // Krawędzie między tą samą parą rozsuwamy, żeby tam i z powrotem nie leżały na sobie.
    const pairs = new Map()
    for (const edge of spec.edges ?? []) {
      const key = [edge.from, edge.to].sort().join('\n')
      pairs.set(key, [...(pairs.get(key) ?? []), edge])
    }
    let edgeSvg = ''
    const segments = []
    for (const edge of spec.edges ?? []) {
      const a = byId.get(edge.from)
      const b = byId.get(edge.to)
      if (!a || !b) {
        problem(`${where}: edge ${edge.from} → ${edge.to} names a node that is not defined`)
        continue
      }
      if (a === b) {
        problem(`${where}: edge from "${a.id}" to itself; use a sequence figure for self calls`)
        continue
      }
      const name = state(edge.state, `${where} edge ${edge.from} → ${edge.to}`)
      used.lines.add(name)
      const group = pairs.get([edge.from, edge.to].sort().join('\n'))
      const shift = (group.indexOf(edge) - (group.length - 1) / 2) * 14
      let points
      let label = []
      let lx
      let ly
      let anchor = 'middle'
      const text = edge.label ? String(edge.label) : ''
      if (a.row === b.row) {
        const dir = b.col > a.col ? 1 : -1
        const yy = a.cy + shift
        points = [[dir > 0 ? a.x + boxW : a.x, yy], [dir > 0 ? b.x : b.x + boxW, yy]]
        const room = Math.abs(points[1][0] - points[0][0]) - 12
        label = text ? wrap(text, room, 10.5, true) : []
        lx = (points[0][0] + points[1][0]) / 2
        // Z pary tam i z powrotem górna linia ma napis nad sobą, a dolna pod sobą.
        ly = shift > 0 ? yy + 15 : yy - 8 - (label.length - 1) * 13
      } else if (a.col === b.col) {
        const dir = b.row > a.row ? 1 : -1
        const xx = a.cx + shift
        points = [[xx, dir > 0 ? a.y + a.h : a.y], [xx, dir > 0 ? b.y : b.y + b.h]]
        label = text ? wrap(text, colW / 2 - 14, 10.5, true) : []
        anchor = shift < 0 ? 'end' : 'start'
        lx = shift < 0 ? xx - 8 : xx + 8
        ly = (points[0][1] + points[1][1]) / 2 - ((label.length - 1) * 13) / 2 + 4
      } else if ((edge.route ?? 'vh') === 'vh') {
        // Najpierw w pionie, bo poziome odcinki w wierszu zajmuje zwykle główna droga.
        const dx = b.col > a.col ? 1 : -1
        const dy = b.row > a.row ? 1 : -1
        const xx = a.cx + shift
        const yy = b.cy + shift
        points = [[xx, dy > 0 ? a.y + a.h : a.y], [xx, yy], [dx > 0 ? b.x : b.x + boxW, yy]]
        label = text ? wrap(text, Math.max(Math.abs(points[2][0] - xx) - 16, 60), 10.5, true) : []
        lx = (xx + points[2][0]) / 2
        ly = yy - 8 - (label.length - 1) * 13
      } else {
        const dx = b.col > a.col ? 1 : -1
        const dy = b.row > a.row ? 1 : -1
        const yy = a.cy + shift
        const ex = b.cx + shift
        points = [[dx > 0 ? a.x + boxW : a.x, yy], [ex, yy], [ex, dy > 0 ? b.y : b.y + b.h]]
        label = text ? wrap(text, Math.max(Math.abs(ex - points[0][0]) - 16, 60), 10.5, true) : []
        lx = (points[0][0] + ex) / 2
        ly = yy - 8 - (label.length - 1) * 13
      }
      if (label.length > 2) warn(`${where}: the label of edge ${edge.from} → ${edge.to} takes ${label.length} lines; shorten it`)
      // Odcinek, który przechodzi przez cudze pudełko, czyta się jak połączenie z nim.
      for (const other of nodes) {
        if (other === a || other === b) continue
        const hit = points.slice(1).some(([x2, y2], i) => {
          const [x1, y1] = points[i]
          return Math.max(x1, x2) > other.x + 2 && Math.min(x1, x2) < other.x + boxW - 2 && Math.max(y1, y2) > other.y + 2 && Math.min(y1, y2) < other.y + other.h - 2
        })
        if (hit) warn(`${where}: edge ${edge.from} → ${edge.to} crosses node "${other.id}"; move a node or set "route": "hv"`)
      }
      for (const [i, point] of points.slice(1).entries()) segments.push({ edge, a: points[i], b: point })
      const dashed = edge.dashed || name === 'removed' ? ' dashed' : ''
      const ends = `${edge.both ? ` marker-start="url(#m-${id}-${name})"` : ''} marker-end="url(#m-${id}-${name})"`
      edgeSvg += `<g class="edge ${name}${dashed}"><path d="${path(points)}"${ends}/>${edgeLabel(label, lx, ly, anchor)}</g>`
    }

    // Dwie krawędzie na jednym odcinku czytają się jak jedna, a ich napisy stają obok siebie.
    const reported = new Set()
    for (const [i, one] of segments.entries()) {
      for (const two of segments.slice(i + 1)) {
        if (one.edge === two.edge) continue
        const flat = (seg) => Math.abs(seg.a[1] - seg.b[1]) < 0.5
        const upright = (seg) => Math.abs(seg.a[0] - seg.b[0]) < 0.5
        const overlap = (p1, p2, q1, q2) => Math.min(Math.max(p1, p2), Math.max(q1, q2)) - Math.max(Math.min(p1, p2), Math.min(q1, q2))
        const along =
          (flat(one) && flat(two) && Math.abs(one.a[1] - two.a[1]) < 4 && overlap(one.a[0], one.b[0], two.a[0], two.b[0]) > 12) ||
          (upright(one) && upright(two) && Math.abs(one.a[0] - two.a[0]) < 4 && overlap(one.a[1], one.b[1], two.a[1], two.b[1]) > 12)
        const key = `${one.edge.from}>${one.edge.to}|${two.edge.from}>${two.edge.to}`
        if (along && !reported.has(key)) {
          reported.add(key)
          warn(`${where}: edges ${one.edge.from} → ${one.edge.to} and ${two.edge.from} → ${two.edge.to} run along the same line; move a node or set "route"`)
        }
      }
    }

    let nodeSvg = ''
    for (const node of nodes) {
      const labelTop = node.y + 11 + 13
      nodeSvg += `<g class="node ${node.state}"><rect x="${node.x.toFixed(1)}" y="${node.y.toFixed(1)}" width="${boxW.toFixed(1)}" height="${node.h}" rx="8"/>${lines(node.lines, node.cx.toFixed(1), labelTop.toFixed(1), 17, 'nl')}${node.subLines.length ? lines(node.subLines, node.cx.toFixed(1), (labelTop + (node.lines.length - 1) * 17 + 18).toFixed(1), 14, 'ns') : ''}</g>`
    }
    // Krawędzie pod pudełkami, ale napisy krawędzi nad nimi: napis bywa szerszy niż odstęp.
    return frame(id, spec, svg + edgeSvg.replace(/<rect class="bg"[\s\S]*?<\/text>/g, '') + nodeSvg + edgeSvg.replace(/<path [^>]*\/>/g, ''), height, used, T.lineStates)
  }

  /* Sekwencja: uczestnicy w kolumnach, wiadomości z góry na dół, numerowane. */
  function sequence(id, spec) {
    const where = `figure "${id}"`
    const actors = (spec.actors ?? []).map((actor) => ({ ...actor }))
    if (actors.length < 2) {
      problem(`${where}: a sequence needs at least two "actors"`)
      return ''
    }
    const used = { boxes: new Set(), lines: new Set() }
    const byId = new Map(actors.map((actor, index) => [actor.id, Object.assign(actor, { index })]))
    if (byId.size !== actors.length) problem(`${where}: actor ids must be unique`)
    const colW = W / actors.length
    const boxW = Math.min(190, colW - 26)
    for (const actor of actors) {
      if (!actor.id || !actor.label) problem(`${where}: every actor needs "id" and "label"`)
      actor.state = state(actor.state, `${where} actor "${actor.id}"`)
      used.boxes.add(actor.state)
      actor.x = colW * (actor.index + 0.5)
      actor.lines = wrap(actor.label, boxW - 18, 13, false)
      actor.subLines = actor.sub ? wrap(actor.sub, boxW - 18, 10.5, true) : []
      actor.h = 20 + actor.lines.length * 17 + (actor.subLines.length ? 2 + actor.subLines.length * 14 : 0)
      if (actor.file) ctx.checkFile(actor.file, actor.state, `${where} actor "${actor.id}"`)
    }
    const headH = Math.max(...actors.map((actor) => actor.h))
    let svg = `<defs>${markers(id)}</defs>`
    let body = ''
    let y = 10 + headH + 30
    let number = 0
    for (const [index, item] of (spec.messages ?? []).entries()) {
      const at = `${where} message ${index + 1}`
      if (item.divider !== undefined) {
        body += `<g class="divider"><line x1="8" y1="${y}" x2="${W - 8}" y2="${y}"/>${edgeLabel([String(item.divider)], 12, y + 4, 'start')}</g>`
        y += 34
        continue
      }
      if (item.note !== undefined) {
        const over = [item.over ?? []].flat().map((name) => byId.get(name))
        if (over.length === 0 || over.some((actor) => !actor)) {
          problem(`${at}: a note needs "over" with one or two actor ids`)
          continue
        }
        const left = Math.min(...over.map((actor) => actor.x)) - Math.min(boxW / 2, 110)
        const right = Math.max(...over.map((actor) => actor.x)) + Math.min(boxW / 2, 110)
        const list = wrap(String(item.note), right - left - 20, 12, false)
        const h = 14 + list.length * 16
        body += `<g class="note"><rect x="${left.toFixed(1)}" y="${y}" width="${(right - left).toFixed(1)}" height="${h}" rx="6"/>${lines(list, ((left + right) / 2).toFixed(1), y + 19, 16, 'nt')}</g>`
        y += h + 18
        continue
      }
      const a = byId.get(item.from)
      const b = byId.get(item.to)
      if (!a || !b) {
        problem(`${at}: "from" and "to" must name actors`)
        continue
      }
      number += 1
      const name = state(item.state, at)
      used.lines.add(name)
      const dashed = item.reply || name === 'removed' ? ' dashed' : ''
      const text = `${number}  ${item.label ?? ''}`.trim()
      if (a === b) {
        const list = wrap(text, colW / 2 + 40, 10.5, true)
        const points = [[a.x, y], [a.x + 34, y], [a.x + 34, y + 22], [a.x, y + 22]]
        body += `<g class="edge ${name}${dashed}"><path d="${path(points)}" marker-end="url(#m-${id}-${name})"/>${edgeLabel(list, a.x + 42, y + 4, 'start')}</g>`
        y += 22 + Math.max(30, list.length * 13 + 16)
        continue
      }
      const list = wrap(text, Math.abs(b.x - a.x) - 26, 10.5, true)
      if (list.length > 2) warn(`${at}: the label takes ${list.length} lines; shorten it`)
      const lineY = y + (list.length - 1) * 13 + 8
      body += `<g class="edge ${name}${dashed}"><path d="M${a.x.toFixed(1)} ${lineY} L${(b.x + (b.x > a.x ? -1 : 1)).toFixed(1)} ${lineY}" marker-end="url(#m-${id}-${name})"/>${edgeLabel(list, (a.x + b.x) / 2, y - 2, 'middle')}</g>`
      y = lineY + 34
    }
    const bottom = y - 10
    for (const actor of actors) {
      svg += `<line class="life" x1="${actor.x.toFixed(1)}" y1="${10 + headH}" x2="${actor.x.toFixed(1)}" y2="${bottom}"/>`
      const boxY = 10 + headH - actor.h
      const labelTop = boxY + 10 + 13
      svg += `<g class="node ${actor.state}"><rect x="${(actor.x - boxW / 2).toFixed(1)}" y="${boxY}" width="${boxW.toFixed(1)}" height="${actor.h}" rx="8"/>${lines(actor.lines, actor.x.toFixed(1), labelTop, 17, 'nl')}${actor.subLines.length ? lines(actor.subLines, actor.x.toFixed(1), labelTop + (actor.lines.length - 1) * 17 + 17, 14, 'ns') : ''}</g>`
    }
    if (number === 0) problem(`${where}: a sequence needs "messages"`)
    return frame(id, spec, svg + body, bottom + 12, used, T.callStates)
  }

  return {
    render(id, spec) {
      if (!spec) {
        problem(`figure "${id}" is used in essay.html but missing in doc.json "figures"`)
        return ''
      }
      if (spec.type === 'flow') return flow(id, spec)
      if (spec.type === 'sequence') return sequence(id, spec)
      problem(`figure "${id}": "type" must be flow or sequence`)
      return ''
    }
  }
}
module.exports.STATES = STATES
