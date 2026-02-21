import { describe, it, expect, beforeEach } from 'vitest'
import { updateGenerateBtn } from '../formValidation.js'

const IDS = ['keyword-engagement', 'keyword-energy', 'keyword-flow']

function setup(values = ['', '', '']) {
  document.body.innerHTML = `
    <input id="keyword-engagement" value="${values[0]}" />
    <input id="keyword-energy"     value="${values[1]}" />
    <input id="keyword-flow"       value="${values[2]}" />
    <button id="generate-btn"></button>
  `
  const inputs = IDS.map(id => document.getElementById(id))
  const btn = document.getElementById('generate-btn')
  return { inputs, btn }
}

describe('updateGenerateBtn — disabled when fields incomplete', () => {
  it('is disabled when all fields are empty', () => {
    const { inputs, btn } = setup(['', '', ''])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(true)
  })

  it('is disabled when only one field is filled', () => {
    const { inputs, btn } = setup(['group facilitation', '', ''])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(true)
  })

  it('is disabled when two fields are filled', () => {
    const { inputs, btn } = setup(['group facilitation', 'shipping a product', ''])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(true)
  })

  it('is disabled when a field is only whitespace', () => {
    const { inputs, btn } = setup(['group facilitation', 'shipping a product', '   '])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(true)
  })
})

describe('updateGenerateBtn — enabled when all fields filled', () => {
  it('is enabled when all three fields have values', () => {
    const { inputs, btn } = setup(['group facilitation', 'shipping a product', 'drawing'])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(false)
  })

  it('trims whitespace when checking — padded values count as filled', () => {
    const { inputs, btn } = setup(['  group facilitation  ', ' shipping ', ' drawing '])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(false)
  })
})

describe('updateGenerateBtn — length boundaries', () => {
  it('is enabled with a single character in each field (min length)', () => {
    const { inputs, btn } = setup(['a', 'b', 'c'])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(false)
  })

  it('is enabled with exactly 40 characters in each field (max length)', () => {
    const val = 'a'.repeat(40)
    const { inputs, btn } = setup([val, val, val])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(false)
  })
})

describe('updateGenerateBtn — reacts to value changes', () => {
  it('disables the button after a field is cleared', () => {
    const { inputs, btn } = setup(['group facilitation', 'shipping a product', 'drawing'])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(false)

    inputs[2].value = ''
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(true)
  })

  it('enables the button once the last empty field is filled', () => {
    const { inputs, btn } = setup(['group facilitation', 'shipping a product', ''])
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(true)

    inputs[2].value = 'drawing'
    updateGenerateBtn(inputs, btn)
    expect(btn.disabled).toBe(false)
  })
})
