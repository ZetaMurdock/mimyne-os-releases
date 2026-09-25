// Files go to Mimyne's file service (files-worker in the app's repo), which
// checks the sign-in, puts them in the uploader's own folder in Backblaze,
// and hands out short-lived download links.
import { auth } from './firebase.js';

export const FILES_URL = import.meta.env.VITE_FILES_URL ?? 'https://mimyne-os.despits-tyrek.workers.dev';

const MESSAGES = {
  'paid-tier': 'Files this large need the paid tier.',
  'sign-in-required': 'Sign in to send files.',
  'bad-name': "That file's name can't be used.",
};

async function token() {
  if (!auth.currentUser) throw new Error(MESSAGES['sign-in-required']);
  return auth.currentUser.getIdToken();
}

async function callJson(path, body) {
  const res = await fetch(FILES_URL + path, {
    method: 'POST',
    headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(MESSAGES[data.error] ?? data.message ?? 'The file service had a problem.');
  return data;
}

// fetch can't report upload progress, so the bytes go by XMLHttpRequest.
function put(url, body, bearer, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('authorization', `Bearer ${bearer}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded);
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        // Non-JSON error page; handled below.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error(MESSAGES[data.error] ?? data.message ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
    xhr.send(body);
  });
}

/**
 * Uploads a File and returns the label posts and messages carry:
 * { name, size, type, path }. `onProgress` gets 0..1.
 */
export async function uploadFile(file, onProgress = () => {}) {
  const type = file.type || 'application/octet-stream';
  const start = await callJson('/uploads', { name: file.name, size: file.size, type });
  const ticket = encodeURIComponent(start.ticket);

  if (start.mode === 'object') {
    await put(`${FILES_URL}/uploads/object?ticket=${ticket}`, file, await token(), (n) => onProgress(n / file.size));
  } else {
    const etags = [];
    for (let n = 1; n <= start.parts; n++) {
      const from = (n - 1) * start.partSize;
      const part = file.slice(from, Math.min(from + start.partSize, file.size));
      const { etag } = await put(`${FILES_URL}/uploads/part?ticket=${ticket}&n=${n}`, part, await token(),
        (loaded) => onProgress((from + loaded) / file.size));
      etags.push(etag);
    }
    await callJson(`/uploads/complete?ticket=${ticket}`, { etags });
  }
  onProgress(1);
  return { name: file.name, size: file.size, type, path: start.path };
}

/** A picked file's label, saying so when a picture, video or song goes as a plain file. */
export async function uploadPicked({ file, display = true }, onProgress) {
  const label = await uploadFile(file, onProgress);
  return display === false && showable(file) ? { ...label, display: false } : label;
}

/** Starts downloading a file through a link that works for ten minutes. */
export async function downloadFile(path) {
  window.location.assign(await fileLink(path));
}

// Links last 10 minutes; each is reused for 8, so a page of pictures asks
// once per file rather than on every render.
const links = new Map();
export function fileLink(path) {
  const held = links.get(path);
  if (held && held.until > Date.now()) return held.url;
  const url = callJson('/downloads', { path }).then((data) => data.url);
  links.set(path, { url, until: Date.now() + 8 * 60 * 1000 });
  url.catch(() => links.delete(path));
  return url;
}

/** Pictures, videos and songs can be shown in place, or sent as plain files. */
export const showable = (file) => /^(image|video|audio)\//.test(file?.type ?? '');
