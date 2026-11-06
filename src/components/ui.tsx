import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import type { Rarity } from '../lib/types';
import { RARITY_LABEL } from '../lib/badges';

export type Mood = 'wave' | 'cheer' | 'think' | 'snap';

/**
 * Elegant: the trail guide. ELE·gant, because "ele" (ಎಲೆ) is Kannada for leaf.
 * A leaf wearing a monocle, drawn in currentColor so it follows the theme.
 */
export function Elegant({ mood = 'wave', size = 120, className = '', alt = '' }: { mood?: Mood; size?: number; className?: string; alt?: string }) {
  return (
    <svg
      viewBox="-8 -8 80 80"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`elegant elegant-${mood} ${className}`}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <path d="M32 6C46 18 52 32 46 46C42 54 36 58 32 58C28 58 22 54 18 46C12 32 18 18 32 6Z" />
      <path d="M32 12V26" />
      <circle cx="38" cy="36" r="6" />
      <path d="M44 38C47 41 48 45 47 50" />
      <circle cx="26" cy="36" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="38" cy="36" r="1.8" fill="currentColor" stroke="none" />
      {mood === 'cheer' ? <path d="M26 45Q32 51 38 45" /> : mood === 'think' ? <path d="M29 47H35" /> : <path d="M28 46Q32 49 36 46" />}
      <path d="M32 58V63" />
      {mood === 'cheer' && <g strokeWidth="2.6"><path d="M6 14l4 3M58 14l-4 3M4 30h5M60 30h-5" /></g>}
      {mood === 'think' && <g strokeWidth="2.6"><circle cx="56" cy="8" r="2.2" /><circle cx="62" cy="0" r="1.4" /></g>}
      {mood === 'snap' && <g strokeWidth="2.4"><path d="M-4 4V-4H4M60 -4H68V4M68 60V68H60M4 68H-4V60" /></g>}
    </svg>
  );
}

/** Old name, kept so existing screens keep working while they move to Elegant. */
export const Sprig = Elegant;

export function Logo({ size = 34 }: { size?: number }) {
  return <Elegant mood="wave" size={size} />;
}

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <div className="topbar">
      <Link to="/" className="brand" aria-label="TREASURE TRAIL home">
        <span className="brand-name">
          <span className="kicker">Leave the Class</span>
          <b>TREASURE TRAIL</b>
        </span>
      </Link>
      {right}
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  trail: <><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><path d="M7 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6" /></>,
  ranks: <path d="M6 20V11M12 20V5M18 20v-6" />,
  journal: <><circle cx="5" cy="19" r="2" /><circle cx="19" cy="5" r="2" /><path d="M7 19h6a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h6" /></>,
  board: <path d="M6 20V11M12 20V5M18 20v-6" />,
  snap: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14c3 0 5 2 5 5" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  share: <><path d="M12 3v12" /><path d="M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>,
  pin: <><path d="M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.5" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  crown: <path d="M3 18 2 7l5 4 5-7 5 7 5-4-1 11z" />,
};

export function Icon({ name, size = 24 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

export function BottomNav() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <nav className="nav" aria-label="Main">
      <NavLink to="/" end className={cls}>
        <Icon name="trail" />Trail
      </NavLink>
      <NavLink to="/board" className={cls}>
        <Icon name="ranks" />Ranks
      </NavLink>
      <NavLink to="/snap" className={({ isActive }) => `snap ${isActive ? 'active' : ''}`}>
        <Icon name="snap" size={20} />Snap
      </NavLink>
      <NavLink to="/map" className={cls}>
        <Icon name="map" />Map
      </NavLink>
      <NavLink to="/team" className={cls}>
        <Icon name="team" />Crew
      </NavLink>
    </nav>
  );
}

export function RarityPill({ rarity }: { rarity: Rarity }) {
  return <span className={`pill ${rarity}`}>{RARITY_LABEL[rarity]}</span>;
}

export function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

let toastSet: ((m: string | null) => void) | null = null;
export function toast(msg: string) {
  toastSet?.(msg);
}
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSet = setMsg;
    return () => {
      toastSet = null;
    };
  }, []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return msg ? <div className="toast" role="status">{msg}</div> : null;
}

export function burst(kind: 'normal' | 'big' | 'legendary' = 'normal') {
  const colors = ['#C8FF2E', '#E2FF8A', '#FFFFFF', '#6EE7A8', '#F5C451'];
  if (kind === 'normal') {
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 }, colors });
    return;
  }
  const end = Date.now() + (kind === 'legendary' ? 2200 : 1200);
  const frame = () => {
    confetti({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0 }, colors });
    confetti({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  };
  frame();
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

export function LeafyBg() {
  const leaves = ['🍃', '🌿', '🍂', '🌱', '🍀'];
  return (
    <div className="leafy-bg" aria-hidden="true">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} style={{ left: `${(i * 11 + 4) % 100}%`, animationDelay: `${-i * 2.1}s`, animationDuration: `${16 + (i % 4) * 3}s` }}>
          {leaves[i % leaves.length]}
        </span>
      ))}
    </div>
  );
}

export function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
