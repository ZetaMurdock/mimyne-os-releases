// A message put together the way Discord's can be: **bold**, *italic*,
// __underline__, ~~struck~~, `code`, ```code blocks```, ||spoilers||,
// > quotes, # headers, - lists, -# subtext, links and @mentions.
//
// The text is parsed into a small tree of plain objects and never into
// HTML: the renderer (components/MessageText.jsx) turns each node into a
// React element, so nothing anyone types can become markup. Anything that
// does not close, or is escaped with a backslash, is shown as it was typed,
// which is what people expect when a lone asterisk is just an asterisk.

const MAX_LENGTH = 20000;

/** Inline marks, longest first so ** is seen before *. */
const MARKS = [
  { marker: '||', type: 'spoiler' },
  { marker: '**', type: 'bold' },
  { marker: '__', type: 'underline' },
  { marker: '~~', type: 'strike' },
  { marker: '*', type: 'italic' },
  { marker: '_', type: 'italic', word: true },
];

const ESCAPABLE = '\\*_~`|#>-@<[]()';
// A username is 3 to 20 letters, digits and underscores (lib/share.js).
const MENTION = /^@([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/;
const URL = /^https?:\/\/[^\s<>]+/;
const LETTER = /[\p{L}\p{N}]/u;

/** Where `marker` closes, from `from` on, or -1. A single * or _ is never half of a double one. */
function findClose(text, from, marker) {
  let at = text.indexOf(marker, from);
  while (at !== -1) {
    const single = marker.length === 1;
    const doubled = single && (text[at + 1] === marker || text[at - 1] === marker);
    const empty = at === from;
    if (!doubled && !empty && !/\s/.test(text[at - 1])) {
      // ***both*** is bold around italic: a triple closes a triple, so the
      // third character stays inside for the single mark to close on.
      if (!single && text[at + 2] === marker[0] && text[from] === marker[0]) return at + 1;
      return at;
    }
    at = text.indexOf(marker, at + 1);
  }
  return -1;
}

/** A URL's trailing punctuation is the sentence's, not the link's. */
function trimUrl(url) {
  let out = url.replace(/[.,;:!?'"]+$/, '');
  while (out.endsWith(')') && (out.match(/\(/g) || []).length < (out.match(/\)/g) || []).length) out = out.slice(0, -1);
  return out;
}

/** The inline nodes of one line: text, bold, italic, underline, strike, code, spoiler, link, mention. */
export function parseInline(text) {
  const nodes = [];
  let buf = '';
  const flush = () => { if (buf) { nodes.push({ type: 'text', text: buf }); buf = ''; } };
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      buf += text[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        nodes.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    const mark = MARKS.find((m) => text.startsWith(m.marker, i));
    if (mark) {
      const open = i + mark.marker.length;
      // A word-bound mark (_) only opens where a word starts, so snake_case is left alone.
      const bounded = !mark.word || i === 0 || !LETTER.test(text[i - 1]);
      const close = bounded && !/\s/.test(text[open] ?? ' ') ? findClose(text, open, mark.marker) : -1;
      const after = close === -1 ? '' : (text[close + mark.marker.length] ?? '');
      if (close !== -1 && (!mark.word || !LETTER.test(after))) {
        flush();
        nodes.push({ type: mark.type, children: parseInline(text.slice(open, close)) });
        i = close + mark.marker.length;
        continue;
      }
    }
    if (ch === '<') {
      const quiet = /^<(https?:\/\/[^\s<>]+)>/.exec(text.slice(i));
      if (quiet) {
        flush();
        nodes.push({ type: 'link', href: quiet[1], text: quiet[1], quiet: true });
        i += quiet[0].length;
        continue;
      }
    }
    if (ch === 'h') {
      const url = URL.exec(text.slice(i));
      if (url) {
        const href = trimUrl(url[0]);
        flush();
        nodes.push({ type: 'link', href, text: href });
        i += href.length;
        continue;
      }
    }
    if (ch === '@' && (i === 0 || !LETTER.test(text[i - 1]))) {
      const mention = MENTION.exec(text.slice(i));
      if (mention) {
        flush();
        nodes.push({ type: 'mention', name: mention[1] });
        i += mention[0].length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return nodes;
}

/**
 * The blocks of a message: paragraph (lines of inline nodes), code (with a
 * language), quote (lines), heading (level 1-3), subtext, list (items,
 * ordered or not). Blank lines separate paragraphs.
 */
export function parseMessage(text) {
  const source = String(text ?? '').slice(0, MAX_LENGTH).replace(/\r\n?/g, '\n');
  const lines = source.split('\n');
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph.map(parseInline) });
    paragraph = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      flush();
      const rest = line.slice(3);
      const sameLine = rest.indexOf('```');
      if (sameLine !== -1) {
        // ```like this``` on one line.
        blocks.push({ type: 'code', language: '', text: rest.slice(0, sameLine) });
        const tail = rest.slice(sameLine + 3);
        if (tail.trim()) paragraph.push(tail);
        i += 1;
        continue;
      }
      const language = /^[\w+#.-]{0,20}$/.test(rest.trim()) ? rest.trim() : '';
      const body = language === rest.trim() ? [] : [rest];
      i += 1;
      let closed = false;
      while (i < lines.length) {
        const next = lines[i];
        if (next.trimEnd().endsWith('```')) {
          const before = next.trimEnd().slice(0, -3);
          if (before.trim()) body.push(before);
          closed = true;
          i += 1;
          break;
        }
        body.push(next);
        i += 1;
      }
      // An unclosed block runs to the end, as it does on Discord.
      blocks.push({ type: 'code', language, text: body.join('\n'), closed });
      continue;
    }
    if (line.startsWith('>>> ')) {
      flush();
      blocks.push({ type: 'quote', lines: [line.slice(4), ...lines.slice(i + 1)].map(parseInline) });
      break;
    }
    if (line === '>' || line.startsWith('> ')) {
      flush();
      const quoted = [];
      while (i < lines.length && (lines[i] === '>' || lines[i].startsWith('> '))) {
        quoted.push(lines[i] === '>' ? '' : lines[i].slice(2));
        i += 1;
      }
      blocks.push({ type: 'quote', lines: quoted.map(parseInline) });
      continue;
    }
    const heading = /^(#{1,3}) (.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2].trim()) });
      i += 1;
      continue;
    }
    const subtext = /^-# (.+)$/.exec(line);
    if (subtext) {
      flush();
      blocks.push({ type: 'subtext', children: parseInline(subtext[1].trim()) });
      i += 1;
      continue;
    }
    const item = /^( {0,4})(?:([-*])|(\d{1,3})\.) (.+)$/.exec(line);
    if (item) {
      flush();
      const ordered = item[3] !== undefined;
      const items = [];
      while (i < lines.length) {
        const m = /^( {0,4})(?:([-*])|(\d{1,3})\.) (.+)$/.exec(lines[i]);
        if (!m || (m[3] !== undefined) !== ordered) break;
        items.push({ depth: m[1].length >= 2 ? 1 : 0, children: parseInline(m[4].trim()) });
        i += 1;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }
    if (line.trim() === '') {
      flush();
      i += 1;
      continue;
    }
    paragraph.push(line);
    i += 1;
  }
  flush();
  return blocks;
}

/**
 * The usernames a message mentions, as they are drawn (so not inside code),
 * lowercased, each once, at most `max`: who a mention notice goes to.
 */
export function mentionsIn(text, max = 10) {
  const found = new Set();
  const walk = (nodes) => {
    for (const node of nodes ?? []) {
      if (node.type === 'mention') found.add(node.name.toLowerCase());
      else if (node.children) walk(node.children);
    }
  };
  for (const block of parseMessage(text)) {
    if (block.type === 'paragraph' || block.type === 'quote') block.lines.forEach(walk);
    else if (block.type === 'list') block.items.forEach((item) => walk(item.children));
    else if (block.type !== 'code') walk(block.children);
  }
  return [...found].slice(0, max);
}

/** The message as plain words, for previews and notifications: marks dropped, links kept. */
export function plainText(text) {
  const words = (nodes) => nodes.map((node) => {
    if (node.type === 'text' || node.type === 'code') return node.text;
    if (node.type === 'link') return node.text;
    if (node.type === 'mention') return `@${node.name}`;
    if (node.type === 'spoiler') return '(spoiler)';
    return words(node.children ?? []);
  }).join('');
  return parseMessage(text).map((block) => {
    if (block.type === 'code') return block.text;
    if (block.type === 'paragraph' || block.type === 'quote') return block.lines.map(words).join('\n');
    if (block.type === 'list') return block.items.map((item) => words(item.children)).join('\n');
    return words(block.children ?? []);
  }).join('\n').trim();
}

/** Whether a message carries any formatting at all: a plain one renders as it always did. */
export function hasFormatting(text) {
  const source = String(text ?? '');
  return /[*_~`|]|^#{1,3} |^-# |^> |^>>> |^ {0,4}(?:[-*]|\d+\.) |https?:\/\/|@[A-Za-z0-9]/m.test(source);
}
