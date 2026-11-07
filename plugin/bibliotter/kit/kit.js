/* Kit dokumentów objaśniających Bibliotter. Bez JS dokument działa w całości, a ten skrypt tylko ułatwia. */
(() => {
  const TEXT = __KIT_TEXT__
  const doc = document.querySelector('meta[name="bibliotter-doc"]')?.content ?? location.pathname
  const memory = {
    get: (name) => {
      try {
        return localStorage.getItem(`explain:${doc}:${name}`)
      } catch {
        return null
      }
    },
    set: (name, value) => {
      try {
        if (value) localStorage.setItem(`explain:${doc}:${name}`, value)
        else localStorage.removeItem(`explain:${doc}:${name}`)
      } catch {
        /* Bez pamięci przeglądarki pytanie działa, tylko nie pamięta odpowiedzi. */
      }
    }
  }

  /* Pytania: bez JS to zwykłe <details>, z JS najpierw wybór, potem odpowiedź. */
  const checks = [...document.querySelectorAll('.check')]

  function paint(check, value) {
    const answer = check.dataset.answer
    check.dataset.state = value ? 'done' : 'open'
    for (const option of check.querySelectorAll('.check-opts li')) {
      option.classList.toggle('picked', value === option.dataset.opt)
      option.classList.toggle('right', Boolean(value) && answer === option.dataset.opt)
      const button = option.querySelector('button')
      if (button) button.disabled = Boolean(value)
    }
    const reveal = check.querySelector('.check-answer')
    reveal.open = Boolean(value)
    for (const why of reveal.querySelectorAll('[data-why]')) {
      why.classList.toggle('lead', why.dataset.why === (value === 'skip' ? answer : value))
    }
    recap()
  }

  function choose(check, value) {
    memory.set(check.id, value)
    paint(check, value)
  }

  for (const check of checks) {
    for (const option of check.querySelectorAll('.check-opts li')) {
      const shown = option.querySelector(':scope > span')
      const button = document.createElement('button')
      button.type = 'button'
      button.append(...shown.childNodes)
      shown.replaceWith(button)
      button.addEventListener('click', () => choose(check, option.dataset.opt))
    }
    const reveal = check.querySelector('.check-answer')
    reveal.querySelector('summary').addEventListener('click', (event) => {
      event.preventDefault()
      choose(check, 'skip')
    })
    const again = document.createElement('button')
    again.type = 'button'
    again.className = 'check-again'
    again.textContent = TEXT.again
    again.addEventListener('click', () => choose(check, null))
    reveal.append(again)
    paint(check, memory.get(check.id))
  }

  /* Cyfry są wolne, bo litery, strzałki i Escape należą do aplikacji. */
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return
    const digit = Number(event.key)
    if (!digit || digit > 4) return
    const seen = (check) => {
      const { top, bottom } = check.getBoundingClientRect()
      return top < innerHeight - 84 && bottom > 0
    }
    const check = checks.find((item) => item.dataset.state === 'open' && seen(item))
    const option = check?.querySelectorAll('.check-opts li')[digit - 1]
    if (option) choose(check, option.dataset.opt)
  })

  function recap() {
    const line = document.getElementById('recap')
    if (!line) return
    const done = checks.filter((check) => check.dataset.state === 'done')
    if (done.length === 0) {
      line.textContent = ''
      return
    }
    // Liczymy tylko pytania z odpowiedzią; te bez niej nie są pomyłką, tylko czekają.
    const right = done.filter((check) => memory.get(check.id) === check.dataset.answer)
    const missed = done.filter((check) => !right.includes(check))
    const waiting = checks.filter((check) => !done.includes(check))
    line.textContent = TEXT.recap.replace('{right}', right.length).replace('{all}', done.length)
    const list = (label, items) => {
      if (items.length === 0) return
      line.append(` ${label} `)
      items.forEach((check, index) => {
        const link = document.createElement('a')
        link.href = `#${check.id}`
        link.textContent = check.dataset.title
        line.append(index > 0 ? ', ' : '', link)
      })
      line.append('.')
    }
    list(TEXT.revisit, missed)
    list(TEXT.waiting, waiting)
  }
  recap()

  /* Źródło pod ręką: najazd pokazuje wpis z bibliografii, kliknięcie przenosi do niego. */
  const pop = document.createElement('div')
  pop.className = 'pop'
  pop.hidden = true
  document.body.append(pop)
  let timer = 0
  let current = null

  function hide() {
    pop.hidden = true
    current?.classList.remove('on')
    current = null
  }

  function show(link) {
    const entry = document.getElementById(link.getAttribute('href').slice(1))
    if (!entry) return
    current?.classList.remove('on')
    current = link
    link.classList.add('on')
    pop.replaceChildren(...entry.cloneNode(true).childNodes)
    pop.hidden = false
    pop.scrollTop = 0
    const anchor = link.getBoundingClientRect()
    const box = pop.getBoundingClientRect()
    // Dok aplikacji zajmuje dół arkusza, więc podgląd nie schodzi niżej niż 92 px nad krawędź.
    const floor = innerHeight - 92
    const below = anchor.bottom + 8
    const top = below + box.height <= floor ? below : Math.max(12, anchor.top - box.height - 8)
    const left = Math.max(16, Math.min(anchor.left - 12, innerWidth - box.width - 16))
    pop.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  const later = (action, delay) => {
    clearTimeout(timer)
    timer = setTimeout(action, delay)
  }

  for (const link of document.querySelectorAll('.cite, .src a')) {
    link.addEventListener('mouseenter', () => later(() => show(link), 140))
    link.addEventListener('mouseleave', () => later(hide, 200))
    link.addEventListener('focus', () => show(link))
    link.addEventListener('blur', () => later(hide, 200))
    link.addEventListener('click', hide)
  }
  pop.addEventListener('mouseenter', () => clearTimeout(timer))
  pop.addEventListener('mouseleave', () => later(hide, 200))
  addEventListener('scroll', hide, { passive: true })
  addEventListener('beforeprint', () => {
    for (const details of document.querySelectorAll('details')) details.open = true
  })
})()
