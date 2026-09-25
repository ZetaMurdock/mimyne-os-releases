import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar, HubIcon } from './Avatar.jsx';
import Icon from './Icon.jsx';
import ApproveBar from './ApproveBar.jsx';
import Button from './Button.jsx';
import HubCard from './HubCard.jsx';
import RoleChip from './RoleChip.jsx';
import { FileCard } from './FileCard.jsx';
import { useVotes } from './useVotes.js';
import ShareDialog from './ShareDialog.jsx';
import ReportDialog from './ReportDialog.jsx';
import { LinkedText } from './LinkPreview.jsx';
import { deletePost, postRef, postUrl, recordView } from '../data/api.js';
import { usePerson } from '../data/people.js';
import { useSession } from '../data/session.jsx';
import { timeAgo } from '../lib/format.js';
import './PostCard.css';

// `hub` is the Hub the post is on, when it's on one; `roleOf(uid)` gives an
// author's role there.
// 1234 → "1.2K", as counts are usually shown.
const compact = (n) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n));

export default function PostCard({ post, hub, roleOf, full = false, showHub = true, canModerate = false, onDeleted }) {
  const { user, signIn } = useSession();
  const author = usePerson(post.authorUid, post.authorName);
  const votes = useVotes(postRef(post.scope, post.id), {
    comments: !full,
    views: true,
    about: { scope: post.scope, postId: post.id, authorUid: post.authorUid },
  });
  const [gone, setGone] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const card = useRef(null);

  // Seen: most of it in view for a second, once per person.
  useEffect(() => {
    if (!user || !card.current || typeof IntersectionObserver === 'undefined') return undefined;
    let timer = null;
    const watcher = new IntersectionObserver(([entry]) => {
      clearTimeout(timer);
      if (entry.isIntersecting) {
        timer = setTimeout(() => {
          recordView(post, user.uid);
          watcher.disconnect();
        }, 1000);
      }
    }, { threshold: 0.5 });
    watcher.observe(card.current);
    return () => {
      clearTimeout(timer);
      watcher.disconnect();
    };
  }, [user?.uid, post.id]);
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
    <article ref={card} className={`post card ${full ? 'post--full' : ''}`}>
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
          <Link to={`/people/${post.authorUid}`} aria-hidden="true" tabIndex={-1}>
            <Avatar person={author} size={22} />
          </Link>
        )}
        <Link to={`/people/${post.authorUid}`} className="post__author">{author.name}</Link>
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
      {post.body && <LinkedText text={post.body} className={post.title ? 'post__body' : 'post__body post__body--lead'} />}

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
        {votes.views != null && (
          <span className="post__views" title={`${votes.views} ${votes.views === 1 ? 'person has' : 'people have'} seen this`}>
            <Icon name="eye" size={15} /> {compact(votes.views)}
          </span>
        )}
        <Button icon="share" variant="secondary" className="post__chip" onClick={() => setSharing(true)}>
          Share
        </Button>
        {(mine || canModerate) && (
          <Button variant="ghost" className="post__chip" onClick={remove}>
            Delete
          </Button>
        )}
        {user && !mine && (
          <Button variant="ghost" className="post__chip post__report" icon="flag" iconOnly aria-label="Report this post" title="Report" onClick={() => setReporting(true)} />
        )}
      </footer>
      {reporting && (
        <ReportDialog
          about={{ targetUid: post.authorUid, kind: 'post', link: url, excerpt: [post.title, post.body].filter(Boolean).join('\n') }}
          onClose={() => setReporting(false)}
        />
      )}
      {sharing && (
        <ShareDialog
          title="Share this post"
          link={url}
          payload={{ post: { postId: post.id, hubId: post.scope.hubId, profileUid: post.scope.profileUid } }}
          onClose={() => setSharing(false)}
        />
      )}
    </article>
  );
}
