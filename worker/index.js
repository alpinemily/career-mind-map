// Cloudflare Worker — proxies Claude API calls and enforces per-IP rate limits.
//
// Setup (run these once from the worker/ directory):
//   1. npm install -g wrangler
//   2. wrangler login
//   3. wrangler kv namespace create CAREER_MIND_MAP_RATE_LIMIT
//      and paste the returned id into wrangler.toml
//   4. wrangler secret put CLAUDE_API_KEY
//   5. wrangler secret put ALLOWED_ORIGIN
//      and enter your deployed site URL e.g. https://alpinemily.github.io
//   6. wrangler secret put LOGTAIL_TOKEN
//      and enter your Better Stack source token
//   7. wrangler deploy

// /word-webs is rate limited to 5/day per IP (one per session).
// /careers is not rate limited — the UI caps it to 2 calls per session at most
// (initial generate + one optional tone switch), so the word-webs limit is sufficient.
const WORD_WEBS_DAILY_LIMIT = 5
const CAREERS_DAILY_LIMIT   = WORD_WEBS_DAILY_LIMIT * 2
const ALLOWED_PATHS = new Set(['/word-webs', '/careers', '/log-share'])

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const path = new URL(request.url).pathname
    if (!ALLOWED_PATHS.has(path)) {
      return new Response('Not found', { status: 404 })
    }

    if (path === '/word-webs') {
      const ip    = request.headers.get('CF-Connecting-IP') || 'unknown'
      const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
      const kvKey = `${path}:${ip}:${today}`
      const count = parseInt((await env.CAREER_MIND_MAP_RATE_LIMIT.get(kvKey)) || '0')

      if (count >= WORD_WEBS_DAILY_LIMIT) {
        return new Response(
          JSON.stringify({ error: 'rate_limit_exceeded' }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) } }
        )
      }

      // Increment counter with a 25-hour TTL (rolls over cleanly across timezones)
      await env.CAREER_MIND_MAP_RATE_LIMIT.put(kvKey, String(count + 1), { expirationTtl: 90000 })
    }

    // Share button was clicked on the client — just log it and return, nothing to proxy
    if (path === '/log-share') {
      if (env.LOGTAIL_TOKEN) {
        const body = await request.json()
        ctx.waitUntil(logToLogtail(env.LOGTAIL_TOKEN, {
          message:    'career-mind-map share-click',
          engagement: body.engagement ?? '',
          energy:     body.energy     ?? '',
          flow:       body.flow       ?? '',
          tone:       body.tone       ?? 'serious',
          ip:         request.headers.get('CF-Connecting-IP') || 'unknown',
        }))
      }
      return new Response('ok', { status: 200, headers: corsHeaders(request, env) })
    }

    if (path === '/careers') {
      const ip    = request.headers.get('CF-Connecting-IP') || 'unknown'
      const today = new Date().toISOString().slice(0, 10)
      const kvKey = `${path}:${ip}:${today}`
      const count = parseInt((await env.CAREER_MIND_MAP_RATE_LIMIT.get(kvKey)) || '0')

      if (count >= CAREERS_DAILY_LIMIT) {
        return new Response(
          JSON.stringify({ error: 'rate_limit_exceeded' }),
          { status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) } }
        )
      }

      await env.CAREER_MIND_MAP_RATE_LIMIT.put(kvKey, String(count + 1), { expirationTtl: 90000 })
    }

    // Proxy to Claude
    const body = await request.json()

    // Strip our metadata field before forwarding — Claude doesn't know about it
    const { _meta = {}, ...claudeBody } = body

    // Log keyword inputs from /word-webs submissions to Better Stack (fire-and-forget)
    if (path === '/word-webs' && env.LOGTAIL_TOKEN) {
      const prompt     = claudeBody.messages?.[0]?.content ?? ''
      const engagement = prompt.match(/ENGAGEMENT: "([^"]+)"/)?.[1] ?? ''
      const energy     = prompt.match(/ENERGY: "([^"]+)"/)?.[1]     ?? ''
      const flow       = prompt.match(/FLOW: "([^"]+)"/)?.[1]       ?? ''
      ctx.waitUntil(logToLogtail(env.LOGTAIL_TOKEN, {
        message:    'career-mind-map submission',
        engagement,
        energy,
        flow,
        ip: request.headers.get('CF-Connecting-IP') || 'unknown',
      }))
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    })

    const data = await claudeRes.json()

    // Log career card generation to Better Stack (fire-and-forget)
    if (path === '/careers' && env.LOGTAIL_TOKEN && claudeRes.ok) {
      const rawText = data.content?.[0]?.text ?? ''
      let careers = []
      try {
        const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
        const parsed  = JSON.parse(cleaned)
        if (Array.isArray(parsed)) {
          careers = parsed.map(c => ({ title: c.t, description: c.d }))
        }
      } catch {}
      ctx.waitUntil(logToLogtail(env.LOGTAIL_TOKEN, {
        message:    'career-mind-map careers-generated',
        engagement: _meta.engagement ?? '',
        energy:     _meta.energy     ?? '',
        flow:       _meta.flow       ?? '',
        tone:       _meta.tone       ?? 'serious',
        careers,
        ip:         request.headers.get('CF-Connecting-IP') || 'unknown',
      }))
    }

    return new Response(JSON.stringify(data), {
      status: claudeRes.status,
      headers: { 'Content-Type': 'application/json', ...corsHeaders(request, env) },
    })
  },
}

async function logToLogtail(token, payload) {
  await fetch('https://in.logs.betterstack.com', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
}

function corsHeaders(request, env) {
  const origin        = request.headers.get('Origin') || ''
  const allowed       = env.ALLOWED_ORIGIN || '*'
  const allowedOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : '')
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}
