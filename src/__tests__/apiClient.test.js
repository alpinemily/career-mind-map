import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callClaudeAssociations, callClaudeCareers, callWithFallback, parseClaudeJSON, ERROR_MESSAGE, RATE_LIMIT_MESSAGE, FLAGGED_MESSAGE } from '../apiClient.js'

function mockFetch(status, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }))
}

function mockFetchNetworkError() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
}

beforeEach(() => vi.unstubAllGlobals())

// ── parseClaudeJSON ────────────────────────────────────────────────────────

describe('parseClaudeJSON', () => {
  it('parses a plain JSON object', () => {
    expect(parseClaudeJSON('{"a":1}')).toEqual({ a: 1 })
  })

  it('parses a plain JSON array', () => {
    expect(parseClaudeJSON('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('strips a ```json ... ``` code fence before parsing', () => {
    const fenced = '```json\n[{"t":"Title","d":"Desc"}]\n```'
    expect(parseClaudeJSON(fenced)).toEqual([{ t: 'Title', d: 'Desc' }])
  })

  it('strips a plain ``` ... ``` code fence before parsing', () => {
    const fenced = '```\n{"key":"val"}\n```'
    expect(parseClaudeJSON(fenced)).toEqual({ key: 'val' })
  })

  it('trims leading/trailing whitespace before parsing', () => {
    expect(parseClaudeJSON('  [1]  ')).toEqual([1])
  })

  it('throws FLAGGED_MESSAGE when Claude responds with refusal prose', () => {
    expect(() => parseClaudeJSON("I'm sorry, I can't help with that request."))
      .toThrow(FLAGGED_MESSAGE)
  })

  it('throws FLAGGED_MESSAGE on any other non-JSON text', () => {
    expect(() => parseClaudeJSON('not json at all')).toThrow(FLAGGED_MESSAGE)
  })

  it('throws FLAGGED_MESSAGE on an empty string', () => {
    expect(() => parseClaudeJSON('')).toThrow(FLAGGED_MESSAGE)
  })
})

// ── error handling ─────────────────────────────────────────────────────────

describe('callClaudeAssociations — errors', () => {
  it('throws ERROR_MESSAGE on a network failure (e.g. CORS error)', async () => {
    mockFetchNetworkError()
    await expect(callClaudeAssociations('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws ERROR_MESSAGE on a 400', async () => {
    mockFetch(400, {})
    await expect(callClaudeAssociations('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws ERROR_MESSAGE on a 401', async () => {
    mockFetch(401, {})
    await expect(callClaudeAssociations('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws ERROR_MESSAGE on a 500', async () => {
    mockFetch(500, {})
    await expect(callClaudeAssociations('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws ERROR_MESSAGE on a 529', async () => {
    mockFetch(529, {})
    await expect(callClaudeAssociations('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws RATE_LIMIT_MESSAGE on a 429', async () => {
    mockFetch(429, { error: 'rate_limit_exceeded' })
    await expect(callClaudeAssociations('prompt')).rejects.toThrow(RATE_LIMIT_MESSAGE)
  })
})

describe('callClaudeCareers — errors', () => {
  it('throws ERROR_MESSAGE on a network failure (e.g. CORS error)', async () => {
    mockFetchNetworkError()
    await expect(callClaudeCareers('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws ERROR_MESSAGE on a 400', async () => {
    mockFetch(400, {})
    await expect(callClaudeCareers('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws ERROR_MESSAGE on a 500', async () => {
    mockFetch(500, {})
    await expect(callClaudeCareers('prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws RATE_LIMIT_MESSAGE on a 429', async () => {
    mockFetch(429, { error: 'rate_limit_exceeded' })
    await expect(callClaudeCareers('prompt')).rejects.toThrow(RATE_LIMIT_MESSAGE)
  })
})

// ── success ────────────────────────────────────────────────────────────────

describe('callClaudeAssociations — success', () => {
  it('returns the text content on 200', async () => {
    mockFetch(200, { content: [{ text: 'result' }] })
    expect(await callClaudeAssociations('prompt')).toBe('result')
  })

  it('calls fetch with the /mind-maps path', async () => {
    mockFetch(200, { content: [{ text: 'ok' }] })
    await callClaudeAssociations('prompt')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/mind-maps')
  })

  it('does not send an x-api-key header', async () => {
    mockFetch(200, { content: [{ text: 'ok' }] })
    await callClaudeAssociations('prompt')
    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(options.headers['x-api-key']).toBeUndefined()
  })
})

describe('callClaudeCareers — success', () => {
  it('returns the text content on 200', async () => {
    mockFetch(200, { content: [{ text: 'career result' }] })
    expect(await callClaudeCareers('prompt')).toBe('career result')
  })

  it('calls fetch with the /careers path', async () => {
    mockFetch(200, { content: [{ text: 'ok' }] })
    await callClaudeCareers('prompt')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('/careers')
  })
})

// ── callWithFallback ───────────────────────────────────────────────────────

// Response shape helpers matching each provider's actual API format
const anthropicOk = (text = 'result') => ({
  ok: true, status: 200,
  json: () => Promise.resolve({ content: [{ text }] }),
})
const openaiOk = (text = 'result') => ({
  ok: true, status: 200,
  json: () => Promise.resolve({ choices: [{ message: { content: text } }] }),
})
const failRes = (status = 500) => ({
  ok: false, status,
  json: () => Promise.resolve({}),
})

function mockSequence(...responses) {
  let mock = vi.fn()
  for (const r of responses) {
    mock = r instanceof Error
      ? mock.mockRejectedValueOnce(r)
      : mock.mockResolvedValueOnce(r)
  }
  vi.stubGlobal('fetch', mock)
}

describe('callWithFallback — first attempt success', () => {
  it('returns anthropic result immediately with one fetch call', async () => {
    mockSequence(anthropicOk('hello'))
    const result = await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    expect(result).toBe('hello')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('returns openai result immediately with one fetch call', async () => {
    mockSequence(openaiOk('hello'))
    const result = await callWithFallback({ provider: 'openai', apiKey: 'o-key', fallbackApiKey: null, prompt: 'p' })
    expect(result).toBe('hello')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('calls the anthropic endpoint for anthropic provider', async () => {
    mockSequence(anthropicOk())
    await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('anthropic.com')
  })

  it('calls the openai endpoint for openai provider', async () => {
    mockSequence(openaiOk())
    await callWithFallback({ provider: 'openai', apiKey: 'o-key', fallbackApiKey: null, prompt: 'p' })
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toContain('openai.com')
  })
})

describe('callWithFallback — retries within primary provider', () => {
  it('succeeds on 2nd attempt after one failure', async () => {
    mockSequence(failRes(), anthropicOk('ok'))
    const result = await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    expect(result).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('succeeds on 3rd attempt (last retry) after two failures', async () => {
    mockSequence(failRes(), failRes(), anthropicOk('ok'))
    const result = await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    expect(result).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('retries on network errors as well as HTTP errors', async () => {
    mockSequence(new TypeError('Failed to fetch'), anthropicOk('ok'))
    const result = await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    expect(result).toBe('ok')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not exceed MAX_RETRIES — stops after 3 total attempts', async () => {
    mockSequence(failRes(), failRes(), failRes(), anthropicOk('should not reach'))
    await expect(
      callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    ).rejects.toThrow(ERROR_MESSAGE)
    expect(fetch).toHaveBeenCalledTimes(3)
  })
})

describe('callWithFallback — provider fallback', () => {
  it('falls back to openai after all anthropic retries are exhausted', async () => {
    mockSequence(failRes(), failRes(), failRes(), openaiOk('fallback'))
    const result = await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: 'o-key', prompt: 'p' })
    expect(result).toBe('fallback')
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('falls back to anthropic after all openai retries are exhausted', async () => {
    mockSequence(failRes(), failRes(), failRes(), anthropicOk('fallback'))
    const result = await callWithFallback({ provider: 'openai', apiKey: 'o-key', fallbackApiKey: 'a-key', prompt: 'p' })
    expect(result).toBe('fallback')
    expect(fetch).toHaveBeenCalledTimes(4)
  })

  it('calls primary endpoint for first 3 attempts then fallback endpoint', async () => {
    mockSequence(failRes(), failRes(), failRes(), openaiOk())
    await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: 'o-key', prompt: 'p' })
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url)
    expect(urls.slice(0, 3).every(u => u.includes('anthropic.com'))).toBe(true)
    expect(urls[3]).toContain('openai.com')
  })

  it('uses the fallback api key, not the primary key, for the fallback call', async () => {
    mockSequence(failRes(), failRes(), failRes(), openaiOk())
    await callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: 'o-key', prompt: 'p' })
    const [, fallbackOpts] = vi.mocked(fetch).mock.calls[3]
    expect(fallbackOpts.headers['Authorization']).toBe('Bearer o-key')
  })

  it('skips fallback and throws when no fallback key is provided', async () => {
    mockSequence(failRes(), failRes(), failRes())
    await expect(
      callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    ).rejects.toThrow(ERROR_MESSAGE)
    expect(fetch).toHaveBeenCalledTimes(3) // no 4th call to fallback
  })

  it('throws the original primary error when both providers fail', async () => {
    mockSequence(failRes(), failRes(), failRes(), failRes())
    await expect(
      callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: 'o-key', prompt: 'p' })
    ).rejects.toThrow(ERROR_MESSAGE)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})

describe('callWithFallback — rate limit short-circuit', () => {
  const rateLimitRes = { ok: false, status: 429, json: () => Promise.resolve({}) }

  it('throws RATE_LIMIT_MESSAGE on 429 from anthropic', async () => {
    mockSequence(rateLimitRes)
    await expect(
      callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: 'o-key', prompt: 'p' })
    ).rejects.toThrow(RATE_LIMIT_MESSAGE)
  })

  it('throws RATE_LIMIT_MESSAGE on 429 from openai', async () => {
    mockSequence(rateLimitRes)
    await expect(
      callWithFallback({ provider: 'openai', apiKey: 'o-key', fallbackApiKey: 'a-key', prompt: 'p' })
    ).rejects.toThrow(RATE_LIMIT_MESSAGE)
  })

  it('does not retry on 429', async () => {
    mockSequence(rateLimitRes, anthropicOk('should not reach'))
    await expect(
      callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: null, prompt: 'p' })
    ).rejects.toThrow(RATE_LIMIT_MESSAGE)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not fall back to other provider on 429', async () => {
    mockSequence(rateLimitRes, openaiOk('should not reach'))
    await expect(
      callWithFallback({ provider: 'anthropic', apiKey: 'a-key', fallbackApiKey: 'o-key', prompt: 'p' })
    ).rejects.toThrow(RATE_LIMIT_MESSAGE)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
