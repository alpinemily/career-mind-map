// Career cards section DOM builder.
// Extracted from main.js so it can be unit-tested without D3 or CSS.
// Callbacks are passed in rather than imported to avoid circular dependencies.

export function createCareerCardsSection(careerIdeas, groups, opts = {}) {
  const {
    showToneSwitch = true,
    currentTone    = 'serious',
    onShare        = () => {},
    onSwitchTone   = () => {},
    onStartOver    = () => {},
  } = opts

  // Tear down any previous run
  document.getElementById('career-cards-section')?.remove()
  document.getElementById('scroll-arrow')?.remove()

  // Scroll hint arrow (only shown when the user hasn't scrolled yet)
  const arrow = document.createElement('div')
  arrow.id = 'scroll-arrow'
  arrow.innerHTML = `
    <span>Scroll to see your career ideas</span>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12l7 7 7-7"/>
    </svg>
  `
  document.getElementById('app').appendChild(arrow)

  // ── Section ──────────────────────────────────────────────────────────
  const section = document.createElement('div')
  section.id = 'career-cards-section'

  // Header: title only
  const headerRow = document.createElement('div')
  headerRow.className = 'career-section-header'

  const title = document.createElement('h2')
  title.textContent = 'Mind Map Career Ideas'
  if (currentTone === 'playful') {
    const badge = document.createElement('span')
    badge.className = 'tone-badge'
    badge.textContent = 'Playful'
    title.appendChild(badge)
  }
  headerRow.appendChild(title)

  section.appendChild(headerRow)

  // ── Career cards ─────────────────────────────────────────────────────
  const cardsContainer = document.createElement('div')
  cardsContainer.className = 'career-cards-container'

  careerIdeas.forEach(idea => {
    const card = document.createElement('div')
    card.className = 'career-card'

    const words = document.createElement('div')
    words.className = 'card-words'
    words.innerHTML = groups[idea.groupIndex].join('<span> + </span>')

    const titleEl = document.createElement('h3')
    titleEl.className = 'card-title'
    titleEl.textContent = idea.title || idea.idea

    const desc = document.createElement('p')
    desc.className = 'card-description'
    desc.textContent = idea.description || ''

    card.appendChild(words)
    card.appendChild(titleEl)
    if (idea.description) card.appendChild(desc)
    cardsContainer.appendChild(card)
  })

  section.appendChild(cardsContainer)

  // ── Action buttons ───────────────────────────────────────────────────
  const actionsDiv = document.createElement('div')
  actionsDiv.className = 'career-actions'

  // Share button — first in actions row (primary CTA after viewing results)
  const shareBtn = document.createElement('button')
  shareBtn.id = 'share-results-btn'
  const shareBtnLabel = 'Share results'
  shareBtn.textContent = shareBtnLabel
  shareBtn.dataset.label = shareBtnLabel
  shareBtn.addEventListener('click', onShare)
  actionsDiv.appendChild(shareBtn)

  // Switch tone button
  if (showToneSwitch) {
    const alternateTone = currentTone === 'serious' ? 'playful' : 'serious'
    const toneLabel     = alternateTone === 'playful' ? 'Playful' : 'Serious'
    const switchToneBtn = document.createElement('button')
    switchToneBtn.id = 'switch-tone-btn'
    switchToneBtn.textContent = `Try ${toneLabel} ideas instead`
    switchToneBtn.addEventListener('click', () => onSwitchTone(alternateTone))
    actionsDiv.appendChild(switchToneBtn)
  }

  const startOverBtn = document.createElement('button')
  startOverBtn.id = 'start-over-btn'
  startOverBtn.textContent = 'Start over'
  startOverBtn.addEventListener('click', onStartOver)
  actionsDiv.appendChild(startOverBtn)

  section.appendChild(actionsDiv)

  const existingNote = document.querySelector('.app-footnote')
  if (existingNote) {
    const note = existingNote.cloneNode(true)
    note.classList.add('app-footnote--inline')
    section.appendChild(note)
  }

  document.getElementById('app').appendChild(section)

  if (window.scrollY < 100) {
    setTimeout(() => arrow.classList.add('visible'), 300)
    const onScroll = () => {
      if (window.scrollY > 100) {
        arrow.classList.add('hidden')
        window.removeEventListener('scroll', onScroll)
      }
    }
    window.addEventListener('scroll', onScroll)
  }
}
