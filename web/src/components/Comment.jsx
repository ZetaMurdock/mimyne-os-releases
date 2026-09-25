import { useState } from 'react';
import { Avatar } from './Avatar.jsx';
import ApproveBar from './ApproveBar.jsx';
import Button from './Button.jsx';
import Composer from './Composer.jsx';
import RoleChip from './RoleChip.jsx';
import { FileCard } from './FileCard.jsx';
import { roleIn } from './PostCard.jsx';
import { getUser } from '../data/api.js';
import { useSession } from '../data/session.jsx';
import { timeAgo } from '../lib/format.js';
import './Comment.css';

// Replies nest under their comment with a thread line. Clicking the line folds
// the thread away; a long thread shows its first two replies and a "more" button.
export default function Comment({ comment, hub, depth = 0, onReply }) {
  const { user, signIn } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const author = getUser(comment.author);
  const replies = showAll ? comment.replies : comment.replies.slice(0, 2);
  const hidden = comment.replies.length - replies.length;

  return (
    <div className={`comment ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="comment__rail">
        <Avatar user={author} size={depth === 0 ? 32 : 28} />
        {!collapsed && (
          <button
            type="button"
            className="comment__line"
            aria-label={`Fold ${author.name}'s thread`}
            onClick={() => setCollapsed(true)}
          />
        )}
      </div>
      <div className="comment__body">
        <div className="comment__meta">
          <span className="comment__author">{author.name}</span>
          <RoleChip role={roleIn(hub, author.id)} />
          <span>· {timeAgo(comment.at)}</span>
          {collapsed && (
            <button type="button" className="comment__unfold" onClick={() => setCollapsed(false)}>
              Show thread
            </button>
          )}
        </div>
        {!collapsed && (
          <>
            {comment.body && <p className="comment__text">{comment.body}</p>}
            {comment.files?.map((f) =>
              f.kind === 'image' ? (
                <div key={f.name} className="comment__image placeholder">
                  {f.name}
                </div>
              ) : (
                <FileCard key={f.name} file={f} compact locked={!user} />
              ),
            )}
            <div className="comment__actions">
              <ApproveBar small count={comment.approvals} signedIn={!!user} onNeedAccount={signIn} />
              <Button variant="ghost" size="sm" onClick={() => (user ? setReplying(true) : signIn())}>
                Reply
              </Button>
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
              <Comment key={r.id} comment={r} hub={hub} depth={depth + 1} onReply={onReply} />
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
