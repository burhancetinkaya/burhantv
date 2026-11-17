// Keep the existing controls/progress API while using Samsung's multi-audio decoder.
export function audioLabel(language, index) {
  const names = {tu:'Türkçe',tur:'Türkçe',tr:'Türkçe',eng:'İngilizce',en:'İngilizce',ger:'Almanca',deu:'Almanca',de:'Almanca',fra:'Fransızca',fre:'Fransızca',fr:'Fransızca'};
  return names[String(language || '').trim().toLowerCase()] || language || ('Ses ' + (index + 1));
}

export function createTvMediaPlayer(video) {
  const av = window.webapis && window.webapis.avplay;
  if (!av) return video;
  const media = document.createElement('span');
  const object = document.createElement('object');
  object.type = 'application/avplayer';
  Object.assign(object.style, {position:'absolute',left:'0',top:'0',width:'100%',height:'100%'});
  video.parentNode.insertBefore(object, video);
  video.style.display = 'none';
  let generation = 0, disposed = false, ready = false, position = 0, pendingSeek = 0, duration = 0, paused = true, ended = false, error = null, seeking = false;
  let operation=Promise.resolve(), requestedSeek=null, seekQueued=false;
  function enqueue(action) {
    const epoch=generation;
    const result=operation.then(()=>{if(!disposed && epoch===generation)return action();});
    operation=result.catch(()=>{});return result;
  }
  media.src = '';
  media.audioTracks = [];
  const emit = name => media.dispatchEvent(new Event(name));
  const close = () => { try { av.close(); } catch (_) {} };
  function refreshTracks() {
    try {
      let current;
      try { current=av.getCurrentStreamInfo().filter(track => track.type === 'AUDIO')[0]; } catch (_) {}
      media.audioTracks = av.getTotalTrackInfo().filter(track => track.type === 'AUDIO').map((track,index) => {
        let info = {}; try { info = JSON.parse(track.extra_info || '{}'); } catch (_) {}
        return {id:track.index, language:info.language || info.track_lang || '', label:audioLabel(info.language || info.track_lang,index), enabled:!!current && current.index === track.index};
      });
      emit('trackschanged');
    } catch (_) {}
  }
  function seek(target) {
    pendingSeek = Math.max(0, Number(target) || 0);
    if (!ready) return;
    // AVPlay cannot seek to the exact start/end. Drop intermediate targets while
    // an asynchronous seek is in flight rather than replaying every key repeat.
    requestedSeek=Math.max(0.1,Math.min(pendingSeek,Math.max(0.1,(duration || Infinity)-0.25)));
    position=requestedSeek;seeking=true;
    if(seekQueued)return;
    seekQueued=true;
    const epoch=generation;
    emit('seeking');
    enqueue(async()=>{
      let failed=false;
      while(requestedSeek!==null && !disposed && epoch===generation){
        const targetTime=requestedSeek;requestedSeek=null;
        failed=await new Promise(resolve=>{
          try{av.seekTo(Math.round(targetTime*1000),()=>resolve(false),()=>resolve(true));}catch(_){resolve(true);}
        });
      }
      if(disposed || epoch!==generation)return;
      seekQueued=false;seeking=false;
      try{position=av.getCurrentTime()/1000;}catch(_){}
      emit(failed?'seekerror':'seeked');emit('timeupdate');
    });
  }
  Object.defineProperties(media, {
    currentTime:{get:()=>position,set:seek}, duration:{get:()=>duration}, paused:{get:()=>paused}, ended:{get:()=>ended},
    error:{get:()=>error}, readyState:{get:()=>ready?4:0}, seeking:{get:()=>seeking}
  });
  media.load = () => {
    const attempt = ++generation;
    close(); operation=Promise.resolve();requestedSeek=null;seekQueued=false;seeking=false; ready=false; paused=true; ended=false; error=null; position=0; pendingSeek=0; duration=0; media.audioTracks=[]; emit('trackschanged');
    if (!media.src || disposed) return;
    const active = () => !disposed && generation === attempt;
    const fail = () => { if(active()){error={code:4};emit('error');} };
    try {
      av.open(media.src);
      // Samsung defaults to a large buffer; four seconds is the supported minimum.
      try{av.setBufferingParam('PLAYER_BUFFER_FOR_PLAY','PLAYER_BUFFER_SIZE_IN_SECOND',4);av.setBufferingParam('PLAYER_BUFFER_FOR_RESUME','PLAYER_BUFFER_SIZE_IN_SECOND',4);av.setTimeoutForBuffering(8);}catch(_){}
      av.setDisplayRect(0,0,1920,1080);
      av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
      av.setListener({
        oncurrentplaytime: milliseconds => {if(active() && !seeking){position=milliseconds/1000;emit('timeupdate');}},
        onstreamcompleted:()=>{if(active()){ended=true;paused=true;emit('ended');}},
        onbufferingstart:()=>{if(active())emit('waiting');},
        onbufferingcomplete:()=>{if(active())emit('playing');},
        onerror:fail
      });
      av.prepareAsync(() => {
        if(!active())return;
        ready=true;duration=av.getDuration()/1000;
        // Text is rendered by our range-based subtitle reader, including tx3g MP4 tracks.
        try { av.setSilentSubtitle(true); } catch (_) {}
        refreshTracks(); emit('durationchange'); emit('loadedmetadata'); emit('canplay');
      },fail);
    } catch (_) { fail(); }
  };
  media.play = () => enqueue(() => {
    if(!ready)return;
    av.play();paused=false;ended=false;refreshTracks();emit('play');
  });
  media.pause = () => enqueue(() => {if(ready){av.pause();paused=true;emit('pause');}});
  media.selectAudio = id => enqueue(() => {
    // Samsung allows AUDIO selection only while PLAYING; preserve a paused session.
    const wasPaused=paused;
    if(wasPaused)av.play();
    try { av.setSelectTrack('AUDIO',Number(id));refreshTracks(); }
    finally { if(wasPaused)av.pause(); }
  });
  media.removeAttribute = name => {if(name==='src')media.src='';};
  media.destroy = () => {disposed=true;generation++;close();object.remove();video.style.display='';};
  return media;
}
