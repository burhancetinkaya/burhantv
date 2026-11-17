// Provider track order does not tell us which audio is original.
export function normalizeLanguage(value) {
  const language=String(value || '').trim().toLowerCase().split(/[-_\s(]/)[0];
  const aliases={tu:'tr',tur:'tr',eng:'en',ger:'de',deu:'de',fra:'fr',fre:'fr',spa:'es',ita:'it',por:'pt',rus:'ru',jpn:'ja',jp:'ja',kor:'ko',chi:'zh',zho:'zh',ara:'ar',hin:'hi',dut:'nl',nld:'nl',swe:'sv',dan:'da',nor:'no',fin:'fi',pol:'pl',gre:'el',ell:'el',ces:'cs',cze:'cs',hun:'hu',ron:'ro',rum:'ro',tha:'th',ind:'id',vie:'vi',ukr:'uk',heb:'he',fas:'fa',per:'fa'};
  return aliases[language] || (/^[a-z]{2}$/.test(language)?language:'');
}

export function defaultLanguageTracks(originalLanguage,audioTracks,subtitleTracks) {
  const original=normalizeLanguage(originalLanguage);
  if(!original)return {audio:null,subtitle:null};
  const audio=audioTracks.find(track=>normalizeLanguage(track.language)===original) || null;
  const subtitle=original==='tr'?null:subtitleTracks.find(track=>normalizeLanguage(track.language)==='tr' || track.label==='Türkçe') || null;
  return {audio,subtitle};
}
