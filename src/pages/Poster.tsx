import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import '../staff.css';
import { Logo } from '../components/ui';

const LEAVES = [
  { e: '🍃', x: 82, y: 4, s: 26, r: 20 },
  { e: '🌿', x: -4, y: 38, s: 30, r: -30 },
  { e: '🍂', x: 88, y: 46, s: 22, r: 40 },
  { e: '🌱', x: 4, y: 84, s: 20, r: 0 },
  { e: '🍀', x: 70, y: 88, s: 18, r: -20 },
  { e: '🌸', x: 44, y: 2, s: 12, r: 10 },
];

export default function Poster() {
  const [qr, setQr] = useState('');
  const url = window.location.origin;

  useEffect(() => {
    document.title = 'Canopy Quest · Poster';
    QRCode.toDataURL(url, { margin: 1, width: 900, errorCorrectionLevel: 'M', color: { dark: '#1d3a2b', light: '#ffffff' } })
      .then(setQr)
      .catch(() => {});
  }, [url]);

  return (
    <>
      <button className="btn pst-print" onClick={() => window.print()}>
        🖨️ Print
      </button>
      <div className="pst-page">
        <div className="pst-leaves" aria-hidden="true">
          {LEAVES.map((l, i) => (
            <span key={i} style={{ left: `${l.x}%`, top: `${l.y}%`, fontSize: `${l.s}mm`, transform: `rotate(${l.r}deg)` }}>
              {l.e}
            </span>
          ))}
        </div>

        <div className="pst-top">
          <Logo />
          <div>
            <h1 className="pst-title">Canopy Quest</h1>
            <div className="pst-sub">Campus species hunt · CoE for Nature Based Solutions · Alliance University</div>
          </div>
        </div>

        <p className="pst-tag">How many plants can your team find?</p>

        <div className="pst-mid">
          <div className="pst-qr">
            {qr ? <img src={qr} alt="QR code to join Canopy Quest" /> : <div style={{ aspectRatio: '1' }} />}
            <b>Scan to play</b>
            <span>{url.replace(/^https?:\/\//, '')}</span>
          </div>
          <div className="pst-steps">
            <div className="pst-step">
              <div className="n">1</div>
              <div>
                <b>Scan &amp; join</b>
                <span>Use your student ID and pick a 4-digit PIN. Play solo or make a team of up to 4.</span>
              </div>
            </div>
            <div className="pst-step">
              <div className="n">2</div>
              <div>
                <b>Snap leaves &amp; plants</b>
                <span>Take the photo in the app anywhere on campus. GPS geotags every find, and an AI checks the species.</span>
              </div>
            </div>
            <div className="pst-step">
              <div className="n">3</div>
              <div>
                <b>Climb the live board</b>
                <span>Every new species scores. Watch the projector for Wanted bounties and the final reveal!</span>
              </div>
            </div>
          </div>
        </div>

        <div className="pst-score">
          <div className="pst-tier">
            <b>10</b>
            <span>Common</span>
          </div>
          <div className="pst-tier">
            <b>20</b>
            <span>Uncommon</span>
          </div>
          <div className="pst-tier">
            <b>40</b>
            <span>Rare</span>
          </div>
          <div className="pst-tier legendary">
            <b>80</b>
            <span>✨ Legendary</span>
          </div>
        </div>

        <div className="pst-bonus">
          <div>
            <b>🥇 First Finder +50%</b>
            Be the first on campus to log a species.
          </div>
          <div>
            <b>🎯 Wanted ×2</b>
            Catch the bounty species while the timer runs.
          </div>
        </div>

        <div className="pst-foot">
          <span>Each species counts once per player and once per team. Judges check every photo.</span>
          <span style={{ fontFamily: 'var(--hand)', fontSize: '7mm', color: 'var(--ink-2)' }}>Happy hunting! 🌿</span>
        </div>
      </div>
    </>
  );
}
