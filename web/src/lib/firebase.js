// The same Firebase project as the app, so one Mimyne account works in both.
// These values identify the project; they aren't secrets. What protects the
// data is firestore.rules in the app's repo.
import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, OAuthProvider, connectAuthEmulator, getAuth, onAuthStateChanged } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const app = initializeApp({
  apiKey: 'AIzaSyCZyboOnL4Hv7v62DHxgkXVtsqs40w4-y8',
  authDomain: 'mimyne-os.firebaseapp.com',
  projectId: 'mimyne-os',
  storageBucket: 'mimyne-os.firebasestorage.app',
  messagingSenderId: '871452005267',
  appId: '1:871452005267:web:43f38fcd32ddb01f570e66',
});

export const auth = getAuth(app);
export const db = getFirestore(app);

// `VITE_EMULATORS=true npm run dev` points the site at the local Firebase
// emulators (auth on 9099, Firestore on 8085, as in the app's firebase.json).
if (import.meta.env.DEV && import.meta.env.VITE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8085);
}

export const googleProvider = new GoogleAuthProvider();
// 'common' lets personal and work or school Microsoft accounts both in, as in the app.
export const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({ tenant: 'common' });

// Firebase restores a sign-in asynchronously. Page loaders wait for it, so a
// signed-in person's first request isn't made as a stranger.
export const authReady = new Promise((resolve) => {
  const stop = onAuthStateChanged(auth, (user) => {
    stop();
    resolve(user);
  });
});
