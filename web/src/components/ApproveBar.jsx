import { useState } from 'react';
import Icon from './Icon.jsx';
import './ApproveBar.css';

// Approve fills the crown in gold. Disapprove is the quiet one and tells
// nobody. Signed out, the count shows but the buttons ask you to sign in.
export default function ApproveBar({ count, approved = false, small = false, signedIn = true, onNeedAccount }) {
  const [vote, setVote] = useState(approved ? 1 : 0);
  const shown = count - (approved ? 1 : 0) + (vote === 1 ? 1 : 0);

  function cast(value) {
    if (!signedIn) {
      onNeedAccount?.();
      return;
    }
    setVote((v) => (v === value ? 0 : value));
  }

  return (
    <span className={`approve ${small ? 'approve--small' : ''}`}>
      <button
        type="button"
        className={`approve__btn approve__btn--up ${vote === 1 ? 'is-on' : ''}`}
        aria-label="Approve"
        aria-pressed={vote === 1}
        onClick={() => cast(1)}
      >
        <Icon name="crown" size={small ? 14 : 16} fill={vote === 1 ? 'currentColor' : 'none'} />
      </button>
      <span className={`approve__count ${vote === 1 ? 'is-on' : ''}`}>{shown}</span>
      <button
        type="button"
        className={`approve__btn approve__btn--down ${vote === -1 ? 'is-on' : ''}`}
        aria-label="Disapprove"
        aria-pressed={vote === -1}
        onClick={() => cast(-1)}
      >
        <Icon name="drop" size={small ? 14 : 16} fill={vote === -1 ? 'currentColor' : 'none'} />
      </button>
    </span>
  );
}
