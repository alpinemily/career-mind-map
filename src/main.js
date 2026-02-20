import './style.css'
import * as d3 from 'd3'
import { MOCK_ASSOCIATIONS, getMockCareerIdeas } from './mockData.js'
import { state, resetSelectionState, handleNodeClick, updateStagingText, finalizeMash, randomizeMash, MAX_MASHES } from './selection.js'
import { createCareerCardsSection } from './careers.js'

// Dev mode: add ?dev to the URL to skip all API calls and use mock data
const DEV_MODE = new URLSearchParams(window.location.search).has('dev')

// Claude API helper
async function callClaudeAPI(apiKey, prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }]
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API request failed')
  }

  const data = await response.json()
  return data.content[0].text
}

// Get all associations
async function getAllAssociations(apiKey, engagement, energy, flow) {
  const prompt = `Generate word associations for a career mind map. For each of these 3 keyphrases, generate 7 associated words, and for each of those, 3 more related words.

1. ENGAGEMENT: "${engagement}"
2. ENERGY: "${energy}"
3. FLOW: "${flow}"

Return ONLY valid JSON:
{
  "engagement": {
    "keyword": "${engagement}",
    "associations": [
      {"word": "word1", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "word2", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "word3", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "word4", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "word5", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "word6", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "word7", "secondary": ["sub1", "sub2", "sub3"]}
    ]
  },
  "energy": {
    "keyword": "${energy}",
    "associations": [/* same structure */]
  },
  "flow": {
    "keyword": "${flow}",
    "associations": [/* same structure */]
  }
}`

  const response = await callClaudeAPI(apiKey, prompt)
  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }
  return JSON.parse(jsonStr)
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

  // Add click handlers for tertiary nodes
  node.filter(d => d.level === 2)
    .style('cursor', 'pointer')
    .on('click', function(event, d) {
      event.stopPropagation()
      handleNodeClick(this, d)
    })

  // Store references to tertiary nodes
  node.filter(d => d.level === 2).each(function(d) {
    state.allTertiaryNodes.push({
      element: this,
      data: d,
      offsetX: offsetX
    })
  })
}


// Build career prompt for a given tone and groupings text
function buildCareerPrompt(tone, groupingsText) {
  if (tone === 'playful') {
    return `You are a wildly creative career counselor who thinks outside the box. Given combinations of 3 words, generate fun, unexpected, and imaginative career ideas that playfully combine all three concepts.

Here are the word groupings:
${groupingsText}

For each grouping, create ONE creative career idea that combines all 3 words in an unexpected way. Think quirky, inventive, and delightful - like "Pirate Surf Camp for Kids" if the words were "pirates, sports, kids". The ideas should be fun and inspiring, not boring corporate job titles.

Return ONLY valid JSON in this exact format:
{
  "careerIdeas": [
    {"groupIndex": 0, "title": "Fun Career Title", "description": "A whimsical description of this creative career."},
    {"groupIndex": 1, "title": "Fun Career Title", "description": "A whimsical description of this creative career."}
  ]
}

Make sure to return one idea for each grouping provided.`
  } else {
    return `You are a creative career counselor who helps people discover unexpected but REALISTIC career paths. Given combinations of 3 words, generate imaginative career ideas that are inspired by these concepts.

IMPORTANT GUIDELINES:
- The career must be a REAL, implementable job or business that could exist in the real world
- Do NOT literally combine the 3 words into a description - instead, let them INSPIRE a creative but practical career
- Avoid overly whimsical or impossible ideas like "GPS tracking emotional journeys through bike poetry"
- Think of actual jobs, businesses, or services someone could realistically start or pursue
- The career should be creative and unexpected, but grounded enough that someone could actually do it

Example: If words were "pirates, sports, kids" - a good answer would be "Adventure Sailing Instructor" with description "Run youth sailing camps with treasure hunt adventures" - NOT "Pirate-themed emotional water journey facilitator"

Here are the word groupings:
${groupingsText}

For each grouping, create ONE creative but realistic career idea. Provide a short, catchy career title (3-6 words) and a brief practical description (1 sentence explaining what you'd actually do).

Return ONLY valid JSON in this exact format:
{
  "careerIdeas": [
    {"groupIndex": 0, "title": "Career Title Here", "description": "Brief description of what this job actually involves."},
    {"groupIndex": 1, "title": "Career Title Here", "description": "Brief description of what this job actually involves."}
  ]
}

Make sure to return one idea for each grouping provided.`
  }
}

// Generate career ideas from Claude API
async function generateCareerIdeas() {
  const apiKey = document.getElementById('api-key').value.trim()
  if (!DEV_MODE && !apiKey) {
    alert('Please enter your Claude API key')
    return
  }

  if (state.mashGroups.length === 0) return

  const btn = document.getElementById('generate-careers-btn')
  btn.disabled = true
  btn.textContent = 'Generating...'

  try {
    let careerIdeas
    if (DEV_MODE) {
      await new Promise(r => setTimeout(r, 600))
      careerIdeas = getMockCareerIdeas(state.mashGroups, state.selectedTone)
    } else {
      const groupingsText = state.mashGroups.map((group, i) =>
        `${i + 1}. "${group.join('" + "')}"`
      ).join('\n')
      const prompt = buildCareerPrompt(state.selectedTone, groupingsText)
      const response = await callClaudeAPI(apiKey, prompt)
      let jsonStr = response.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      }
      careerIdeas = JSON.parse(jsonStr).careerIdeas
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
    alert(`Error generating ideas: ${error.message}`)
    btn.disabled = false
    btn.textContent = 'Generate career ideas'
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
  const apiKey = document.getElementById('api-key').value.trim()
  if (!DEV_MODE && !apiKey) {
    alert('Please enter your Claude API key')
    return
  }

  const btn = document.getElementById('switch-tone-btn')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Generating...'
  }

  try {
    let careerIdeas
    if (DEV_MODE) {
      await new Promise(r => setTimeout(r, 600))
      careerIdeas = getMockCareerIdeas(groups, alternateTone)
    } else {
      const groupingsText = groups.map((group, i) =>
        `${i + 1}. "${group.join('" + "')}"`
      ).join('\n')
      const prompt = buildCareerPrompt(alternateTone, groupingsText)
      const response = await callClaudeAPI(apiKey, prompt)
      let jsonStr = response.trim()
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      }
      careerIdeas = JSON.parse(jsonStr).careerIdeas
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
    alert(`Error generating ideas: ${error.message}`)
    if (btn) {
      btn.disabled = false
      const label = alternateTone === 'playful' ? 'Playful' : 'Serious'
      btn.textContent = `Try ${label} ideas instead`
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
      a.download = 'career-mind-map.png'
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')

    if (btn) {
      btn.disabled = false
      btn.textContent = 'Share results'
    }

  } catch (error) {
    console.error(error)
    alert('Error generating image. Please try again.')
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
  const generateBtn = document.getElementById('generate-btn')
  generateBtn.style.display = 'block'
  generateBtn.disabled = false

  // snap to top while still invisible so the form is in view before fade-in starts
  window.scrollTo(0, 0)
  document.body.style.transition = 'opacity 0.4s ease-in'
  document.body.style.opacity = '1'
}

function init() {
  // Randomize button
  document.getElementById('randomize-btn').addEventListener('click', randomizeMash)

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

  // Dev mode setup
  if (DEV_MODE) {
    // Badge
    const badge = document.createElement('div')
    badge.id = 'dev-mode-badge'
    badge.textContent = 'DEV MODE'
    document.getElementById('app').appendChild(badge)

    // Hide API key input since it's not needed
    document.querySelector('.api-key-corner').style.display = 'none'

    // Pre-fill inputs so user can click straight through
    document.getElementById('keyword-engagement').value = 'balancing the budget'
    document.getElementById('keyword-energy').value = 'teaching'
    document.getElementById('keyword-flow').value = 'social dance'
  }

  document.getElementById('generate-btn').addEventListener('click', async () => {
    const apiKey = document.getElementById('api-key').value.trim()
    const engagement = document.getElementById('keyword-engagement').value.trim()
    const energy = document.getElementById('keyword-energy').value.trim()
    const flow = document.getElementById('keyword-flow').value.trim()

    if (!DEV_MODE && !apiKey) return alert('Please enter your Claude API key (top right corner)')
    if (!engagement || !energy || !flow) return alert('Please fill in all three keyword fields')

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
        data = await getAllAssociations(apiKey, engagement, energy, flow)
      }
      loading.classList.add('hidden')
      await showMindMap()
      renderMindMap(data)
    } catch (error) {
      console.error(error)
      alert(`Error: ${error.message}`)
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

init()
