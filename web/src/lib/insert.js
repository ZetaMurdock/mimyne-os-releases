/** `text` put where the cursor is in an input or textarea; the new value and caret. */
export function insertAt(field, value, text) {
  const start = field?.selectionStart ?? value.length;
  const end = field?.selectionEnd ?? value.length;
  return { value: value.slice(0, start) + text + value.slice(end), caret: start + text.length };
}

/** After React has put the new value in, the caret goes after what was added. */
export function placeCaret(field, caret) {
  requestAnimationFrame(() => {
    if (!field) return;
    field.focus();
    field.setSelectionRange(caret, caret);
  });
}
