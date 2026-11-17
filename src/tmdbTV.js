import { imdbRating } from './imdbRatings.js';
import { tvBootstrap } from './config.js';
// Standalone TV metadata: keep the personal key on the device.
export function tvTmdbKey() {
  try { return (localStorage.getItem('retflix-tmdb-key') || tvBootstrap.tmdbApiKey || '').trim(); } catch { return ''; }
}

export function saveTvTmdbKey(key) {
  localStorage.setItem('retflix-tmdb-key', String(key || '').trim());
}

async function request(path, params) {
  const key = tvTmdbKey();
  if (!key) return null;
  const query = Object.entries({ api_key: key, ...params })
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  let timer;
  try {
    return await Promise.race([
      fetch('https://api.themoviedb.org/3' + path + '?' + query)
        .then(r => r.ok ? r.json() : null),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), 6000); }),
    ]);
  } catch { return null; } finally { clearTimeout(timer); }
}

const cache = {};
function normalized(value) { return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9çğıöşü]+/g, ' ').trim(); }
export function cleanMetadataTitle(item) {
  const raw=String(item.name||'');
  const year=(String(item.year||'').match(/(?:19|20)\d{2}/)||raw.match(/(?:19|20)\d{2}/)||[])[0]||'';
  const name=raw.replace(/^(?:TRD|TR|DE|EN|FR|ITA|ENG)\s*[:|]\s*/i,'').replace(/\(?\b(?:19|20)\d{2}\b\)?.*$/,'')
    .replace(/\b(?:4K|UHD|FHD|HD|SD|1080p|720p|2160p|HEVC|DUAL|MULTI|BLURAY|WEB-DL)\b/gi,'').replace(/[\s:()\-|]+$/,'').trim();
  return {name,year};
}
let saved={};try{saved=JSON.parse(localStorage.getItem('burhantv-title-meta-v1')||'{}')}catch{}
let persistTimer;
function persist(key,patch){saved[key]={at:Date.now(),patch};clearTimeout(persistTimer);persistTimer=setTimeout(()=>{try{const keys=Object.keys(saved).sort((a,b)=>saved[b].at-saved[a].at);const out={};keys.slice(0,500).forEach(k=>out[k]=saved[k]);localStorage.setItem('burhantv-title-meta-v1',JSON.stringify(out))}catch{}},500)}
export async function localizeTvItem(item, options = {}) {
  if (!item || !tvTmdbKey() || item.type === 'live') return item;
  let language = 'tr';try { language = localStorage.getItem('retlix-lang') || 'tr'; } catch {}
  const key=[item.type,item.id,item.name,language].join(':');
  if(cache[key] && (!options.originalLanguage || cache[key].originalLanguage !== undefined))return {...item,...cache[key]};
  const previous=saved[key];let patch=previous&&Date.now()-previous.at<7*86400000?previous.patch:null;
  if(options.originalLanguage && patch && patch.originalLanguage === undefined)patch=null;
  if(!patch){
    const type=item.type==='series'?'tv':'movie',clean=cleanMetadataTitle(item);
    if(!clean.name)return item;
    const response=await request('/search/'+type,{query:clean.name,language,include_adult:false});
    let candidates=(response?.results||[]).filter(r=>!clean.year||String(r.release_date||r.first_air_date||'').slice(0,4)===clean.year);
    const exact=candidates.filter(r=>[r.title,r.name,r.original_title,r.original_name].some(n=>normalized(n)===normalized(clean.name)));
    if(exact.length===1)candidates=exact;
    // Never silently choose the first of several same-name/year results.
    if(candidates.length!==1)return item;
    const info=await request('/'+type+'/'+candidates[0].id,{language,append_to_response:'external_ids,alternative_titles'});
    if(!info)return item;
    const aliases=[info.title,info.name,info.original_title,info.original_name].concat((info.alternative_titles?.titles||info.alternative_titles?.results||[]).map(t=>t.title));
    if(!aliases.some(n=>normalized(n)===normalized(clean.name)))return item;
    patch={originalLanguage:info.original_language||'',tmdbId:info.id,imdbId:info.imdb_id||info.external_ids?.imdb_id||'',
      plot:info.overview||item.plot||'',genre:(info.genres||[]).map(g=>g.name).join(', ')||item.genre||'',
      year:String(info.release_date||info.first_air_date||item.year||'').slice(0,4),
      runtimeMinutes:type==='movie'?Number(info.runtime)||0:0,
      backdrop:info.backdrop_path?'https://image.tmdb.org/t/p/w1280'+info.backdrop_path:item.backdrop};
  }
  const knownScore=patch.imdbRating?patch:
    (previous?.patch?.imdbId===patch.imdbId?previous.patch:patch);
  const score=options.skipRatings?null:await imdbRating(patch.imdbId,{
    rating:knownScore.imdbRating,votes:knownScore.imdbVotes,updated:knownScore.imdbUpdated
  });
  if(options.skipRatings && knownScore.imdbRating)patch={...patch,imdbRating:knownScore.imdbRating,imdbVotes:knownScore.imdbVotes,imdbUpdated:knownScore.imdbUpdated};
  if(score)patch={...patch,imdbRating:score.rating,imdbVotes:score.votes,imdbUpdated:score.updated};
  cache[key]=patch;persist(key,patch);return {...item,...patch};
}
