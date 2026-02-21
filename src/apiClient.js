export const ERROR_MESSAGE        = "Something went wrong. Text Emily and let her know? If you don't know Emily, um, why are you even here?"
export const RATE_LIMIT_MESSAGE   = "You've hit the daily usage limit. Emily's api credit budget thanks you 🥺👉👈. Come back tomorrow, and in the meanwhile you may enjoy staring at this spiral."
export const FLAGGED_MESSAGE      = "Something went wrong. Please try different words."

// Parse Claude's response text as JSON. Claude occasionally refuses with prose instead of
// JSON — that produces a SyntaxError, which we surface as a clear user-facing message.
export function parseClaudeJSON(rawText) {
  let jsonStr = rawText.trim()
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
  }
  try {
    return JSON.parse(jsonStr)
  } catch {
    throw new Error(FLAGGED_MESSAGE)
  }
}

const WORKER = import.meta.env.VITE_WORKER_URL ?? ''

async function postToWorker(path, prompt, meta = {}) {
  let response
  try {
    response = await fetch(`${WORKER}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
        ...(Object.keys(meta).length > 0 && { _meta: meta }),
      }),
    })
  } catch {
    throw new Error(ERROR_MESSAGE)
  }

  if (response.status === 429) throw new Error(RATE_LIMIT_MESSAGE)
  if (!response.ok)            throw new Error(ERROR_MESSAGE)

  const data = await response.json()
  return data.content[0].text
}
 
export const callClaudeAssociations = (prompt)       => postToWorker('/word-webs', prompt)
export const callClaudeCareers      = (prompt, meta) => postToWorker('/careers', prompt, meta)

// Fire-and-forget share-click log. Never throws — logging must not affect UX.
export async function callLogShare(engagement, energy, flow, tone) {
  try {
    await fetch(`${WORKER}/log-share`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ engagement, energy, flow, tone }),
    })
  } catch {}
}

// Staging mode: hit Claude directly with a user-supplied key (bypasses the Worker)
export async function callClaudeDirect(apiKey, prompt) {
  let response
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages:   [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    throw new Error(ERROR_MESSAGE)
  }
  if (!response.ok) throw new Error(ERROR_MESSAGE)
  const data = await response.json()
  return data.content[0].text
}
