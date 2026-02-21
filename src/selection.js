// Selection state and mash-group logic.
// Extracted from main.js so it can be unit-tested without D3 or CSS.
// D3's classed() helpers have been replaced with native classList equivalents.

export const MAX_MASHES = 8

export const state = {
  selectedNodes:   [],   // nodes currently being staged into a group
  mashGroups:      [],   // finalised groups of 3 words
  allTertiaryNodes: [],  // every clickable leaf node in the mind map
  currentStagingEl: null, // the in-progress staging row in the sidebar
  selectedTone:    'serious',
}

export function resetSelectionState() {
  state.selectedNodes    = []
  state.mashGroups       = []
  state.allTertiaryNodes = []
  state.currentStagingEl = null
  state.selectedTone     = 'serious'
}

// Update the live "staging" row in the sidebar as the user selects nodes
export function updateStagingText() {
  const listEl = document.getElementById('mash-list')
  if (!listEl) return

  if (state.selectedNodes.length === 0) {
    if (state.currentStagingEl) {
      state.currentStagingEl.remove()
      state.currentStagingEl = null
    }
    return
  }

  if (!state.currentStagingEl) {
    state.currentStagingEl = document.createElement('div')
    state.currentStagingEl.className = 'mash-group staging'
    listEl.appendChild(state.currentStagingEl)
  }

  const labels = state.selectedNodes.map(n => n.label)
  state.currentStagingEl.innerHTML = labels.join('<span> + </span>')
}

// Lock in the current 3-node selection as a completed mash group
export function finalizeMash(clearDelay = 0) {
  const labels = state.selectedNodes.map(n => n.label)
  state.mashGroups.push(labels)

  // Promote staging row to a permanent entry, storing labels for hover lookup
  if (state.currentStagingEl) {
    state.currentStagingEl.classList.remove('staging')
    state.currentStagingEl.dataset.labels = labels.join(',')
    state.currentStagingEl = null
  }

  if (state.mashGroups.length >= 1) {
    document.getElementById('generate-section')?.classList.remove('hidden')
  }
  if (state.mashGroups.length >= MAX_MASHES) {
    document.getElementById('max-note')?.classList.remove('hidden')
    const randomizeBtn = document.getElementById('randomize-btn')
    if (randomizeBtn) randomizeBtn.disabled = true
  }

  // Clear state immediately so new selections can begin,
  // but delay removing the visual highlight to match the ripple duration
  const nodesToClear = state.selectedNodes.slice()
  state.selectedNodes = []
  const clearFn = () => nodesToClear.forEach(n => n.element.classList.remove('selected'))
  if (clearDelay > 0) setTimeout(clearFn, clearDelay)
  else clearFn()
}

// Handle a click on a tertiary (leaf) node — toggles selection
export function handleNodeClick(element, data, finalizeDelay = 0) {
  if (state.mashGroups.length >= MAX_MASHES) return

  const nodeId    = element.getAttribute('data-id')
  const isSelected = state.selectedNodes.find(n => n.id === nodeId)

  if (isSelected) {
    state.selectedNodes = state.selectedNodes.filter(n => n.id !== nodeId)
    element.classList.remove('selected')
    updateStagingText()
  } else if (state.selectedNodes.length < 3) {
    state.selectedNodes.push({ id: nodeId, label: data.label, element })
    element.classList.add('selected')
    updateStagingText()
    if (state.selectedNodes.length === 3) finalizeMash(finalizeDelay)
  }
}

// Pick 3 random tertiary nodes and add them as a mash group
export function randomizeMash() {
  if (state.mashGroups.length >= MAX_MASHES) return
  if (state.allTertiaryNodes.length < 3) return

  // Clear any in-progress manual selection first
  state.selectedNodes.forEach(n => n.element.classList.remove('selected'))
  if (state.currentStagingEl) {
    state.currentStagingEl.remove()
    state.currentStagingEl = null
  }
  state.selectedNodes = []

  // Group nodes by category, then pick one random node from each category
  const byCategory = {}
  state.allTertiaryNodes.forEach(n => {
    const cat = n.category ?? 'default'
    if (!byCategory[cat]) byCategory[cat] = []
    byCategory[cat].push(n)
  })
  const categories = Object.keys(byCategory)
  if (categories.length < 3) {
    // Fallback: fewer than 3 categories (e.g. in tests) — pick randomly
    const shuffled = [...state.allTertiaryNodes].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, 3)
  }
  const picked = categories.slice(0, 3).map(cat => {
    const nodes = byCategory[cat]
    return nodes[Math.floor(Math.random() * nodes.length)]
  })

  picked.forEach(node => node.element.classList.add('random-highlight'))
  setTimeout(() => {
    picked.forEach(node => node.element.classList.remove('random-highlight'))
  }, 1500)

  const labels = picked.map(n => n.data.label)
  state.mashGroups.push(labels)

  const listEl = document.getElementById('mash-list')
  if (listEl) {
    const groupEl = document.createElement('div')
    groupEl.className = 'mash-group'
    groupEl.dataset.labels = labels.join(',')
    groupEl.innerHTML = labels.join('<span> + </span>')
    listEl.appendChild(groupEl)
  }

  if (state.mashGroups.length >= 1) {
    document.getElementById('generate-section')?.classList.remove('hidden')
  }
  if (state.mashGroups.length >= MAX_MASHES) {
    document.getElementById('max-note')?.classList.remove('hidden')
  }

  return picked
}
