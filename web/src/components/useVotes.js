import { useEffect, useState } from 'react';
import { getStats, vote } from '../data/api.js';
import { useSession } from '../data/session.jsx';
import { notifyVote } from '../data/notifications.js';

// Approvals, the viewer's own vote and (for posts) the comment count for one
// post or comment, with voting that shows at once and settles in the
// background.
// `about` ({scope, postId, commentId?, authorUid}) says whose it is, so a
// vote can tell them.
export function useVotes(ref, { comments = false, about = null } = {}) {
  const { user, signIn } = useSession();
  const [stats, setStats] = useState({ approvals: null, mine: null, comments: null });
  const key = ref?.path;

  useEffect(() => {
    if (!ref) return undefined;
    let live = true;
    getStats(ref, user?.uid, { comments }).then((s) => live && setStats(s));
    return () => {
      live = false;
    };
    // The ref's path is what identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, user?.uid, comments]);

  async function onVote(next) {
    if (!user) {
      signIn();
      return;
    }
    const before = stats;
    const up = (v) => (v === 'up' ? 1 : 0);
    setStats({ ...stats, mine: next, approvals: (stats.approvals ?? 0) - up(stats.mine) + up(next) });
    try {
      await vote(ref, user.uid, next);
      if (about && next) notifyVote(user.uid, { ...about, vote: next });
    } catch {
      setStats(before);
    }
  }

  return { ...stats, onVote };
}
