import './style.css'
import * as d3 from 'd3'
import { MOCK_ASSOCIATIONS, getMockCareerIdeas } from './mockData.js'
import { state, resetSelectionState, handleNodeClick, updateStagingText, finalizeMash, randomizeMash, MAX_MASHES } from './selection.js'
import { createCareerCardsSection } from './careers.js'
import { callClaudeAssociations, callClaudeCareers, callClaudeDirect } from './apiClient.js'
import { updateGenerateBtn } from './formValidation.js'
import { parseCompactAssociations } from './parseAssociations.js'

// Dev mode: add ?dev to the URL to skip all API calls and use mock data
const DEV_MODE     = new URLSearchParams(window.location.search).has('dev')
// Staging mode: add ?staging to use a UI-entered API key and call Claude directly
const STAGING_MODE = new URLSearchParams(window.location.search).has('staging')

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
  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }
  return parseCompactAssociations(JSON.parse(jsonStr), { engagement, energy, flow })
}

// Color palette
const colorPalette = [
  '#646cff',
  '#f093fb', '#f5576c', '#4facfe', '#43e97b',
  '#fa709a', '#fee140', '#30cfd0'
]


// Build simple radial mind map for one category
function buildCategoryMap(categoryData, centerX, centerY) {
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

  const primaryRadius = 100
  const secondaryRadius = 70

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
      const secAngle = angle + (j - 1) * 0.5
      const sDist = secondaryRadius + (Math.random() - 0.5) * 25
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

  // Calculate sidebar width to match CSS clamp(180px, 15vw, 280px)
  const sidebarWidth = Math.min(280, Math.max(180, window.innerWidth * 0.15))
  const availableWidth = window.innerWidth - sidebarWidth
  const height = window.innerHeight - 70
  const sectionWidth = availableWidth / 3
  const verticalCenter = height / 2

  // Create SVG that fills available width (excluding sidebar)
  const svg = d3.select(container)
    .append('svg')
    .attr('width', availableWidth)
    .attr('height', height)
    .attr('id', 'mindmap-svg')

  // Create main group for all content (for animation)
  const mainGroup = svg.append('g').attr('class', 'main-group')

  const categories = ['engagement', 'energy', 'flow']

  categories.forEach((cat, i) => {
    const mapData = buildCategoryMap(data[cat], sectionWidth / 2, verticalCenter)
    renderCategoryInGroup(mainGroup, mapData, i * sectionWidth, cat)
  })

  // Show sidebar
  document.getElementById('mash-sidebar').classList.remove('hidden')

  // Show instruction text
  document.getElementById('instruction-text').classList.remove('hidden')
}

// Render category into a group (for animation support)
function renderCategoryInGroup(parentG, data, offsetX, categoryName) {
  const g = parentG.append('g').attr('transform', `translate(${offsetX}, 0)`)

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
    .attr('r', d => d.level === 0 ? 35 : d.level === 1 ? 22 : 14)
    .attr('fill', d => d.color)
    .attr('opacity', 0.85)

  node.append('text')
    .text(d => d.label)
    .attr('dy', 4)
    .attr('font-size', d => d.level === 0 ? '11px' : d.level === 1 ? '9px' : '7px')
    .attr('font-weight', d => d.level === 0 ? 'bold' : 'normal')
    .attr('fill', 'white')
    .attr('text-anchor', 'middle')
    .style('pointer-events', d => d.level === 2 ? 'all' : 'none')

  // Ripple circle for tertiary nodes (sits on top, animated via CSS)
  node.filter(d => d.level === 2)
    .append('circle')
    .attr('r', 14)
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
      const response = STAGING_MODE
        ? await callClaudeDirect(getStagingApiKey(), prompt)
        : await callClaudeCareers(prompt)
      let jsonStr = response.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      }
      careerIdeas = JSON.parse(jsonStr).map((idea, i) => ({
        groupIndex: i, title: idea.t, description: idea.d,
      }))
    }

    createCareerCardsSection(careerIdeas, state.mashGroups, {
      currentTone:  state.selectedTone,
      onShare:      shareResults,
      onSwitchTone: (tone) => regenerateWithAlternateTone(tone, state.mashGroups),
      onStartOver:  startOver,
    })

    // Hide the entire sidebar
    document.getElementById('mash-sidebar').classList.add('hidden')

    // Fade out instruction text and keyword pills
    const keywordsDisplay = document.getElementById('keywords-display')
    if (keywordsDisplay) {
      keywordsDisplay.style.transition = 'opacity 0.5s ease-out'
      keywordsDisplay.style.opacity = '0'
      setTimeout(() => {
        keywordsDisplay.classList.add('hidden')
      }, 500)
    }

    // Animate mindmap to center now that sidebar is gone
    const container = document.getElementById('mindmap-container')
    const svg = container.querySelector('svg')
    if (svg) {
      const sidebarWidth = Math.min(280, Math.max(180, window.innerWidth * 0.15))
      const shiftX = sidebarWidth / 2  // Shift content to center

      // Animate the shift using the main group
      const mainGroup = svg.querySelector('.main-group')
      if (mainGroup) {
        mainGroup.style.transition = 'transform 0.6s ease-out'
        mainGroup.setAttribute('transform', `translate(${shiftX}, 0)`)
      }

      // Expand SVG width with transition
      svg.style.transition = 'width 0.6s ease-out'
      svg.setAttribute('width', window.innerWidth)
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

// Regenerate career cards with the alternate tone
async function regenerateWithAlternateTone(alternateTone, groups) {
  const btn = document.getElementById('switch-tone-btn')
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
      const response = STAGING_MODE
        ? await callClaudeDirect(getStagingApiKey(), prompt)
        : await callClaudeCareers(prompt)
      let jsonStr = response.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      }
      careerIdeas = JSON.parse(jsonStr).map((idea, i) => ({
        groupIndex: i, title: idea.t, description: idea.d,
      }))
    }

    state.selectedTone = alternateTone
    createCareerCardsSection(careerIdeas, groups, {
      showToneSwitch: false,
      currentTone:   alternateTone,
      onShare:       shareResults,
      onSwitchTone:  () => {},
      onStartOver:   startOver,
    })

    // Scroll to career section since user is already past the mind map
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

    // Hide UI elements
    const scrollArrow = document.getElementById('scroll-arrow')
    const apiKeyCorner = document.querySelector('.api-key-corner')
    const shareBtn = document.getElementById('share-results-btn')
    const keywordsDisplay = document.getElementById('keywords-display')
    const careerActions = document.querySelector('.career-actions')

    if (scrollArrow) scrollArrow.style.display = 'none'
    if (apiKeyCorner) apiKeyCorner.style.display = 'none'
    if (shareBtn) shareBtn.style.display = 'none'
    if (keywordsDisplay) keywordsDisplay.style.display = 'none'
    if (careerActions) careerActions.style.display = 'none'

    // Get the two sections to capture
    const mindmapContainer = document.getElementById('mindmap-container')
    const careerSection = document.getElementById('career-cards-section')

    // Capture mind map (word webs)
    const mindmapCanvas = await html2canvas(mindmapContainer, {
      backgroundColor: '#1a1a2e',
      scale: 2,
      useCORS: true,
      logging: false
    })

    // Capture career cards section
    const careerCanvas = await html2canvas(careerSection, {
      backgroundColor: '#1a1a2e',
      scale: 2,
      useCORS: true,
      logging: false
    })

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

    // Restore hidden elements
    document.body.style.visibility = ''
    if (scrollArrow) scrollArrow.style.display = ''
    if (apiKeyCorner) apiKeyCorner.style.display = ''
    if (shareBtn) shareBtn.style.display = ''
    if (keywordsDisplay) keywordsDisplay.style.display = ''
    if (careerActions) careerActions.style.display = ''

    // Convert to blob and download
    combinedCanvas.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = state.selectedTone === 'playful' ? 'career-mind-map-playful.png' : 'career-mind-map.png'
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')

    if (btn) {
      btn.disabled = false
      btn.textContent = 'Share results'
    }

  } catch (error) {
    console.error(error)
    showErrorBar('Error generating image. Please try again.')
    if (btn) {
      btn.disabled = false
      btn.textContent = 'Share results'
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

  // tear down sections that were created dynamically during the session
  document.getElementById('career-cards-section')?.remove()
  document.getElementById('scroll-arrow')?.remove()

  // clear the SVG and re-hide the mind map container
  const mindmapContainer = document.getElementById('mindmap-container')
  mindmapContainer.innerHTML = ''
  mindmapContainer.classList.add('hidden')
  mindmapContainer.classList.remove('visible') // 'visible' drives the opacity transition

  // collapse the sidebar back to its initial hidden state
  document.getElementById('mash-sidebar').classList.add('hidden')
  document.getElementById('mash-list').innerHTML = ''        // remove all mash group pills
  document.getElementById('generate-section').classList.add('hidden') // hide generate btn
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

function createLandingBg() {
  const NS     = 'http://www.w3.org/2000/svg'
  const N      = 7    // secondaries per cluster
  const SPREAD = 40   // ± degrees for tertiary spread

  // Similar-sized clusters flanking both edges
  const clusters = [
    { cx: 200,  cy: 160, color: '#646cff', a0: 0,   cls: 'bg-float-slow', r1: 82, r2: 42 },  // left top
    { cx: 200,  cy: 740, color: '#30cfd0', a0: 300, cls: 'bg-float-fast', r1: 78, r2: 40 },  // left bottom
    { cx: 75,   cy: 450, color: '#4facfe', a0: 270, cls: 'bg-float-med',  r1: 74, r2: 38 },  // left mid
    { cx: 1240, cy: 160, color: '#f093fb', a0: 130, cls: 'bg-float-med',  r1: 80, r2: 41 },  // right top
    { cx: 1240, cy: 740, color: '#f5576c', a0: 50,  cls: 'bg-float-slow', r1: 85, r2: 44 },  // right bottom
    { cx: 1365, cy: 450, color: '#43e97b', a0: 90,  cls: 'bg-float-fast', r1: 76, r2: 39 },  // right mid
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

  for (const { cx, cy, color, a0, cls, r1, r2 } of clusters) {
    // Group opacity creates an isolated compositing buffer: circles at opacity:1 within
    // the group will properly occlude lines, so the web reads as one unified shape.
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('class', cls)
    g.setAttribute('opacity', '0.11')

    // Pre-compute all positions in one pass so lines and circles share the same coords
    const secs = Array.from({ length: N }, (_, i) => {
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
      return { x: sx, y: sy, bend, ters }
    })

    // Curved paths first — lines are semi-transparent within the group buffer
    for (const s of secs) {
      g.appendChild(mkEl('path', { d: curvePath(cx, cy, s.x, s.y, s.bend), stroke: color, 'stroke-width': '1.5', opacity: '0.65', fill: 'none' }))
      for (const t of s.ters) {
        g.appendChild(mkEl('path', { d: curvePath(s.x, s.y, t.x, t.y, t.bend), stroke: color, 'stroke-width': '1', opacity: '0.5', fill: 'none' }))
      }
    }

    // Circles at full opacity within the group — they sit on top and fully cover line ends
    g.appendChild(mkEl('circle', { cx, cy, r: '9', fill: color, opacity: '1' }))
    for (const s of secs) {
      g.appendChild(mkEl('circle', { cx: s.x, cy: s.y, r: '5', fill: color, opacity: '1' }))
      for (const t of s.ters) {
        g.appendChild(mkEl('circle', { cx: t.x, cy: t.y, r: '3.5', fill: color, opacity: '1' }))
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
      document.getElementById('form-container').style.visibility = 'visible'
      document.getElementById('form-container').classList.remove('hidden')
      btn.style.display = 'block'
      btn.disabled = false
      document.querySelectorAll('.keyword-floater').forEach(el => el.remove())
      document.getElementById('keywords-display').classList.add('hidden')
    }
  })
}

createLandingBg()
init()
