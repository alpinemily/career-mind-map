import { describe, it, expect } from 'vitest'
import { parseCompactAssociations } from '../parseAssociations.js'

// Minimal compact response: 3 categories, 7 associations each, 3 sub-words each
const makeRawCategory = (prefix) =>
  Array.from({ length: 7 }, (_, i) => [`${prefix}-word${i}`, 's1', 's2', 's3'])

const RAW = [
  makeRawCategory('eng'),
  makeRawCategory('nrg'),
  makeRawCategory('flw'),
]
const KEYWORDS = { engagement: 'creating new recipes', energy: 'group facilitation', flow: 'drawing' }

describe('parseCompactAssociations — keyword assignment', () => {
  it('uses the user engagement input as the engagement keyword, not the string "engagement"', () => {
    const result = parseCompactAssociations(RAW, KEYWORDS)
    expect(result.engagement.keyword).toBe('creating new recipes')
    expect(result.engagement.keyword).not.toBe('engagement')
  })

  it('uses the user energy input as the energy keyword, not the string "energy"', () => {
    const result = parseCompactAssociations(RAW, KEYWORDS)
    expect(result.energy.keyword).toBe('group facilitation')
    expect(result.energy.keyword).not.toBe('energy')
  })

  it('uses the user flow input as the flow keyword, not the string "flow"', () => {
    const result = parseCompactAssociations(RAW, KEYWORDS)
    expect(result.flow.keyword).toBe('drawing')
    expect(result.flow.keyword).not.toBe('flow')
  })
})

describe('parseCompactAssociations — associations shape', () => {
  it('returns 7 associations per category', () => {
    const result = parseCompactAssociations(RAW, KEYWORDS)
    expect(result.engagement.associations).toHaveLength(7)
    expect(result.energy.associations).toHaveLength(7)
    expect(result.flow.associations).toHaveLength(7)
  })

  it('each association has a word string', () => {
    const { associations } = parseCompactAssociations(RAW, KEYWORDS).engagement
    associations.forEach(a => expect(typeof a.word).toBe('string'))
  })

  it('each association has exactly 3 secondary words', () => {
    const { associations } = parseCompactAssociations(RAW, KEYWORDS).engagement
    associations.forEach(a => expect(a.secondary).toHaveLength(3))
  })

  it('secondary words are strings', () => {
    const { associations } = parseCompactAssociations(RAW, KEYWORDS).engagement
    associations.forEach(a =>
      a.secondary.forEach(s => expect(typeof s).toBe('string'))
    )
  })

  it('preserves the correct word values from the raw array', () => {
    const result = parseCompactAssociations(RAW, KEYWORDS)
    expect(result.engagement.associations[0].word).toBe('eng-word0')
    expect(result.flow.associations[6].word).toBe('flw-word6')
  })

  it('preserves the correct secondary values from the raw array', () => {
    const result = parseCompactAssociations(RAW, KEYWORDS)
    expect(result.energy.associations[2].secondary).toEqual(['s1', 's2', 's3'])
  })
})
