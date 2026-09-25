import { doc } from 'firebase/firestore';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from './Avatar.jsx';
import ApproveBar from './ApproveBar.jsx';
import Button from './Button.jsx';
import Composer from './Composer.jsx';
import RoleChip from './RoleChip.jsx';
import { FileCard } from './FileCard.jsx';
import { useVotes } from './useVotes.js';
import { LinkedText } from './LinkPreview.jsx';
import { postRef } from '../data/api.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import { timeAgo } from '../lib/format.js';
import './Comment.css';

// Replies nest under their comment with a thread line. Clicking the line folds
// the thread away; a long thread shows its first two replies and a "more" button.
export default function Comment({ comment, post, roleOf, canModerate, depth = 0, onReply, onDelete }) {
  const { user, signIn } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const author = usePerson(comment.authorUid, comment.authorName);
  const votes = useVotes(doc(postRef(post.scope, post.id), 'comments', comment.id), {
    about: { scope: post.scope, postId: post.id, commentId: comment.id, authorUid: comment.authorUid },
  });
  const replies = showAll ? comment.replies : comment.replies.slice(0, 2);
  const hidden = comment.replies.length - replies.length;
  const mine = user?.uid === comment.authorUid;

  return (
    <div className={`comment ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="comment__rail">
        <Avatar person={author} size={depth === 0 ? 32 : 28} />
        {!collapsed && (
          <button type="button" className="comment__line" aria-label={`Fold ${author.name}'s thread`} onClick={() => setCollapsed(true)} />
        )}
      </div>
      <div className="comment__body">
        <div className="comment__meta">
          <Link to={`/people/${comment.authorUid}`} className="comment__author">{author.name}</Link>
          {roleOf && <RoleChip role={roleOf(comment.authorUid)} />}
          <span>· {timeAgo(comment.at)}</span>
          {collapsed && (
            <button type="button" className="comment__unfold" onClick={() => setCollapsed(false)}>
              Show thread
            </button>
          )}
        </div>
        {!collapsed && (
          <>
            {comment.text && <LinkedText text={comment.text} className="comment__text" />}
            {comment.files.map((f) => (
              <FileCard key={f.path} file={f} compact locked={!user} onNeedAccount={signIn} />
            ))}
            <div className="comment__actions">
              <ApproveBar small count={votes.approvals} mine={votes.mine} onVote={votes.onVote} />
              <Button variant="ghost" size="sm" onClick={() => (user ? setReplying(true) : signIn())}>
                Reply
              </Button>
              {(mine || canModerate) && (
                <Button variant="ghost" size="sm" onClick={() => onDelete(comment.id)}>
                  Delete
                </Button>
              )}
            </div>
            {replying && (
              <Composer
                compact
                autoFocus
                placeholder={`Reply to ${author.name}`}
                submitLabel="Reply"
                onCancel={() => setReplying(false)}
                onSubmit={async (draft) => {
                  await onReply(comment.id, draft);
                  setReplying(false);
                  setShowAll(true);
                }}
              />
            )}
            {replies.map((r) => (
              <Comment key={r.id} comment={r} post={post} roleOf={roleOf} canModerate={canModerate} depth={depth + 1} onReply={onReply} onDelete={onDelete} />
            ))}
            {hidden > 0 && (
              <button type="button" className="comment__more" onClick={() => setShowAll(true)}>
                {hidden} more {hidden === 1 ? 'reply' : 'replies'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
