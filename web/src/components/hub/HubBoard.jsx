import { useEffect, useState } from 'react';
import Button from '../Button.jsx';
import Composer from '../Composer.jsx';
import Dialog from '../Dialog.jsx';
import Icon from '../Icon.jsx';
import PostCard from '../PostCard.jsx';
import { createBoard, createPost, deleteBoard, listPosts, updateBoard, watchBoards } from '../../data/api.js';
import { BOARD_WHO, MAX_BOARD_NAME, MAX_BOARD_TOPIC, boardIdFor, boardRights, cleanBoardAccess, postChoices, visibleBoards } from '../../lib/hubBoards.js';
import './HubBoard.css';

/**
 * A Hub's Board: its posts, and the rooms inside it - places where a
 * group talks, like threads with a name (lib/hubBoards.js). The Board
 * itself is the first pill; each room after it. The owner and mods make
 * rooms and say who may see and post in each; a room kept from someone is
 * not shown to them, and its posts cannot be read by them either.
 */
export default function HubBoard({ hub, user, access, level, roleOf, posts: loaded, onPosts, board: boardId, onBoard, onSignIn }) {
  const [boards, setBoards] = useState([]);
  const [roomPosts, setRoomPosts] = useState({});
  const [loading, setLoading] = useState(null);
  const [editing, setEditing] = useState(null); // false = new, a board = that one
  useEffect(() => watchBoards(hub.id, setBoards, () => setBoards([])), [hub.id]);

  const shown = visibleBoards(boards, level);
  const board = boardId ? shown.find((b) => b.id === boardId) ?? null : null;
  const rights = board ? boardRights(board, level, access.canPost) : { view: true, post: access.canPost };
  const scope = board ? { hubId: hub.id, boardId: board.id } : { hubId: hub.id };
  const posts = board ? roomPosts[board.id] : loaded;

  useEffect(() => {
    if (!board || roomPosts[board.id]) return undefined;
    let live = true;
    setLoading(board.id);
    listPosts(scope, 30).then((list) => {
      if (!live) return;
      setRoomPosts((all) => ({ ...all, [board.id]: list }));
      setLoading(null);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id]);

  async function post({ text, files }) {
    const created = await createPost(scope, { me: user, body: text, files });
    if (board) setRoomPosts((all) => ({ ...all, [board.id]: [created, ...(all[board.id] ?? [])] }));
    else onPosts((prev) => [created, ...prev]);
  }

  return (
    <div className="hub__board">
      <div className="board-rooms" role="tablist" aria-label="Board rooms">
        <button type="button" role="tab" aria-selected={!board} className={`board-rooms__pill ${!board ? 'is-on' : ''}`} onClick={() => onBoard(null)}>
          The Board
        </button>
        {shown.map((b) => (
          <button
            key={b.id}
            type="button"
            role="tab"
            aria-selected={board?.id === b.id}
            className={`board-rooms__pill ${board?.id === b.id ? 'is-on' : ''}`}
            title={b.topic || b.name}
            onClick={() => onBoard(b.id)}
          >
            {b.access.view !== 'everyone' && <Icon name="lock" size={12} />}
            {b.name}
          </button>
        ))}
        {access.canModerate && (
          <button type="button" className="board-rooms__pill board-rooms__add" onClick={() => setEditing(false)} title="A room inside the Board: a place where a group talks">
            <Icon name="plus" size={12} strokeWidth={2.2} /> Room
          </button>
        )}
      </div>

      {board && (
        <div className="board-room__head">
          <div className="board-room__text">
            <strong>{board.name}</strong>
            {board.topic && <span className="muted">{board.topic}</span>}
          </div>
          {access.canModerate && (
            <Button size="sm" variant="ghost" icon="gear" iconOnly aria-label={`Change ${board.name}`} onClick={() => setEditing(board)} />
          )}
        </div>
      )}

      {!user ? (
        <LockedComposer text={`Sign in to post in ${board ? board.name : hub.name}`} action="Sign in" onAction={onSignIn} />
      ) : !rights.post ? (
        <LockedComposer text={board ? `Only some can post in ${board.name}. You can read along.` : "Only people who pledged can post here. The Hub's owner set it that way."} />
      ) : (
        <Composer placeholder={`Post to ${board ? board.name : hub.name}`} onSubmit={post} />
      )}

      {loading === board?.id && board && <p className="muted hub__empty">Loading {board.name}…</p>}
      {posts && posts.length === 0 && loading !== board?.id && <p className="muted hub__empty">{board ? `Nothing in ${board.name} yet.` : 'Nothing on the Board yet.'}</p>}
      {(posts ?? []).map((p) => (
        <PostCard key={p.id} post={p} hub={hub} showHub={false} roleOf={roleOf} canModerate={access.canModerate} />
      ))}

      {editing !== null && (
        <BoardRoomForm
          hub={hub}
          board={editing || null}
          taken={boards.map((b) => b.id)}
          owner={hub.ownerId === user?.uid}
          onClose={() => setEditing(null)}
          onRemoved={() => {
            setEditing(null);
            if (board && board.id === editing?.id) onBoard(null);
          }}
        />
      )}
    </div>
  );
}

function LockedComposer({ text, action, onAction }) {
  return (
    <div className="hub__locked">
      <Icon name="lock" size={18} />
      <span>{text}</span>
      {action && (
        <Button size="md" onClick={onAction}>
          {action}
        </Button>
      )}
    </div>
  );
}

const WHO_LABEL = { everyone: 'Anyone who can see the Board', pledged: 'Pledged people', mods: 'Mods and the owner', owner: 'Only the owner' };

// A room's name, what it is for, and who may see and post in it.
function BoardRoomForm({ hub, board, taken, owner, onClose, onRemoved }) {
  const [name, setName] = useState(board?.name ?? '');
  const [topic, setTopic] = useState(board?.topic ?? '');
  const [access, setAccess] = useState(board?.access ?? { view: 'everyone', post: 'everyone' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const who = owner ? BOARD_WHO : BOARD_WHO.filter((w) => w !== 'owner');

  async function save(event) {
    event.preventDefault();
    if (!name.trim()) return setError('Give the room a name.');
    setBusy(true);
    setError(null);
    try {
      const fields = { name: name.trim(), topic: topic.trim(), access };
      if (board) await updateBoard(hub.id, board.id, fields);
      else await createBoard(hub.id, boardIdFor(name, taken), { ...fields, order: taken.length });
      onClose();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "The Hub didn't take that room." : err.message);
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Remove ${board.name}? Its posts stay where they are but nobody reaches them.`)) return;
    setBusy(true);
    try {
      await deleteBoard(hub.id, board.id);
      onRemoved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Dialog title={board ? board.name : 'A room in the Board'} onClose={onClose}>
      <form onSubmit={save} className="board-form">
        <label className="field">
          Name
          <input className="field__input" value={name} maxLength={MAX_BOARD_NAME} placeholder="Strategy" autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          What it's for
          <input className="field__input" value={topic} maxLength={MAX_BOARD_TOPIC} placeholder="Plans for the week" onChange={(e) => setTopic(e.target.value)} />
        </label>
        <fieldset className="board-form__access">
          <legend>Who can</legend>
          {[['view', 'See it', who], ['post', 'Post in it', postChoices(access.view).filter((w) => who.includes(w))]].map(([key, label, choices]) => (
            <label key={key} className="board-form__row">
              <span>{label}</span>
              {/* Posting is never wider than seeing: the choices follow, and a change to seeing carries posting along. */}
              <select value={access[key]} onChange={(e) => setAccess((a) => cleanBoardAccess({ ...a, [key]: e.target.value }))}>
                {choices.map((w) => <option key={w} value={w}>{WHO_LABEL[w]}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="board-form__actions">
          {board && <Button variant="ghost" size="sm" icon="trash" onClick={remove} disabled={busy}>Remove</Button>}
          <span className="board-form__spacer" />
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>{board ? 'Save' : 'Make the room'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
