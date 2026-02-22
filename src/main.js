import './style.css'
import * as d3 from 'd3'
import { MOCK_ASSOCIATIONS, getMockCareerIdeas } from './mockData.js'
import { state, resetSelectionState, handleNodeClick, updateStagingText, finalizeMash, randomizeMash, MAX_MASHES } from './selection.js'
import { createCareerCardsSection } from './careers.js'
import { callClaudeAssociations, callClaudeCareers, callClaudeDirect, parseClaudeJSON, RATE_LIMIT_MESSAGE, callLogShare } from './apiClient.js'
import { updateGenerateBtn } from './formValidation.js'
import { parseCompactAssociations } from './parseAssociations.js'

// Dev mode: add ?dev to the URL to skip all API calls and use mock data
const DEV_MODE      = new URLSearchParams(window.location.search).has('dev')
// Staging mode: add ?staging to use a UI-entered API key and call Claude directly
const STAGING_MODE  = new URLSearchParams(window.location.search).has('staging')
// Rate-limit preview: add ?spiral to immediately show the spiral animation
const SPIRAL_VIEW_MODE = new URLSearchParams(window.location.search).has('spiral')

// Career ideas keyed by tone ('serious' / 'playful') — avoids a second API call when
// the user toggles between tones after both have been generated once.
const careerCache = {}

// Original form keywords — stored at submission time so they can be included in
// career-generation and share-click logs without re-reading the (by then hidden) inputs.
let sessionKeywords = { engagement: '', energy: '', flow: '' }

function getStagingApiKey() {
  const key = document.getElementById('staging-api-key')?.value.trim()
  if (!key) throw new Error('Please enter your Claude API key to use staging mode')
  return key
}

function triggerRipple(element, multi = false) {
  element.classList.remove('ripple', 'ripple-multi')
  void element.getBoundingClientRect() // force reflow so animation restarts
  element.classList.add(multi ? 'ripple-multi' : 'ripple')
}

function setButtonLoading(btn, label) {
  btn.disabled = true
  btn.innerHTML = `${label} <span class="btn-dots"><span></span><span></span><span></span></span>`
}

function clearButtonLoading(btn, label) {
  btn.disabled = false
  btn.textContent = label
}

function showErrorBar(message) {
  let bar = document.getElementById('error-bar')
  if (!bar) {
    bar = document.createElement('div')
    bar.id = 'error-bar'
    document.body.prepend(bar)
  }
  bar.innerHTML = `<span>${message}</span><button id="error-bar-close" aria-label="Dismiss">&times;</button>`
  bar.classList.add('visible')
  const dismiss = () => bar.classList.remove('visible')
  document.getElementById('error-bar-close').addEventListener('click', dismiss)
}


// Get all associations
async function getAllAssociations(engagement, energy, flow) {
  const prompt = `Word-associate 3 career mind map keyphrases. Per keyphrase: 7 words, each with 3 sub-words. Be creative and lateral — go beyond the obvious, but the connection should still be immediately understandable to a human (no abstract leaps).
ENGAGEMENT: "${engagement}"
ENERGY: "${energy}"
FLOW: "${flow}"

JSON only — ordered array [engagement,energy,flow], each: [[word,s1,s2,s3],…×7]`

  const response = STAGING_MODE
    ? await callClaudeDirect(getStagingApiKey(), prompt)
    : await callClaudeAssociations(prompt)
  return parseCompactAssociations(parseClaudeJSON(response), { engagement, energy, flow })
}

// Color palette
const colorPalette = [
  '#646cff',
  '#f093fb', '#f5576c', '#4facfe', '#43e97b',
  '#fa709a', '#fee140', '#30cfd0'
]


// Build simple radial mind map for one category
function buildCategoryMap(categoryData, centerX, centerY, primaryRadius, secondaryRadius) {
  const nodes = []
  const links = []

  // Center node
  nodes.push({
    id: 'center',
    label: categoryData.keyword,
    level: 0,
    group: 0,
    color: colorPalette[0],
    x: centerX,
    y: centerY
  })

  categoryData.associations.forEach((item, i) => {
    const angle = (i / 7) * Math.PI * 2 - Math.PI / 2
    const groupColor = colorPalette[(i % 7) + 1]

    // Vary primary distance slightly
    const pDist = primaryRadius + (Math.random() - 0.5) * 30
    const px = centerX + Math.cos(angle) * pDist
    const py = centerY + Math.sin(angle) * pDist

    nodes.push({
      id: `p-${i}`,
      label: item.word,
      level: 1,
      group: i + 1,
      color: groupColor,
      x: px,
      y: py
    })

    links.push({ source: 'center', target: `p-${i}`, color: groupColor })

    // Secondary nodes
    item.secondary.forEach((word, j) => {
      const secAngle = angle + (j - 1) * 0.65
      const sDist = secondaryRadius + (Math.random() - 0.5) * 10
      const sx = px + Math.cos(secAngle) * sDist
      const sy = py + Math.sin(secAngle) * sDist

      nodes.push({
        id: `s-${i}-${j}`,
        label: word,
        level: 2,
        group: i + 1,
        color: groupColor,
        x: sx,
        y: sy
      })

      links.push({ source: `p-${i}`, target: `s-${i}-${j}`, color: groupColor })
    })
  })

  return { nodes, links }
}

// Generate curved path with slight S-curve
function curvePath(x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const dist = Math.sqrt(dx * dx + dy * dy) || 1

  const perpX = -dy / dist
  const perpY = dx / dist
  const curve = dist * 0.12 * (Math.random() > 0.5 ? 1 : -1)

  const cp1x = x1 + dx * 0.3 + perpX * curve
  const cp1y = y1 + dy * 0.3 + perpY * curve
  const cp2x = x1 + dx * 0.7 - perpX * curve
  const cp2y = y1 + dy * 0.7 - perpY * curve

  return `M ${x1} ${y1} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${x2} ${y2}`
}

// Main render
function renderMindMap(data) {
  const container = document.getElementById('mindmap-container')
  container.innerHTML = ''

  // Reset selection state
  state.selectedNodes    = []
  state.allTertiaryNodes = []

  const categories  = ['engagement', 'energy', 'flow']
  // True when the viewport is taller than it is wide (i.e. portrait orientation — phones)
  const isMobileOrPortraitViewport = window.innerWidth < window.innerHeight

  let svg, mainGroup

  // ── Tweak these two values to adjust the mind map layout ──────────────────
  const BASE_PRIMARY_RADIUS   = 88   // center → primary node distance
  const BASE_SECONDARY_RADIUS = 88  // primary → tertiary node distance
  // ──────────────────────────────────────────────────────────────────────────

  // Max extent a node can reach from center (used to scale down on tiny screens)
  const BASE_MAX_EXTENT = (BASE_PRIMARY_RADIUS + 15) + (BASE_SECONDARY_RADIUS + 5)

  if (isMobileOrPortraitViewport) {
    // Mobile: 3 maps in a horizontally scrollable row.
    // Radii scale to fit the viewport width, then section width is fitted tightly to the
    // content — so maps aren't spaced by viewport width (which causes huge gaps on larger phones).
    const viewportWidth   = window.innerWidth
    const radiiScale      = Math.min(1, (viewportWidth / 2 - 20) / BASE_MAX_EXTENT)
    const primaryRadius   = Math.round(BASE_PRIMARY_RADIUS   * radiiScale)
    const secondaryRadius = Math.round(BASE_SECONDARY_RADIUS * radiiScale)

    // Content extent = farthest a node can land from the center
    const maxExtent  = (primaryRadius + 15) + (secondaryRadius + 5)
    // Section width snugly wraps the content (15px padding each side)
    const sectionWidth = Math.round(maxExtent * 2 + 30)
    const svgWidth     = sectionWidth * 3
    const svgHeight    = Math.round(maxExtent * 2 + 40)
    const centerX      = sectionWidth / 2
    const centerY      = svgHeight / 2

    svg = d3.select(container)
      .append('svg')
      .attr('width', svgWidth)
      .attr('height', svgHeight)
      .attr('id', 'mindmap-svg')

    mainGroup = svg.append('g').attr('class', 'main-group')

    categories.forEach((cat, i) => {
      const mapData = buildCategoryMap(data[cat], centerX, centerY, primaryRadius, secondaryRadius)
      renderCategoryInGroup(mainGroup, mapData, i * sectionWidth, cat, 0)
    })

    // Scroll hint — fades in after maps appear, dismisses on first scroll or after 4s
    const hint = document.createElement('div')
    hint.id = 'mindmap-scroll-hint'
    hint.textContent = '← scroll to see all 3 mind maps →'
    hint.style.top = `${Math.round(svgHeight - 52)}px`
    document.body.appendChild(hint)

    let hintDismissed = false
    const dismissHint = () => {
      if (hintDismissed) return
      hintDismissed = true
      hint.classList.remove('visible')
      setTimeout(() => hint.remove(), 500)
      container.removeEventListener('scroll', dismissHint)
    }
    setTimeout(() => hint.classList.add('visible'), 900)
    container.addEventListener('scroll', dismissHint, { passive: true })
    setTimeout(dismissHint, 4000)
  } else {
    // Desktop/landscape: 3 maps side by side, sidebar fixed on the right
    const sidebarWidth   = Math.min(280, Math.max(180, window.innerWidth * 0.15))
    const availableWidth = window.innerWidth - sidebarWidth
    const height         = window.innerHeight - 70
    const sectionWidth   = availableWidth / 3
    const verticalCenter = height / 2

    // Scale radii down only if the section is too narrow to fit the base layout
    const radiiScale      = Math.min(1, (sectionWidth / 2 - 8) / BASE_MAX_EXTENT)
    const primaryRadius   = Math.round(BASE_PRIMARY_RADIUS   * radiiScale)
    const secondaryRadius = Math.round(BASE_SECONDARY_RADIUS * radiiScale)

    svg = d3.select(container)
      .append('svg')
      .attr('width', availableWidth)
      .attr('height', height)
      .attr('id', 'mindmap-svg')

    mainGroup = svg.append('g').attr('class', 'main-group')

    categories.forEach((cat, i) => {
      const mapData = buildCategoryMap(data[cat], sectionWidth / 2, verticalCenter, primaryRadius, secondaryRadius)
      renderCategoryInGroup(mainGroup, mapData, i * sectionWidth, cat, 0)
    })
  }

  // Show sidebar
  document.getElementById('mash-sidebar').classList.remove('hidden')

  // Show instruction text
  document.getElementById('instruction-text').classList.remove('hidden')
}

// Render category into a group (for animation support)
function renderCategoryInGroup(parentG, data, offsetX, categoryName, offsetY = 0) {
  const g = parentG.append('g').attr('transform', `translate(${offsetX}, ${offsetY})`)

  // Links
  g.selectAll('.link')
    .data(data.links)
    .enter()
    .append('path')
    .attr('d', d => {
      const src = data.nodes.find(n => n.id === d.source)
      const tgt = data.nodes.find(n => n.id === d.target)
      return curvePath(src.x, src.y, tgt.x, tgt.y)
    })
    .attr('stroke', d => d.color)
    .attr('stroke-width', 1.5)
    .attr('stroke-opacity', 0.4)
    .attr('fill', 'none')

  // Nodes
  const node = g.selectAll('.node')
    .data(data.nodes)
    .enter()
    .append('g')
    .attr('class', d => d.level === 2 ? 'tertiary-node' : '')
    .attr('transform', d => `translate(${d.x}, ${d.y})`)
    .attr('data-label', d => d.label)
    .attr('data-category', categoryName)
    .attr('data-id', d => `${categoryName}-${d.id}`)

  node.append('circle')
    .attr('r', d => d.level === 0 ? 26 : d.level === 1 ? 20 : 26)
    .attr('fill', d => d.color)
    .attr('opacity', 0.85)

  node.append('text')
    .attr('font-size', d => d.level === 0 ? '9px' : d.level === 1 ? '8px' : '9px')
    .attr('font-weight', d => d.level === 0 ? 'bold' : 'normal')
    .attr('fill', 'white')
    .attr('text-anchor', 'middle')
    .style('pointer-events', d => d.level === 2 ? 'all' : 'none')
    .each(function(d) {
      const sel = d3.select(this)
      if (d.level === 0 && d.label.length > 20) {
        const mid = Math.floor(d.label.length / 2)
        let split = d.label.lastIndexOf(' ', mid)
        if (split === -1) split = d.label.indexOf(' ', mid)
        if (split === -1) {
          sel.append('tspan').attr('x', 0).attr('dy', 4).text(d.label)
        } else {
          sel.append('tspan').attr('x', 0).attr('dy', -2).text(d.label.slice(0, split))
          sel.append('tspan').attr('x', 0).attr('dy', 11).text(d.label.slice(split + 1))
        }
      } else {
        sel.append('tspan').attr('x', 0).attr('dy', 4).text(d.label)
      }
    })

  // Ripple circle for tertiary nodes (sits on top, animated via CSS)
  node.filter(d => d.level === 2)
    .append('circle')
    .attr('r', 26)
    .attr('class', 'node-ripple')

  // Add click handlers for tertiary nodes
  node.filter(d => d.level === 2)
    .style('cursor', 'pointer')
    .on('click', function(event, d) {
      event.stopPropagation()
      handleNodeClick(this, d, 1500)
      if (state.mashGroups.length < MAX_MASHES) triggerRipple(this)
    })

  // Store references to tertiary nodes
  node.filter(d => d.level === 2).each(function(d) {
    state.allTertiaryNodes.push({
      element: this,
      data: d,
      offsetX: offsetX,
      category: categoryName
    })
  })
}


// Build career prompt for a given tone and groupings text
function buildCareerPrompt(tone, groupingsText) {
  if (tone === 'playful') {
    return `Wildly creative career counselor. Given word groups, generate fun unexpected careers that playfully combine all 3 words. Think quirky and delightful (e.g. "Pirate Surf Camp for Kids" from pirates+sports+kids).

${groupingsText}

JSON only — array in order, one per group: [{"t":"Fun Title","d":"Whimsical sentence."},…]`
  } else {
    return `Creative career counselor. Given word groups, generate real implementable careers INSPIRED by (not literally combining) the words. No whimsical or impossible ideas — actual jobs or businesses someone could pursue.

${groupingsText}

JSON only — array in order, one per group: [{"t":"Short Title","d":"One sentence of what you'd actually do."},…]`
  }
}

// Generate career ideas from Claude API
async function generateCareerIdeas() {
  if (state.mashGroups.length === 0) return

  const btn = document.getElementById('generate-careers-btn')
  setButtonLoading(btn, 'Generating')

  try {
    let careerIdeas
    if (DEV_MODE) {
      await new Promise(r => setTimeout(r, 600))
      careerIdeas = getMockCareerIdeas(state.mashGroups, state.selectedTone)
    } else {
      const groupingsText = state.mashGroups.map((group, i) =>
        `${i + 1}. ${group.join(', ')}`
      ).join('\n')
      const prompt = buildCareerPrompt(state.selectedTone, groupingsText)
      const meta   = { ...sessionKeywords, tone: state.selectedTone }
      const response = STAGING_MODE
        ? await callClaudeDirect(getStagingApiKey(), prompt)
        : await callClaudeCareers(prompt, meta)
      careerIdeas = parseClaudeJSON(response).map((idea, i) => ({
        groupIndex: i, title: idea.t, description: idea.d,
      }))
    }

    careerCache[state.selectedTone] = careerIdeas

    createCareerCardsSection(careerIdeas, state.mashGroups, {
      currentTone:  state.selectedTone,
      onShare:      shareResults,
      onSwitchTone: (tone) => regenerateWithAlternateTone(tone, state.mashGroups),
      onStartOver:  startOver,
    })

    // Desktop: clip the mindmap container so there's exactly 40px between the
    // bottom of the rendered nodes and the scroll arrow (the SVG is full viewport
    // height but the nodes only occupy the middle portion of it).
    if (window.innerWidth >= window.innerHeight) {
      const svgEl = document.getElementById('mindmap-svg')
      const grpEl = svgEl?.querySelector('.main-group')
      const mcEl  = document.getElementById('mindmap-container')
      if (svgEl && grpEl && mcEl) {
        const bbox     = grpEl.getBBox()
        const clippedH = Math.round(bbox.y + bbox.height + 40)
        svgEl.style.height = `${parseFloat(svgEl.getAttribute('height'))}px`
        mcEl.style.height   = `${clippedH}px`
        mcEl.style.overflow = 'hidden'
      }
    }

    // Hide the entire sidebar
    document.getElementById('mash-sidebar').classList.add('hidden')

    // Fade out instruction text and keyword pills
    const keywordsDisplay = document.getElementById('keywords-display')
    if (keywordsDisplay) {
      keywordsDisplay.style.transition = 'opacity 0.5s ease-out'
      keywordsDisplay.style.opacity = '0'
      setTimeout(() => {
        // Clear pill text so the elements aren't sitting invisible with stale content
        ;['display-engagement', 'display-energy', 'display-flow'].forEach(id => {
          document.getElementById(id).textContent = ''
        })
      }, 500)
    }

    // Animate mindmap to center now that sidebar is gone (desktop only — on portrait
    // the sidebar sits below the maps in document flow, so no horizontal shift needed)
    if (window.innerWidth >= window.innerHeight) { // desktop/landscape only
      const container = document.getElementById('mindmap-container')
      const svg = container.querySelector('svg')
      if (svg) {
        const sidebarWidth = Math.min(280, Math.max(180, window.innerWidth * 0.15))
        const shiftX = sidebarWidth / 2

        const mainGroup = svg.querySelector('.main-group')
        if (mainGroup) {
          mainGroup.style.transition = 'transform 0.6s ease-out'
          mainGroup.setAttribute('transform', `translate(${shiftX}, 0)`)
        }

        svg.style.transition = 'width 0.6s ease-out'
        svg.setAttribute('width', window.innerWidth)
      }
    }

  } catch (error) {
    console.error(error)
    showErrorBar(error.message)
    clearButtonLoading(btn, 'Generate career ideas')
  }
}

// Fade out and reset the app to step 1 (reused by both start-over button and resetApp)
function startOver() {
  document.body.style.transition = 'opacity 0.4s ease-out'
  document.body.style.opacity = '0'
  setTimeout(resetApp, 400) // wait for fade-out to finish, then reset while invisible
}

// Switch to the alternate tone — uses cached ideas if available, otherwise calls Claude.
async function regenerateWithAlternateTone(alternateTone, groups) {
  const btn = document.getElementById('switch-tone-btn')

  if (careerCache[alternateTone]) {
    // Already generated — show instantly from cache, no API call needed
    state.selectedTone = alternateTone
    createCareerCardsSection(careerCache[alternateTone], groups, {
      currentTone:  alternateTone,
      onShare:      shareResults,
      onSwitchTone: (tone) => regenerateWithAlternateTone(tone, groups),
      onStartOver:  startOver,
    })
    document.getElementById('career-cards-section')?.scrollIntoView({ behavior: 'smooth' })
    return
  }

  if (btn) setButtonLoading(btn, 'Generating')

  try {
    let careerIdeas
    if (DEV_MODE) {
      await new Promise(r => setTimeout(r, 600))
      careerIdeas = getMockCareerIdeas(groups, alternateTone)
    } else {
      const groupingsText = groups.map((group, i) =>
        `${i + 1}. ${group.join(', ')}`
      ).join('\n')
      const prompt = buildCareerPrompt(alternateTone, groupingsText)
      const meta   = { ...sessionKeywords, tone: alternateTone }
      const response = STAGING_MODE
        ? await callClaudeDirect(getStagingApiKey(), prompt)
        : await callClaudeCareers(prompt, meta)
      careerIdeas = parseClaudeJSON(response).map((idea, i) => ({
        groupIndex: i, title: idea.t, description: idea.d,
      }))
    }

    careerCache[alternateTone] = careerIdeas
    state.selectedTone = alternateTone
    createCareerCardsSection(careerIdeas, groups, {
      currentTone:  alternateTone,
      onShare:      shareResults,
      onSwitchTone: (tone) => regenerateWithAlternateTone(tone, groups),
      onStartOver:  startOver,
    })

    document.getElementById('career-cards-section')?.scrollIntoView({ behavior: 'smooth' })
  } catch (error) {
    console.error(error)
    showErrorBar(error.message)
    if (btn) {
      const label = alternateTone === 'playful' ? 'Playful' : 'Serious'
      clearButtonLoading(btn, `Try ${label} ideas instead`)
    }
  }
}

// Share results as image
async function shareResults() {
  // Log the share click immediately — fire-and-forget, never blocks the flow
  if (!DEV_MODE && !STAGING_MODE) {
    callLogShare(sessionKeywords.engagement, sessionKeywords.energy, sessionKeywords.flow, state.selectedTone)
  }

  const btn = document.getElementById('share-results-btn')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Generating image...'
  }

  try {
    // Load html2canvas if not already loaded
    if (!window.html2canvas) {
      const script = document.createElement('script')
      script.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js'
      document.head.appendChild(script)
      await new Promise(resolve => script.onload = resolve)
    }

    // Override the body visibility animation so html2canvas sees all elements as visible
    document.body.style.visibility = 'visible'

    // Elements to exclude from the screenshot — identified up front so both
    // captures use the same set. ignoreElements avoids touching the DOM (no
    // display:none flicker while the async capture runs).
    const excludeFromCapture = new Set([
      document.getElementById('scroll-arrow'),
      document.querySelector('.api-key-corner'),
      document.getElementById('share-results-btn'),
      document.getElementById('keywords-display'),
      document.querySelector('.career-actions'),
    ].filter(Boolean))

    const captureOpts = {
      backgroundColor: '#1a1a2e',
      scale: 2,
      useCORS: true,
      logging: false,
      ignoreElements: (el) => excludeFromCapture.has(el),
    }

    // Get the two sections to capture
    const mindmapContainer = document.getElementById('mindmap-container')
    const careerSection = document.getElementById('career-cards-section')

    // Measure actual node bounds so we can crop the empty SVG space in the clone
    const svgEl = document.getElementById('mindmap-svg')
    const bbox  = svgEl?.querySelector('.main-group')?.getBBox() ?? null
    const PAD_TOP    = 60 // px of breathing room above the nodes in the image
    const PAD_BOTTOM = 24 // px of breathing room below

    // Capture mind map — crop empty space above/below nodes via viewBox on clone
    const mindmapCanvas = await html2canvas(mindmapContainer, {
      ...captureOpts,
      onclone: (clonedDoc) => {
        if (!bbox) return
        const clonedSvg = clonedDoc.getElementById('mindmap-svg')
        if (!clonedSvg) return
        const svgW  = parseFloat(clonedSvg.getAttribute('width'))
        const viewY = Math.max(0, bbox.y - PAD_TOP)
        const viewH = bbox.height + PAD_TOP + PAD_BOTTOM
        clonedSvg.setAttribute('viewBox', `0 ${viewY} ${svgW} ${viewH}`)
        clonedSvg.setAttribute('height', viewH)
        clonedSvg.style.height = `${viewH}px`
        // Shrink the container to match so html2canvas doesn't capture dead space
        const clonedContainer = clonedDoc.getElementById('mindmap-container')
        if (clonedContainer) clonedContainer.style.height = `${viewH}px`
      },
    })

    // Capture career cards — remove min-height:100vh and trim bottom padding via clone
    const careerCanvas = await html2canvas(careerSection, {
      ...captureOpts,
      onclone: (clonedDoc) => {
        const clonedSection = clonedDoc.getElementById('career-cards-section')
        if (!clonedSection) return
        clonedSection.style.minHeight = 'auto'
        clonedSection.style.paddingBottom = `${PAD_BOTTOM}px`
      },
    })

    document.body.style.visibility = ''

    // Combine the two canvases vertically
    const combinedCanvas = document.createElement('canvas')
    const ctx = combinedCanvas.getContext('2d')
    combinedCanvas.width = Math.max(mindmapCanvas.width, careerCanvas.width)
    combinedCanvas.height = mindmapCanvas.height + careerCanvas.height

    // Fill background
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, combinedCanvas.width, combinedCanvas.height)

    // Draw mind map at top (centered if narrower)
    const mindmapX = (combinedCanvas.width - mindmapCanvas.width) / 2
    ctx.drawImage(mindmapCanvas, mindmapX, 0)

    // Draw career cards below (centered if narrower)
    const careerX = (combinedCanvas.width - careerCanvas.width) / 2
    ctx.drawImage(careerCanvas, careerX, mindmapCanvas.height)

    // Convert to blob, then share natively on mobile or download on desktop
    const filename = state.selectedTone === 'playful' ? 'career-mind-map-playful.png' : 'career-mind-map.png'
    const blob = await new Promise(resolve => combinedCanvas.toBlob(resolve, 'image/png'))
    const file = new File([blob], filename, { type: 'image/png' })

    const isMobileDevice = navigator.userAgentData?.mobile ?? /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    if (isMobileDevice && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'My Career Mind Map' })
    } else {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }

    if (btn) {
      btn.disabled = false
      btn.textContent = btn.dataset.label
    }

  } catch (error) {
    // AbortError = user dismissed the native share sheet — not a real error
    if (error.name === 'AbortError') {
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label }
      return
    }
    console.error(error)
    showErrorBar('Error generating image. Please try again.')
    if (btn) {
      btn.disabled = false
      btn.textContent = btn.dataset.label
    }
  }
}

// Animation
function animateKeywordsToBottom() {
  return new Promise(resolve => {
    const inputs = ['keyword-engagement', 'keyword-energy', 'keyword-flow']
    const displays = ['display-engagement', 'display-energy', 'display-flow']
    const values = inputs.map(id => document.getElementById(id).value.trim())
    const rects = inputs.map(id => document.getElementById(id).getBoundingClientRect())

    const display = document.getElementById('keywords-display')
    displays.forEach((id, i) => document.getElementById(id).textContent = values[i])

    display.style.visibility = 'hidden'
    display.classList.remove('hidden')
    display.style.opacity = '0'

    const finalRects = displays.map(id => document.getElementById(id).getBoundingClientRect())

    display.classList.add('hidden')
    display.style.visibility = ''

    const floaters = values.map((text, i) => {
      const el = document.createElement('div')
      el.textContent = text
      el.style.cssText = `
        position: fixed; left: ${rects[i].left}px; top: ${rects[i].top}px;
        width: ${rects[i].width}px; height: ${rects[i].height}px;
        padding: 0.75rem 1rem; background: rgba(255,255,255,0.1);
        border: 1px solid rgba(255,255,255,0.2); border-radius: 8px;
        color: white; font-size: 1rem; z-index: 1000;
        display: flex; align-items: center; box-sizing: border-box;
      `
      document.body.appendChild(el)
      el.dataset.finalLeft = finalRects[i].left
      el.dataset.finalTop = finalRects[i].top
      el.dataset.finalWidth = finalRects[i].width
      el.dataset.finalHeight = finalRects[i].height
      return el
    })

    document.getElementById('form-container').style.visibility = 'hidden'

    requestAnimationFrame(() => {
      floaters.forEach(el => {
        el.style.transition = 'all 0.6s ease-out'
      })
      requestAnimationFrame(() => {
        floaters.forEach(el => {
          el.style.left = `${el.dataset.finalLeft}px`
          el.style.top = `${el.dataset.finalTop}px`
          el.style.width = `${el.dataset.finalWidth}px`
          el.style.height = `${el.dataset.finalHeight}px`
          el.style.padding = '0.5rem 1.2rem'
          el.style.borderRadius = '20px'
          el.style.fontSize = '0.85rem'
        })
      })
    })

    setTimeout(() => {
      display.classList.remove('hidden')
      display.style.opacity = '1'
      floaters.forEach(el => el.remove())
      document.getElementById('form-container').classList.add('hidden')
      resolve()
    }, 650)
  })
}

function showMindMap() {
  return new Promise(resolve => {
    const container = document.getElementById('mindmap-container')
    container.classList.remove('hidden')
    setTimeout(() => {
      container.classList.add('visible')
      resolve()
    }, 50)
  })
}

// Called after the fade-out completes. Resets all state and DOM while the page
// is invisible (opacity 0), then fades back in — no reload, no flash.
function resetApp() {
  resetSelectionState() // clears selectedNodes, mashGroups, allTertiaryNodes, selectedTone
  careerCache.serious = null
  careerCache.playful = null
  sessionKeywords     = { engagement: '', energy: '', flow: '' }

  // tear down sections that were created dynamically during the session
  document.getElementById('career-cards-section')?.remove()
  document.getElementById('scroll-arrow')?.remove()
  document.getElementById('mindmap-scroll-hint')?.remove()
  document.getElementById('rate-limit-spiral')?.remove()
  document.getElementById('rate-limit-spiral-style')?.remove()

  // clear the SVG and re-hide the mind map container
  const mindmapContainer = document.getElementById('mindmap-container')
  mindmapContainer.innerHTML = ''
  mindmapContainer.classList.add('hidden')
  mindmapContainer.classList.remove('visible') // 'visible' drives the opacity transition

  // collapse the sidebar back to its initial hidden state
  document.getElementById('mash-sidebar').classList.add('hidden')
  document.getElementById('mash-list').innerHTML = ''        // remove all mash group pills
  document.getElementById('generate-section').classList.add('hidden') // hide generate btn
  const genCareersBtn = document.getElementById('generate-careers-btn')
  genCareersBtn.textContent = 'Generate career ideas'
  genCareersBtn.disabled = false
  document.getElementById('max-note').classList.add('hidden')

  // clear inline styles set during the session so CSS classes take over again
  const keywordsDisplay = document.getElementById('keywords-display')
  keywordsDisplay.classList.add('hidden')
  keywordsDisplay.style.opacity = ''    // was set to '0' during fade-out
  keywordsDisplay.style.transition = '' // was set inline during fade-out
  document.getElementById('instruction-text').classList.add('hidden')

  // reset tone toggle buttons back to Serious active
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tone === 'serious')
  })

  // unhide the landing form and re-enable the generate button
  const formContainer = document.getElementById('form-container')
  formContainer.classList.remove('hidden')
  formContainer.style.visibility = '' // was set to 'hidden' during the keyword animation
  // clear keyword inputs and re-evaluate button state
  const keywordInputs = ['keyword-engagement', 'keyword-energy', 'keyword-flow']
    .map(id => document.getElementById(id))
  keywordInputs.forEach(el => { el.value = '' })

  const generateBtn = document.getElementById('generate-btn')
  generateBtn.style.display = 'block'
  updateGenerateBtn(keywordInputs, generateBtn)
  document.getElementById('randomize-btn').disabled = false


  // snap to top while still invisible so the form is in view before fade-in starts
  window.scrollTo(0, 0)
  document.body.style.transition = 'opacity 0.4s ease-in'
  document.body.style.opacity = '1'
}

function showRateLimitSpiral() {
  document.getElementById('rate-limit-spiral')?.remove()
  document.getElementById('rate-limit-spiral-style')?.remove()

  const W  = window.innerWidth
  const H  = window.innerHeight
  const cx = W / 2
  const cy = H / 2
  // Extend past the farthest corner so the spiral truly fills the viewport
  const maxR = Math.hypot(cx, cy) + 30

  // Archimedean spiral: r = a·θ, coil spacing = 2π·a
  const coilSpacing = 52
  const a           = coilSpacing / (2 * Math.PI)
  const maxTheta    = maxR / a

  // ~18 sample points per radian keeps line segments small enough to look curved
  const steps = Math.ceil(maxTheta * 18)
  const parts = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * maxTheta
    const r = a * t
    const x = (cx + r * Math.cos(t)).toFixed(1)
    const y = (cy + r * Math.sin(t)).toFixed(1)
    parts.push(i === 0 ? `M${x},${y}` : `L${x},${y}`)
  }

  const NS  = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.id = 'rate-limit-spiral'
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`)
  svg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;'

  const path = document.createElementNS(NS, 'path')
  path.setAttribute('d', parts.join(''))
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'rgba(255,255,255,0.18)')
  path.setAttribute('stroke-width', '1')
  path.setAttribute('stroke-linecap', 'round')
  svg.appendChild(path)
  document.body.appendChild(svg)

  // getTotalLength() requires the element to be in the DOM
  const len     = Math.ceil(path.getTotalLength())
  const styleEl = document.createElement('style')
  styleEl.id    = 'rate-limit-spiral-style'
  styleEl.textContent = `
    @keyframes spiral-draw {
      from { stroke-dashoffset: ${len}; }
      to   { stroke-dashoffset: 0; }
    }
    @keyframes spiral-breathe {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.4; }
    }
  `
  document.head.appendChild(styleEl)

  // Draw in over 30 s, then softly pulse forever
  path.style.strokeDasharray  = len
  path.style.strokeDashoffset = len
  path.style.animation =
    'spiral-draw 750s linear forwards, ' +
    'spiral-breathe 250s ease-in-out 750s infinite'
}

function createLandingBg() {
  const NS           = 'http://www.w3.org/2000/svg'
  const N            = 7    // secondaries per cluster
  const SPREAD       = 40   // ± degrees for tertiary spread
  const CENTER_COLOR = '#667eea'
  // One colour per branch — matches the actual mind map node palette
  const BRANCH_COLORS = ['#f5576c', '#43e97b', '#fee140', '#4facfe', '#fa709a', '#30cfd0', '#a18cd1']

  // Similar-sized clusters flanking both edges
  const clusters = [
    { cx: 200,  cy: 160, a0: 0,   cls: 'bg-float-slow', r1: 82, r2: 42 },  // left top
    { cx: 200,  cy: 740, a0: 300, cls: 'bg-float-fast',  r1: 78, r2: 40 },  // left bottom
    { cx: 75,   cy: 450, a0: 270, cls: 'bg-float-med',   r1: 74, r2: 38 },  // left mid
    { cx: 1240, cy: 160, a0: 130, cls: 'bg-float-med',   r1: 80, r2: 41 },  // right top
    { cx: 1240, cy: 740, a0: 50,  cls: 'bg-float-slow',  r1: 85, r2: 44 },  // right bottom
    { cx: 1365, cy: 450, a0: 90,  cls: 'bg-float-fast',  r1: 76, r2: 39 },  // right mid
  ]

  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'landing-bg')
  svg.setAttribute('viewBox', '0 0 1440 900')
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice')
  svg.setAttribute('aria-hidden', 'true')

  const deg2rad = d => d * Math.PI / 180
  const mkEl = (tag, attrs) => {
    const e = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
    return e
  }

  // Quadratic bezier between two points; bend is a signed perpendicular offset
  function curvePath(x1, y1, x2, y2, bend) {
    const mx  = (x1 + x2) / 2
    const my  = (y1 + y2) / 2
    const dx  = x2 - x1, dy = y2 - y1
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    // Perpendicular of (dx,dy) is (-dy, dx)
    const cpx = Math.round(mx - bend * dy / len)
    const cpy = Math.round(my + bend * dx / len)
    return `M ${x1},${y1} Q ${cpx},${cpy} ${x2},${y2}`
  }

  for (const { cx, cy, a0, cls, r1, r2 } of clusters) {
    // Group opacity creates an isolated compositing buffer: circles at opacity:1 within
    // the group will properly occlude lines, so the web reads as one unified shape.
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('class', cls)
    g.setAttribute('opacity', '0.18')

    // Pre-compute all positions in one pass so lines and circles share the same coords
    const secs = Array.from({ length: N }, (_, i) => {
      const color = BRANCH_COLORS[i]
      const a    = a0 + i * (360 / N)
      const rad  = deg2rad(a)
      const rLen = r1 * (0.82 + Math.random() * 0.36)          // ±18% length variation
      const bend = (Math.random() - 0.5) * r1 * 0.35           // random curve direction
      const sx   = Math.round(cx + rLen * Math.cos(rad))
      const sy   = Math.round(cy + rLen * Math.sin(rad))
      const ters = [-SPREAD, 0, SPREAD].map(off => {
        const ta    = deg2rad(a + off)
        const tLen  = r2 * (0.80 + Math.random() * 0.40)       // ±20% length variation
        const tBend = (Math.random() - 0.5) * r2 * 0.35
        return { x: Math.round(sx + tLen * Math.cos(ta)), y: Math.round(sy + tLen * Math.sin(ta)), bend: tBend }
      })
      return { x: sx, y: sy, bend, ters, color }
    })

    // Curved paths first — lines are semi-transparent within the group buffer
    for (const s of secs) {
      g.appendChild(mkEl('path', { d: curvePath(cx, cy, s.x, s.y, s.bend), stroke: s.color, 'stroke-width': '1.5', opacity: '0.65', fill: 'none' }))
      for (const t of s.ters) {
        g.appendChild(mkEl('path', { d: curvePath(s.x, s.y, t.x, t.y, t.bend), stroke: s.color, 'stroke-width': '1', opacity: '0.5', fill: 'none' }))
      }
    }

    // Circles at full opacity within the group — they sit on top and fully cover line ends
    g.appendChild(mkEl('circle', { cx, cy, r: '9', fill: CENTER_COLOR, opacity: '1' }))
    for (const s of secs) {
      g.appendChild(mkEl('circle', { cx: s.x, cy: s.y, r: '5', fill: s.color, opacity: '1' }))
      for (const t of s.ters) {
        g.appendChild(mkEl('circle', { cx: t.x, cy: t.y, r: '3.5', fill: s.color, opacity: '1' }))
      }
    }

    svg.appendChild(g)
  }

  document.getElementById('form-container').prepend(svg)
}

function init() {
  // Disable generate button until all 3 fields are filled
  const generateBtn = document.getElementById('generate-btn')
  const keywordInputs = ['keyword-engagement', 'keyword-energy', 'keyword-flow'].map(id => document.getElementById(id))

  keywordInputs.forEach(el => el.addEventListener('input', () => updateGenerateBtn(keywordInputs, generateBtn)))
  updateGenerateBtn(keywordInputs, generateBtn) // set initial state

  // Randomize button
  const randomizeBtn = document.getElementById('randomize-btn')
  randomizeBtn.addEventListener('click', () => {
    const picked = randomizeMash()
    picked?.forEach(({ element }) => triggerRipple(element))
    if (state.mashGroups.length >= MAX_MASHES) randomizeBtn.disabled = true
  })

  // Tone toggle buttons
  document.querySelectorAll('.tone-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tone-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      state.selectedTone = btn.dataset.tone
    })
  })

  // Generate career ideas button
  document.getElementById('generate-careers-btn').addEventListener('click', generateCareerIdeas)

  // Click a mash pill → ripple its 3 source nodes 3 times
  document.getElementById('mash-list').addEventListener('click', e => {
    const pill = e.target.closest('.mash-group:not(.staging)')
    if (!pill?.dataset.labels) return
    const labels = new Set(pill.dataset.labels.split(','))
    state.allTertiaryNodes
      .filter(({ data }) => labels.has(data.label))
      .forEach(({ element }) => triggerRipple(element, true))
  })

  // Dev mode setup
  if (DEV_MODE) {
    const badge = document.createElement('div')
    badge.id = 'dev-mode-badge'
    badge.textContent = 'DEV MODE'
    document.getElementById('app').appendChild(badge)

    // Pre-fill inputs so user can click straight through
    document.getElementById('keyword-engagement').value = 'balancing the budget'
    document.getElementById('keyword-energy').value = 'teaching'
    document.getElementById('keyword-flow').value = 'social dance'
    updateGenerateBtn(keywordInputs, generateBtn)
  }

  // Staging mode setup
  if (STAGING_MODE) {
    const badge = document.createElement('div')
    badge.id = 'dev-mode-badge'
    badge.textContent = 'STAGING MODE'
    document.getElementById('app').appendChild(badge)

    const corner = document.createElement('div')
    corner.className = 'api-key-corner'
    corner.innerHTML = '<input type="text" id="staging-api-key" placeholder="Claude API Key" />'
    document.getElementById('app').appendChild(corner)
  }

  document.getElementById('generate-btn').addEventListener('click', async () => {
    const engagement = document.getElementById('keyword-engagement').value.trim()
    const energy = document.getElementById('keyword-energy').value.trim()
    const flow = document.getElementById('keyword-flow').value.trim()

    if (!engagement || !energy || !flow) { showErrorBar('Please fill in all three keyword fields'); return }
    if (STAGING_MODE && !document.getElementById('staging-api-key')?.value.trim()) {
      showErrorBar('Please enter your Claude API key for staging mode'); return
    }

    sessionKeywords = { engagement, energy, flow }

    const btn = document.getElementById('generate-btn')
    btn.disabled = true
    btn.style.display = 'none'

    animateKeywordsToBottom()

    const loading = document.getElementById('loading')
    loading.classList.remove('hidden')

    try {
      let data
      if (DEV_MODE) {
        await new Promise(r => setTimeout(r, 500))
        data = {
          engagement: { ...MOCK_ASSOCIATIONS.engagement, keyword: engagement },
          energy:     { ...MOCK_ASSOCIATIONS.energy,     keyword: energy     },
          flow:       { ...MOCK_ASSOCIATIONS.flow,       keyword: flow       }
        }
      } else {
        data = await getAllAssociations(engagement, energy, flow)
      }
      loading.classList.add('hidden')
      await showMindMap()
      renderMindMap(data)
      // Ripple all edge nodes on load with organic random delays
      state.allTertiaryNodes.forEach(({ element }) => {
        setTimeout(() => triggerRipple(element), Math.random() * 700)
      })
    } catch (error) {
      console.error(error)
      showErrorBar(error.message)
      loading.classList.add('hidden')
      document.querySelectorAll('.keyword-floater').forEach(el => el.remove())

      if (error.message === RATE_LIMIT_MESSAGE) {
        // Rate limited: leave the form hidden and fill the screen with the spiral
        showRateLimitSpiral()
      } else {
        document.getElementById('form-container').style.visibility = 'visible'
        document.getElementById('form-container').classList.remove('hidden')
        btn.style.display = 'block'
        btn.disabled = false
        document.getElementById('keywords-display').classList.add('hidden')
      }
    }
  })

  if (SPIRAL_VIEW_MODE) showRateLimitSpiral()
}

createLandingBg()
init()
