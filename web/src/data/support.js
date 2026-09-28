// Plus supports Hubs: counting the qualified minutes you spend in a Hub
// (docs/plus-supports-hubs.md in the app's repository). Part of every Plus
// subscription is to go to the Hubs its member uses, split by these
// minutes. A minute qualifies when the Hub's tab is on screen and you did
// something in the last two minutes - scrolled, typed, clicked, moved
// something - or a video is playing. Nothing else is looked at, and what is
// sent is only which Hub and which minute; the file service keeps the
// per-Hub totals (files-worker/src/support.js). While the program is off
// the file service says so, and nothing more is sent this session.
import { useEffect } from 'react';
import { FILES_URL } from '../lib/files.js';
import { auth } from '../lib/firebase.js';

export const MINUTE_MS = 60_000;
/** How recent an action has to be for a minute to count. */
export const ACTIVE_MS = 2 * MINUTE_MS;
/** Minutes are sent this often, and sooner once a batch holds this many. */
export const FLUSH_MS = 5 * MINUTE_MS;
export const FLUSH_AT = 5;
/** Older than this, the file service would not take them anyway. */
const KEEP_MS = 10 * MINUTE_MS;
/** How often the counter looks at the clock. */
const TICK_MS = 15_000;

/**
 * The counter, with no browser in it: told what happened, and asked each
 * tick whether the current minute qualifies. It keeps the minutes that did
 * until they are taken to send.
 */
export function makeCounter(hub, { now = Date.now } = {}) {
  let lastActive = now();
  let last = null;
  let pending = [];
  return {
    /** Something was done: the next two minutes qualify. */
    active() {
      lastActive = now();
    },
    /** Notes the current minute once, when it qualifies; says whether it did. */
    tick({ visible, playing = false }) {
      const t = now();
      if (!visible || (!playing && t - lastActive > ACTIVE_MS)) return false;
      const minute = Math.floor(t / MINUTE_MS);
      if (minute === last) return false;
      last = minute;
      pending.push({ hub, minute });
      return true;
    },
    /** Whether it is time to send: a full batch, or the oldest waiting long enough. */
    due() {
      return pending.length >= FLUSH_AT || (pending.length > 0 && now() - pending[0].minute * MINUTE_MS >= FLUSH_MS);
    },
    /** The minutes to send, taken out; ones too old to be taken are dropped. */
    take() {
      const t = now();
      const out = pending.filter((m) => t - m.minute * MINUTE_MS <= KEEP_MS);
      pending = [];
      return out;
    },
    /** Minutes that could not be sent, back in front to try again. */
    restore(minutes) {
      pending = [...minutes, ...pending];
    },
    pending: () => pending.slice(),
  };
}

// Once the file service has said the program is off (404) or refused the
// sign-in (401), nothing more is sent this session.
let stopped = false;
export const supportStopped = () => stopped;
/** Tests only. */
export const resetSupport = () => { stopped = false; };

const idToken = () => (auth.currentUser ? auth.currentUser.getIdToken() : Promise.resolve(null));

/** Sends a batch; resolves true when the file service took it. */
export async function sendMinutes(minutes, { fetchFn = fetch, token = idToken, keepalive = false } = {}) {
  if (stopped || !minutes.length) return false;
  const bearer = await token().catch(() => null);
  if (!bearer) return false;
  try {
    const res = await fetchFn(`${FILES_URL}/support/minutes`, {
      method: 'POST',
      keepalive,
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify({ minutes }),
    });
    if (res.status === 404 || res.status === 401) stopped = true;
    // Opted out: the file service records nothing, so there is nothing to send.
    if (res.ok && typeof res.json === 'function') {
      const answer = await res.json().catch(() => null);
      if (answer?.reason === 'opted-out') stopped = true;
    }
    return res.ok;
  } catch {
    return false;
  }
}

/** The file service, asked as you. `{ off: true }` while the program is off; null when signed out. */
export async function ask(path, { method = 'GET', body } = {}) {
  const bearer = await idToken().catch(() => null);
  if (!bearer) return null;
  const res = await fetch(`${FILES_URL}${path}`, {
    method,
    headers: { authorization: `Bearer ${bearer}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && data.error === 'support-off') return { off: true };
  if (!res.ok) throw new Error(data.message || data.error || `The file service answered ${res.status}.`);
  return data;
}

const withMonth = (path, month) => (month ? `${path}?month=${encodeURIComponent(month)}` : path);

/** Your month: whether you have Plus, your opt-out, and where your support goes (estimated). */
export const fetchMySupport = (month) => ask(withMonth('/support/me', month));
/** The opt-out: split my support evenly between the Hubs I pledge to, and record none of my minutes. */
export const saveSupportEven = (even) => ask('/support/me', { method: 'POST', body: { even } });
/** A Hub's month as its owner sees it: the estimate, contributors, active people, eligibility. */
export const fetchHubEarnings = (hubId, month) => ask(withMonth(`/earnings/hub/${encodeURIComponent(hubId)}`, month));

/** Staff: the Hubs flagged at a close ('open'), or those already decided ('released', 'held'). */
export const fetchReviewQueue = (status = 'open') => ask(`/support/review?status=${encodeURIComponent(status)}`);
/** Staff: what each monthly close and payout run did, newest first. */
export const fetchSupportRuns = () => ask('/support/runs');
/** Staff: release a flagged month's earning into the ordinary hold, or keep it held. */
export const decideReview = (hub, month, action) => ask('/support/review', { method: 'POST', body: { hub, month, action } });
/** Staff: flag an account for abuse, so nothing of theirs counts from now on - or unflag it. */
export const setAccountBlocked = (uid, blocked) => ask('/support/block', { method: 'POST', body: { uid, blocked } });

/** An owner's payout account with Stripe: set up, verified, what Stripe still needs; { off } or 503 while payouts are not set up. */
export const fetchPayoutAccount = () => ask('/earnings/payout-account');
/** Starts (or resumes) Stripe's onboarding for the owner: { url } to send them to. `replace` moves to a new account. */
export const startPayouts = (replace = false) => ask('/earnings/payout-account', { method: 'POST', body: { replace } });
/** A link into the owner's own Stripe dashboard (bank details, the payouts Stripe made them): { url }. */
export const openStripeDashboard = () => ask('/earnings/payout-account', { method: 'POST', body: { login: true } });

/** The owner's choice to pay the Hub's Pro from its balance each month, once Mimyne offers it. */
export const setHubProFromBalance = (hubId, on) => ask(`/earnings/hub/${encodeURIComponent(hubId)}/pro`, { method: 'POST', body: { fromBalance: on === true } });

/** Which state the program is in - 'off', 'measure' or 'on' - for anyone; 'off' when it cannot be asked. */
export async function fetchSupportState({ fetchFn = fetch } = {}) {
  try {
    const res = await fetchFn(`${FILES_URL}/support/state`);
    const data = res.ok ? await res.json() : null;
    return ['measure', 'on'].includes(data?.state) ? data.state : 'off';
  } catch {
    return 'off';
  }
}

export const money = (cents) => {
  const n = Number(cents) || 0;
  return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 100).toFixed(2)}`;
};
/** "September 2026" for "2026-09". */
export const monthName = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' });

// Embedded players. A YouTube player (the site's are made with enablejsapi,
// lib/profileShapes.js) tells the page its state once the page asks for
// it: playerState 1 is playing, and while it plays the reports keep
// coming. Medal's player says nothing, so a Medal clip counts only through
// the person's own activity.
const PLAYER_ORIGINS = new Set(['https://www.youtube.com', 'https://www.youtube-nocookie.com']);
export const EMBED_QUIET_MS = 10_000;
const embeds = new Map();
let embedsListening = false;

/** Hears what embedded players report. Once per page. */
export function listenToEmbeds(win = window) {
  if (embedsListening) return;
  embedsListening = true;
  win.addEventListener('message', (event) => {
    if (!PLAYER_ORIGINS.has(event.origin) || typeof event.data !== 'string') return;
    let data;
    try { data = JSON.parse(event.data); } catch { return; }
    const state = data?.info?.playerState;
    if (data?.event !== 'infoDelivery' || typeof state !== 'number') return;
    embeds.set(event.source ?? 'page', { playing: state === 1, at: Date.now() });
  });
}

/** Asks every YouTube player on the page to report, and forgets ones long quiet. */
export function askEmbeds(root = document, now = Date.now()) {
  for (const [key, seen] of embeds) if (now - seen.at > 30 * EMBED_QUIET_MS) embeds.delete(key);
  for (const frame of root.querySelectorAll('iframe')) {
    let origin;
    try { origin = new URL(frame.src).origin; } catch { continue; }
    if (!PLAYER_ORIGINS.has(origin) || !frame.contentWindow) continue;
    frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 'mimyne-support', channel: 'widget' }), origin);
  }
}

/** Whether an embedded player reported playing in the last EMBED_QUIET_MS. */
export const anyEmbedPlaying = (now = Date.now()) => [...embeds.values()].some((e) => e.playing && now - e.at < EMBED_QUIET_MS);

/** Whether a video on the page is playing: a Clip, an attached video, or an embedded player that says so. */
export const anyVideoPlaying = (root = document, now = Date.now()) =>
  [...root.querySelectorAll('video')].some((v) => !v.paused && !v.ended && v.readyState > 2) || anyEmbedPlaying(now);

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'];

/**
 * Counts qualified minutes while a Hub page is open, for the person signed
 * in. Sends every five minutes, when the tab is hidden, and on leaving.
 */
export function useSupportMinutes(hubId, uid) {
  useEffect(() => {
    if (!hubId || !uid || typeof document === 'undefined' || stopped) return undefined;
    const counter = makeCounter(hubId);
    const active = () => counter.active();
    for (const name of ACTIVITY) window.addEventListener(name, active, { passive: true, capture: true });
    listenToEmbeds();

    const flush = (leaving = false) => {
      if (!leaving && !counter.due()) return;
      const batch = counter.take();
      if (!batch.length) return;
      sendMinutes(batch, { keepalive: leaving }).then((ok) => {
        if (!ok && !stopped) counter.restore(batch);
      });
    };
    const tick = () => {
      askEmbeds();
      counter.tick({ visible: document.visibilityState === 'visible', playing: anyVideoPlaying() });
      flush();
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? flush(true) : tick());
    const onLeave = () => flush(true);
    const timer = setInterval(tick, TICK_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      for (const name of ACTIVITY) window.removeEventListener(name, active, { capture: true });
      flush(true);
    };
  }, [hubId, uid]);
}
