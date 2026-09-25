import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { SOCIAL } from '../lib/features.js';

// Who is signed in, their public card, and which Hubs they pledged to.
// Firebase is loaded only where the social side is on, so the home page of
// the published site stays light.
const SessionContext = createContext(null);
const SignInDialog = lazy(() => import('../components/SignInDialog.jsx'));
const ClaimUsername = lazy(() => import('../components/ClaimUsername.jsx'));

export function SessionProvider({ children }) {
  // off: the social side isn't built in. loading: Firebase is restoring a
  // sign-in. needs-username: signed in, no Mimyne profile yet.
  const [status, setStatus] = useState(SOCIAL ? 'loading' : 'off');
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [pledged, setPledged] = useState(() => new Set());
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!SOCIAL) return undefined;
    let stopAuth = () => {};
    let stopProfile = () => {};
    let stopPledges = () => {};
    let cancelled = false;

    Promise.all([import('firebase/auth'), import('firebase/firestore'), import('../lib/firebase.js'), import('./identity.js'), import('./api.js')])
      .then(([{ onAuthStateChanged }, { doc, onSnapshot }, { auth, db }, { cleanProfile }, { watchMyPledges }]) => {
        if (cancelled) return;
        stopAuth = onAuthStateChanged(auth, (user) => {
          stopProfile();
          stopPledges();
          setFirebaseUser(user);
          setPledged(new Set());
          if (!user) {
            setProfile(null);
            setStatus('signed-out');
            return;
          }
          stopProfile = onSnapshot(doc(db, 'profiles', user.uid), (snap) => {
            const card = snap.exists() ? cleanProfile(user.uid, snap.data()) : null;
            setProfile(card);
            setStatus(card ? 'ready' : 'needs-username');
          }, () => setStatus('needs-username'));
          stopPledges = watchMyPledges(user.uid, (ids) => setPledged(new Set(ids)));
        });
      })
      .catch(() => setStatus('signed-out'));

    return () => {
      cancelled = true;
      stopAuth();
      stopProfile();
      stopPledges();
    };
  }, []);

  const signOut = useCallback(async () => {
    const [{ signOut: firebaseSignOut }, { auth }] = await Promise.all([import('firebase/auth'), import('../lib/firebase.js')]);
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo(() => {
    const user = status === 'ready' && profile
      ? { uid: profile.uid, username: profile.username, name: profile.displayName || profile.username, picture: profile.picture }
      : null;
    return {
      status,
      user,
      pledged,
      signIn: () => setSigningIn(true),
      signOut,
      async pledge(hubId) {
        const { pledge } = await import('./api.js');
        await pledge(hubId, user);
      },
      async unpledge(hubId) {
        const { unpledge } = await import('./api.js');
        await unpledge(hubId, user.uid);
      },
    };
  }, [status, profile, pledged, signOut]);

  return (
    <SessionContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        {signingIn && status !== 'ready' && <SignInDialog onClose={() => setSigningIn(false)} />}
        {status === 'needs-username' && firebaseUser && (
          <ClaimUsername firebaseUser={firebaseUser} onDone={() => {}} onSignOut={signOut} />
        )}
      </Suspense>
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}

/** What the signed-in person may do in a Hub, from its pledges. */
export function useHubAccess(hub, members = []) {
  const { user, pledged } = useSession();
  if (!hub) return {};
  const mine = user ? members.find((m) => m.uid === user.uid) : null;
  const level = hub.ownerId === user?.uid ? 'owner' : mine?.level ?? (user && pledged.has(hub.id) ? 'member' : null);
  const isPledged = !!user && (pledged.has(hub.id) || !!mine || level === 'owner');
  return {
    signedIn: !!user,
    isPledged,
    level,
    canPost: !!user && (hub.postingPolicy === 'signed-in' || isPledged),
    canModerate: level === 'owner' || level === 'mod',
  };
}
