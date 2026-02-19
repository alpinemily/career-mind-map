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
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error?.message || 'API request failed')
  }

  const data = await response.json()
  return data.content[0].text
}

// Get all associations for 3 keywords in a single API call
async function getAllAssociations(apiKey, engagement, energy, flow) {
  const prompt = `Generate word associations for a career mind map exercise. I have 3 keyphrases representing different aspects of career fulfillment:

1. ENGAGEMENT: "${engagement}"
2. ENERGY: "${energy}"
3. FLOW: "${flow}"

For EACH of these 3 keyphrases:
- Generate exactly 7 closely associated words or short phrases
- For each of those 7 words, generate exactly 3 related words or short phrases

Return ONLY valid JSON in this exact format, no other text:
{
  "engagement": {
    "keyword": "${engagement}",
    "associations": [
      {"word": "association1", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association2", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association3", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association4", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association5", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association6", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association7", "secondary": ["sub1", "sub2", "sub3"]}
    ]
  },
  "energy": {
    "keyword": "${energy}",
    "associations": [
      {"word": "association1", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association2", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association3", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association4", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association5", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association6", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association7", "secondary": ["sub1", "sub2", "sub3"]}
    ]
  },
  "flow": {
    "keyword": "${flow}",
    "associations": [
      {"word": "association1", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association2", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association3", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association4", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association5", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association6", "secondary": ["sub1", "sub2", "sub3"]},
      {"word": "association7", "secondary": ["sub1", "sub2", "sub3"]}
    ]
  }
}`

  const response = await callClaudeAPI(apiKey, prompt)

  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }

  return JSON.parse(jsonStr)
}

// Color palette - each group gets a different color (like the original)
const colorPalette = [
  '#4338ca', // center - indigo
  '#9333ea', '#dc2626', '#0369a1', '#047857',
  '#be185d', '#b45309', '#0e7490'
]

// Build unified mind map data with all 3 categories enmeshed
function buildUnifiedMindMapData(data, width, height) {
  const nodes = []
  const links = []

  // Horizontal layout - spread across the width
  const padding = 100
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2

  // Centers spread horizontally but slightly staggered vertically
  const centers = {
    engagement: { x: padding + usableWidth * 0.2, y: height * 0.45 },
    energy: { x: padding + usableWidth * 0.5, y: height * 0.4 },
    flow: { x: padding + usableWidth * 0.8, y: height * 0.5 }
  }

  const categories = ['engagement', 'energy', 'flow']

  categories.forEach((category, catIndex) => {
    const categoryData = data[category]
    const center = centers[category]

    // Add center node
    nodes.push({
      id: `${category}-center`,
      label: categoryData.keyword,
      level: 0,
      category,
      group: 0,
      color: colorPalette[0],
      fx: center.x,
      fy: center.y
    })

    // Add primary and secondary nodes
    categoryData.associations.forEach((item, index) => {
      const primaryId = `${category}-primary-${index}`
      // Spread primary nodes in a wider arc
      const angleOffset = catIndex === 0 ? Math.PI : catIndex === 1 ? Math.PI * 0.5 : 0
      const angle = (index / 7) * Math.PI * 1.5 + angleOffset - Math.PI * 0.25

      const groupColor = colorPalette[(index % 7) + 1]

      nodes.push({
        id: primaryId,
        label: item.word,
        level: 1,
        category,
        group: index + 1,
        color: groupColor,
        initialAngle: angle,
        initialDistance: 150
      })

      links.push({
        source: `${category}-center`,
        target: primaryId,
        category,
        color: groupColor
      })

      // Add secondary nodes - push them toward edges
      item.secondary.forEach((word, secIndex) => {
        const secondaryId = `${category}-secondary-${index}-${secIndex}`
        const secAngle = angle + ((secIndex - 1) * 0.3)

        nodes.push({
          id: secondaryId,
          label: word,
          level: 2,
          category,
          group: index + 1,
          color: groupColor,
          initialAngle: secAngle,
          initialDistance: 100
        })

        links.push({
          source: primaryId,
          target: secondaryId,
          category,
          color: groupColor
        })
      })
    })
  })

  return { nodes, links, centers }
}

// Render the unified mind map
function renderMindMap(data) {
  const container = document.getElementById('mindmap-container')
  container.innerHTML = ''

  const width = window.innerWidth
  const height = window.innerHeight - 80 // Leave room for keywords at bottom

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)

  // Create zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoom)

  // Build unified data
  const mapData = buildUnifiedMindMapData(data, width, height)

  // Create radial gradients for each color
  const defs = svg.append('defs')

  colorPalette.forEach((color, i) => {
    const gradient = defs.append('radialGradient')
      .attr('id', `fade-gradient-${i}`)
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%')

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.7)

    gradient.append('stop')
      .attr('offset', '50%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.3)

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0)
  })

  const g = svg.append('g')

  // Initialize positions - push secondary nodes toward edges
  const padding = 60
  mapData.nodes.forEach(node => {
    if (node.level === 0) return

    const centerNode = mapData.nodes.find(n => n.id === `${node.category}-center`)
    const angle = node.initialAngle || Math.random() * Math.PI * 2
    const baseDist = node.level === 1 ? 150 : 220
    const dist = baseDist + (Math.random() - 0.5) * 50

    let x = centerNode.fx + Math.cos(angle) * dist
    let y = centerNode.fy + Math.sin(angle) * dist

    // For level 2 nodes, push toward edges
    if (node.level === 2) {
      // Push toward nearest edge
      const distToLeft = x
      const distToRight = width - x
      const distToTop = y
      const distToBottom = height - y

      const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom)

      if (minDist === distToLeft) x = Math.max(padding, x - 30)
      else if (minDist === distToRight) x = Math.min(width - padding, x + 30)
      else if (minDist === distToTop) y = Math.max(padding, y - 30)
      else y = Math.min(height - padding, y + 30)
    }

    node.x = x
    node.y = y
  })

  // Create force simulation
  const simulation = d3.forceSimulation(mapData.nodes)
    .force('link', d3.forceLink(mapData.links)
      .id(d => d.id)
      .distance(d => {
        const sourceLevel = mapData.nodes.find(n => n.id === (d.source.id || d.source))?.level || 0
        if (sourceLevel === 0) return 120 + Math.random() * 40
        return 70 + Math.random() * 30
      })
      .strength(0.3)
    )
    .force('charge', d3.forceManyBody()
      .strength(d => {
        if (d.level === 0) return -400
        if (d.level === 1) return -200
        return -100
      })
    )
    .force('collision', d3.forceCollide()
      .radius(d => {
        const textLen = d.label.length
        return Math.max(textLen * 4.5 + 25, 35)
      })
      .strength(1)
    )
    // Keep primary nodes near their center, let secondary nodes spread to edges
    .force('x', d3.forceX(d => {
      if (d.level === 0) return d.fx
      if (d.level === 2) {
        // Push toward left or right edge based on position
        const centerNode = mapData.nodes.find(n => n.id === `${d.category}-center`)
        if (d.x < centerNode.fx) return padding + 50
        return width - padding - 50
      }
      const centerNode = mapData.nodes.find(n => n.id === `${d.category}-center`)
      return centerNode?.fx || width / 2
    }).strength(d => d.level === 0 ? 1 : d.level === 2 ? 0.05 : 0.02))
    .force('y', d3.forceY(d => {
      if (d.level === 0) return d.fy
      if (d.level === 2) {
        // Push toward top or bottom based on position
        if (d.y < height / 2) return padding + 50
        return height - padding - 50
      }
      const centerNode = mapData.nodes.find(n => n.id === `${d.category}-center`)
      return centerNode?.fy || height / 2
    }).strength(d => d.level === 0 ? 1 : d.level === 2 ? 0.05 : 0.02))
    // Keep nodes within bounds
    .force('bounds', () => {
      mapData.nodes.forEach(node => {
        if (node.level === 0) return
        node.x = Math.max(padding, Math.min(width - padding, node.x))
        node.y = Math.max(padding, Math.min(height - padding, node.y))
      })
    })

  // Draw links
  const link = g.append('g')
    .selectAll('line')
    .data(mapData.links)
    .enter()
    .append('line')
    .attr('class', 'link')
    .attr('stroke', d => d.color || '#666')
    .attr('stroke-width', 1.5)

  // Draw nodes
  const node = g.append('g')
    .selectAll('.node')
    .data(mapData.nodes)
    .enter()
    .append('g')
    .attr('class', 'node')

  function getRadius(d) {
    if (d.level === 0) return 45
    if (d.level === 1) return 28
    return 16
  }

  node.append('circle')
    .attr('r', d => getRadius(d) * 1.5)
    .attr('fill', d => `url(#fade-gradient-${d.group})`)
    .attr('stroke', 'none')

  // Text - no truncation
  node.append('text')
    .text(d => d.label)
    .attr('dy', d => d.level === 0 ? 5 : 4)
    .attr('font-size', d => {
      if (d.level === 0) return '12px'
      if (d.level === 1) return '10px'
      return '8px'
    })
    .attr('font-weight', d => d.level === 0 ? 'bold' : 'normal')
    .style('pointer-events', 'auto')
    .style('user-select', 'text')
    .style('cursor', 'text')

  // Update positions on tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)

    node.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  simulation.alpha(1).restart()
}

// Animation: animate keywords from input positions to bottom
function animateKeywordsToBottom() {
  return new Promise(resolve => {
    const engagementInput = document.getElementById('keyword-engagement')
    const energyInput = document.getElementById('keyword-energy')
    const flowInput = document.getElementById('keyword-flow')

    const engagement = engagementInput.value.trim()
    const energy = energyInput.value.trim()
    const flow = flowInput.value.trim()

    // Get positions of inputs
    const engRect = engagementInput.getBoundingClientRect()
    const energyRect = energyInput.getBoundingClientRect()
    const flowRect = flowInput.getBoundingClientRect()

    // Create floating elements at input positions
    const createFloater = (text, rect, id) => {
      const el = document.createElement('div')
      el.className = 'keyword-floater'
      el.id = id
      el.textContent = text
      el.style.position = 'fixed'
      el.style.left = rect.left + 'px'
      el.style.top = rect.top + 'px'
      el.style.width = rect.width + 'px'
      el.style.padding = '0.75rem 1rem'
      el.style.background = 'rgba(255,255,255,0.1)'
      el.style.border = '1px solid rgba(255,255,255,0.2)'
      el.style.borderRadius = '8px'
      el.style.color = 'white'
      el.style.fontSize = '1rem'
      el.style.zIndex = '1000'
      el.style.transition = 'all 0.8s ease-in-out'
      document.body.appendChild(el)
      return el
    }

    const floater1 = createFloater(engagement, engRect, 'floater-engagement')
    const floater2 = createFloater(energy, energyRect, 'floater-energy')
    const floater3 = createFloater(flow, flowRect, 'floater-flow')

    // Hide form elements (but keep floaters visible)
    const formContainer = document.getElementById('form-container')
    formContainer.style.opacity = '0'
    formContainer.style.pointerEvents = 'none'

    // After a brief delay, animate floaters to bottom
    setTimeout(() => {
      const bottomY = window.innerHeight - 60
      const centerX = window.innerWidth / 2

      // Animate to pill style at bottom
      const animateToBottom = (el, targetX) => {
        el.style.left = targetX + 'px'
        el.style.top = bottomY + 'px'
        el.style.width = 'auto'
        el.style.padding = '0.5rem 1rem'
        el.style.borderRadius = '20px'
        el.style.fontSize = '0.85rem'
        el.style.transform = 'translateX(-50%)'
      }

      animateToBottom(floater1, centerX - 150)
      animateToBottom(floater2, centerX)
      animateToBottom(floater3, centerX + 150)

      setTimeout(() => {
        // Transfer to permanent display
        const display = document.getElementById('keywords-display')
        document.getElementById('display-engagement').textContent = engagement
        document.getElementById('display-energy').textContent = energy
        document.getElementById('display-flow').textContent = flow

        display.classList.remove('hidden')
        display.classList.add('visible')

        // Remove floaters
        floater1.remove()
        floater2.remove()
        floater3.remove()

        // Hide form container completely
        formContainer.classList.add('hidden')

        resolve()
      }, 800)
    }, 100)
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

// Main initialization
function init() {
  const generateBtn = document.getElementById('generate-btn')
  const apiKeyInput = document.getElementById('api-key')
  const engagementInput = document.getElementById('keyword-engagement')
  const energyInput = document.getElementById('keyword-energy')
  const flowInput = document.getElementById('keyword-flow')
  const loading = document.getElementById('loading')
  const loadingText = document.getElementById('loading-text')

  generateBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim()
    const engagement = engagementInput.value.trim()
    const energy = energyInput.value.trim()
    const flow = flowInput.value.trim()

    if (!apiKey) {
      alert('Please enter your Claude API key (top right corner)')
      return
    }

    if (!engagement || !energy || !flow) {
      alert('Please fill in all three keyword fields')
      return
    }

    generateBtn.disabled = true
    generateBtn.style.display = 'none'

    // Start animating keywords to bottom immediately
    animateKeywordsToBottom()

    // Show loading (positioned in center)
    loading.classList.remove('hidden')
    loadingText.textContent = 'Generating your career mind map...'

    try {
      const data = await getAllAssociations(apiKey, engagement, energy, flow)

      // Hide loading
      loading.classList.add('hidden')

      // Show and render mind map
      await showMindMap()
      renderMindMap(data)

    } catch (error) {
      console.error('Error:', error)
      alert(`Error: ${error.message}`)
      loading.classList.add('hidden')

      // Reset form
      const formContainer = document.getElementById('form-container')
      formContainer.style.opacity = '1'
      formContainer.style.pointerEvents = 'auto'
      formContainer.classList.remove('hidden')
      generateBtn.style.display = 'block'
      generateBtn.disabled = false

      // Remove any floaters
      document.querySelectorAll('.keyword-floater').forEach(el => el.remove())
    }
  })
}

init()
