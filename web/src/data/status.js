// Status on mimyne.com: this tab keeps status/<uid>.webAt fresh while it's
// open (the app keeps appAt the same way), away when idle or chosen, and
// writes nothing while its person is invisible. How someone wants to appear
// is theirs alone, in status_settings/<uid>. See firestore.rules, "status".
import { useEffect, useState } from 'react';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import { IDLE_MS, STATUS_HEARTBEAT_MS, cleanStatusSettings, readStatus } from '../lib/status.js';

export function watchStatusSettings(uid, onChange) {
  return onSnapshot(
    doc(db, 'status_settings', uid),
    (snap) => onChange(cleanStatusSettings(snap.exists() ? snap.data() : null)),
    () => onChange(cleanStatusSettings(null)),
  );
}

export function saveStatusSettings(uid, settings) {
  return setDoc(doc(db, 'status_settings', uid), cleanStatusSettings(settings));
}

/** Someone's status, live, re-read each half minute so it goes stale on time. */
export function useStatus(uid) {
  const [raw, setRaw] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!uid) return undefined;
    const stop = onSnapshot(doc(db, 'status', uid), (snap) => setRaw(snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null), () => setRaw(null));
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      stop();
      clearInterval(timer);
    };
  }, [uid]);
  return readStatus(raw);
}

/** Keeps this tab's stamp fresh while someone is signed in here. */
export function useWebStatusPublisher(uid) {
  useEffect(() => {
    if (!uid) return undefined;
    let settings = null;
    let timer = null;
    let lastInput = Date.now();
    let wroteLive = false;
    const ref = doc(db, 'status', uid);
    const onInput = () => {
      const wasIdle = Date.now() - lastInput > IDLE_MS;
      lastInput = Date.now();
      if (wasIdle) beat();
    };

    async function beat() {
      clearTimeout(timer);
      if (!settings) return;
      try {
        if (settings.mode === 'invisible') {
          if (wroteLive) await setDoc(ref, { webAt: null }, { merge: true });
          wroteLive = false;
        } else {
          const idle = Date.now() - lastInput > IDLE_MS || document.visibilityState === 'hidden';
          await setDoc(ref, { webAt: serverTimestamp(), away: settings.mode === 'away' || idle }, { merge: true });
          wroteLive = true;
        }
      } catch {
        // The rules may not be deployed yet; try again next beat.
      }
      timer = setTimeout(beat, STATUS_HEARTBEAT_MS);
    }

    const stop = watchStatusSettings(uid, (next) => {
      settings = next;
      beat();
    });
    const onVisible = () => beat();
    window.addEventListener('pointermove', onInput, { passive: true });
    window.addEventListener('keydown', onInput);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stop();
      clearTimeout(timer);
      window.removeEventListener('pointermove', onInput);
      window.removeEventListener('keydown', onInput);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid]);
}

/** Several people's statuses at once, live: uid → status. */
export function useStatuses(uids) {
  const key = [...new Set(uids)].sort().join(',');
  const [raw, setRaw] = useState({});
  const [, tick] = useState(0);
  useEffect(() => {
    const ids = key ? key.split(',') : [];
    const stops = ids.map((id) =>
      onSnapshot(doc(db, 'status', id), (snap) => setRaw((prev) => ({ ...prev, [id]: snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null })), () => {}),
    );
    const timer = setInterval(() => tick((n) => n + 1), 30_000);
    return () => {
      stops.forEach((stop) => stop());
      clearInterval(timer);
    };
  }, [key]);
  return Object.fromEntries((key ? key.split(',') : []).map((id) => [id, readStatus(raw[id])]));
}
