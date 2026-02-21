export function updateGenerateBtn(inputs, btn) {
  btn.disabled = !inputs.every(el => el.value.trim() !== '')
}
