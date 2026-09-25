import { useEffect, useState } from 'react';
import { Link, useLoaderData } from 'react-router-dom';
import Comment from '../components/Comment.jsx';
import Composer from '../components/Composer.jsx';
import HubCard from '../components/HubCard.jsx';
import Icon from '../components/Icon.jsx';
import PostCard from '../components/PostCard.jsx';
import { addComment, deleteComment, getHubPeople, getPost, listComments } from '../data/api.js';
import { useHubAccess, useSession } from '../data/session.jsx';
import './Thread.css';

// /h/<hub>/p/<post> for a post on a Hub's Board, /people/<uid>/p/<post> for
// one on someone's profile.
export function threadLoader({ params }) {
  return getPost(params.hubId ? { hubId: params.hubId } : { profileUid: params.uid }, params.postId);
}

export default function Thread() {
  const { post, comments: loaded, hub } = useLoaderData();
  const { user, signIn } = useSession();
  const [comments, setComments] = useState(loaded);
  const [people, setPeople] = useState({ roles: [], members: [] });
  const access = useHubAccess(hub, people.members);
  const count = countAll(comments);
  // Signed-out visitors see comments on public Hubs; commenting needs an account.
  const canComment = user && (!hub || access.canPost);

  useEffect(() => {
    if (hub) getHubPeople(hub.id).then(setPeople).catch(() => {});
  }, [hub]);

  const roleOf = hub
    ? (uid) => people.roles.find((r) => r.id === people.members.find((m) => m.uid === uid)?.role) ?? null
    : null;

  async function reload() {
    setComments(await listComments(post.scope, post.id));
  }

  async function reply(parentId, { text, files }) {
    await addComment(post.scope, post.id, { me: user, text, parentId, files });
    await reload();
  }

  async function remove(commentId) {
    if (!window.confirm('Delete this comment?')) return;
    await deleteComment(post.scope, post.id, commentId);
    await reload();
  }

  return (
    <div className="frame">
      <div className="frame__main">
        <Link to={hub ? `/h/${hub.id}` : user ? '/feed' : '/'} className="thread__back">
          <Icon name="back" size={16} strokeWidth={2} />
          {hub ? hub.name : user ? 'Feed' : 'Home'}
        </Link>

        <PostCard post={post} hub={hub} roleOf={roleOf} full canModerate={access.canModerate} />

        {canComment ? (
          <Composer compact placeholder="Add a comment" submitLabel="Comment" onSubmit={(draft) => reply(null, draft)} />
        ) : !user ? (
          <button type="button" className="thread__signin" onClick={signIn}>
            <Icon name="lock" size={16} /> Sign in to comment
          </button>
        ) : (
          <p className="thread__signin">
            <Icon name="lock" size={16} /> Only people who pledged can comment here.
          </p>
        )}

        <p className="thread__count">
          <strong>
            {count} {count === 1 ? 'comment' : 'comments'}
          </strong>
        </p>

        <div className="thread__comments">
          {comments.map((c) => (
            <Comment key={c.id} comment={c} post={post} roleOf={roleOf} canModerate={access.canModerate} onReply={reply} onDelete={remove} />
          ))}
        </div>
      </div>

      {hub && (
        <aside className="frame__side">
          <HubCard hub={hub} />
        </aside>
      )}
    </div>
  );
}

function countAll(list) {
  return list.reduce((n, c) => n + 1 + countAll(c.replies), 0);
}
