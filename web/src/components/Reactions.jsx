import MediaPicker from './MediaPicker.jsx';
import { QUICK_MARKS, summarizeReactions } from '../lib/reactions.js';
import './Reactions.css';

// The marks under a message (lib/reactions.js): each with its count, mine
// outlined, a click putting mine on or taking it off. `AddReaction` is the
// tool that opens the emoji picker for one, with the quick row above it.

export function Reactions({ reactions, meUid, onToggle, names = null }) {
  const chips = summarizeReactions(reactions, meUid);
  if (!chips.length) return null;
  return (
    <div className="react" role="group" aria-label="Reactions">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={`react__chip${chip.mine ? ' is-mine' : ''}`}
          aria-pressed={chip.mine}
          aria-label={`${chip.key} ${chip.count}${chip.mine ? ', yours' : ''}`}
          title={names ? chip.who.map((uid) => names(uid) ?? uid).join(', ') : undefined}
          disabled={!onToggle}
          onClick={() => onToggle?.(chip.key)}
        >
          <span className="react__mark">{chip.key}</span>
          <span className="react__count">{chip.count}</span>
        </button>
      ))}
    </div>
  );
}

/** The quick marks and the picker, for a message's tools. */
export function AddReaction({ onPick, placement = 'up' }) {
  return (
    <span className="react__add">
      {QUICK_MARKS.map((mark) => (
        <button key={mark} type="button" className="react__quick" aria-label={`React ${mark}`} title={`React ${mark}`} onClick={() => onPick(mark)}>
          {mark}
        </button>
      ))}
      <MediaPicker emojiOnly label="React with an emoji" placement={placement} align="end" onEmoji={onPick} />
    </span>
  );
}
