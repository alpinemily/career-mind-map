import { describe, it, expect, vi, beforeEach } from 'vitest'
import { callClaudeAPI, ERROR_MESSAGE } from '../apiClient.js'

function mockFetch(status, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  }))
}

beforeEach(() => vi.unstubAllGlobals())

describe('callClaudeAPI — 4xx errors', () => {
  it('throws an error on a 400', async () => {
    mockFetch(400, { error: { message: 'bad request' } })
    await expect(callClaudeAPI('key', 'prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws an error on a 401', async () => {
    mockFetch(401, { error: { message: 'invalid api key' } })
    await expect(callClaudeAPI('key', 'prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws an error on a 402 (credit balance exhausted)', async () => {
    mockFetch(402, { error: { message: 'Your credit balance is too low' } })
    await expect(callClaudeAPI('key', 'prompt')).rejects.toThrow(ERROR_MESSAGE)
  })
})

describe('callClaudeAPI — 5xx errors', () => {
  it('throws an error on a 500', async () => {
    mockFetch(500, { error: { message: 'internal server error' } })
    await expect(callClaudeAPI('key', 'prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws an error on a 500 with no body message', async () => {
    mockFetch(500, {})
    await expect(callClaudeAPI('key', 'prompt')).rejects.toThrow(ERROR_MESSAGE)
  })

  it('throws an error on a 529 (API overloaded / credits used up)', async () => {
    mockFetch(529, { error: { message: 'API temporarily unavailable due to insufficient credits' } })
    await expect(callClaudeAPI('key', 'prompt')).rejects.toThrow(ERROR_MESSAGE)
  })
})

describe('callClaudeAPI — success', () => {
  it('returns the text content on a 200 response', async () => {
    mockFetch(200, { content: [{ text: 'hello world' }] })
    const result = await callClaudeAPI('key', 'prompt')
    expect(result).toBe('hello world')
  })

  it('calls fetch with the correct URL', async () => {
    mockFetch(200, { content: [{ text: 'ok' }] })
    await callClaudeAPI('key', 'prompt')
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.any(Object)
    )
  })

  it('sends the api key in the x-api-key header', async () => {
    mockFetch(200, { content: [{ text: 'ok' }] })
    await callClaudeAPI('my-secret-key', 'prompt')
    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect(options.headers['x-api-key']).toBe('my-secret-key')
  })
})
