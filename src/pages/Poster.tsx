import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import '../staff.css';
import { Elegant } from '../components/ui';

/** Printable A4 poster: white page, one dark-green band, lime only as accents (saves ink). */
export default function Poster() {
  const [qr, setQr] = useState('');
  const url = window.location.origin;

  useEffect(() => {
    document.title = 'TREASURE TRAIL · Poster';
    QRCode.toDataURL(url, { margin: 1, width: 900, errorCorrectionLevel: 'M', color: { dark: '#0F1F15', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => {});
  }, [url]);

  return (
    <>
      <button className="pst-print" onClick={() => window.print()}>
        Print poster
      </button>
      <div className="pst-page">
        <header className="pst-band">
          <div>
            <div className="pst-kicker">LEAVE THE CLASS</div>
            <h1 className="pst-title">
              TREASURE
              <br />
              TRAIL
            </h1>
            <p className="pst-tagline">
              Leave the class. Discover the biodiversity along campus. <b>Snap it.</b>
            </p>
          </div>
          <div className="pst-markwrap">
            <Elegant mood="wave" size={110} />
          </div>
          <span className="pst-live">
            <i />
            ALLIANCE UNIVERSITY
          </span>
        </header>

        <div className="pst-body">
          <div className="pst-mid">
            <div className="pst-qr">
              {qr ? <img src={qr} alt="QR code to join TREASURE TRAIL" /> : <div style={{ aspectRatio: '1' }} />}
              <b>Scan to play</b>
              <span>{url.replace(/^https?:\/\//, '')}</span>
            </div>
            <div className="pst-steps">
              <div className="pst-step">
                <div className="n">1</div>
                <div>
                  <b>Scan &amp; join</b>
                  <span>Use your student ID and pick a 4-digit PIN. Go solo, or start a crew of up to 4.</span>
                </div>
              </div>
              <div className="pst-step">
                <div className="n">2</div>
                <div>
                  <b>Snap leaves anywhere on campus</b>
                  <span>Take the photo in the app. GPS tags every find, and an AI checks the species.</span>
                </div>
              </div>
              <div className="pst-step">
                <div className="n">3</div>
                <div>
                  <b>Climb the live ranks</b>
                  <span>Every new species scores. Watch the big screen for bounties and the final reveal.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pst-elegant">
            <Elegant mood="think" size={80} />
            <div>
              <div className="nm">
                Meet <i>Ele</i>gant
              </div>
              <p>
                ELE·gant, because <span className="kn">ಎಲೆ</span> (ele) is Kannada for leaf. Not sure what you found? Ask Elegant and it tells you
                what it is.
              </p>
            </div>
          </div>

          <div>
            <div className="pst-sectlabel">SCORING</div>
            <div className="pst-score">
              <div className="pst-tier">
                <b>10</b>
                <span>Common</span>
              </div>
              <div className="pst-tier">
                <b>25</b>
                <span>Rare</span>
              </div>
              <div className="pst-tier legendary">
                <b>50</b>
                <span>Legendary</span>
              </div>
            </div>
            <div className="pst-bonus">
              <div>
                <b>First on campus +50%</b>
                Be the first to snap a species.
              </div>
              <div>
                <b>Bounty ×2</b>
                Snap the bounty species while the timer runs.
              </div>
            </div>
          </div>
        </div>

        <footer className="pst-foot">
          <span>Each species counts once per player and once per crew. Judges check every photo.</span>
          <span className="url">{url.replace(/^https?:\/\//, '')}</span>
        </footer>
      </div>
    </>
  );
}
