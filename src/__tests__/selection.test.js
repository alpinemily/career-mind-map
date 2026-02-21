import { describe, it, expect, beforeEach } from 'vitest'
import {
  state, MAX_MASHES,
  resetSelectionState, handleNodeClick, updateStagingText, finalizeMash, randomizeMash,
} from '../selection.js'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEl(id, label = id) {
  const el = document.createElement('g')
  el.setAttribute('data-id', id)
  el.setAttribute('data-label', label)
  return el
}

const CATEGORIES = ['engagement', 'energy', 'flow']

function makeTertiaryNode(id, categoryIndex = 0) {
  return {
    element: makeEl(id, `word-${id}`),
    data: { label: `word-${id}` },
    category: CATEGORIES[categoryIndex % CATEGORIES.length],
  }
}

// Builds a realistic set of nodes spread across all 3 categories
function makeNodesAcrossCategories(ids) {
  return ids.map((id, i) => makeTertiaryNode(id, i))
}

const SIDEBAR_HTML = `
  <div id="mash-list"></div>
  <div id="generate-section" class="hidden"></div>
  <div id="max-note" class="hidden"></div>
`

// ── state reset ───────────────────────────────────────────────────────────────

describe('resetSelectionState', () => {
  it('restores all state to defaults', () => {
    state.selectedNodes    = [{ id: 'x' }]
    state.mashGroups       = [['a', 'b', 'c']]
    state.allTertiaryNodes = [{}]
    state.currentStagingEl = document.createElement('div')
    state.selectedTone     = 'playful'

    resetSelectionState()

    expect(state.selectedNodes).toHaveLength(0)
    expect(state.mashGroups).toHaveLength(0)
    expect(state.allTertiaryNodes).toHaveLength(0)
    expect(state.currentStagingEl).toBeNull()
    expect(state.selectedTone).toBe('serious')
  })
})

// ── handleNodeClick ───────────────────────────────────────────────────────────

describe('handleNodeClick — selecting', () => {
  beforeEach(() => {
    resetSelectionState()
    document.body.innerHTML = SIDEBAR_HTML
  })

  it('adds a node to selectedNodes', () => {
    handleNodeClick(makeEl('a'), { label: 'alpha' })
    expect(state.selectedNodes).toHaveLength(1)
    expect(state.selectedNodes[0].label).toBe('alpha')
  })

  it('adds the "selected" CSS class to the element', () => {
    const el = makeEl('a')
    handleNodeClick(el, { label: 'alpha' })
    expect(el.classList.contains('selected')).toBe(true)
  })

  it('deselects a node when clicked again', () => {
    const el = makeEl('a')
    handleNodeClick(el, { label: 'alpha' })
    handleNodeClick(el, { label: 'alpha' })
    expect(state.selectedNodes).toHaveLength(0)
    expect(el.classList.contains('selected')).toBe(false)
  })

  it('ignores a 4th click when 3 are already selected (and not yet finalized)', () => {
    // Manually stuff state to simulate 3 already in without triggering finalize
    state.selectedNodes = ['b', 'c', 'd'].map(id => ({ id, label: id, element: makeEl(id) }))
    const el = makeEl('extra')
    handleNodeClick(el, { label: 'extra' })
    expect(state.selectedNodes).toHaveLength(3) // unchanged
    expect(el.classList.contains('selected')).toBe(false)
  })

  it('is blocked entirely when MAX_MASHES groups are already saved', () => {
    for (let i = 0; i < MAX_MASHES; i++) state.mashGroups.push(['x', 'y', 'z'])
    const el = makeEl('new')
    handleNodeClick(el, { label: 'new' })
    expect(state.selectedNodes).toHaveLength(0)
  })
})

// ── finalizeMash ──────────────────────────────────────────────────────────────

describe('finalizeMash', () => {
  beforeEach(() => {
    resetSelectionState()
    document.body.innerHTML = SIDEBAR_HTML
  })

  it('pushes selected node labels to mashGroups', () => {
    state.selectedNodes = ['a', 'b', 'c'].map(id => ({ id, label: id, element: makeEl(id) }))
    finalizeMash()
    expect(state.mashGroups).toHaveLength(1)
    expect(state.mashGroups[0]).toEqual(['a', 'b', 'c'])
  })

  it('clears selectedNodes after finalizing', () => {
    state.selectedNodes = ['a', 'b', 'c'].map(id => ({ id, label: id, element: makeEl(id) }))
    finalizeMash()
    expect(state.selectedNodes).toHaveLength(0)
  })

  it('removes the "selected" CSS class from each element', () => {
    const els = ['a', 'b', 'c'].map(id => makeEl(id))
    els.forEach(el => el.classList.add('selected'))
    state.selectedNodes = els.map((el, i) => ({ id: String(i), label: String(i), element: el }))
    finalizeMash()
    els.forEach(el => expect(el.classList.contains('selected')).toBe(false))
  })

  it('reveals the generate-section after the first mash', () => {
    state.selectedNodes = ['a', 'b', 'c'].map(id => ({ id, label: id, element: makeEl(id) }))
    finalizeMash()
    expect(document.getElementById('generate-section').classList.contains('hidden')).toBe(false)
  })

  it('reveals max-note exactly when MAX_MASHES is reached', () => {
    for (let i = 0; i < MAX_MASHES - 1; i++) state.mashGroups.push(['x', 'y', 'z'])
    state.selectedNodes = ['a', 'b', 'c'].map(id => ({ id, label: id, element: makeEl(id) }))
    finalizeMash()
    expect(document.getElementById('max-note').classList.contains('hidden')).toBe(false)
  })

  it('does NOT reveal max-note before MAX_MASHES is reached', () => {
    state.selectedNodes = ['a', 'b', 'c'].map(id => ({ id, label: id, element: makeEl(id) }))
    finalizeMash() // mashGroups.length is now 1
    expect(document.getElementById('max-note').classList.contains('hidden')).toBe(true)
  })
})

// ── full click-to-finalize flow ────────────────────────────────────────────

describe('handleNodeClick → auto-finalize after 3 selections', () => {
  beforeEach(() => {
    resetSelectionState()
    document.body.innerHTML = SIDEBAR_HTML
  })

  it('auto-finalizes when the 3rd node is clicked', () => {
    const els = ['x', 'y', 'z'].map(id => makeEl(id, id))
    els.forEach(el => handleNodeClick(el, { label: el.getAttribute('data-id') }))
    expect(state.mashGroups).toHaveLength(1)
    expect(state.selectedNodes).toHaveLength(0)
  })

  it('the 4th click starts a new group rather than extending the previous one', () => {
    ;['x', 'y', 'z', 'w'].forEach(id => handleNodeClick(makeEl(id, id), { label: id }))
    expect(state.mashGroups).toHaveLength(1)
    expect(state.selectedNodes).toHaveLength(1)
    expect(state.selectedNodes[0].label).toBe('w')
  })
})

// ── updateStagingText ─────────────────────────────────────────────────────────

describe('updateStagingText', () => {
  beforeEach(() => {
    resetSelectionState()
    document.body.innerHTML = '<div id="mash-list"></div>'
  })

  it('creates a staging row showing the selected label(s)', () => {
    state.selectedNodes = [{ label: 'rhythm', element: makeEl('r') }]
    updateStagingText()
    const list = document.getElementById('mash-list')
    expect(list.children).toHaveLength(1)
    expect(list.children[0].classList.contains('staging')).toBe(true)
    expect(list.children[0].textContent).toContain('rhythm')
  })

  it('removes the staging row when selection is cleared', () => {
    state.selectedNodes = [{ label: 'rhythm', element: makeEl('r') }]
    updateStagingText()
    state.selectedNodes = []
    updateStagingText()
    expect(document.getElementById('mash-list').children).toHaveLength(0)
  })

  it('updates the staging row text as more nodes are added', () => {
    state.selectedNodes = [{ label: 'rhythm', element: makeEl('r') }]
    updateStagingText()
    state.selectedNodes.push({ label: 'craft', element: makeEl('c') })
    updateStagingText()
    const text = document.getElementById('mash-list').children[0].textContent
    expect(text).toContain('rhythm')
    expect(text).toContain('craft')
  })
})

// ── randomizeMash ─────────────────────────────────────────────────────────────

describe('randomizeMash', () => {
  beforeEach(() => {
    resetSelectionState()
    document.body.innerHTML = SIDEBAR_HTML
  })

  it('does nothing when fewer than 3 tertiary nodes exist', () => {
    state.allTertiaryNodes = [makeTertiaryNode('a'), makeTertiaryNode('b')]
    randomizeMash()
    expect(state.mashGroups).toHaveLength(0)
  })

  it('does nothing when MAX_MASHES groups already exist', () => {
    for (let i = 0; i < MAX_MASHES; i++) state.mashGroups.push(['a', 'b', 'c'])
    state.allTertiaryNodes = makeNodesAcrossCategories(['a', 'b', 'c'])
    randomizeMash()
    expect(state.mashGroups).toHaveLength(MAX_MASHES) // unchanged
  })

  it('adds exactly one group of 3 labels', () => {
    state.allTertiaryNodes = makeNodesAcrossCategories(['a', 'b', 'c', 'd', 'e', 'f'])
    randomizeMash()
    expect(state.mashGroups).toHaveLength(1)
    expect(state.mashGroups[0]).toHaveLength(3)
  })

  it('picks one node from each category (no duplicates within the group)', () => {
    state.allTertiaryNodes = makeNodesAcrossCategories(['a', 'b', 'c', 'd', 'e', 'f'])
    randomizeMash()
    const pickedCategories = state.mashGroups[0].map((label) => {
      const node = state.allTertiaryNodes.find(n => n.data.label === label)
      return node?.category
    })
    expect(new Set(pickedCategories).size).toBe(3)
  })

  it('adds a .mash-group row to the sidebar list', () => {
    state.allTertiaryNodes = makeNodesAcrossCategories(['a', 'b', 'c'])
    randomizeMash()
    const list = document.getElementById('mash-list')
    expect(list.children).toHaveLength(1)
    expect(list.children[0].classList.contains('mash-group')).toBe(true)
  })

  it('reveals the generate section', () => {
    state.allTertiaryNodes = makeNodesAcrossCategories(['a', 'b', 'c'])
    randomizeMash()
    expect(document.getElementById('generate-section').classList.contains('hidden')).toBe(false)
  })

  it('applies the random-highlight class to the 3 picked nodes', () => {
    state.allTertiaryNodes = makeNodesAcrossCategories(['a', 'b', 'c'])
    const picked = randomizeMash()
    expect(picked).toHaveLength(3)
    picked.forEach(n => expect(n.element.classList.contains('random-highlight')).toBe(true))
  })

  it('clears any existing manual selection before randomizing', () => {
    const existingEl = makeEl('existing')
    existingEl.classList.add('selected')
    state.selectedNodes = [{ id: 'existing', label: 'old', element: existingEl }]
    state.allTertiaryNodes = makeNodesAcrossCategories(['a', 'b', 'c'])
    randomizeMash()
    expect(state.selectedNodes).toHaveLength(0)
    expect(existingEl.classList.contains('selected')).toBe(false)
  })
})
