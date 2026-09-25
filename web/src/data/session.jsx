import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { users } from './mock.js';

// Who is signed in and which Hubs they pledged to. For now sign-in is a
// stand-in that signs you in as the sample account; Firebase Auth replaces it.
const SessionContext = createContext(null);
const STORAGE_KEY = 'mimyne.session';
const DEFAULT_PLEDGES = ['ashfall', 'pyre', 'wraithline', 'nightshift', 'lowpoly'];

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.userId) return saved;
  } catch {
    // Storage can be blocked or hold something unreadable; start signed out.
  }
  return { userId: null, pledged: [] };
}

function save(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Signed-in state just won't survive a reload.
  }
}

export function SessionProvider({ children }) {
  const [state, setState] = useState(load);

  const update = useCallback((next) => {
    setState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next;
      save(value);
      return value;
    });
  }, []);

  const value = useMemo(() => {
    const user = state.userId ? users[state.userId] : null;
    const pledged = new Set(state.pledged);
    return {
      user,
      pledged,
      signIn: () => update({ userId: 'zeta', pledged: DEFAULT_PLEDGES }),
      signOut: () => update({ userId: null, pledged: [] }),
      pledge: (hubId) => update((s) => ({ ...s, pledged: [...new Set([...s.pledged, hubId])] })),
      unpledge: (hubId) => update((s) => ({ ...s, pledged: s.pledged.filter((id) => id !== hubId) })),
    };
  }, [state, update]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

// What the signed-in person may do in a Hub. Levels come from the role the
// Hub gave them; not pledged means no role.
export function useHubAccess(hub) {
  const { user, pledged } = useSession();
  if (!hub) return {};
  const roleId = user ? hub.members[user.id] : null;
  const role = hub.roles.find((r) => r.id === roleId) ?? null;
  const isPledged = !!user && (pledged.has(hub.id) || !!role);
  const canPost = !!user && (hub.postingPolicy === 'signed-in' || isPledged);
  return {
    signedIn: !!user,
    isPledged,
    role,
    canPost,
    canDownload: !!user,
    canModerate: role?.level === 'owner' || role?.level === 'mod',
  };
}
