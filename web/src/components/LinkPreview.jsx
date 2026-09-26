import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { LinkBubble } from './ShareCards.jsx';
import { linkKind, linkPieces, splitLinks, unfurl } from '../lib/links.js';
import './LinkPreview.css';

const LABELS = { youtube: 'YouTube', spotify: 'Spotify', soundcloud: 'SoundCloud', medal: 'Medal' };
const hostOf = (link) => {
  try {
    return new URL(link).hostname.replace(/^www\./, '');
  } catch {
    return link;
  }
};

/**
 * What someone wrote, with its links shown as what they link to: a video
 * you can play, a picture, a song, a page's card. The address itself shows
 * on hover. `bubble` wraps the words (a message's bubble), when there are any.
 */
export function LinkedText({ text, className, as: Tag = 'p', after = null }) {
  const { rest, links } = splitLinks(text);
  return (
    <>
      {rest && (
        <Tag className={className}>
          <Linkify text={rest} />
          {after}
        </Tag>
      )}
      {links.map((url) => (
        <LinkPreview key={url} url={url} />
      ))}
    </>
  );
}

/** Text with any links left in it made clickable. */
export function Linkify({ text }) {
  return linkPieces(text).map((piece, i) =>
    piece.url ? (
      <a key={i} href={piece.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-link">
        {piece.url}
      </a>
    ) : (
      <span key={i}>{piece.text}</span>
    ),
  );
}

export default function LinkPreview({ url }) {
  const kind = linkKind(url);
  let body;
  if (kind.kind === 'mimyne') body = <LinkBubble path={kind.path} />;
  else if (kind.kind === 'image') body = <a href={url} target="_blank" rel="noopener noreferrer nofollow"><img className="linkp__media" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /></a>;
  else if (kind.kind === 'video') body = <video className="linkp__media" src={url} controls preload="metadata" />;
  else if (kind.kind === 'audio') body = <audio className="linkp__audio" src={url} controls preload="metadata" />;
  else if (kind.kind === 'embed') body = <EmbedCard url={url} kind={kind} />;
  else body = <PageCard url={url} />;
  return (
    <div className="linkp" title={url}>
      {body}
      <a className="linkp__url" href={url} target="_blank" rel="noopener noreferrer nofollow">
        <Icon name="link" size={11} /> {url}
      </a>
    </div>
  );
}

function useUnfurl(url, wanted = true) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!wanted) return undefined;
    let live = true;
    unfurl(url).then((data) => live && setInfo(data));
    return () => {
      live = false;
    };
  }, [url, wanted]);
  return info;
}

// A video, song or clip: its card until pressed, then the service's own player.
function EmbedCard({ url, kind }) {
  const [playing, setPlaying] = useState(false);
  const info = useUnfurl(url, kind.provider !== 'medal');
  const picture = info?.image || kind.thumb;
  const wide = kind.height === 'wide';
  if (playing) {
    return (
      <div className={`linkp__player ${wide ? 'is-wide' : ''}`} style={wide ? undefined : { height: kind.height }}>
        <iframe
          src={kind.src}
          title={info?.title || `${LABELS[kind.provider]} player`}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
        />
      </div>
    );
  }
  return (
    <button type="button" className={`linkp__card linkp__card--embed ${wide ? 'is-wide' : ''}`} onClick={() => setPlaying(true)} aria-label={`Play ${info?.title || `on ${LABELS[kind.provider]}`}`}>
      {wide ? (
        <span className="linkp__cover">
          {picture ? <img src={picture} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : <span className="linkp__cover-blank" />}
          <span className="linkp__play">
            <Icon name="play" size={16} />
          </span>
        </span>
      ) : (
        <span className="linkp__thumb">
          {picture ? <img src={picture} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} /> : null}
          <span className="linkp__play linkp__play--small">
            <Icon name="play" size={12} />
          </span>
        </span>
      )}
      <span className="linkp__text">
        <span className="linkp__site">{LABELS[kind.provider]}</span>
        <strong className="linkp__title">{info?.title || (kind.provider === 'medal' ? 'Medal clip' : hostOf(url))}</strong>
        {info?.description && <span className="linkp__desc">{info.description}</span>}
      </span>
    </button>
  );
}

// Any other page: its site, title, a line and its picture, opening in a new tab.
function PageCard({ url }) {
  const info = useUnfurl(url);
  if (info?.media === 'image') return <a href={url} target="_blank" rel="noopener noreferrer nofollow"><img className="linkp__media" src={url} alt="" loading="lazy" referrerPolicy="no-referrer" /></a>;
  if (info?.media === 'video') return <video className="linkp__media" src={url} controls preload="metadata" />;
  if (info?.media === 'audio') return <audio className="linkp__audio" src={url} controls preload="metadata" />;
  const site = info?.siteName || hostOf(url);
  return (
    <a className="linkp__card" href={url} target="_blank" rel="noopener noreferrer nofollow" style={/^#[0-9a-f]{3,8}$/i.test(info?.themeColor ?? '') ? { '--linkp-edge': info.themeColor } : undefined}>
      <span className="linkp__text">
        <span className="linkp__site">
          {info?.icon && <img src={info.icon} alt="" className="linkp__icon" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.display = 'none')} />}
          {site}
        </span>
        <strong className="linkp__title">{info ? info.title || hostOf(url) : ' '}</strong>
        {info?.description && <span className="linkp__desc">{info.description}</span>}
      </span>
      {info?.image && (
        <span className="linkp__side">
          <img src={info.image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.parentElement.style.display = 'none')} />
        </span>
      )}
    </a>
  );
}
