import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import { SessionProvider, useSession } from './lib/game';
import { BottomNav, Spinner, ToastHost } from './components/ui';
import Join from './pages/Join';
import Journal from './pages/Journal';

const Snap = lazy(() => import('./pages/Snap'));
const Board = lazy(() => import('./pages/Board'));
const MapPage = lazy(() => import('./pages/MapPage'));
const TeamPage = lazy(() => import('./pages/TeamPage'));
const Judge = lazy(() => import('./pages/Judge'));
const Admin = lazy(() => import('./pages/Admin'));
const Live = lazy(() => import('./pages/Live'));
const Poster = lazy(() => import('./pages/Poster'));

function Player({ children, nav = true }: { children: ReactNode; nav?: boolean }) {
  const { session } = useSession();
  if (!session) return <Navigate to="/join" replace />;
  return (
    <>
      <div className="app">{children}</div>
      {nav && <BottomNav />}
    </>
  );
}

const Loading = () => (
  <div style={{ padding: '4rem 0' }}>
    <Spinner />
  </div>
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter>
        <ToastHost />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/join" element={<Join />} />
            <Route path="/" element={<Player><Journal /></Player>} />
            <Route path="/snap" element={<Player nav={false}><Snap /></Player>} />
            <Route path="/board" element={<Player><Board /></Player>} />
            <Route path="/map" element={<Player><MapPage /></Player>} />
            <Route path="/team" element={<Player><TeamPage /></Player>} />
            <Route path="/judge" element={<Judge />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/live" element={<Live />} />
            <Route path="/poster" element={<Poster />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
);
