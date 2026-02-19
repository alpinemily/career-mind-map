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
function renderCategory(svg, data, offsetX) {
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
    .attr('transform', d => `translate(${d.x}, ${d.y})`)

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
    .style('pointer-events', 'all')
    .style('user-select', 'text')
    .style('-webkit-user-select', 'text')
    .style('cursor', 'text')
}

// Main render
function renderMindMap(data) {
  const container = document.getElementById('mindmap-container')
  container.innerHTML = ''

  const width = window.innerWidth
  const height = window.innerHeight - 70
  const sectionWidth = width / 3

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)

  const categories = ['engagement', 'energy', 'flow']

  categories.forEach((cat, i) => {
    const mapData = buildCategoryMap(data[cat], sectionWidth / 2, height / 2)
    renderCategory(svg, mapData, i * sectionWidth)
  })
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
