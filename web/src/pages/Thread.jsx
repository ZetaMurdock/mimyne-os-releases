import { useState } from 'react';
import { Link, useLoaderData } from 'react-router-dom';
import { HubIcon } from '../components/Avatar.jsx';
import Comment from '../components/Comment.jsx';
import Composer from '../components/Composer.jsx';
import Icon from '../components/Icon.jsx';
import PledgeButton from '../components/PledgeButton.jsx';
import PostCard from '../components/PostCard.jsx';
import { addComment, getComments, getHubSync, getPost } from '../data/api.js';
import { useSession } from '../data/session.jsx';
import './Thread.css';

export function threadLoader({ params }) {
  return getPost(params.id);
}

export default function Thread() {
  const { post, comments: loaded } = useLoaderData();
  const { user, signIn } = useSession();
  const [comments, setComments] = useState(loaded);
  const hub = post.hub ? getHubSync(post.hub) : null;
  const count = countAll(comments);

  async function reply(parentId, { text, files }) {
    await addComment(post.id, parentId, { author: user.id, body: text, files });
    setComments(getComments(post.id));
  }

  return (
    <div className="frame">
      <div className="frame__main">
        <Link to={user ? '/feed' : hub ? `/h/${hub.id}` : '/'} className="thread__back">
          <Icon name="back" size={16} strokeWidth={2} />
          {user ? 'Feed' : hub ? hub.name : 'Home'}
        </Link>

        <PostCard post={post} full />

        {user ? (
          <Composer compact placeholder="Add a comment" submitLabel="Comment" onSubmit={(draft) => reply(null, draft)} />
        ) : (
          <button type="button" className="thread__signin" onClick={signIn}>
            <Icon name="lock" size={16} /> Sign in to comment
          </button>
        )}

        <p className="thread__count">
          <strong>{count} comments</strong> · Best
        </p>

        <div className="thread__comments">
          {comments.map((c) => (
            <Comment key={c.id} comment={c} hub={hub} onReply={reply} />
          ))}
        </div>
      </div>

      {hub && (
        <aside className="frame__side">
          <section className="card thread__hub">
            <div className="thread__hub-banner" style={{ background: hub.banner }} />
            <div className="thread__hub-body">
              <span className="thread__hub-icon">
                <HubIcon hub={hub} size={52} />
              </span>
              <Link to={`/h/${hub.id}`} className="thread__hub-name">
                {hub.name}
              </Link>
              <p className="muted">{hub.tagline}</p>
              <PledgeButton hub={hub} />
            </div>
          </section>
        </aside>
      )}
    </div>
  );
}

function countAll(list) {
  return list.reduce((n, c) => n + 1 + countAll(c.replies), 0);
}
