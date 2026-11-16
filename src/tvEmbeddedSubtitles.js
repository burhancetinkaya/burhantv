// Read only MP4 subtitle tables and the text samples around the current position.
// Runs on the TV itself, so IP-bound video links never leave the viewer's network.
const sessions=new Map();
function readRange(url,start,end){
  return new Promise((resolve,reject)=>{
    let attempts=0;
    function attempt(){
    attempts++;
    if(end-start>32*1024*1024){reject(new Error('MP4 altyazı bilgisi çok büyük.'));return;}
    const request=new XMLHttpRequest();request.open('GET',url);request.responseType='arraybuffer';request.timeout=20000;request.setRequestHeader('Range','bytes='+start+'-'+end);
    request.onload=()=>{if(request.status!==206||!request.response||request.response.byteLength!==end-start+1){reject(new Error('Video bağlantısındaki altyazı verisi okunamadı.'));return;}resolve(new Uint8Array(request.response));};
    request.onerror=request.ontimeout=()=>{if(attempts<3)setTimeout(attempt,200);else reject(new Error('Altyazı kaynağına ulaşılamadı.'));};
    request.send();
    }
    attempt();
  });
}
function parser(bytes){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u32=offset=>view.getUint32(offset),i32=offset=>view.getInt32(offset),u64=offset=>u32(offset)*4294967296+u32(offset+4);
  const text=(offset,length)=>String.fromCharCode.apply(null,bytes.subarray(offset,offset+length));
  function boxes(start,end){
    const result=[];
    while(start+8<=end){
      let size=u32(start),header=8;if(size===1){size=u64(start+8);header=16;}if(size===0)size=end-start;
      if(!Number.isSafeInteger(size)||size<header||start+size>end)throw new Error('MP4 parça yapısı desteklenmiyor.');
      result.push({type:text(start+4,4),start:start+header,end:start+size});start+=size;
    }
    return result;
  }
  function child(parent,type){return boxes(parent.start,parent.end).find(box=>box.type===type);}
  const root={start:0,end:bytes.length},moov=child(root,'moov');
  if(!moov)throw new Error('MP4 üstbilgisi bulunamadı.');
  const mvhd=child(moov,'mvhd'),movieScale=u32(mvhd.start+(bytes[mvhd.start]===1?20:12));
  const tracks=[];
  for(const trak of boxes(moov.start,moov.end).filter(box=>box.type==='trak')){
    const mdia=child(trak,'mdia'),hdlr=mdia&&child(mdia,'hdlr');
    if(!hdlr||['sbtl','subt','text'].indexOf(text(hdlr.start+8,4))<0)continue;
    const minf=child(mdia,'minf'),stbl=child(minf,'stbl'),stsd=child(stbl,'stsd');
    if(!stsd||text(stsd.start+12,4)!=='tx3g')continue;
    const mdhd=child(mdia,'mdhd'),version=bytes[mdhd.start],scale=u32(mdhd.start+(version===1?20:12));
    const code=view.getUint16(mdhd.start+(version===1?32:20)),language=String.fromCharCode(((code>>10)&31)+96,((code>>5)&31)+96,(code&31)+96);
    const tkhd=child(trak,'tkhd'),id=u32(tkhd.start+(bytes[tkhd.start]===1?20:12));
    const stsz=child(stbl,'stsz'),count=u32(stsz.start+8),uniform=u32(stsz.start+4);
    if(count>100000)throw new Error('Altyazı parçası çok büyük.');
    const sizes=Array.from({length:count},(_,i)=>uniform||u32(stsz.start+12+i*4));
    const stco=child(stbl,'stco')||child(stbl,'co64'),chunkCount=u32(stco.start+4),is64=stco.type==='co64';
    const stsc=child(stbl,'stsc'),runs=Array.from({length:u32(stsc.start+4)},(_,i)=>({first:u32(stsc.start+8+i*12),perChunk:u32(stsc.start+12+i*12)}));
    const samples=[];let index=0,run=0;
    for(let chunk=1;chunk<=chunkCount;chunk++){
      while(run+1<runs.length&&runs[run+1].first<=chunk)run++;
      let offset=is64?u64(stco.start+8+(chunk-1)*8):u32(stco.start+8+(chunk-1)*4);
      for(let j=0;j<runs[run].perChunk&&index<count;j++,index++){samples.push({offset,size:sizes[index],start:0,end:0});offset+=sizes[index];}
    }
    if(samples.length!==count)throw new Error('Altyazı örnek tablosu eksik.');
    let shift=0;const edts=child(trak,'edts'),elst=edts&&child(edts,'elst');
    if(elst){
      const wide=bytes[elst.start]===1,entries=u32(elst.start+4);let pos=elst.start+8;
      for(let i=0;i<entries;i++,pos+=wide?20:12){
        const duration=wide?u64(pos):u32(pos),media=wide?(i32(pos+8)===-1&&u32(pos+12)===4294967295?-1:u64(pos+8)):i32(pos+4);
        if(media===-1)shift+=duration/movieScale;else{shift-=media/scale;break;}
      }
    }
    const stts=child(stbl,'stts');let clock=0,sampleIndex=0;
    for(let i=0;i<u32(stts.start+4);i++){
      const n=u32(stts.start+8+i*8),delta=u32(stts.start+12+i*8);
      for(let j=0;j<n&&sampleIndex<count;j++,sampleIndex++){samples[sampleIndex].start=clock/scale+shift;clock+=delta;samples[sampleIndex].end=clock/scale+shift;}
    }
    const ctts=child(stbl,'ctts');sampleIndex=0;
    if(ctts)for(let i=0;i<u32(ctts.start+4);i++){
      const n=u32(ctts.start+8+i*8),offset=(bytes[ctts.start]===1?i32(ctts.start+12+i*8):u32(ctts.start+12+i*8))/scale;
      for(let j=0;j<n&&sampleIndex<count;j++,sampleIndex++){samples[sampleIndex].start+=offset;samples[sampleIndex].end+=offset;}
    }
    const labels={tur:'Türkçe',tr:'Türkçe',eng:'İngilizce',en:'İngilizce',ger:'Almanca',deu:'Almanca'};
    tracks.push({id,language,label:labels[language]||'Altyazı '+(tracks.length+1),samples,cues:new Map()});
  }
  return {tracks};
}
async function sampleCue(session,track,index){
  if(track.cues.has(index))return track.cues.get(index);
  const sample=track.samples[index];
  const promise=(async()=>{
    if(sample.size<=2||sample.size>65536)return null;
    const bytes=await readRange(session.url,sample.offset,sample.offset+sample.size-1),length=(bytes[0]<<8)|bytes[1];
    if(length>bytes.length-2)throw new Error('Altyazı metni okunamadı.');
    const value=bytes.subarray(2,2+length);
    const text=(value[0]===254&&value[1]===255?new TextDecoder('utf-16be').decode(value.subarray(2)):new TextDecoder().decode(value)).replace(/\r\n?/g,'\n').replace(/\u0000/g,'').trim();
    return text?{start:sample.start,end:sample.end,text}:null;
  })();track.cues.set(index,promise);
  try{return await promise;}catch(error){track.cues.delete(index);throw error;}
}
async function subtitleMetadata(url,start,size,header){
  const parts=[];let position=start+header,found=false;
  function handler(prefix){
    const view=new DataView(prefix.buffer,prefix.byteOffset,prefix.byteLength);
    function walk(first,end){
      for(let at=first;at+16<=prefix.length&&at<end;){
        let length=view.getUint32(at),head=8;if(length===1){length=view.getUint32(at+8)*4294967296+view.getUint32(at+12);head=16;}
        if(length<head)return null;
        const type=String.fromCharCode.apply(null,prefix.subarray(at+4,at+8));
        if(type==='hdlr'&&at+head+12<=prefix.length)return String.fromCharCode.apply(null,prefix.subarray(at+head+8,at+head+12));
        if(type==='trak'||type==='mdia'){const result=walk(at+head,at+length);if(result)return result;}
        at+=length;
      }
      return null;
    }
    return walk(0,prefix.length);
  }
  while(position+16<=start+size){
    const bytes=await readRange(url,position,position+15),view=new DataView(bytes.buffer);
    let length=view.getUint32(0),head=8;if(length===1){length=view.getUint32(8)*4294967296+view.getUint32(12);head=16;}
    if(!Number.isSafeInteger(length)||length<head||position+length>start+size)throw new Error('MP4 parça yapısı desteklenmiyor.');
    const type=String.fromCharCode.apply(null,bytes.subarray(4,8));
    if(type==='mvhd')parts.push(await readRange(url,position,position+length-1));
    else if(type==='trak'){
      const prefix=await readRange(url,position,position+Math.min(length,4096)-1),kind=handler(prefix);
      if(['sbtl','subt','text'].indexOf(kind)>=0){parts.push(await readRange(url,position,position+length-1));found=true;}
    }
    position+=length;
  }
  if(!found)return readRange(url,start,start+size-1);
  const total=8+parts.reduce((length,part)=>length+part.length,0),result=new Uint8Array(total);
  new DataView(result.buffer).setUint32(0,total);result.set([109,111,111,118],4);
  let at=8;parts.forEach(part=>{result.set(part,at);at+=part.length;});return result;
}
export async function inspectTvSubtitles(url){
  if(sessions.has(url))return sessions.get(url);
  let offset=0;
  for(let count=0;count<64;count++){
    const head=await readRange(url,offset,offset+15),view=new DataView(head.buffer);
    let size=view.getUint32(0),header=8;if(size===1){size=view.getUint32(8)*4294967296+view.getUint32(12);header=16;}
    if(!Number.isSafeInteger(size)||size<header)throw new Error('MP4 dosya yapısı desteklenmiyor.');
    if(String.fromCharCode.apply(null,head.subarray(4,8))==='moov'){
      const metadata=await subtitleMetadata(url,offset,size,header);
      const session=Object.assign(parser(metadata),{url});
      for(const track of session.tracks){
        const first=track.samples.map((sample,index)=>({sample,index})).filter(x=>x.sample.size>2).slice(0,3);
        const cues=await Promise.all(first.map(x=>sampleCue(session,track,x.index)));
        if(cues.some(c=>c&&/[ğĞıİşŞ]/.test(c.text)))track.label='Türkçe';
      }
      if(sessions.size>=2)sessions.delete(sessions.keys().next().value);
      sessions.set(url,session);return session;
    }
    offset+=size;
  }
  throw new Error('MP4 altyazı üstbilgisi bulunamadı.');
}
export async function tvSubtitleWindow(session,trackId,time){
  const track=session.tracks.find(t=>String(t.id)===String(trackId));if(!track)throw new Error('Altyazı parçası bulunamadı.');
  const start=Math.max(0,Math.floor(time/15)*15-5),end=start+35;
  const samples=track.samples.map((s,i)=>({s,i})).filter(x=>x.s.size>2&&x.s.end>start&&x.s.start<end),cues=[];
  for(let i=0;i<samples.length;i+=2){const group=await Promise.all(samples.slice(i,i+2).map(x=>sampleCue(session,track,x.i)));Array.prototype.push.apply(cues,group.filter(Boolean));}
  return {start,end,cues};
}
