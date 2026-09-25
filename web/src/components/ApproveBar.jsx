import Icon from './Icon.jsx';
import './ApproveBar.css';

// Approve fills the crown in gold. Disapprove is the quiet one and tells
// nobody. The caller owns the vote; signed out, pressing either asks you to
// sign in.
export default function ApproveBar({ count, mine = null, small = false, onVote }) {
  return (
    <span className={`approve ${small ? 'approve--small' : ''}`}>
      <button
        type="button"
        className={`approve__btn approve__btn--up ${mine === 'up' ? 'is-on' : ''}`}
        aria-label="Approve"
        aria-pressed={mine === 'up'}
        onClick={() => onVote(mine === 'up' ? null : 'up')}
      >
        <Icon name="crown" size={small ? 14 : 16} fill={mine === 'up' ? 'currentColor' : 'none'} />
      </button>
      <span className={`approve__count ${mine === 'up' ? 'is-on' : ''}`}>{count ?? '·'}</span>
      <button
        type="button"
        className={`approve__btn approve__btn--down ${mine === 'down' ? 'is-on' : ''}`}
        aria-label="Disapprove"
        aria-pressed={mine === 'down'}
        onClick={() => onVote(mine === 'down' ? null : 'down')}
      >
        <Icon name="drop" size={small ? 14 : 16} fill={mine === 'down' ? 'currentColor' : 'none'} />
      </button>
    </span>
  );
}
