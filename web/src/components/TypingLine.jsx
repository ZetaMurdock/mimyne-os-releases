import { useEffect, useState } from 'react';
import { usePerson } from '../data/people.js';
import { typingLine, typingNow } from '../lib/typing.js';
import './TypingLine.css';

// "Ann is typing" under a chat (lib/typing.js): the fresh stamps, not
// mine, named. Ticks once a second while anyone is, so a stamp that went
// stale disappears on its own.
export default function TypingLine({ stamps, meUid }) {
  const [now, setNow] = useState(() => Date.now());
  const uids = typingNow(stamps, now, meUid);
  const any = Object.keys(stamps ?? {}).length > 0;
  useEffect(() => {
    if (!any) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [any]);
  const first = usePerson(uids[0] ?? null);
  const second = usePerson(uids[1] ?? null);
  const third = usePerson(uids[2] ?? null);
  const names = uids.map((uid, index) => [first, second, third][index]?.name || 'Someone');
  const line = typingLine(names);
  return (
    <p className={`typing${line ? ' is-on' : ''}`} role="status" aria-live="polite">
      {line && (
        <>
          <span className="typing__dots" aria-hidden="true"><i /><i /><i /></span>
          {line}
        </>
      )}
    </p>
  );
}
