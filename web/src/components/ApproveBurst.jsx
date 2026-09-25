import { useEffect, useState } from 'react';
import crown from '../assets/approve/crown.webp';
import shard from '../assets/approve/shard.webp';
import sparks from '../assets/approve/sparks.webp';
import { playApproveSound } from '../lib/uiSound.js';

// What approving looks like, as in the app (ApproveBurst there): Mimyne's
// crown pops up out of the button, its sparks fan out behind it and a shard
// drifts off, with the sound. Keyed on `play`, so approving again restarts
// it. Less motion asked for: the sound, and no flying pieces.

export const BURST_MS = 760;

const LAYERS = [
  { src: sparks, className: 'fx-approve-sparks', scale: 3.6 },
  { src: crown, className: 'fx-approve-crown', scale: 1.9 },
  { src: shard, className: 'fx-approve-shard', scale: 0.7 },
];

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

export default function ApproveBurst({ play = 0, size = 16 }) {
  const [showing, setShowing] = useState(0);

  useEffect(() => {
    if (!play) return undefined;
    playApproveSound();
    if (reducedMotion()) return undefined;
    setShowing(play);
    const done = setTimeout(() => setShowing(0), BURST_MS);
    return () => clearTimeout(done);
  }, [play]);

  if (!showing) return null;
  return (
    <span key={showing} className="fx-anchor" aria-hidden="true">
      {LAYERS.map((layer) => (
        <img key={layer.className} src={layer.src} alt="" draggable={false} className={layer.className} style={{ width: size * layer.scale }} />
      ))}
    </span>
  );
}
