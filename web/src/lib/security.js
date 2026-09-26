// 2-step verification on mimyne.com. Firebase keeps the second steps (an
// authenticator app or a phone); the file service keeps what gets someone
// back in without them: backup codes and a recovery email
// (files-worker/src/security.js in the app's repo).
import { auth } from './firebase.js';
import { FILES_URL } from './files.js';

export class SecurityError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FALLBACK = {
  'sign-in-required': 'Sign in first.',
  'slow-down': 'Too many tries. Wait a minute and try again.',
};

async function call(method, path, body, signedIn = true) {
  const headers = { 'content-type': 'application/json' };
  if (signedIn) {
    if (!auth.currentUser) throw new SecurityError('sign-in-required', FALLBACK['sign-in-required']);
    headers.authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  let res;
  try {
    res = await fetch(FILES_URL + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new SecurityError('offline', "Mimyne couldn't be reached. Check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SecurityError(data.error ?? 'error', data.message && data.message !== data.error ? data.message : FALLBACK[data.error] ?? 'Something went wrong. Try again.');
  return data;
}

/** { codesLeft, codesMadeAt, recovery: { email } | null, pending, emailReady } */
export const mySecurity = () => call('GET', '/security');
/** Ten new backup codes; the old ones stop working. */
export const makeBackupCodes = () => call('POST', '/security/codes', {});
export const addRecoveryEmail = (email) => call('POST', '/security/recovery-email', { email });
export const removeRecoveryEmail = () => call('DELETE', '/security/recovery-email');
export const signOutEverywhere = () => call('POST', '/security/sign-out-everywhere', {});
/** With a code: 2-step off now. Without: a link to the recovery email, if there is one. */
export const recover = (email, code) => call('POST', '/security/recover', code ? { email, code } : { email }, false);
export const confirmLink = (t) => call('POST', '/security/confirm', { t }, false);

/** What a link from an email is for, read from it before it is used. */
export function linkKind(t) {
  try {
    const body = String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(body)).k ?? null;
  } catch {
    return null;
  }
}

/** Errors that mean "sign in again, then try once more". */
export const needsFreshSignIn = (error) => error?.code === 'auth/requires-recent-login' || error?.code === 'sign-in-again';

export const TWO_STEP_REQUIRED = 'auth/multi-factor-auth-required';

/** Firebase's 2-step errors, in plain words. */
export function twoStepMessage(error) {
  const code = error?.code ?? '';
  if (code === 'auth/invalid-verification-code' || code === 'auth/invalid-verification-id') return "That code didn't work. Check it and try again.";
  if (code === 'auth/code-expired' || code === 'auth/totp-challenge-timeout') return 'That code expired. Use a new one.';
  if (code === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes and try again.';
  if (code === 'auth/invalid-phone-number') return 'Enter the number with its country code, like +1 555 123 4567.';
  if (code === 'auth/unverified-email') return 'Verify your email address first.';
  if (code === 'auth/second-factor-already-in-use') return 'That phone number is already on your account.';
  if (code === 'auth/maximum-second-factor-count-exceeded') return 'You have as many second steps as an account can have. Remove one first.';
  if (code === 'auth/operation-not-allowed') return "2-step verification isn't switched on for Mimyne yet.";
  if (code === 'auth/captcha-check-failed') return "The robot check didn't pass. Reload the page and try again.";
  return String(error?.message ?? error).replace('Firebase: ', '');
}
