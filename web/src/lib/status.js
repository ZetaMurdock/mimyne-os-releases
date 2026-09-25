// Whether someone is around, read the way the app reads it
// (runtime/status.js in the app's repo): each of the app and the website
// keeps its own stamp fresh while open, so a closed one goes stale.
export const STATUS_HEARTBEAT_MS = 60 * 1000;
export const STATUS_STALE_MS = 150 * 1000;
export const IDLE_MS = 5 * 60 * 1000;

const stamp = (value) => (value && typeof value.toMillis === 'function' ? value.toMillis() : (typeof value === 'number' ? value : null));

export function cleanStatusSettings(data) {
  return {
    mode: ['auto', 'away', 'invisible'].includes(data?.mode) ? data.mode : 'auto',
    shareWorkspace: data?.shareWorkspace === true,
  };
}

/** 'online', 'away' or 'offline'; in the app, on the website; the workspace they share. */
export function readStatus(data, now = Date.now()) {
  const fresh = (value) => {
    const at = stamp(value);
    return !!at && now - at < STATUS_STALE_MS;
  };
  const inApp = fresh(data?.appAt);
  const onWeb = fresh(data?.webAt);
  if (!inApp && !onWeb) return { state: 'offline', inApp: false, onWeb: false, workspace: null };
  const workspace = inApp && data?.workspace && typeof data.workspace.name === 'string'
    ? { id: String(data.workspace.id || ''), name: data.workspace.name.slice(0, 120) }
    : null;
  return { state: data?.away ? 'away' : 'online', inApp, onWeb, workspace };
}

/** One line for it: "In the app · Conlang", "On mimyne.com", "Away", "Offline". */
export function statusLine(status) {
  if (status.state === 'offline') return 'Offline';
  const where = status.inApp ? (status.workspace ? `In the app · ${status.workspace.name}` : 'In the app') : 'On mimyne.com';
  return status.state === 'away' ? `Away · ${where}` : where;
}
