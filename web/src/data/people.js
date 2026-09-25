// Other people's names and pictures, read once and remembered. Profiles are
// readable only when signed in; signed out, callers fall back to the name a
// post or pledge carries.
import { useEffect, useState } from 'react';
import { readProfile } from './identity.js';
import { auth } from '../lib/firebase.js';

const cache = new Map();

export function loadProfile(uid) {
  if (!uid || !auth.currentUser) return Promise.resolve(null);
  if (!cache.has(uid)) cache.set(uid, readProfile(uid).catch(() => null));
  return cache.get(uid);
}

export function forgetProfile(uid) {
  cache.delete(uid);
}

/** A person to draw: their profile when it can be read, else the name given. */
export function usePerson(uid, fallbackName) {
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    let live = true;
    loadProfile(uid).then((p) => live && setProfile(p));
    return () => {
      live = false;
    };
  }, [uid]);
  const username = profile?.username ?? fallbackName ?? 'Someone';
  return {
    uid,
    username,
    name: profile?.displayName || username,
    picture: profile?.picture ?? null,
  };
}
