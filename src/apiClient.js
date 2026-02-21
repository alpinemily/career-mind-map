export const ERROR_MESSAGE        = "Something went wrong. Text Emily and let her know? If you don't know Emily, um, why are you even here?"
export const RATE_LIMIT_MESSAGE   = "You've hit the daily usage limit. Come back tomorrow. Emily's api credit budget thanks you. 🥺👉👈"
export const FLAGGED_MESSAGE      = "Please try different words."

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

async function postToWorker(path, prompt) {
  let response
  try {
    response = await fetch(`${WORKER}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:    'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
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

export const callClaudeAssociations = (prompt) => postToWorker('/word-webs', prompt)
export const callClaudeCareers      = (prompt) => postToWorker('/careers',      prompt)

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
