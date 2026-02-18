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

  // Extract JSON from response (handle potential markdown code blocks)
  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }

  return JSON.parse(jsonStr)
}

// Build the mind map data structure for a single category
function buildMindMapData(categoryData) {
  const seedKeyword = categoryData.keyword
  const nodes = [
    { id: seedKeyword, level: 0, group: 0 }
  ]
  const links = []

  // Add primary and secondary nodes
  categoryData.associations.forEach((item, index) => {
    const group = index + 1

    // Add primary node
    nodes.push({ id: item.word, level: 1, group })
    links.push({ source: seedKeyword, target: item.word })

    // Add secondary nodes
    item.secondary.forEach(word => {
      // Avoid duplicate nodes
      if (!nodes.find(n => n.id === word)) {
        nodes.push({ id: word, level: 2, group })
        links.push({ source: item.word, target: word })
      }
    })
  })

  return { nodes, links }
}

// Color palette for groups - darker colors for better white text contrast
const colorPalette = [
  '#4338ca', // center - indigo
  '#9333ea', '#dc2626', '#0369a1', '#047857',
  '#be185d', '#b45309', '#0e7490'
]

// Render the mind map using D3.js
function renderMindMap(data, containerId) {
  const container = document.getElementById(containerId)
  container.innerHTML = ''

  const width = container.clientWidth || 400
  const height = container.clientHeight || 500

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])

  // Create zoom behavior (pan only, no node dragging)
  const zoom = d3.zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoom)

  // Create radial gradients for fading circles
  const defs = svg.append('defs')
  colorPalette.forEach((color, i) => {
    const gradient = defs.append('radialGradient')
      .attr('id', `fade-gradient-${containerId}-${i}`)
      .attr('cx', '50%')
      .attr('cy', '50%')
      .attr('r', '50%')

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.8)

    gradient.append('stop')
      .attr('offset', '60%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.4)

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0)
  })

  const g = svg.append('g')

  // Add randomness to each node for organic spacing
  data.nodes.forEach(node => {
    node.randomOffset = {
      distance: 0.6 + Math.random() * 0.8,
      angle: Math.random() * Math.PI * 2
    }
  })

  // Create force simulation with organic/hand-drawn feel
  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links)
      .id(d => d.id)
      .distance(d => {
        const base = d.source.level === 0 ? 80 : 40
        const variance = (Math.random() - 0.5) * 30
        return base + variance
      })
      .strength(0.3)
    )
    .force('charge', d3.forceManyBody()
      .strength(d => {
        const base = d.level === 0 ? -200 : d.level === 1 ? -100 : -50
        return base + (Math.random() - 0.5) * 50
      })
    )
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => getRadius(d) + 3))
    .force('jitter', d3.forceX().x(d => {
      return width / 2 + Math.cos(d.randomOffset.angle) * 30 * d.randomOffset.distance
    }).strength(0.02))
    .force('jitterY', d3.forceY().y(d => {
      return height / 2 + Math.sin(d.randomOffset.angle) * 30 * d.randomOffset.distance
    }).strength(0.02))

  // Draw links
  const link = g.append('g')
    .selectAll('line')
    .data(data.links)
    .enter()
    .append('line')
    .attr('class', 'link')
    .attr('stroke', d => colorPalette[d.source.group || 0])
    .attr('stroke-width', d => d.source.level === 0 ? 2 : 1.5)

  function getRadius(d) {
    if (d.level === 0) return 30
    if (d.level === 1) return 20
    return 12
  }

  // Draw nodes (no drag behavior)
  const node = g.append('g')
    .selectAll('.node')
    .data(data.nodes)
    .enter()
    .append('g')
    .attr('class', 'node')

  node.append('circle')
    .attr('r', d => getRadius(d) * 1.5)
    .attr('fill', d => `url(#fade-gradient-${containerId}-${d.group})`)
    .attr('stroke', 'none')

  // Text is selectable
  node.append('text')
    .text(d => d.id.length > 12 ? d.id.substring(0, 12) + '...' : d.id)
    .attr('dy', d => d.level === 0 ? 4 : 3)
    .attr('font-size', d => {
      if (d.level === 0) return '11px'
      if (d.level === 1) return '9px'
      return '7px'
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
      alert('Please enter your Claude API key')
      return
    }

    if (!engagement || !energy || !flow) {
      alert('Please fill in all three keyword fields')
      return
    }

    generateBtn.disabled = true
    loading.classList.remove('hidden')
    loadingText.textContent = 'Generating associations for all three categories...'

    try {
      const data = await getAllAssociations(apiKey, engagement, energy, flow)

      loading.classList.add('hidden')

      // Build and render each mind map
      const engagementData = buildMindMapData(data.engagement)
      const energyData = buildMindMapData(data.energy)
      const flowData = buildMindMapData(data.flow)

      renderMindMap(engagementData, 'mindmap-engagement')
      renderMindMap(energyData, 'mindmap-energy')
      renderMindMap(flowData, 'mindmap-flow')

    } catch (error) {
      console.error('Error:', error)
      alert(`Error: ${error.message}`)
      loading.classList.add('hidden')
    } finally {
      generateBtn.disabled = false
    }
  })

  // Handle window resize
  window.addEventListener('resize', () => {
    const containers = ['mindmap-engagement', 'mindmap-energy', 'mindmap-flow']
    containers.forEach(id => {
      const svg = document.querySelector(`#${id} svg`)
      if (svg) {
        const container = document.getElementById(id)
        svg.setAttribute('width', container.clientWidth)
        svg.setAttribute('height', container.clientHeight)
      }
    })
  })
}

init()
