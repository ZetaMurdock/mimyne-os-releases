// The Hub file converter. Everything runs here in the browser, on the
// visitor's own machine: the file comes down through its short-lived link,
// is converted, and goes back up (onto the Hub's shelf) only if they say so.
//
//   pictures        canvas: PNG, JPG, WebP, an icon, a one-page PDF
//   video, audio    ffmpeg (WebAssembly, served with the site, fetched the
//                   first time someone converts one): MP4, WebM, GIF, MP3...
//   CSV, JSON, text plain JavaScript
import { fileLink } from './files.js';

const IMAGE_LIMIT = 80 * 1024 * 1024;
const MEDIA_LIMIT = 400 * 1024 * 1024;
const TEXT_LIMIT = 30 * 1024 * 1024;

const ext = (name) => (name.match(/\.([a-z0-9]{1,6})$/i)?.[1] ?? '').toLowerCase();
const base = (name) => name.replace(/\.[a-z0-9]{1,6}$/i, '') || 'file';

/** What sort of thing a file is, for the converter. */
export function familyOf(file) {
  const type = file.type ?? '';
  const e = ext(file.name);
  if (type === 'image/gif' || e === 'gif') return 'gif';
  if (type.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'svg', 'avif', 'ico'].includes(e)) return 'image';
  if (type.startsWith('video/') || ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', 'flv', 'wmv', 'mpeg', 'mpg', '3gp'].includes(e)) return 'video';
  if (type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac', 'opus', 'wma', 'aiff'].includes(e)) return 'audio';
  if (e === 'csv' || type === 'text/csv') return 'csv';
  if (e === 'json' || type === 'application/json') return 'json';
  if (['md', 'markdown'].includes(e) || type === 'text/markdown') return 'markdown';
  if (e === 'txt' || type === 'text/plain') return 'text';
  return null;
}

// Every format the converter makes. `from` is the families it takes.
const TARGETS = [
  { id: 'png', label: 'PNG', ext: 'png', type: 'image/png', from: ['image', 'gif'], hint: 'Sharp, keeps see-through parts', group: 'Picture' },
  { id: 'jpg', label: 'JPG', ext: 'jpg', type: 'image/jpeg', from: ['image', 'gif'], hint: 'Small, opens anywhere', group: 'Picture' },
  { id: 'webp', label: 'WebP', ext: 'webp', type: 'image/webp', from: ['image', 'gif'], hint: 'Smallest for the web', group: 'Picture' },
  { id: 'ico', label: 'Icon', ext: 'ico', type: 'image/x-icon', from: ['image'], hint: '256px .ico, for apps and sites', group: 'Picture' },
  { id: 'pdf', label: 'PDF', ext: 'pdf', type: 'application/pdf', from: ['image'], hint: 'The picture as a page', group: 'Document' },

  { id: 'mp4', label: 'MP4', ext: 'mp4', type: 'video/mp4', from: ['video', 'gif'], hint: 'Plays everywhere', group: 'Video', media: true },
  { id: 'mp4-720', label: 'MP4, smaller', ext: 'mp4', type: 'video/mp4', from: ['video'], hint: 'Up to 720p, lighter to send', group: 'Video', media: true, suffix: '-720p' },
  { id: 'webm', label: 'WebM', ext: 'webm', type: 'video/webm', from: ['video', 'gif'], hint: 'Open format for the web', group: 'Video', media: true },
  { id: 'gif', label: 'GIF', ext: 'gif', type: 'image/gif', from: ['video'], hint: 'Loops, no sound, first 15s', group: 'Video', media: true },

  { id: 'mp3', label: 'MP3', ext: 'mp3', type: 'audio/mpeg', from: ['video', 'audio'], hint: 'Just the sound', group: 'Audio', media: true },
  { id: 'wav', label: 'WAV', ext: 'wav', type: 'audio/wav', from: ['video', 'audio'], hint: 'Uncompressed, for editing', group: 'Audio', media: true },
  { id: 'ogg', label: 'OGG', ext: 'ogg', type: 'audio/ogg', from: ['audio'], hint: 'Small and open', group: 'Audio', media: true },
  { id: 'm4a', label: 'M4A', ext: 'm4a', type: 'audio/mp4', from: ['audio'], hint: 'AAC, for phones', group: 'Audio', media: true },
  { id: 'flac', label: 'FLAC', ext: 'flac', type: 'audio/flac', from: ['audio'], hint: 'Lossless, smaller than WAV', group: 'Audio', media: true },

  { id: 'json', label: 'JSON', ext: 'json', type: 'application/json', from: ['csv'], hint: 'Rows as a list of objects', group: 'Data' },
  { id: 'csv', label: 'CSV', ext: 'csv', type: 'text/csv', from: ['json'], hint: 'Opens in any spreadsheet', group: 'Data' },
  { id: 'json-pretty', label: 'JSON, tidied', ext: 'json', type: 'application/json', from: ['json'], hint: 'Indented to read', group: 'Data', suffix: '-tidy' },
  { id: 'html', label: 'Web page', ext: 'html', type: 'text/html', from: ['markdown', 'text'], hint: 'An .html page to open or host', group: 'Document' },
];

/** The formats a file can become, less the one it is already. */
export function targetsFor(file) {
  const family = familyOf(file);
  if (!family) return [];
  const own = ext(file.name).replace('jpeg', 'jpg');
  return TARGETS.filter((t) => t.from.includes(family) && !(t.ext === own && !t.suffix));
}

export function limitFor(target) {
  return target.media ? MEDIA_LIMIT : target.group === 'Data' || target.id === 'html' ? TEXT_LIMIT : IMAGE_LIMIT;
}

/**
 * Converts a file off a Hub's shelf. `onStep` hears the stage ('fetch',
 * 'engine', 'convert') and progress 0..1. Resolves to a File.
 */
export async function convertFile(file, target, onStep = () => {}) {
  if (file.size > limitFor(target)) {
    throw new Error(`That's too big to convert here (${Math.round(limitFor(target) / 1048576)} MB at most for ${target.label}).`);
  }
  const blob = await fetchWithProgress(await fileLink(file.path), file.size, (p) => onStep('fetch', p));
  const name = `${base(file.name)}${target.suffix ?? ''}.${target.ext}`;
  let out;
  if (target.media) out = await viaFfmpeg(blob, file, target, onStep);
  else if (target.group === 'Picture' || target.id === 'pdf') out = await viaCanvas(blob, file, target, onStep);
  else out = await viaText(blob, target, onStep);
  onStep('done', 1);
  return new File([out], name, { type: target.type });
}

async function fetchWithProgress(url, expected, onProgress) {
  // Past the browser's cache: a thumbnail may have stored this same link
  // without the Worker's CORS header (an <img> doesn't ask for it), and a
  // cached copy like that is refused to a script.
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!res) throw new Error("The file couldn't be fetched to convert. Check your connection and try again.");
  if (!res.ok) throw new Error("The file couldn't be fetched to convert.");
  const total = Number(res.headers.get('content-length')) || expected || 0;
  if (!res.body || !total) return res.blob();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    onProgress(Math.min(1, got / total));
  }
  return new Blob(chunks, { type: res.headers.get('content-type') ?? '' });
}

// ---------------------------------------------------------------- pictures

function loadImage(blob, file) {
  // An SVG needs its type to be drawn; the stored one may be generic.
  const typed = ext(file.name) === 'svg' && blob.type !== 'image/svg+xml' ? new Blob([blob], { type: 'image/svg+xml' }) : blob;
  const url = URL.createObjectURL(typed);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ img, done: () => URL.revokeObjectURL(url) });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This picture couldn't be opened by the browser."));
    };
    img.src = url;
  });
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("The browser couldn't write that format."))), type, quality));
}

async function viaCanvas(blob, file, target, onStep) {
  onStep('convert', 0.2);
  const { img, done } = await loadImage(blob, file);
  try {
    let w = img.naturalWidth || 1024;
    let h = img.naturalHeight || 1024;
    if (target.id === 'ico') {
      const scale = Math.min(1, 256 / Math.max(w, h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // JPG and PDF have no see-through: white behind, as paper would be.
    if (target.id === 'jpg' || target.id === 'pdf') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
    }
    ctx.drawImage(img, 0, 0, w, h);
    onStep('convert', 0.6);
    if (target.id === 'ico') return icoFromPng(await canvasBlob(canvas, 'image/png'), w, h);
    if (target.id === 'pdf') return pdfFromJpeg(await canvasBlob(canvas, 'image/jpeg', 0.92), w, h);
    const made = await canvasBlob(canvas, target.type, target.id === 'png' ? undefined : 0.9);
    // Some browsers quietly give PNG for a type they can't write.
    if (made.type !== target.type) throw new Error(`This browser can't write ${target.label}. Try another format.`);
    return made;
  } finally {
    done();
  }
}

/** An .ico holding one PNG, which every current system reads. */
async function icoFromPng(png, w, h) {
  const bytes = new Uint8Array(await png.arrayBuffer());
  const head = new DataView(new ArrayBuffer(22));
  head.setUint16(2, 1, true); // type: icon
  head.setUint16(4, 1, true); // one image
  head.setUint8(6, w >= 256 ? 0 : w);
  head.setUint8(7, h >= 256 ? 0 : h);
  head.setUint16(10, 1, true); // planes
  head.setUint16(12, 32, true); // bits per pixel
  head.setUint32(14, bytes.length, true);
  head.setUint32(18, 22, true); // where the PNG starts
  return new Blob([head.buffer, bytes], { type: 'image/x-icon' });
}

/** A one-page PDF with the picture filling the page (72 dpi to the pixel's 96). */
async function pdfFromJpeg(jpeg, w, h) {
  const img = new Uint8Array(await jpeg.arrayBuffer());
  const pw = +(w * 0.75).toFixed(2);
  const ph = +(h * 0.75).toFixed(2);
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (chunk) => {
    const bytes = typeof chunk === 'string' ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const object = (n, body, stream) => {
    offsets[n] = length;
    push(`${n} 0 obj\n${body}\n`);
    if (stream) {
      push('stream\n');
      push(stream);
      push('\nendstream\n');
    }
    push('endobj\n');
  };
  const drawing = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`);
  push('%PDF-1.4\n%âãÏÓ\n');
  object(1, '<< /Type /Catalog /Pages 2 0 R >>');
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  object(4, `<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>`, img);
  object(5, `<< /Length ${drawing.length} >>`, drawing);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

// ------------------------------------------------------- video and audio

let engine = null;
let queue = Promise.resolve();

async function loadEngine(onStep) {
  if (!engine) {
    engine = (async () => {
      const [{ FFmpeg }, core, wasm] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/core?url'),
        import('@ffmpeg/core/wasm?url'),
      ]);
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL: new URL(core.default, location.href).href, wasmURL: new URL(wasm.default, location.href).href });
      return ffmpeg;
    })();
    engine.catch(() => {
      engine = null;
    });
  }
  onStep('engine', 0);
  return engine;
}

const MEDIA_ARGS = {
  mp4: ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
  'mp4-720': ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '27', '-pix_fmt', 'yuv420p', '-vf', "scale=-2:'min(720,trunc(ih/2)*2)'", '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'],
  webm: ['-c:v', 'libvpx', '-b:v', '1500k', '-deadline', 'realtime', '-cpu-used', '8', '-c:a', 'libvorbis', '-q:a', '4'],
  gif: ['-t', '15', '-vf', "fps=12,scale='min(480,iw)':-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse", '-loop', '0'],
  mp3: ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
  wav: ['-vn', '-c:a', 'pcm_s16le'],
  ogg: ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
  m4a: ['-vn', '-c:a', 'aac', '-b:a', '192k'],
  flac: ['-vn', '-c:a', 'flac'],
};

// One conversion at a time: there is one engine.
function viaFfmpeg(blob, file, target, onStep) {
  const run = queue.then(async () => {
    const ffmpeg = await loadEngine(onStep);
    const input = `in.${ext(file.name) || 'bin'}`;
    const output = `out.${target.ext}`;
    const onProgress = ({ progress }) => onStep('convert', Math.max(0, Math.min(1, progress)));
    const log = [];
    const onLog = ({ message }) => log.push(message) > 40 && log.shift();
    ffmpeg.on('progress', onProgress);
    ffmpeg.on('log', onLog);
    try {
      onStep('convert', 0);
      await ffmpeg.writeFile(input, new Uint8Array(await blob.arrayBuffer()));
      const code = await ffmpeg.exec(['-i', input, ...MEDIA_ARGS[target.id], '-y', output]);
      if (code !== 0) {
        console.warn('Conversion failed', log.join('\n'));
        throw new Error(/does not contain any stream|Output file #0 does not contain/i.test(log.join('\n'))
          ? `There's nothing in this file to make ${target.label} from.`
          : `This file couldn't be made into ${target.label}.`);
      }
      const data = await ffmpeg.readFile(output);
      return new Blob([data], { type: target.type });
    } finally {
      ffmpeg.off('progress', onProgress);
      ffmpeg.off('log', onLog);
      await ffmpeg.deleteFile(input).catch(() => {});
      await ffmpeg.deleteFile(output).catch(() => {});
    }
  });
  queue = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------- data and text

async function viaText(blob, target, onStep) {
  onStep('convert', 0.3);
  const source = await blob.text();
  let out;
  if (target.id === 'json') out = JSON.stringify(csvToObjects(source), null, 2);
  else if (target.id === 'csv') out = objectsToCsv(parseJson(source));
  else if (target.id === 'json-pretty') out = JSON.stringify(parseJson(source), null, 2);
  else if (target.id === 'html') out = htmlPage(markdownToHtml(source));
  return new Blob([out], { type: target.type });
}

function parseJson(source) {
  try {
    return JSON.parse(source);
  } catch {
    throw new Error("This isn't valid JSON, so it can't be converted.");
  }
}

/** CSV rows, quotes and all (RFC 4180), with the first row as the names. */
export function parseCsv(source) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const s = source.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== '');
}

export function csvToObjects(source) {
  const [head = [], ...rows] = parseCsv(source);
  const names = head.map((h, i) => h.trim() || `column${i + 1}`);
  return rows.map((r) => Object.fromEntries(names.map((n, i) => [n, typed(r[i] ?? '')])));
}

// Numbers and true/false come out as themselves; everything else as words.
function typed(value) {
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return Number(value);
  if (value === 'true' || value === 'false') return value === 'true';
  return value;
}

export function objectsToCsv(data) {
  const list = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data).find(Array.isArray) ?? [data] : null;
  if (!list) throw new Error('This JSON needs to be a list of things to make a table.');
  const rows = list.map((item) => (item && typeof item === 'object' && !Array.isArray(item) ? item : { value: item }));
  const names = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [names.map(cell).join(','), ...rows.map((r) => names.map((n) => cell(r[n])).join(','))].join('\r\n') + '\r\n';
}

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s) {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/** Markdown's everyday parts: headings, lists, quotes, code, links, emphasis. */
export function markdownToHtml(source) {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = null;
  let para = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flush();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (heading) {
      flush();
      out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    } else if (bullet || numbered) {
      if (para.length) {
        out.push(`<p>${inline(para.join(' '))}</p>`);
        para = [];
      }
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        if (list) out.push(`</${list}>`);
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)[1])}</li>`);
    } else if (/^>\s?/.test(line)) {
      flush();
      out.push(`<blockquote>${inline(line.replace(/^>\s?/, ''))}</blockquote>`);
    } else if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      flush();
      out.push('<hr>');
    } else if (!line.trim()) flush();
    else {
      if (list) {
        out.push(`</${list}>`);
        list = null;
      }
      para.push(line.trim());
    }
  }
  flush();
  return out.join('\n');
}

function htmlPage(body) {
  const title = body.match(/<h1>(.*?)<\/h1>/)?.[1]?.replace(/<[^>]+>/g, '') ?? 'Document';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  body { max-width: 720px; margin: 48px auto; padding: 0 20px; font: 17px/1.6 system-ui, sans-serif; color: #1c1917; background: #fff; }
  pre { background: #f5f5f4; padding: 12px 14px; border-radius: 8px; overflow-x: auto; }
  code { font-family: ui-monospace, monospace; font-size: .92em; }
  blockquote { margin: 0; padding-left: 14px; border-left: 3px solid #d6d3d1; color: #57534e; }
  img { max-width: 100%; }
  @media (prefers-color-scheme: dark) { body { background: #1c1917; color: #f5f5f4; } pre { background: #292524; } }
</style>
</head>
<body>
${body}
</body>
</html>
`;
}

/** Stops a video or audio conversion under way (the engine starts afresh next time). */
export async function stopConverting() {
  if (!engine) return;
  const running = engine;
  engine = null;
  queue = Promise.resolve();
  (await running.catch(() => null))?.terminate();
}

/** Whether the video and audio engine is loaded already (no wait next time). */
export const engineReady = () => !!engine;
