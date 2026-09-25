import { useRef, useState } from 'react';
import ApproveBurst from './ApproveBurst.jsx';
import DisapproveSplat from './DisapproveSplat.jsx';
import Icon from './Icon.jsx';
import { useSession } from '../data/session.jsx';
import './ApproveBar.css';

// Approve fills the crown in gold. Disapprove is the quiet one and tells
// nobody. The caller owns the vote; signed out, pressing either asks you to
// sign in.
//
// Each new approval sets off the app's crown burst and each new disapproval
// its splat, at once rather than when the write lands: a celebration that
// arrives late is no celebration. Taking a vote back plays nothing.
export default function ApproveBar({ count, mine = null, small = false, onVote }) {
  const { user } = useSession();
  const [burst, setBurst] = useState(0);
  const [splat, setSplat] = useState(0);
  const plays = useRef(0);
  const size = small ? 14 : 16;

  function press(vote) {
    if (user && mine !== vote) {
      plays.current += 1;
      (vote === 'up' ? setBurst : setSplat)(plays.current);
    }
    onVote(mine === vote ? null : vote);
  }

  return (
    <span className={`approve ${small ? 'approve--small' : ''}`}>
      <button
        type="button"
        className={`approve__btn approve__btn--up ${mine === 'up' ? 'is-on' : ''}`}
        aria-label={mine === 'up' ? 'Take back your approval' : 'Approve'}
        aria-pressed={mine === 'up'}
        onClick={() => press('up')}
      >
        {/* The effect hangs off the icon, not the button. */}
        <span className="approve__icon">
          <span key={burst} className={burst ? 'fx-approve-pop' : undefined}>
            <Icon name="crown" size={size} fill={mine === 'up' ? 'currentColor' : 'none'} />
          </span>
          <ApproveBurst play={burst} size={size} />
        </span>
      </button>
      <span className={`approve__count ${mine === 'up' ? 'is-on' : ''}`}>{count ?? '·'}</span>
      <button
        type="button"
        className={`approve__btn approve__btn--down ${mine === 'down' ? 'is-on' : ''}`}
        aria-label={mine === 'down' ? 'Take back your disapproval' : 'Disapprove'}
        aria-pressed={mine === 'down'}
        onClick={() => press('down')}
      >
        <span className="approve__icon">
          <span key={splat} className={splat ? 'fx-disapprove-dip' : undefined}>
            <Icon name="drop" size={size} fill={mine === 'down' ? 'currentColor' : 'none'} />
          </span>
          <DisapproveSplat play={splat} size={size} />
        </span>
      </button>
    </span>
  );
}
