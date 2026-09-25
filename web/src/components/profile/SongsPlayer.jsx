import { useEffect, useRef, useState } from 'react';
import { doc } from 'firebase/firestore';
import ApproveBar from '../ApproveBar.jsx';
import { useVotes } from '../useVotes.js';
import { db } from '../../lib/firebase.js';
import { musicPlayer, PROVIDER_LABELS } from '../../lib/profileShapes.js';
import { notifyProfileLike } from '../../data/notifications.js';
import { useSession } from '../../data/session.jsx';
import './SongsPlayer.css';

const PLAYER_ORIGINS = { youtube: 'https://www.youtube-nocookie.com', soundcloud: 'https://w.soundcloud.com' };

/**
 * A profile's songs, as in the app (ProfilePage.jsx, SongsPlayer): nothing
 * loads or plays until the visitor presses Play, then they play in order.
 * Where the service says a song ended (YouTube, SoundCloud, an audio file),
 * the next one starts; a playlist link plays through in its own player.
 */
export default function SongsPlayer({ songs, ownerUid }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [round, setRound] = useState(0);
  const frame = useRef(null);
  const list = songs || [];
  const current = list[Math.min(index, list.length - 1)];
  const player = current ? musicPlayer(current.url) : null;

  useEffect(() => {
    if (index >= list.length) setIndex(0);
  }, [index, list.length]);

  const go = (step) => {
    if (list.length > 1) setIndex((value) => (value + step + list.length) % list.length);
    else setRound((value) => value + 1);
  };

  // The embedded players report their state by message: listen for the end.
  useEffect(() => {
    if (!playing || !player || player.kind !== 'iframe') return undefined;
    const onMessage = (event) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (player.provider === 'youtube') {
        const state = data?.event === 'onStateChange' ? data.info : data?.info?.playerState;
        if (state === 0 && !player.playlist) go(1);
      } else if (player.provider === 'soundcloud' && data?.method === 'finish') {
        go(1);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, player?.src, list.length]);

  const listen = () => {
    const target = frame.current?.contentWindow;
    const origin = PLAYER_ORIGINS[player?.provider];
    if (!target || !origin) return;
    if (player.provider === 'youtube') {
      target.postMessage(JSON.stringify({ event: 'listening', id: 'mimyne', channel: 'widget' }), origin);
      target.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }), origin);
    } else {
      target.postMessage(JSON.stringify({ method: 'addEventListener', value: 'finish' }), origin);
    }
  };

  if (!player) return null;
  const height = player.provider === 'youtube' ? 220 : player.provider === 'spotify' ? (player.playlist ? 352 : 152) : player.playlist ? 300 : 120;
  const label = (song) => song.title || PROVIDER_LABELS[musicPlayer(song.url)?.provider] || 'Song';

  return (
    <section className="songs card" aria-label="Profile songs">
      <div className="songs__head">
        <div className="songs__now">
          <span className="label">{list.length > 1 ? `Songs ${index + 1} of ${list.length}` : 'Song'}</span>
          <strong className="songs__title">{label(current)}</strong>
          <span className="songs__service">
            {player.playlist ? `${PROVIDER_LABELS[player.provider]} playlist` : PROVIDER_LABELS[player.provider]}
            {current?.id && <SongVotes ownerUid={ownerUid} songId={current.id} />}
          </span>
        </div>
        <div className="songs__controls">
          {list.length > 1 && (
            <button type="button" className="songs__btn" onClick={() => go(-1)} aria-label="Previous song">
              Prev
            </button>
          )}
          <button type="button" className="songs__btn songs__btn--play" onClick={() => setPlaying((value) => !value)}>
            {playing ? 'Stop' : 'Play'}
          </button>
          {list.length > 1 && (
            <button type="button" className="songs__btn" onClick={() => go(1)} aria-label="Next song">
              Next
            </button>
          )}
        </div>
      </div>
      {playing &&
        (player.kind === 'audio' ? (
          <audio key={`${player.src}-${round}`} src={player.src} autoPlay controls onEnded={() => go(1)} className="songs__audio" />
        ) : (
          <iframe
            key={`${player.src}-${round}`}
            ref={frame}
            src={player.src}
            onLoad={listen}
            title="Profile song"
            allow="autoplay; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            className="songs__frame"
            style={{ height }}
          />
        ))}
      {playing && player.provider === 'spotify' && (
        <p className="muted songs__note">Spotify plays 30-second previews unless you're signed in to Spotify in this browser.</p>
      )}
      {list.length > 1 && (
        <ol className="songs__list">
          {list.map((song, position) => (
            <li key={song.id || `${song.url}-${position}`}>
              <button
                type="button"
                className={position === index ? 'is-current' : undefined}
                onClick={() => {
                  setIndex(position);
                  setPlaying(true);
                }}
              >
                {position + 1}. {label(song)}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SongVotes({ ownerUid, songId }) {
  const { user } = useSession();
  const votes = useVotes(doc(db, 'profile_pages', ownerUid, 'songs', songId), {
    onVoted: (vote) => vote === 'up' && notifyProfileLike(user.uid, ownerUid, 'song', songId),
  });
  return <ApproveBar small count={votes.approvals} mine={votes.mine} onVote={votes.onVote} disabled={user?.uid === ownerUid} />;
}
