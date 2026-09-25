import { useEffect, useMemo, useState } from 'react';
import crown from '../../assets/approve/crown.webp';
import shard from '../../assets/approve/shard.webp';
import sparks from '../../assets/approve/sparks.webp';
import splat1 from '../../assets/disapprove/splat-1.webp';
import splat2 from '../../assets/disapprove/splat-2.webp';
import splat3 from '../../assets/disapprove/splat-3.webp';
import splat4 from '../../assets/disapprove/splat-4.webp';
import splat5 from '../../assets/disapprove/splat-5.webp';
import { playApproveSound, playDisapproveSound } from '../../lib/uiSound.js';
import './ProfileAura.css';

/**
 * What a profile greets you with, from how it's been voted: mostly approved,
 * stars shoot across the screen and sparkle, the app's sparks burst and its
 * shards drift, and Mimyne's crown rises in the middle; mostly disapproved,
 * the app's brown splats land all over it and one last big one (its drawings
 * played in order) slides from top to bottom, smearing as it goes.
 * Nothing when it's close, or unvoted. The more votes, the more of it.
 * Brief, never in the way (pointer-events: none), and nothing at all for
 * people who ask their system for less motion.
 */

const SHOW_MS = 4600;

/** 'stars', 'splats' or null, and how much (0.35 to 1). */
export function auraFor({ up = 0, down = 0 } = {}) {
  const total = up + down;
  if (!total) return null;
  const share = up / total;
  const mood = share >= 0.6 ? 'stars' : share <= 0.4 ? 'splats' : null;
  if (!mood) return null;
  return { mood, amount: Math.min(1, 0.35 + Math.log10(total + 1) / 2.5) };
}

// The same scatter every time for the same profile, so it feels like its own.
function seeded(seed) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0;
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

export default function ProfileAura({ votes, seed }) {
  const aura = auraFor(votes);
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (!aura || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return undefined;
    setShowing(true);
    (aura.mood === 'stars' ? playApproveSound : playDisapproveSound)();
    const done = setTimeout(() => setShowing(false), SHOW_MS);
    return () => clearTimeout(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, aura?.mood]);

  if (!showing || !aura) return null;
  return aura.mood === 'stars' ? <Stars amount={aura.amount} seed={seed} /> : <Splats amount={aura.amount} seed={seed} />;
}

function Stars({ amount, seed }) {
  const { shooting, sparkles, bursts, shards } = useMemo(() => {
    const r = seeded(`${seed}:stars`);
    return {
      bursts: Array.from({ length: Math.round(3 + 6 * amount) }, (_, i) => ({
        id: i,
        top: 8 + r() * 76,
        left: 6 + r() * 84,
        size: 90 + r() * 110,
        delay: 0.3 + r() * 2.4,
        turn: Math.round(r() * 360),
      })),
      shards: Array.from({ length: Math.round(4 + 10 * amount) }, (_, i) => ({
        id: i,
        left: 4 + r() * 92,
        size: 14 + r() * 22,
        delay: r() * 2.6,
        duration: 2 + r() * 1.4,
        spin: Math.round(180 + r() * 540) * (r() > 0.5 ? 1 : -1),
        sway: Math.round(-60 + r() * 120),
      })),
      shooting: Array.from({ length: Math.round(6 + 16 * amount) }, (_, i) => ({
        id: i,
        top: -10 + r() * 60,
        left: 20 + r() * 95,
        delay: r() * 2.2,
        length: 90 + r() * 140,
        duration: 0.7 + r() * 0.6,
        travel: 55 + r() * 45,
      })),
      sparkles: Array.from({ length: Math.round(10 + 28 * amount) }, (_, i) => ({
        id: i,
        top: 4 + r() * 88,
        left: 3 + r() * 94,
        size: 8 + r() * 16,
        delay: 0.2 + r() * 2.8,
        duration: 0.9 + r() * 0.7,
        tint: ['#fff7d6', '#f2b84b', '#c4b5fd', '#ffffff'][Math.floor(r() * 4)],
      })),
    };
  }, [amount, seed]);

  return (
    <div className="aura aura--stars" aria-hidden="true">
      {bursts.map((b) => (
        <img key={`b${b.id}`} src={sparks} alt="" className="aura__burst" style={{ top: `${b.top}%`, left: `${b.left}%`, width: b.size, '--turn': `${b.turn}deg`, animationDelay: `${b.delay}s` }} />
      ))}
      {shards.map((d) => (
        <img
          key={`d${d.id}`}
          src={shard}
          alt=""
          className="aura__shard"
          style={{ left: `${d.left}%`, width: d.size, animationDelay: `${d.delay}s`, animationDuration: `${d.duration}s`, '--spin': `${d.spin}deg`, '--sway': `${d.sway}px` }}
        />
      ))}
      {shooting.map((s) => (
        <span
          key={s.id}
          className="aura__shoot"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: s.length,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
            '--travel': `${s.travel}vmax`,
          }}
        />
      ))}
      {sparkles.map((s) => (
        <svg
          key={s.id}
          className="aura__sparkle"
          viewBox="0 0 24 24"
          style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, color: s.tint, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }}
        >
          <path d="M12 0c.6 5.4 1.9 8.8 3.4 10.3C17 11.8 19.2 11.4 24 12c-4.8.6-7 .2-8.6 1.7C13.9 15.2 12.6 18.6 12 24c-.6-5.4-1.9-8.8-3.4-10.3C7 12.2 4.8 12.6 0 12c4.8-.6 7-.2 8.6-1.7C10.1 8.8 11.4 5.4 12 0z" fill="currentColor" />
        </svg>
      ))}
      {/* Mimyne's crown rises in the middle, its sparks fanning behind it. */}
      <div className="aura__crown">
        <img src={sparks} alt="" className="aura__crown-sparks" />
        <img src={crown} alt="" className="aura__crown-img" />
      </div>
    </div>
  );
}

/** The big splat's drawings, in order, as it lands: the drop, then it breaks up. */
function useLanding(delayMs) {
  const frames = [splat1, splat2, splat3, splat4, splat5];
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const steps = frames.map((_, i) => setTimeout(() => setFrame(i), delayMs + i * 70));
    return () => steps.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delayMs]);
  return frames[frame];
}

function Splats({ amount, seed }) {
  const bigFrame = useLanding(1650);
  const drops = useMemo(() => {
    const r = seeded(`${seed}:drops`);
    return Array.from({ length: 10 }, (_, i) => ({
      id: i,
      x: 20 + r() * 60,
      size: 6 + r() * 12,
      delay: 1.7 + r() * 0.25,
      fx: Math.round((r() - 0.5) * 420),
      fy: Math.round(60 + r() * 220),
    }));
  }, [seed]);
  const splotches = useMemo(() => {
    const r = seeded(`${seed}:splats`);
    const frames = [splat3, splat4, splat5];
    // Spread over the whole screen: one to a cell of a loose grid, each
    // nudged somewhere inside its cell.
    const count = Math.round(5 + 13 * amount);
    const cols = Math.ceil(Math.sqrt(count * 1.6));
    const rows = Math.ceil(count / cols);
    const cells = Array.from({ length: cols * rows }, (_, i) => i).sort(() => r() - 0.5).slice(0, count);
    return cells.map((cell, i) => ({
      id: i,
      src: frames[Math.floor(r() * frames.length)],
      top: -6 + ((Math.floor(cell / cols) + r()) / rows) * 96,
      left: -6 + ((cell % cols + r()) / cols) * 100,
      size: 70 + r() * 150,
      turn: Math.round(r() * 360),
      delay: r() * 1.5,
    }));
  }, [amount, seed]);

  return (
    <div className="aura aura--splats" aria-hidden="true">
      {splotches.map((s) => (
        <img
          key={s.id}
          src={s.src}
          alt=""
          className="aura__splot"
          style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, '--turn': `${s.turn}deg`, animationDelay: `${s.delay}s` }}
        />
      ))}
      {/* The last one: big, lands at the top, and slides all the way down. */}
      <div className="aura__big">
        <span className="aura__trail" />
        {drops.map((d) => (
          <span key={d.id} className="aura__drop" style={{ left: `${d.x}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s`, '--fly-x': `${d.fx}px`, '--fly-y': `${d.fy}px` }} />
        ))}
        <img src={bigFrame} alt="" className="aura__big-splat" />
      </div>
    </div>
  );
}
