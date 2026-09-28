// Keyboard formatting in a message box, the way Discord's works: Ctrl+B,
// Ctrl+I and Ctrl+U wrap what is selected in the marks lib/messageFormat.js
// reads, or unwrap it when it already is. With nothing selected, the marks
// go in around the caret, ready to type into.

/** The shortcut letters and their marks. */
export const FORMAT_KEYS = Object.freeze({ b: '**', i: '*', u: '__', e: '`' });

/** The mark a keydown asks for (Ctrl or Cmd with a letter above), or null. */
export function formatKey(event) {
  if (!event || !(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = String(event.key || '').toLowerCase();
  if (event.shiftKey) return key === 's' ? '~~' : key === 'p' ? '||' : null;
  return Object.hasOwn(FORMAT_KEYS, key) ? FORMAT_KEYS[key] : null;
}

/**
 * `value` with the selection [start, end) wrapped in `mark` (or unwrapped,
 * when it already is), and where the selection lands after. Whitespace at
 * the selection's ends stays outside the marks, since a mark next to a space
 * does not read as one.
 */
export function wrapSelection(value, start, end, mark) {
  const text = String(value ?? '');
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(text.length, Math.max(start, end));
  const picked = text.slice(from, to);
  const lead = picked.length - picked.trimStart().length;
  const trail = picked.length - picked.trimEnd().length;
  const innerFrom = from + lead;
  const innerTo = to - trail;
  const inner = text.slice(innerFrom, innerTo);
  // Already wrapped, either inside the selection or just around it: take the marks off.
  if (inner.startsWith(mark) && inner.endsWith(mark) && inner.length >= mark.length * 2) {
    const bare = inner.slice(mark.length, inner.length - mark.length);
    return { value: text.slice(0, innerFrom) + bare + text.slice(innerTo), start: innerFrom, end: innerFrom + bare.length };
  }
  if (text.slice(innerFrom - mark.length, innerFrom) === mark && text.slice(innerTo, innerTo + mark.length) === mark) {
    return {
      value: text.slice(0, innerFrom - mark.length) + inner + text.slice(innerTo + mark.length),
      start: innerFrom - mark.length,
      end: innerFrom - mark.length + inner.length,
    };
  }
  const wrapped = `${mark}${inner}${mark}`;
  return {
    value: text.slice(0, innerFrom) + wrapped + text.slice(innerTo),
    start: innerFrom + mark.length,
    end: innerFrom + mark.length + inner.length,
  };
}

/**
 * Applies a formatting shortcut to a text box in place: returns true and
 * changes its value and selection when the keydown was one, so the caller
 * can preventDefault and keep its own state in step.
 */
export function applyFormatKey(event, box, onChange) {
  const mark = formatKey(event);
  if (!mark || !box) return false;
  const next = wrapSelection(box.value, box.selectionStart ?? 0, box.selectionEnd ?? 0, mark);
  onChange(next.value);
  // The box takes the new value from React on the next paint; the selection is set after it.
  requestAnimationFrame(() => {
    try { box.setSelectionRange(next.start, next.end); } catch { /* a box that is gone */ }
  });
  return true;
}
