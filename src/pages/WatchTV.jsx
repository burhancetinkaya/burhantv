import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { api, streamUrl, hlsVodMaster, hlsVodTracks, getServerUrl } from '../api.js';
import { isConfigured as xtreamConfigured, liveUrl as xtreamLive, movieUrl as xtreamMovie, seriesUrl as xtreamSeries } from '../xtreamTV.js';
import { useI18n } from '../i18n.js';
import Icon from '../components/Icons.jsx';
import { notifyReceiver } from '../linkRelay.js';
import { sentLinkProgress, saveSentLinkProgress } from '../sentLinkHistory.js';
import useEmbeddedSubtitles from '../hooks/useEmbeddedSubtitles.js';
import { localizeTvItem } from '../tmdbTV.js';
import { defaultLanguageTracks, normalizeLanguage } from '../playbackLanguage.js';
import { createTvMediaPlayer, audioLabel } from '../tvMediaPlayer.js';

function fmt(t) {
  if (!t || isNaN(t) || !isFinite(t)) return '0:00';
  t = Math.floor(t);
  var h = Math.floor(t / 3600);
  var m = Math.floor((t % 3600) / 60);
  var s = t % 60;
  return h > 0
    ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0')
    : m + ':' + String(s).padStart(2, '0');
}

export default function WatchTV({ externalSource, onExternalClose } = {}) {
  var { t } = useI18n();
  var routeParams = useParams();
  var isExternal = !!externalSource;
  var type = isExternal ? 'external' : routeParams.type;
  var id = isExternal ? externalSource.url : routeParams.id;
  var [params] = useSearchParams();
  var navigate = useNavigate();

  var videoRef = useRef(null);
  var playerRef = useRef(null);
  var [audioTracks,setAudioTracks] = useState([]);
  var [audioError,setAudioError] = useState('');
  var [audioSourceKey,setAudioSourceKey] = useState(null);
  var [originalAudio,setOriginalAudio] = useState(null);
  var languageChoice = useRef({});
  var containerRef = useRef(null);
  var hideTimer = useRef(null);
  var externalSaveRef = useRef(null);
  var layerRef = useRef('center');
  var baseOffsetRef = useRef(0); // which player layer has focus: 'top' | 'center' | 'bottom'

  var [detail, setDetail] = useState(null);
  var [seasons, setSeasons] = useState(null);
  var [flat, setFlat] = useState([]);
  var [current, setCurrent] = useState(0);

  var [playing, setPlaying] = useState(false);
  var [time, setTime] = useState(0);
  var [duration, setDuration] = useState(0);
  var [showUI, setShowUI] = useState(true);
  var [status, setStatus] = useState('Caricamento…');
  var [error, setError] = useState('');
  var [subtitleMenu, setSubtitleMenu] = useState(false);
  var subtitleMenuRef = useRef(false);
  subtitleMenuRef.current = subtitleMenu;

  var isSeries = type === 'series';
  var isLive = type === 'live';

  // Load content details
  useEffect(function() {
    var alive = true;
    if (isExternal) { setDetail({name: externalSource.title}); return; }
    api.detail(isSeries ? 'series' : type, id).then(function(d) {
      if (!alive) return;
      setDetail(d);
      if (d.seasons) {
        setSeasons(d.seasons);
        var keys = Object.keys(d.seasons).sort(function(a, b) { return Number(a) - Number(b); });
        var list = [];
        keys.forEach(function(k) {
          (d.seasons[k] || []).forEach(function(ep, idx) {
            list.push({ season: k, idxInSeason: idx, ep: ep });
          });
        });
        setFlat(list);
        var qs = params.get('s');
        var qei = parseInt(params.get('ei'), 10);
        var start = 0;
        if (qs != null && !isNaN(qei)) {
          var found = -1;
          for (var i = 0; i < list.length; i++) {
            if (list[i].season === qs && list[i].idxInSeason === qei) { found = i; break; }
          }
          if (found >= 0) start = found;
        }
        setCurrent(start);
      }
    }).catch(function() { setError('Impossibile caricare questo titolo.'); });
    return function() { alive = false; };
  }, [type, id]);

  // Resolve source
  var source = useMemo(function() {
    if (isExternal) return {streamType:'external',streamId:externalSource.url,title:externalSource.title,url:externalSource.url};
    if (isLive) return { streamType: 'live', streamId: id, ext: 'ts', title: (detail && detail.name) || '' };
    if (type === 'movie') {
      if (!detail) return null;
      return { streamType: 'movie', streamId: id, ext: detail.container_extension || 'mp4', title: detail.name };
    }
    if (!flat.length) return null;
    var node = flat[current];
    if (!node) return null;
    var ep = node.ep;
    return {
      streamType: 'series', streamId: ep.id,
      ext: ep.container_extension || 'mp4',
      title: (detail && detail.name || '') + '  ·  S' + node.season + ':E' + ep.episode_num,
      seriesId: id, season: node.season, epIndex: node.idxInSeason,
    };
  }, [isLive, type, id, detail, flat, current]);

  var sourceKey = source ? source.streamType + ':' + source.streamId : null;
  var subtitleUrl = source && !isLive ? (isExternal ? source.url : xtreamConfigured() ? (source.streamType === 'movie' ? xtreamMovie(source.streamId,source.ext) : xtreamSeries(source.streamId,source.ext)) : null) : null;
  var subtitles = useEmbeddedSubtitles(subtitleUrl, time);
  if(languageChoice.current.key!==sourceKey)languageChoice.current={key:sourceKey,audio:false,subtitle:false,audioApplied:false,subtitleApplied:false};
  useEffect(function(){
    var alive=true;
    setOriginalAudio(null);
    if(isExternal || isLive || !detail)return;
    var key=type+':'+id;
    if(normalizeLanguage(detail.originalLanguage || detail.original_language)){
      setOriginalAudio({key:key,language:detail.originalLanguage || detail.original_language});return;
    }
    localizeTvItem(Object.assign({},detail,{type:type,id:id}),{originalLanguage:true,skipRatings:true}).then(function(item){
      if(alive)setOriginalAudio({key:key,language:item.originalLanguage || ''});
    });
    return function(){alive=false;};
  },[detail,type,id,isExternal,isLive]);
  function selectSubtitle(id){languageChoice.current.subtitle=true;subtitles.select(id);}
  async function selectAudio(id, automatic) {
    if(!automatic)languageChoice.current.audio=true;
    var media=playerRef.current;
    try {
      if(media.selectAudio)await media.selectAudio(id);
      else Array.from(media.audioTracks || []).forEach(function(track,index){track.enabled=String(index)===String(id);});
      if(playerRef.current!==media)return;
      setAudioError('');
      media.dispatchEvent(new Event('trackschanged'));
    } catch (_) { if(playerRef.current===media)setAudioError('Ses dili değiştirilemedi.'); }
  }


  // Direct VOD uses Samsung AVPlay for multiple audio tracks; other sources keep HTML5.
  useEffect(function() {
    var element = videoRef.current;
    if (!element || !source) return;
    var video = !isExternal && !isLive && xtreamConfigured() ? createTvMediaPlayer(element) : element;
    playerRef.current=video;
    element.parentNode.__burhantvPlayer=video;
    setSubtitleMenu(false);setAudioError('');setPlaying(false);setTime(0);setDuration(0);
    var alive=true;
    setError('');
    setStatus(t('Caricamento…'));
    var playbackUrl;
    var progressReady = false;
    var resumeHandler = null;
    if (isExternal) notifyReceiver(externalSource.token,externalSource.sequence,'received');

    function startPlayback(resumePos) {
      if(!alive)return;
      var url;
      var directMode = xtreamConfigured();

      if (isExternal) {
        url = source.url;
        baseOffsetRef.current = 0;
      } else if (isLive) {
        url = directMode ? xtreamLive(source.streamId) : (getServerUrl() + '/api/hls/live/' + source.streamId);
        baseOffsetRef.current = 0;
      } else if (directMode) {
        // Direct from provider — TV plays MP4/HLS natively, seek works
        if (source.streamType === 'movie') {
          url = xtreamMovie(source.streamId, source.ext);
        } else {
          url = xtreamSeries(source.streamId, source.ext);
        }
        baseOffsetRef.current = 0;
      } else {
        // Via server HLS transcode
        baseOffsetRef.current = resumePos || 0;
        url = hlsVodMaster(source.streamType, source.streamId, source.ext, resumePos || 0);
      }

      playbackUrl = url;
      progressReady = false;
      if(resumeHandler)video.removeEventListener('loadedmetadata',resumeHandler);
      // Apply the saved time before autoplay; do not let initial zero-time events overwrite it.
      if(isExternal || (directMode && !isLive && resumePos > 5)){
        resumeHandler=function(){
          video.removeEventListener('loadedmetadata',resumeHandler);
          var target=Math.max(0,resumePos||0);
          if(isFinite(video.duration)&&video.duration>0)target=Math.min(target,Math.max(0,video.duration-0.25));
          if(target>0){video.currentTime=target;setTime(target);}
          progressReady=true;
        };
        video.addEventListener('loadedmetadata',resumeHandler);
      }
      video.src = url;
      video.load();
    }

    var onCanPlay = function() {
      video.removeEventListener('canplay', onCanPlay);
      setStatus('');
      video.play().catch(function() {});
    };
    var onError = function() {
      var message = isExternal ? 'Video açılamadı. Bağlantının süresi dolmuş veya video biçimi TV ile uyumsuz olabilir.' : t('Impossibile riprodurre questo contenuto.');
      setError(message);
      if (isExternal) notifyReceiver(externalSource.token,externalSource.sequence,'error',message);
    };

    // Load saved position then start
    if (isExternal) {
      startPlayback(sentLinkProgress(source.url).position);
    } else if (!isLive) {
      api.getProgress().then(function(rows) {
        var resumePos = 0;
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].key === source.streamType + ':' + source.streamId) {
            if (rows[i].position > 5) resumePos = Math.floor(rows[i].position);
            break;
          }
        }
        startPlayback(resumePos);
      }).catch(function() { startPlayback(0); });
    } else {
      startPlayback(0);
    }

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    // Stall watchdog
    var stallTime = 0;
    var stallTicks = 0;
    var retries = 0;
    var maxRetries = isLive ? 9999 : 10;
    var watchdog = setInterval(function() {
      if (video.paused || video.ended || video.seeking) { stallTime = video.currentTime; stallTicks = 0; return; }
      if (video.currentTime > stallTime + 0.05) { stallTime = video.currentTime; stallTicks = 0; retries = 0; return; }
      stallTicks++;
      if (stallTicks < 6) return;
      stallTicks = 0;
      if (retries >= maxRetries) { setError('Connessione persa.'); return; }
      retries++;
      setStatus('Riconnessione…');
      var pos = video.currentTime || 0;
      if(isExternal){video.addEventListener('canplay',onCanPlay);startPlayback(pos);return;}
      video.src = playbackUrl;
      video.load();
      if (pos > 5) {
        var onSeek = function() { video.removeEventListener('loadedmetadata', onSeek); video.currentTime = pos; video.play().catch(function(){}); };
        video.addEventListener('loadedmetadata', onSeek);
      }
    }, 1000);

    // Save progress every 10s
    var saver = setInterval(function() {
      if(isExternal){saveExternalNow();return;}
      if (isLive || !video.duration || isNaN(video.duration)) return;
      api.saveProgress({
        type: source.streamType, id: source.streamId,
        position: baseOffsetRef.current + video.currentTime, duration: video.duration,
        parent: source.seriesId, season: source.season, ep_index: source.epIndex,
      }).catch(function() {});
    }, isExternal ? 5000 : 10000);

    function saveExternalNow(){
      if(!isExternal||!progressReady||video.error)return;
      saveSentLinkProgress(source.url,video.currentTime,video.duration,!!video.ended);
    }
    if(isExternal)externalSaveRef.current=saveExternalNow;
    function onVisibility(){if(document.hidden)saveExternalNow();}
    if(isExternal){
      video.addEventListener('pause',saveExternalNow);
      video.addEventListener('seeked',saveExternalNow);
      video.addEventListener('ended',saveExternalNow);
      window.addEventListener('pagehide',saveExternalNow);
      document.addEventListener('visibilitychange',onVisibility);
    }

    // Save progress on exit
    function saveNow() {
      if(isExternal){saveExternalNow();return;}
      if (isLive || !video.duration || isNaN(video.duration)) return;
      api.saveProgress({
        type: source.streamType, id: source.streamId,
        position: baseOffsetRef.current + video.currentTime, duration: video.duration,
        parent: source.seriesId, season: source.season, ep_index: source.epIndex,
      }).catch(function() {});
    }

    return function() {
      alive=false;
      saveNow();
      if(isExternal)externalSaveRef.current=null;
      clearInterval(saver);
      clearInterval(watchdog);
      if(resumeHandler)video.removeEventListener('loadedmetadata',resumeHandler);
      video.removeEventListener('pause',saveExternalNow);
      video.removeEventListener('seeked',saveExternalNow);
      video.removeEventListener('ended',saveExternalNow);
      window.removeEventListener('pagehide',saveExternalNow);
      document.removeEventListener('visibilitychange',onVisibility);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      try { video.load(); } catch(e) {}
      if(video.destroy)video.destroy();
      if(element.parentNode)delete element.parentNode.__burhantvPlayer;
      playerRef.current=null;
    };
  }, [sourceKey]);

  // Media events
  useEffect(function() {
    var v = playerRef.current;
    if (!v) return;
    var readAudio = function(){setAudioSourceKey(sourceKey);setAudioTracks(Array.from(v.audioTracks || []).map(function(track,index){return {id:v.selectAudio?track.id:index,language:track.language || '',label:track.label||audioLabel(track.language,index),enabled:track.enabled};}));};
    readAudio();
    v.addEventListener('trackschanged',readAudio);
    v.addEventListener('loadedmetadata',readAudio);
    var onTime = function() { setTime(baseOffsetRef.current + v.currentTime); };
    var onDur = function() { setDuration(v.duration || 0); }; // HLS duration grows, but OK for progress bar
    var onPlay = function() { setPlaying(true); setStatus(''); if (isExternal) notifyReceiver(externalSource.token,externalSource.sequence,'playing'); };
    var onPause = function() { setPlaying(false); };
    var onEnded = function() {
      if (isSeries && current < flat.length - 1) setCurrent(function(c) { return c + 1; });
    };
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('durationchange', onDur);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('ended', onEnded);
    return function() {
      v.removeEventListener('trackschanged',readAudio);
      v.removeEventListener('loadedmetadata',readAudio);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('durationchange', onDur);
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('ended', onEnded);
    };
  }, [isSeries, current, flat.length, sourceKey]);


  // Apply each default once per film/episode, after both metadata and tracks arrive.
  // A manual choice made while metadata is loading always wins.
  useEffect(function(){
    if(!originalAudio || originalAudio.key!==type+':'+id || !normalizeLanguage(originalAudio.language))return;
    var choice=languageChoice.current;
    var defaults=defaultLanguageTracks(originalAudio.language,audioTracks,subtitles.tracks);
    if(audioSourceKey===sourceKey && defaults.audio && !choice.audio && !choice.audioApplied){
      choice.audioApplied=true;
      if(!defaults.audio.enabled)selectAudio(defaults.audio.id,true);
    }
    if(subtitles.loadedUrl===subtitleUrl && !choice.subtitle && !choice.subtitleApplied){
      choice.subtitleApplied=true;
      subtitles.select(defaults.subtitle?String(defaults.subtitle.id):'');
    }
  },[originalAudio,audioTracks,audioSourceKey,sourceKey,subtitles.tracks,subtitles.loadedUrl,subtitleUrl,type,id]);

  // Controls
  var togglePlay = useCallback(function() {
    var v = playerRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(function() {}); else v.pause();
  }, []);

  var skip = useCallback(function(s) {
    var v = playerRef.current;
    if (!v || !source) return;
    if (isLive) return;

    if (isExternal || xtreamConfigured()) {
      // Direct mode: native seek works on MP4 from provider
      var newTime = Math.max(0, Math.min(v.duration || Infinity, v.currentTime + s));
      v.currentTime = newTime;
      setTime(newTime);
    } else {
      // HLS transcode: restart from new absolute position
      var absTime = baseOffsetRef.current + (v.currentTime || 0) + s;
      absTime = Math.max(0, absTime);
      setStatus('Caricamento…');
      setTime(absTime);
      baseOffsetRef.current = Math.floor(absTime);
      var newUrl = hlsVodMaster(source.streamType, source.streamId, source.ext, Math.floor(absTime));
      v.src = newUrl;
      v.load();
    }
  }, [source, isLive, isExternal]);

  var goBack = function() { if (subtitleMenu) { setSubtitleMenu(false); return; } if(isExternal && externalSaveRef.current)externalSaveRef.current(); if (isExternal && onExternalClose) onExternalClose(); else navigate(-1); };
  var nextEp = function() { if (isSeries && current < flat.length - 1) setCurrent(current + 1); };
  var prevEp = function() { if (isSeries && current > 0) setCurrent(current - 1); };

  // Auto-hide UI
  var poke = useCallback(function() {
    setShowUI(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(function() {
      var v = playerRef.current;
      if (v && !v.paused && !subtitleMenuRef.current) setShowUI(false);
    }, 5000);
  }, []);

  // The mount timer may expire while the first video is still loading.
  // Start a fresh idle period when playback starts (also after pause/resume).
  useEffect(function() {
    if (playing && !subtitleMenu) poke();
    else { clearTimeout(hideTimer.current); setShowUI(true); }
    return function() { clearTimeout(hideTimer.current); };
  }, [playing, sourceKey, subtitleMenu, poke]);

  useEffect(function(){
    if(subtitleMenu){clearTimeout(hideTimer.current);setShowUI(true);var timer=setTimeout(function(){var button=containerRef.current.querySelector('.subtitle-menu button.selected')||containerRef.current.querySelector('.subtitle-menu button');if(button)button.focus();},50);return function(){clearTimeout(timer);};}
  },[subtitleMenu]);

  // Helper: focus a button within a player layer
  function focusLayer(layerName) {
    layerRef.current = layerName;
    var container = containerRef.current;
    if (!container) return;
    var layer = container.querySelector('[data-player-layer="' + layerName + '"]');
    if (!layer) return;
    var btns = layer.querySelectorAll('[data-focusable]');
    if (!btns.length) return;
    // Prefer the play button in center, first button otherwise
    var target = null;
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].className && btns[i].className.indexOf('play') >= 0) { target = btns[i]; break; }
    }
    if (!target) target = btns[0];
    if (target) target.focus();
  }

  // Helper: find next/prev focusable within a layer
  function moveFocusInLayer(dir) {
    var container = containerRef.current;
    if (!container) return false;
    var layer = container.querySelector('[data-player-layer="' + layerRef.current + '"]');
    if (!layer) return false;
    var btns = [];
    var els = layer.querySelectorAll('[data-focusable]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].offsetParent !== null && !els[i].disabled) btns.push(els[i]);
    }
    if (btns.length < 2) return false;
    var cur = document.activeElement;
    var idx = -1;
    for (var j = 0; j < btns.length; j++) {
      if (btns[j] === cur) { idx = j; break; }
    }
    if (idx < 0) return false;
    var next = dir === 'right' ? idx + 1 : idx - 1;
    if (next < 0 || next >= btns.length) return false;
    btns[next].focus();
    return true;
  }

  // Layer order for Up/Down navigation
  var layers = ['top', 'center', 'bottom'];

  // Keyboard/remote control — layer-based D-pad navigation
  useEffect(function() {
    var onKey = function(e) {
      var code = e.keyCode || e.which;
      poke();

      // Back — exit player
      if (code === 10009 || code === 27) {
        e.preventDefault();
        e._tvHandled = true;
        goBack();
        return;
      }

      if (subtitleMenu) {
        var choices=Array.from(containerRef.current.querySelectorAll('.subtitle-menu button:not(:disabled)'));
        var active=choices.indexOf(document.activeElement);
        if(code===13){e.preventDefault();if(active>=0)choices[active].click();return;}
        if([37,38,39,40].indexOf(code)>=0){e.preventDefault();var dir=(code===37||code===38)?-1:1;var next=Math.max(0,Math.min(choices.length-1,active<0?0:active+dir));if(choices[next])choices[next].focus();return;}
        return;
      }

      // Enter/OK — if a player button is focused, click it; otherwise toggle play
      if (code === 13) {
        e.preventDefault();
        var focused = document.activeElement;
        if (focused && focused.hasAttribute && focused.hasAttribute('data-focusable') && focused.closest && focused.closest('.watch')) {
          focused.click();
        } else {
          togglePlay();
        }
        return;
      }

      // Media keys
      if (code === 415 || code === 19 || code === 10252) { e.preventDefault(); togglePlay(); return; } // Play/Pause
      if (code === 412) { e.preventDefault(); skip(-10); return; } // Rewind
      if (code === 417) { e.preventDefault(); skip(10); return; } // FastForward

      // Space — toggle play
      if (code === 32) { e.preventDefault(); togglePlay(); return; }

      // D-pad navigation between player layers
      if (code === 38) { // Up
        e.preventDefault();
        if(layerRef.current==='bottom' && document.activeElement && document.activeElement.tagName!=='INPUT'){
          var seekBar=containerRef.current.querySelector('.pl-seek input');if(seekBar){seekBar.focus();return;}
        }
        var curLayer = layerRef.current;
        var li = layers.indexOf(curLayer);
        if (li > 0) {
          focusLayer(layers[li - 1]);
        }
        return;
      }
      if (code === 40) { // Down
        e.preventDefault();
        var curLayer2 = layerRef.current;
        var li2 = layers.indexOf(curLayer2);
        if (li2 < layers.length - 1) {
          focusLayer(layers[li2 + 1]);
        } else {
          var subtitleButton=containerRef.current.querySelector('.pl-subtitle-button');
          if(subtitleButton)subtitleButton.focus();
        }
        return;
      }
      if (code === 37) { // Left: move between bottom buttons or seek on the timeline
        e.preventDefault();
        if(layerRef.current==='bottom' && document.activeElement.tagName!=='INPUT' && moveFocusInLayer('left'))return;
        skip(-10);
        return;
      }
      if (code === 39) { // Right: move between bottom buttons or seek on the timeline
        e.preventDefault();
        if(layerRef.current==='bottom' && document.activeElement.tagName!=='INPUT' && moveFocusInLayer('right'))return;
        skip(10);
        return;
      }
    };

    window.addEventListener('keydown', onKey, true);
    return function() { window.removeEventListener('keydown', onKey, true); };
  }, [poke, togglePlay, skip, current, flat.length, subtitleMenu]);

  // Focus the center play button on mount
  useEffect(function() {
    poke();
    setTimeout(function() { focusLayer('center'); }, 500);
  }, []);

  return (
    <div className="watch" ref={containerRef} onMouseMove={poke} onTouchStart={poke} style={{cursor: showUI ? 'default' : 'none'}}>
      <video ref={videoRef} playsInline autoPlay style={{width:'100%',height:'100%',background:'#000',objectFit:'contain'}} />

      {status && !error && <div className="watch-status"><div className="spinner" /></div>}

      {subtitles.text && <div className={'embedded-caption' + (showUI ? ' controls-visible' : '')} aria-live="off">{subtitles.text}</div>}

      {isExternal && externalSource.historySaved === false && <div className="sent-history-warning" role="status">Video açıldı, ancak TV depolaması dolu olduğu için geçmişe kaydedilemedi.</div>}

      {/* Top bar */}
      <div className={'pl-top' + (showUI ? '' : ' hidden')} data-player-layer="top">
        <button className="pl-iconbtn" data-focusable onClick={goBack}><Icon name="back" size={26} /></button>
        <div className="pl-title">{source ? source.title : ''}</div>
      </div>

      {/* Center controls */}
      {!error && (
        <div className={'pl-center' + (showUI ? '' : ' hidden')} data-player-layer="center">
          {isSeries && <button className="pl-bigbtn" data-focusable onClick={prevEp} disabled={current === 0}><Icon name="prev" size={26} /></button>}
          <button className="pl-bigbtn" data-focusable onClick={function() { skip(-10); }}><Icon name="back10" size={28} /><span>10</span></button>
          <button className="pl-bigbtn play" aria-label={playing ? 'Duraklat' : 'Oynat'} data-focusable onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={34} /></button>
          <button className="pl-bigbtn" data-focusable onClick={function() { skip(10); }}><Icon name="forward10" size={28} /><span>10</span></button>
          {isSeries && <button className="pl-bigbtn" data-focusable onClick={nextEp} disabled={current >= flat.length - 1}><Icon name="next" size={26} /></button>}
        </div>
      )}

      {/* Bottom controls */}
      {!isLive && (
        <div className={'pl-bottom' + (showUI ? '' : ' hidden')} data-player-layer="bottom">
          <div className="pl-seek">
            <div className="pl-seek-rail" />
            <div className="pl-seek-played" style={{width: duration ? (time / duration) * 100 + '%' : 0}} />
            <input
              type="range" min={0} max={duration || 0} step="0.1" value={time}
              aria-label="Oynatma konumu"
              onChange={function(e) { poke(); var target = parseFloat(e.target.value); skip(target - time); }}
              data-focusable
            />
          </div>
          <div className="pl-controls">
            <button className="pl-iconbtn" data-focusable onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
            <span className="pl-time">{fmt(time)} / {fmt(duration)}</span>
            <div className="pl-spacer" />
            {(subtitles.available || audioTracks.length > 0) && <button className="pl-subtitle-button" aria-expanded={subtitleMenu} data-focusable onClick={function(){poke();setSubtitleMenu(!subtitleMenu);}}>Ses ve altyazı{subtitles.selected ? ': ' + (subtitles.tracks.find(function(track){return String(track.id) === subtitles.selected;}) || {}).label : ': Kapalı'}</button>}
            {isSeries && <button className="pl-iconbtn" data-focusable onClick={nextEp} disabled={current >= flat.length - 1}><Icon name="next" size={20} /></button>}
          </div>
        </div>
      )}

      {isLive && (
        <div className={'pl-bottom live' + (showUI ? '' : ' hidden')} data-player-layer="bottom">
          <div className="pl-controls">
            <button className="pl-iconbtn" data-focusable onClick={togglePlay}><Icon name={playing ? 'pause' : 'play'} size={20} /></button>
            <span className="pl-live-badge"><i className="live-dot" /> LIVE</span>
            <div className="pl-spacer" />
          </div>
        </div>
      )}

      {subtitleMenu && <section className="subtitle-menu" aria-label="Ses ve altyazı seçenekleri" data-player-layer="subtitles">
        <div className="subtitle-menu-header"><h2>Ses ve altyazı</h2><button data-focusable onClick={function(){setSubtitleMenu(false);poke();}}>Kapat</button></div>
        <p>Ses dili</p>
        {audioTracks.map(function(track){return <button key={'audio-'+track.id} className={track.enabled?'selected':''} aria-pressed={track.enabled} data-focusable onClick={function(){selectAudio(track.id);}}>{track.label}</button>;})}
        {!audioTracks.length && <p>Seçilebilir ses parçası bulunamadı.</p>}
        {audioError && <p role="status">{audioError}</p>}
        <p>Altyazı</p>
        <button className={!subtitles.selected ? 'selected' : ''} aria-pressed={!subtitles.selected} data-focusable onClick={function(){selectSubtitle('');}}>Kapalı</button>
        {subtitles.tracks.map(function(track){return <button key={track.id} className={subtitles.selected === String(track.id) ? 'selected' : ''} aria-pressed={subtitles.selected === String(track.id)} data-focusable onClick={function(){selectSubtitle(String(track.id));}}>{track.label}</button>;})}
        {subtitles.status && <p role="status">{subtitles.status}</p>}
        {subtitles.selected && <div className="subtitle-offset"><span>Altyazı gecikmesi: {subtitles.offset > 0 ? '+' : ''}{subtitles.offset.toFixed(1)} sn</span><div><button data-focusable onClick={function(){subtitles.setOffset(Math.max(-10,subtitles.offset-0.5));}}>−0,5 sn</button><button data-focusable onClick={function(){subtitles.setOffset(0);}}>Sıfırla</button><button data-focusable onClick={function(){subtitles.setOffset(Math.min(10,subtitles.offset+0.5));}}>+0,5 sn</button></div></div>}
      </section>}
      {error && (
        <div className="watch-error">
          <div className="box">
            <h3 style={{marginTop: 0}}>Oynatma sorunu</h3>
            <p style={{color: '#bbb'}}>{error}</p>
            <button className="btn btn-red" data-focusable onClick={goBack}>Geri dön</button>
          </div>
        </div>
      )}
    </div>
  );
}
