import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callClaudeAssociations, callClaudeCareers, parseClaudeJSON, ERROR_MESSAGE, RATE_LIMIT_MESSAGE, FLAGGED_MESSAGE } from '../apiClient.js'

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
