import Assistant from './pages/Assistant.jsx';
import useAssistant from './hooks/useAssistant.js';
import { useI18n } from './i18n.js';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import Navbar from './components/Navbar.jsx';
import DetailModal from './components/DetailModal.jsx';
import Loader from './components/Loader.jsx';
import Setup from './pages/Setup.jsx';
import Home from './pages/Home.jsx';
import WebTest from './pages/WebTest.jsx';
import ReceiveLink from './pages/ReceiveLink.jsx';
import ExternalPlayer from './pages/ExternalPlayer.jsx';
import Browse from './pages/Browse.jsx';
import Search from './pages/Search.jsx';
import Watch from './pages/Watch.jsx';
import WatchTV from './pages/WatchTV.jsx';
import Settings from './pages/Settings.jsx';
import DetailTV from './pages/DetailTV.jsx';
import { TvContext, detectTV, useSpatialNav } from './hooks/useTv.js';
import { isConfigured as _xtreamDirect } from './xtreamTV.js';
import { refreshLibraryOnStartup } from './apiTV.js';

const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export default function App() {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [splashDone, setSplashDone] = useState(false);
  const [splashMsg, setSplashMsg] = useState('');
  const [detail, setDetail] = useState(null);
  const [isTV, setIsTV] = useState(detectTV);
  const location = useLocation();

  useAssistant(isTV && splashDone && !loading && !!status?.configured);
  useSpatialNav(isTV && splashDone && location.pathname !== '/external');

  useEffect(() => {
    if (isTV) document.documentElement.classList.add('tv');
    else document.documentElement.classList.remove('tv');
  }, [isTV]);

  // TV Splash: download playlist from provider on every startup
  // Updates the HTML splash message (visible before React mounts) then hides it
  useEffect(() => {
    if (!isTV || !_xtreamDirect()) {
      setSplashDone(true);
      // Hide HTML splash immediately for non-TV or non-xtream
      var sp = document.getElementById('splash');
      if (sp) sp.style.display = 'none';
      return;
    }
    var splashEl = document.getElementById('splash');
    var msgEl = splashEl ? splashEl.querySelector('div:last-child') : null;
    function setMsg(t) { if (msgEl) msgEl.textContent = t; setSplashMsg(t); }

    let active = true;
    setMsg('IPTV arşivi güncelleniyor…');
    refreshLibraryOnStartup().then(function(result) {
      if (!active) return;
      setMsg(result.failed.length ? 'Bazı listeler yenilenemedi. Kayıtlı arşiv kullanılıyor.' : t('Pronto!'));
      setTimeout(function() {
        if (!active) return;
        if (splashEl) {
          splashEl.style.transition = 'opacity 0.4s';
          splashEl.style.opacity = '0';
          setTimeout(function() { splashEl.style.display = 'none'; }, 400);
        }
        setSplashDone(true);
      }, result.failed.length ? 1500 : 300);
    });
    return function() { active = false; };
  }, [isTV, t]);

  const refreshStatus = useCallback(async () => {
    try {
      const s = await api.getProvider();
      setStatus(s);
      return s;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refreshStatus(); }, [refreshStatus]);

  const navigate = useNavigate();
  const openDetail = useCallback((type, id) => {
    if (isTV) navigate('/detail/' + type + '/' + id);
    else setDetail({ type, id });
  }, [isTV, navigate]);
  const closeDetail = useCallback(() => setDetail(null), []);

  // Fallback back handler — only fires if no page handler stopped propagation
  useEffect(() => {
    if (!isTV) return;
    const onBack = (e) => {
      var code = e.keyCode || e.which;
      if (code === 10009 || code === 27) {
        // If already handled by a page (Browse, Player, Detail), skip
        if (e._tvHandled) return;
        e.preventDefault();
        if (detail) { closeDetail(); return; }
        // Don't go back from Home
        if (location.pathname === '/') return;
        window.history.back();
      }
    };
    // Use bubble phase (no true) so page capture handlers fire first
    window.addEventListener('keydown', onBack);
    return () => window.removeEventListener('keydown', onBack);
  }, [isTV, detail, closeDetail, location.pathname]);

  // Wait for both: provider status loaded + TV splash done
  if (loading || (isTV && !splashDone)) return null;

  const configured = status?.configured && ((status?.stats?.movie + status?.stats?.series + status?.stats?.live) > 0 || _xtreamDirect());
  const isWatch = location.pathname.startsWith('/watch') || location.pathname === '/external';
  const isDetail = location.pathname.startsWith('/detail');
  const isSetup = location.pathname.startsWith('/setup');

  return (
    <TvContext.Provider value={{ isTV, setIsTV }}>
      <UIContext.Provider value={{ status, refreshStatus, openDetail, closeDetail }}>
        {!isWatch && !isDetail && !isSetup && configured && <Navbar />}
        <Routes>
          <Route path="/setup" element={<Setup />} />
          <Route path="/web-test" element={<WebTest />} />
          <Route path="/assistant" element={<Assistant />} />
          <Route path="/send-to-tv" element={<ReceiveLink />} />
          <Route path="/external" element={<ExternalPlayer />} />
          {!configured ? (
            <Route path="*" element={<Navigate to="/setup" replace />} />
          ) : (
            <>
              <Route path="/" element={<Home />} />
              <Route path="/movies" element={<Browse type="movie" key="movie" />} />
              <Route path="/series" element={<Browse type="series" key="series" />} />
              <Route path="/live" element={<Browse type="live" key="live" />} />
              <Route path="/search" element={<Search key={'actor:' + (new URLSearchParams(location.search).get('actor') || '')} />} />
              <Route path="/detail/:type/:id" element={<DetailTV />} />
              <Route path="/watch/:type/:id" element={isTV ? <WatchTV /> : <Watch />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </>
          )}
        </Routes>
        {detail && <DetailModal type={detail.type} id={detail.id} onClose={closeDetail} />}
      </UIContext.Provider>
    </TvContext.Provider>
  );
}
