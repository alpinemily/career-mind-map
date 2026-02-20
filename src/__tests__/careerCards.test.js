import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createCareerCardsSection } from '../careers.js'

// ── fixtures ──────────────────────────────────────────────────────────────────

const GROUPS = [
  ['rhythm', 'craft', 'impact'],
  ['data',   'teach', 'nature'],
  ['code',   'story', 'flow'],
]

const IDEAS = [
  { groupIndex: 0, title: 'Movement Studio Director',   description: 'Run a creative studio.' },
  { groupIndex: 1, title: 'Behavioural Data Coach',     description: 'Use data to coach teams.' },
  { groupIndex: 2, title: 'Narrative Systems Designer', description: 'Design story systems.' },
]

function setup(ideas = IDEAS, groups = GROUPS, opts = {}) {
  document.body.innerHTML = '<div id="app"></div>'
  createCareerCardsSection(ideas, groups, opts)
}

// ── section presence ──────────────────────────────────────────────────────────

describe('career cards section — presence', () => {
  beforeEach(() => setup())

  it('creates a #career-cards-section element', () => {
    expect(document.getElementById('career-cards-section')).not.toBeNull()
  })

  it('appends the section to #app', () => {
    const app = document.getElementById('app')
    expect(app.contains(document.getElementById('career-cards-section'))).toBe(true)
  })

  it('replaces an existing section rather than duplicating it', () => {
    setup() // call again
    expect(document.querySelectorAll('#career-cards-section')).toHaveLength(1)
  })
})

// ── header row ────────────────────────────────────────────────────────────────

describe('career cards section — header', () => {
  beforeEach(() => setup())

  it('contains an h2 with the text "Your Career Ideas"', () => {
    const h2 = document.querySelector('#career-cards-section h2')
    expect(h2).not.toBeNull()
    expect(h2.textContent).toBe('Your Career Ideas')
  })

  it('contains the share button (#share-results-btn)', () => {
    expect(document.getElementById('share-results-btn')).not.toBeNull()
  })

  it('places title and share button inside a .career-section-header row', () => {
    const header = document.querySelector('.career-section-header')
    expect(header).not.toBeNull()
    expect(header.contains(document.querySelector('h2'))).toBe(true)
    expect(header.contains(document.getElementById('share-results-btn'))).toBe(true)
  })

  it('calls onShare when the share button is clicked', () => {
    const onShare = vi.fn()
    setup(IDEAS, GROUPS, { onShare })
    document.getElementById('share-results-btn').click()
    expect(onShare).toHaveBeenCalledOnce()
  })
})

// ── career cards ──────────────────────────────────────────────────────────────

describe('career cards section — cards', () => {
  beforeEach(() => setup())

  it('renders exactly as many cards as career ideas', () => {
    expect(document.querySelectorAll('.career-card')).toHaveLength(IDEAS.length)
  })

  it('each card displays the word group for its groupIndex', () => {
    const cards = document.querySelectorAll('.career-card')
    cards.forEach((card, i) => {
      const words = card.querySelector('.card-words').textContent
      GROUPS[IDEAS[i].groupIndex].forEach(word => expect(words).toContain(word))
    })
  })

  it('each card displays the career title', () => {
    const cards = document.querySelectorAll('.career-card')
    cards.forEach((card, i) => {
      expect(card.querySelector('.card-title').textContent).toBe(IDEAS[i].title)
    })
  })

  it('each card displays the description', () => {
    const cards = document.querySelectorAll('.career-card')
    cards.forEach((card, i) => {
      expect(card.querySelector('.card-description').textContent).toBe(IDEAS[i].description)
    })
  })

  it('renders the correct number of cards for a single idea', () => {
    setup([IDEAS[0]], GROUPS)
    expect(document.querySelectorAll('.career-card')).toHaveLength(1)
  })
})

// ── tone switch button ────────────────────────────────────────────────────────

describe('career cards section — tone switch button', () => {
  it('is present by default (showToneSwitch not specified)', () => {
    setup(IDEAS, GROUPS, { currentTone: 'serious' })
    expect(document.getElementById('switch-tone-btn')).not.toBeNull()
  })

  it('reads "Try Playful ideas instead" when currentTone is serious', () => {
    setup(IDEAS, GROUPS, { currentTone: 'serious' })
    expect(document.getElementById('switch-tone-btn').textContent).toBe('Try Playful ideas instead')
  })

  it('reads "Try Serious ideas instead" when currentTone is playful', () => {
    setup(IDEAS, GROUPS, { currentTone: 'playful' })
    expect(document.getElementById('switch-tone-btn').textContent).toBe('Try Serious ideas instead')
  })

  it('is absent when showToneSwitch is false', () => {
    setup(IDEAS, GROUPS, { showToneSwitch: false })
    expect(document.getElementById('switch-tone-btn')).toBeNull()
  })

  it('calls onSwitchTone with the alternate tone when clicked', () => {
    const onSwitchTone = vi.fn()
    setup(IDEAS, GROUPS, { currentTone: 'serious', onSwitchTone })
    document.getElementById('switch-tone-btn').click()
    expect(onSwitchTone).toHaveBeenCalledWith('playful')
  })

  it('calls onSwitchTone with "serious" when currentTone is playful', () => {
    const onSwitchTone = vi.fn()
    setup(IDEAS, GROUPS, { currentTone: 'playful', onSwitchTone })
    document.getElementById('switch-tone-btn').click()
    expect(onSwitchTone).toHaveBeenCalledWith('serious')
  })
})

// ── start over button ─────────────────────────────────────────────────────────

describe('career cards section — start over button', () => {
  it('is always present regardless of showToneSwitch', () => {
    setup(IDEAS, GROUPS, { showToneSwitch: true })
    expect(document.getElementById('start-over-btn')).not.toBeNull()

    setup(IDEAS, GROUPS, { showToneSwitch: false })
    expect(document.getElementById('start-over-btn')).not.toBeNull()
  })

  it('calls onStartOver when clicked', () => {
    const onStartOver = vi.fn()
    setup(IDEAS, GROUPS, { onStartOver })
    document.getElementById('start-over-btn').click()
    expect(onStartOver).toHaveBeenCalledOnce()
  })
})

// ── scroll arrow ──────────────────────────────────────────────────────────────

describe('career cards section — scroll arrow', () => {
  it('creates a #scroll-arrow element', () => {
    setup()
    expect(document.getElementById('scroll-arrow')).not.toBeNull()
  })

  it('replaces an existing scroll arrow rather than duplicating it', () => {
    setup()
    setup()
    expect(document.querySelectorAll('#scroll-arrow')).toHaveLength(1)
  })
})
