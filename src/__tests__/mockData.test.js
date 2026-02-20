import { describe, it, expect } from 'vitest'
import { MOCK_ASSOCIATIONS, getMockCareerIdeas } from '../mockData.js'

describe('MOCK_ASSOCIATIONS structure', () => {
  it('has the three required category keys', () => {
    expect(MOCK_ASSOCIATIONS).toHaveProperty('engagement')
    expect(MOCK_ASSOCIATIONS).toHaveProperty('energy')
    expect(MOCK_ASSOCIATIONS).toHaveProperty('flow')
  })

  it.each(['engagement', 'energy', 'flow'])('%s has a keyword string', category => {
    expect(typeof MOCK_ASSOCIATIONS[category].keyword).toBe('string')
    expect(MOCK_ASSOCIATIONS[category].keyword.length).toBeGreaterThan(0)
  })

  it.each(['engagement', 'energy', 'flow'])('%s has exactly 7 primary associations', category => {
    expect(MOCK_ASSOCIATIONS[category].associations).toHaveLength(7)
  })

  it.each(['engagement', 'energy', 'flow'])('%s associations each have exactly 3 secondary words', category => {
    for (const assoc of MOCK_ASSOCIATIONS[category].associations) {
      expect(assoc.secondary).toHaveLength(3)
    }
  })

  it.each(['engagement', 'energy', 'flow'])('%s associations all have non-empty word strings', category => {
    for (const assoc of MOCK_ASSOCIATIONS[category].associations) {
      expect(typeof assoc.word).toBe('string')
      expect(assoc.word.length).toBeGreaterThan(0)
      for (const s of assoc.secondary) {
        expect(typeof s).toBe('string')
        expect(s.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('getMockCareerIdeas', () => {
  const threeGroups = [['a', 'b', 'c'], ['d', 'e', 'f'], ['g', 'h', 'i']]

  it('returns one idea per group', () => {
    expect(getMockCareerIdeas(threeGroups, 'serious')).toHaveLength(3)
    expect(getMockCareerIdeas(threeGroups, 'playful')).toHaveLength(3)
  })

  it('each idea has a groupIndex matching its position', () => {
    const ideas = getMockCareerIdeas(threeGroups, 'serious')
    ideas.forEach((idea, i) => expect(idea.groupIndex).toBe(i))
  })

  it('each idea has a non-empty title and description', () => {
    for (const tone of ['serious', 'playful']) {
      for (const idea of getMockCareerIdeas(threeGroups, tone)) {
        expect(idea.title.length).toBeGreaterThan(0)
        expect(idea.description.length).toBeGreaterThan(0)
      }
    }
  })

  it('serious and playful tones return different titles', () => {
    const serious = getMockCareerIdeas(threeGroups, 'serious')
    const playful = getMockCareerIdeas(threeGroups, 'playful')
    expect(serious[0].title).not.toBe(playful[0].title)
  })

  it('defaults to serious when tone is omitted', () => {
    const withTone    = getMockCareerIdeas(threeGroups, 'serious')
    const withDefault = getMockCareerIdeas(threeGroups)
    expect(withDefault[0].title).toBe(withTone[0].title)
  })

  it('falls back to serious for an unrecognised tone', () => {
    const serious  = getMockCareerIdeas(threeGroups, 'serious')
    const fallback = getMockCareerIdeas(threeGroups, 'nonsense')
    expect(fallback[0].title).toBe(serious[0].title)
  })

  it('cycles through the pool when groups exceed pool length', () => {
    const manyGroups = Array.from({ length: 10 }, (_, i) => [`w${i}`])
    const ideas = getMockCareerIdeas(manyGroups, 'serious')
    expect(ideas).toHaveLength(10)
    // index 0 and index 8 (pool size is 8) should have the same title
    expect(ideas[0].title).toBe(ideas[8].title)
  })
})
