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
      max_tokens: 1024,
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

// Get all associations in a single API call
async function getAllAssociations(apiKey, keyword) {
  const prompt = `For the keyword "${keyword}", generate a mind map structure:
1. List 10 words/phrases closely associated with "${keyword}"
2. For each of those 10 words, list 3 related words/phrases

Return ONLY valid JSON in this exact format, no other text:
{
  "primary": [
    {"word": "first association", "secondary": ["sub1", "sub2", "sub3"]},
    {"word": "second association", "secondary": ["sub1", "sub2", "sub3"]}
  ]
}

Include exactly 10 items in the primary array, each with exactly 3 secondary words.`

  const response = await callClaudeAPI(apiKey, prompt)

  // Extract JSON from response (handle potential markdown code blocks)
  let jsonStr = response.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }

  return JSON.parse(jsonStr)
}

// Build the mind map data structure
async function buildMindMapData(apiKey, seedKeyword, updateStatus) {
  updateStatus('Generating mind map...')

  const data = await getAllAssociations(apiKey, seedKeyword)

  const nodes = [
    { id: seedKeyword, level: 0, group: 0 }
  ]
  const links = []

  // Add primary and secondary nodes
  data.primary.forEach((item, index) => {
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

// Color palette for groups
const colorPalette = [
  '#667eea', // center
  '#f093fb', '#f5576c', '#4facfe', '#43e97b',
  '#fa709a', '#fee140', '#30cfd0', '#a8edea',
  '#ff9a9e', '#fecfef'
]

// Render the mind map using D3.js
function renderMindMap(data) {
  const container = document.getElementById('mindmap-container')
  container.innerHTML = ''

  const width = container.clientWidth || 1000
  const height = container.clientHeight || 600

  const svg = d3.select(container)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])

  // Create zoom behavior
  const zoom = d3.zoom()
    .scaleExtent([0.3, 3])
    .on('zoom', (event) => {
      g.attr('transform', event.transform)
    })

  svg.call(zoom)

  const g = svg.append('g')

  // Create force simulation
  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.links)
      .id(d => d.id)
      .distance(d => {
        if (d.source.level === 0) return 150
        return 80
      })
    )
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => getRadius(d) + 10))

  // Draw links
  const link = g.append('g')
    .selectAll('line')
    .data(data.links)
    .enter()
    .append('line')
    .attr('class', 'link')
    .attr('stroke', d => colorPalette[d.source.group || 0])
    .attr('stroke-width', d => d.source.level === 0 ? 3 : 2)

  // Draw nodes
  const node = g.append('g')
    .selectAll('.node')
    .data(data.nodes)
    .enter()
    .append('g')
    .attr('class', 'node')
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended)
    )

  function getRadius(d) {
    if (d.level === 0) return 40
    if (d.level === 1) return 25
    return 15
  }

  node.append('circle')
    .attr('r', getRadius)
    .attr('fill', d => colorPalette[d.group])
    .attr('stroke', d => d3.color(colorPalette[d.group]).darker(0.5))

  node.append('text')
    .text(d => d.id.length > 15 ? d.id.substring(0, 15) + '...' : d.id)
    .attr('dy', d => d.level === 0 ? 5 : 4)
    .attr('font-size', d => {
      if (d.level === 0) return '14px'
      if (d.level === 1) return '11px'
      return '9px'
    })
    .attr('font-weight', d => d.level === 0 ? 'bold' : 'normal')

  // Tooltip for full text
  const tooltip = d3.select('body')
    .append('div')
    .attr('class', 'tooltip')
    .style('opacity', 0)

  node.on('mouseover', (event, d) => {
    tooltip.transition().duration(200).style('opacity', 1)
    tooltip.html(d.id)
      .style('left', (event.pageX + 10) + 'px')
      .style('top', (event.pageY - 10) + 'px')
  })
    .on('mouseout', () => {
      tooltip.transition().duration(200).style('opacity', 0)
    })

  // Update positions on tick
  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)

    node.attr('transform', d => `translate(${d.x},${d.y})`)
  })

  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart()
    event.subject.fx = event.subject.x
    event.subject.fy = event.subject.y
  }

  function dragged(event) {
    event.subject.fx = event.x
    event.subject.fy = event.y
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0)
    event.subject.fx = null
    event.subject.fy = null
  }
}

// Main initialization
function init() {
  const generateBtn = document.getElementById('generate-btn')
  const apiKeyInput = document.getElementById('api-key')
  const keywordInput = document.getElementById('keyword')
  const loading = document.getElementById('loading')
  const loadingText = document.getElementById('loading-text')

  generateBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim()
    const keyword = keywordInput.value.trim()

    if (!apiKey) {
      alert('Please enter your Claude API key')
      return
    }

    if (!keyword) {
      alert('Please enter a seed keyword')
      return
    }

    generateBtn.disabled = true
    loading.classList.remove('hidden')

    try {
      const data = await buildMindMapData(apiKey, keyword, (status) => {
        loadingText.textContent = status
      })

      loading.classList.add('hidden')
      renderMindMap(data)
    } catch (error) {
      console.error('Error:', error)
      alert(`Error: ${error.message}`)
      loading.classList.add('hidden')
    } finally {
      generateBtn.disabled = false
    }
  })

  // Handle Enter key
  keywordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      generateBtn.click()
    }
  })

  // Handle window resize
  window.addEventListener('resize', () => {
    const svg = document.querySelector('#mindmap-container svg')
    if (svg) {
      const container = document.getElementById('mindmap-container')
      svg.setAttribute('width', container.clientWidth)
      svg.setAttribute('height', container.clientHeight)
    }
  })
}

init()
