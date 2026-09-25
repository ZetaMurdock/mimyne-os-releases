import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, HubIcon } from './Avatar.jsx';
import ApproveBar from './ApproveBar.jsx';
import Button from './Button.jsx';
import HubCard from './HubCard.jsx';
import RoleChip from './RoleChip.jsx';
import { FileCard } from './FileCard.jsx';
import { useVotes } from './useVotes.js';
import { deletePost, postRef, postUrl } from '../data/api.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import { timeAgo } from '../lib/format.js';
import './PostCard.css';

// `hub` is the Hub the post is on, when it's on one; `roleOf(uid)` gives an
// author's role there. Images and videos show as files until previews come.
export default function PostCard({ post, hub, roleOf, full = false, showHub = true, canModerate = false, onDeleted }) {
  const { user, signIn } = useSession();
  const author = usePerson(post.authorUid, post.authorName);
  const votes = useVotes(postRef(post.scope, post.id), { comments: !full });
  const [gone, setGone] = useState(false);
  const TitleTag = full ? 'h1' : 'h3';
  const url = postUrl(post);
  const mine = user?.uid === post.authorUid;

  if (gone) return null;

  async function remove() {
    if (!window.confirm('Delete this post? This can’t be undone.')) return;
    await deletePost(post);
    setGone(true);
    onDeleted?.();
  }

  return (
    <article className={`post card ${full ? 'post--full' : ''}`}>
      <header className="post__meta">
        {hub && showHub ? (
          <>
            <Link to={`/h/${hub.id}`} className="post__hub">
              <HubIcon hub={hub} size={22} />
              {hub.name}
            </Link>
            <span>·</span>
          </>
        ) : (
          <Avatar person={author} size={22} />
        )}
        <span className="post__author">{author.name}</span>
        {roleOf && <RoleChip role={roleOf(post.authorUid)} />}
        {!post.scope.hubId && <span>posted to their profile</span>}
        <span>
          · <Link to={url} className="post__time">{timeAgo(post.at)}</Link>
        </span>
      </header>

      {post.title &&
        (full ? (
          <TitleTag className="post__title">{post.title}</TitleTag>
        ) : (
          <Link to={url} className="post__title-link">
            <TitleTag className="post__title">{post.title}</TitleTag>
          </Link>
        ))}
      {post.body && <p className={post.title ? 'post__body' : 'post__body post__body--lead'}>{post.body}</p>}

      {post.files.map((file) => (
        <FileCard key={file.path} file={file} locked={!user} onNeedAccount={signIn} />
      ))}

      {post.embedHubId && <HubCard hubId={post.embedHubId} />}

      <footer className="post__actions">
        <ApproveBar count={votes.approvals} mine={votes.mine} onVote={votes.onVote} />
        {!full && (
          <Button to={url} icon="message" variant="secondary" className="post__chip">
            {votes.comments == null ? 'Comments' : `${votes.comments} ${votes.comments === 1 ? 'comment' : 'comments'}`}
          </Button>
        )}
        <Button icon="share" variant="secondary" className="post__chip" onClick={() => navigator.clipboard?.writeText(location.origin + url).catch(() => {})}>
          Share
        </Button>
        {(mine || canModerate) && (
          <Button variant="ghost" className="post__chip" onClick={remove}>
            Delete
          </Button>
        )}
      </footer>
    </article>
  );
}
