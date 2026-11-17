import test from 'node:test';
import assert from 'node:assert/strict';
import { createTvMediaPlayer } from '../src/tvMediaPlayer.js';

function fixture(native=true) {
  const calls=[],prepares=[];
  let selected=1,listener;
  const av={close(){calls.push('close')},open(url){calls.push(['open',url])},setDisplayRect(){},setDisplayMethod(){},
    setListener(value){listener=value},prepareAsync(ok,fail){prepares.push({ok,fail})},getDuration(){return 120000},setSilentSubtitle(value){calls.push(['silent',value])},
    getTotalTrackInfo(){return [{index:0,type:'VIDEO'},{index:1,type:'AUDIO',extra_info:'{"language":"tur"}'},{index:2,type:'AUDIO',extra_info:'{"language":"eng"}'}]},
    getCurrentStreamInfo(){return [{type:'AUDIO',index:selected}]},
    play(){calls.push('play')},pause(){calls.push('pause')},seekTo(ms,ok){calls.push(['seek',ms]);ok()},
    setSelectTrack(type,id){calls.push(['select',type,id]);selected=id}
  };
  globalThis.window={webapis:native?{avplay:av}:null};
  globalThis.document={createElement(type){const el=new EventTarget();el.style={};el.remove=()=>calls.push(['remove',type]);return el;}};
  const video={style:{},parentNode:{insertBefore(){calls.push('insert')}}};
  const player=createTvMediaPlayer(video);
  return {player,video,calls,prepares,get listener(){return listener}};
}

test('native player exposes Turkish/English audio and preserves pause while changing language', async()=>{
 const f=fixture(),p=f.player;p.src='https://media.example/episode.mp4';p.load();f.prepares[0].ok();
 assert.deepEqual(p.audioTracks.map(t=>t.label),['Türkçe','İngilizce']);
 await p.play();await p.pause();const mark=f.calls.length;await p.selectAudio(2);
 assert.deepEqual(f.calls.slice(mark),['play',['select','AUDIO',2],'pause']);
 assert.equal(p.paused,true);assert.equal(p.audioTracks.find(t=>t.enabled).id,2);
 assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]==='silent'&&c[1]===true));
});

test('native seek uses milliseconds and playback events retain duration/current position',async()=>{
 const f=fixture(),p=f.player;let ended=0;p.addEventListener('ended',()=>ended++);
 p.src='https://media.example/episode.mp4';p.load();f.prepares[0].ok();await p.play();
 p.currentTime=45;await p.play();assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]==='seek'&&c[1]===45000));
 assert.equal(p.duration,120);assert.equal(p.currentTime,45);assert.equal(p.seeking,false);
 f.listener.oncurrentplaytime(46500);assert.equal(p.currentTime,46.5);
 f.listener.onstreamcompleted();assert.equal(ended,1);assert.equal(p.ended,true);assert.equal(p.paused,true);
});

test('stale preparation and callbacks cannot revive a replaced or destroyed source',()=>{
 const f=fixture(),p=f.player;let ready=0,errors=0;p.addEventListener('canplay',()=>ready++);p.addEventListener('error',()=>errors++);
 p.src='https://media.example/one.mp4';p.load();const old=f.listener;
 p.src='https://media.example/two.mp4';p.load();f.prepares[0].ok();old.onerror();assert.equal(ready,0);assert.equal(errors,0);
 f.prepares[1].ok();assert.equal(ready,1);const current=f.listener;p.destroy();current.oncurrentplaytime(9000);assert.equal(p.currentTime,0);
 assert.equal(f.video.style.display,'');assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]==='remove'));
});

test('preparation errors surface and devices without AVPlay keep the HTML5 player',()=>{
 const f=fixture(),p=f.player;let errors=0;p.addEventListener('error',()=>errors++);p.src='https://media.example/bad.mp4';p.load();f.prepares[0].fail();
 assert.equal(errors,1);assert.equal(p.error.code,4);assert.equal(p.readyState,0);
 const html=fixture(false);assert.equal(html.player,html.video);assert.equal(html.calls.length,0);
});

test('resume playback waits for asynchronous seek before calling play', async()=>{
 const f=fixture(),p=f.player;let finish;
 window.webapis.avplay.seekTo=(ms,ok)=>{f.calls.push(['seek',ms]);finish=ok;};
 p.src='https://media.example/resume.mp4';p.load();f.prepares[0].ok();p.currentTime=35;
 const play=p.play();await Promise.resolve();assert.equal(f.calls.includes('play'),false);
 finish();await play;assert.equal(f.calls.at(-1),'play');assert.equal(p.paused,false);
});
