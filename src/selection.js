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
export function finalizeMash() {
  const labels = state.selectedNodes.map(n => n.label)
  state.mashGroups.push(labels)

  // Promote staging row to a permanent entry
  if (state.currentStagingEl) {
    state.currentStagingEl.classList.remove('staging')
    state.currentStagingEl = null
  }

  if (state.mashGroups.length >= 1) {
    document.getElementById('generate-section')?.classList.remove('hidden')
  }
  if (state.mashGroups.length >= MAX_MASHES) {
    document.getElementById('max-note')?.classList.remove('hidden')
  }

  // Clear visual selection on every node that was part of this group
  state.selectedNodes.forEach(n => n.element.classList.remove('selected'))
  state.selectedNodes = []
}

// Handle a click on a tertiary (leaf) node — toggles selection
export function handleNodeClick(element, data) {
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
    if (state.selectedNodes.length === 3) finalizeMash()
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

  const shuffled = [...state.allTertiaryNodes].sort(() => Math.random() - 0.5)
  const picked   = shuffled.slice(0, 3)

  picked.forEach(node => node.element.classList.add('random-highlight'))

  const labels = picked.map(n => n.data.label)
  state.mashGroups.push(labels)

  const listEl = document.getElementById('mash-list')
  if (listEl) {
    const groupEl = document.createElement('div')
    groupEl.className = 'mash-group'
    groupEl.innerHTML = labels.join('<span> + </span>')
    listEl.appendChild(groupEl)
  }

  if (state.mashGroups.length >= 1) {
    document.getElementById('generate-section')?.classList.remove('hidden')
  }
  if (state.mashGroups.length >= MAX_MASHES) {
    document.getElementById('max-note')?.classList.remove('hidden')
  }

  setTimeout(() => {
    picked.forEach(node => node.element.classList.remove('random-highlight'))
  }, 5000)
}
