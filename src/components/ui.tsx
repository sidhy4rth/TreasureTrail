import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Link } from 'react-router-dom';
import confetti from 'canvas-confetti';
import type { Rarity } from '../lib/types';
import { RARITY_LABEL } from '../lib/badges';

export type Mood = 'wave' | 'cheer' | 'think' | 'snap';

/** Sprig, the Canopy Quest leaf mascot. */
export function Sprig({ mood = 'wave', size = 120, className = '', alt = '' }: { mood?: Mood; size?: number; className?: string; alt?: string }) {
  return <img src={`/art/sprig-${mood}.svg`} width={size} height={Math.round(size * 1.087)} alt={alt} aria-hidden={alt ? undefined : true} className={`sprig ${className}`} draggable={false} />;
}

export function Logo({ size = 34 }: { size?: number }) {
  return <Sprig mood="wave" size={size} />;
}

export function TopBar({ right }: { right?: ReactNode }) {
  return (
    <div className="topbar">
      <Link to="/" className="brand">
        <Logo />
        Canopy Quest
      </Link>
      {right}
    </div>
  );
}

const ICONS: Record<string, ReactNode> = {
  journal: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 8c2-2 5-2 6 1-2 2-5 2-6-1z" /></>,
  board: <><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></>,
  snap: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></>,
  team: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14c3 0 5 2 5 5" /></>,
};

export function Icon({ name, size = 24 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

export function BottomNav() {
  const cls = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');
  return (
    <nav className="nav" aria-label="Main">
      <NavLink to="/" end className={cls}>
        <Icon name="journal" />Journal
      </NavLink>
      <NavLink to="/board" className={cls}>
        <Icon name="board" />Board
      </NavLink>
      <NavLink to="/snap" aria-label="Snap a leaf" className={({ isActive }) => `snap ${isActive ? 'active' : ''}`}>
        <span className="ico"><Icon name="snap" size={32} /></span>
      </NavLink>
      <NavLink to="/map" className={cls}>
        <Icon name="map" />Map
      </NavLink>
      <NavLink to="/team" className={cls}>
        <Icon name="team" />Team
      </NavLink>
    </nav>
  );
}

export function RarityPill({ rarity }: { rarity: Rarity }) {
  return <span className={`pill ${rarity}`}>{rarity === 'legendary' ? '✨ ' : ''}{RARITY_LABEL[rarity]}</span>;
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
  const colors = ['#FFC93C', '#4CC26A', '#C6F06B', '#FF6B57', '#5EC8F2', '#FF9AB4'];
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
