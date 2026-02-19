import './style.css'
import * as d3 from 'd3'

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

// Selection state
let selectedNodes = []
let mashGroups = []
const MAX_MASHES = 10
let allTertiaryNodes = [] // Store references to all tertiary node elements

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

// Render one mind map
function renderCategory(svg, data, offsetX, categoryName) {
  const g = svg.append('g').attr('transform', `translate(${offsetX}, 0)`)

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
    allTertiaryNodes.push({
      element: this,
      data: d,
      offsetX: offsetX
    })
  })
}

// Main render
function renderMindMap(data) {
  const container = document.getElementById('mindmap-container')
  container.innerHTML = ''

  // Reset selection state
  selectedNodes = []
  allTertiaryNodes = []

  // Calculate sidebar width to match CSS clamp(180px, 15vw, 280px)
  const sidebarWidth = Math.min(280, Math.max(180, window.innerWidth * 0.15))
  const width = window.innerWidth - sidebarWidth
  const height = window.innerHeight - 70
  const sectionWidth = width / 3

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)

  const categories = ['engagement', 'energy', 'flow']

  categories.forEach((cat, i) => {
    const mapData = buildCategoryMap(data[cat], sectionWidth / 2, height / 2)
    renderCategory(svg, mapData, i * sectionWidth, cat)
  })

  // Show sidebar
  document.getElementById('mash-sidebar').classList.remove('hidden')
}

// Current staging element for building a mash
let currentStagingEl = null

// Handle tertiary node click
function handleNodeClick(element, data) {
  if (mashGroups.length >= MAX_MASHES) return

  const nodeId = element.getAttribute('data-id')
  const isSelected = selectedNodes.find(n => n.id === nodeId)

  if (isSelected) {
    // Unselect
    selectedNodes = selectedNodes.filter(n => n.id !== nodeId)
    d3.select(element).classed('selected', false)
    updateStagingText()
  } else {
    // Select (if under 3)
    if (selectedNodes.length < 3) {
      selectedNodes.push({
        id: nodeId,
        label: data.label,
        element: element
      })
      d3.select(element).classed('selected', true)
      updateStagingText()

      // If we have 3, finalize the mash
      if (selectedNodes.length === 3) {
        finalizeMash()
      }
    }
  }
}

// Update the staging text in sidebar
function updateStagingText() {
  const listEl = document.getElementById('mash-list')

  if (selectedNodes.length === 0) {
    // Remove staging element if no selections
    if (currentStagingEl) {
      currentStagingEl.remove()
      currentStagingEl = null
    }
    return
  }

  // Create staging element if needed
  if (!currentStagingEl) {
    currentStagingEl = document.createElement('div')
    currentStagingEl.className = 'mash-group staging'
    listEl.appendChild(currentStagingEl)
  }

  // Update text with current selections
  const labels = selectedNodes.map(n => n.label)
  currentStagingEl.innerHTML = labels.join('<span> + </span>')
}

// Finalize the current mash
function finalizeMash() {
  const labels = selectedNodes.map(n => n.label)
  mashGroups.push(labels)

  // Convert staging to final
  if (currentStagingEl) {
    currentStagingEl.classList.remove('staging')
    currentStagingEl = null
  }

  // Show generate button after first grouping
  if (mashGroups.length >= 1) {
    document.getElementById('generate-section').classList.remove('hidden')
  }

  // Check max
  if (mashGroups.length >= MAX_MASHES) {
    document.getElementById('max-note').classList.remove('hidden')
  }

  // Unhighlight all nodes
  selectedNodes.forEach(n => {
    d3.select(n.element).classed('selected', false)
  })
  selectedNodes = []
}

// Randomize - pick 3 random tertiary nodes with highlight
function randomizeMash() {
  if (mashGroups.length >= MAX_MASHES) return
  if (allTertiaryNodes.length < 3) return

  // Clear any current selection
  selectedNodes.forEach(n => {
    d3.select(n.element).classed('selected', false)
  })
  if (currentStagingEl) {
    currentStagingEl.remove()
    currentStagingEl = null
  }
  selectedNodes = []

  // Pick 3 random unique nodes
  const shuffled = [...allTertiaryNodes].sort(() => Math.random() - 0.5)
  const picked = shuffled.slice(0, 3)

  // Highlight picked nodes
  picked.forEach(node => {
    d3.select(node.element).classed('random-highlight', true)
  })

  // Add text to sidebar immediately
  const labels = picked.map(n => n.data.label)
  mashGroups.push(labels)

  const listEl = document.getElementById('mash-list')
  const groupEl = document.createElement('div')
  groupEl.className = 'mash-group'
  groupEl.innerHTML = labels.join('<span> + </span>')
  listEl.appendChild(groupEl)

  // Show generate button
  if (mashGroups.length >= 1) {
    document.getElementById('generate-section').classList.remove('hidden')
  }

  // Check max
  if (mashGroups.length >= MAX_MASHES) {
    document.getElementById('max-note').classList.remove('hidden')
  }

  // After 5 seconds, remove highlight
  setTimeout(() => {
    picked.forEach(node => {
      d3.select(node.element).classed('random-highlight', false)
    })
  }, 5000)
}

// Generate career ideas from Claude API
async function generateCareerIdeas() {
  const apiKey = document.getElementById('api-key').value.trim()
  if (!apiKey) {
    alert('Please enter your Claude API key')
    return
  }

  if (mashGroups.length === 0) return

  const btn = document.getElementById('generate-careers-btn')
  btn.disabled = true
  btn.textContent = 'Generating...'

  // Build the prompt
  const groupingsText = mashGroups.map((group, i) =>
    `${i + 1}. "${group.join('" + "')}"`
  ).join('\n')

  const prompt = `You are a creative career counselor who helps people discover unexpected but REALISTIC career paths. Given combinations of 3 words, generate imaginative career ideas that are inspired by these concepts.

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

  try {
    const response = await callClaudeAPI(apiKey, prompt)
    let jsonStr = response.trim()
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
    }
    const data = JSON.parse(jsonStr)

    // Create career cards section below the page (with share button)
    createCareerCardsSection(data.careerIdeas, mashGroups)

    // Hide the entire sidebar
    document.getElementById('mash-sidebar').classList.add('hidden')

    // Resize mindmap to use full width now that sidebar is gone
    const container = document.getElementById('mindmap-container')
    const svg = container.querySelector('svg')
    if (svg) {
      svg.setAttribute('width', window.innerWidth)
    }

  } catch (error) {
    console.error(error)
    alert(`Error generating ideas: ${error.message}`)
    btn.disabled = false
    btn.textContent = 'Generate career ideas'
  }
}

// Create career cards section below the page
function createCareerCardsSection(careerIdeas, groups) {
  // Remove existing section if any
  const existing = document.getElementById('career-cards-section')
  if (existing) existing.remove()

  // Create scroll arrow
  const arrow = document.createElement('div')
  arrow.id = 'scroll-arrow'
  arrow.innerHTML = `
    <span>Scroll to see your career ideas</span>
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M12 5v14M5 12l7 7 7-7"/>
    </svg>
  `
  document.getElementById('app').appendChild(arrow)

  // Create section
  const section = document.createElement('div')
  section.id = 'career-cards-section'

  const title = document.createElement('h2')
  title.textContent = 'Your Career Ideas'
  section.appendChild(title)

  const cardsContainer = document.createElement('div')
  cardsContainer.className = 'career-cards-container'

  careerIdeas.forEach((idea, i) => {
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

  // Add share button at the bottom
  const shareBtn = document.createElement('button')
  shareBtn.id = 'share-results-btn'
  shareBtn.textContent = 'Share results'
  shareBtn.addEventListener('click', shareResults)
  section.appendChild(shareBtn)

  document.getElementById('app').appendChild(section)

  // Scroll to arrow after a moment
  setTimeout(() => {
    arrow.classList.add('visible')
  }, 300)

  // Remove arrow when user scrolls past it
  const handleScroll = () => {
    if (window.scrollY > 100) {
      arrow.classList.add('hidden')
      window.removeEventListener('scroll', handleScroll)
    }
  }
  window.addEventListener('scroll', handleScroll)
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

    // Hide UI elements we don't want in the screenshot
    const scrollArrow = document.getElementById('scroll-arrow')
    const keywordsDisplay = document.getElementById('keywords-display')
    const apiKeyCorner = document.querySelector('.api-key-corner')
    const shareBtn = document.getElementById('share-results-btn')

    if (scrollArrow) scrollArrow.style.display = 'none'
    if (apiKeyCorner) apiKeyCorner.style.display = 'none'
    if (shareBtn) shareBtn.style.display = 'none'

    // Capture the entire app including mind maps and career cards
    const app = document.getElementById('app')

    const canvas = await html2canvas(app, {
      backgroundColor: '#1a1a2e',
      scale: 2,
      width: window.innerWidth,
      height: app.scrollHeight,
      windowWidth: window.innerWidth,
      windowHeight: app.scrollHeight,
      y: 0,
      scrollY: -window.scrollY
    })

    // Restore hidden elements
    if (scrollArrow) scrollArrow.style.display = ''
    if (apiKeyCorner) apiKeyCorner.style.display = ''
    if (shareBtn) shareBtn.style.display = ''

    // Convert to blob and download
    canvas.toBlob(blob => {
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

function init() {
  // Randomize button
  document.getElementById('randomize-btn').addEventListener('click', randomizeMash)

  // Generate career ideas button
  document.getElementById('generate-careers-btn').addEventListener('click', generateCareerIdeas)

  document.getElementById('generate-btn').addEventListener('click', async () => {
    const apiKey = document.getElementById('api-key').value.trim()
    const engagement = document.getElementById('keyword-engagement').value.trim()
    const energy = document.getElementById('keyword-energy').value.trim()
    const flow = document.getElementById('keyword-flow').value.trim()

    if (!apiKey) return alert('Please enter your Claude API key (top right corner)')
    if (!engagement || !energy || !flow) return alert('Please fill in all three keyword fields')

    const btn = document.getElementById('generate-btn')
    btn.disabled = true
    btn.style.display = 'none'

    animateKeywordsToBottom()

    const loading = document.getElementById('loading')
    loading.classList.remove('hidden')

    try {
      const data = await getAllAssociations(apiKey, engagement, energy, flow)
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
