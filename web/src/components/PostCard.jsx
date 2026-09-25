import { Link } from 'react-router-dom';
import { Avatar, HubIcon } from './Avatar.jsx';
import ApproveBar from './ApproveBar.jsx';
import Button from './Button.jsx';
import HubCard from './HubCard.jsx';
import Icon from './Icon.jsx';
import RoleChip from './RoleChip.jsx';
import { FileCard } from './FileCard.jsx';
import { getHubSync, getUser } from '../data/api.js';
import { useSession } from '../data/session.jsx';
import { timeAgo } from '../lib/format.js';
import './PostCard.css';

export function roleIn(hub, userId) {
  if (!hub) return null;
  return hub.roles.find((r) => r.id === hub.members[userId]) ?? null;
}

export default function PostCard({ post, full = false, showHub = true }) {
  const { user, signIn } = useSession();
  const author = getUser(post.author);
  const hub = post.hub ? getHubSync(post.hub) : null;
  const embed = post.embedHub ? getHubSync(post.embedHub) : null;
  const TitleTag = full ? 'h1' : 'h3';

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
            <span className="post__author">{author.name}</span>
            <RoleChip role={roleIn(hub, author.id)} />
          </>
        ) : (
          <>
            <Avatar user={author} size={22} />
            <span className="post__author">{author.name}</span>
            {hub ? <RoleChip role={roleIn(hub, author.id)} /> : <span>posted to their profile</span>}
          </>
        )}
        <span>· {timeAgo(post.at)}</span>
      </header>

      {post.title &&
        (full ? (
          <TitleTag className="post__title">{post.title}</TitleTag>
        ) : (
          <Link to={`/p/${post.id}`} className="post__title-link">
            <TitleTag className="post__title">{post.title}</TitleTag>
          </Link>
        ))}
      {post.body && <p className={post.title ? 'post__body' : 'post__body post__body--lead'}>{post.body}</p>}

      {post.files?.map((file) =>
        file.kind === 'video' ? (
          <div key={file.name} className="post__video placeholder">
            <button type="button" className="post__play" aria-label={`Play ${file.name}`}>
              <Icon name="play" size={22} />
            </button>
            {file.duration && <span className="post__duration">{file.duration}</span>}
          </div>
        ) : file.kind === 'image' ? (
          <div key={file.name} className="post__image placeholder">
            {file.name}
          </div>
        ) : (
          <FileCard key={file.name} file={file} locked={!user} />
        ),
      )}

      {embed && <HubCard hub={embed} />}

      <footer className="post__actions">
        <ApproveBar count={post.approvals} approved={post.approved} signedIn={!!user} onNeedAccount={signIn} />
        {!full && (
          <Button to={`/p/${post.id}`} icon="message" variant="secondary" className="post__chip">
            {post.comments} comments
          </Button>
        )}
        <Button icon="share" variant="secondary" className="post__chip" onClick={() => copyLink(post)}>
          Share
        </Button>
        {full && post.room && (
          <Button variant="secondary" className="post__chip">
            Open in Mimyne
          </Button>
        )}
      </footer>
    </article>
  );
}

function copyLink(post) {
  const url = `${location.origin}/p/${post.id}`;
  navigator.clipboard?.writeText(url).catch(() => {});
}
