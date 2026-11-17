import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultLanguageTracks,normalizeLanguage} from '../src/playbackLanguage.js';
const audio=[{id:1,language:'tu'},{id:2,language:'eng'},{id:3,language:'deu'}];
const subs=[{id:4,language:'tur'},{id:5,language:'eng'}];

test('foreign originals choose matching audio and Turkish subtitles instead of provider track order',()=>{
 for(const [original,id] of [['en',2],['de',3]]){
  const result=defaultLanguageTracks(original,audio,subs);
  assert.equal(result.audio.id,id);assert.equal(result.subtitle.id,4);
 }
});
test('Turkish originals choose Turkish audio and disable subtitles',()=>{
 const result=defaultLanguageTracks('tr',audio,subs);
 assert.equal(result.audio.id,1);assert.equal(result.subtitle,null);
});
test('unavailable original audio is not replaced with guessed English and absent Turkish subtitles stay off',()=>{
 const result=defaultLanguageTracks('fr',audio,[{id:5,language:'eng'}]);
 assert.equal(result.audio,null);assert.equal(result.subtitle,null);
});
test('unknown original language does not invent a default',()=>{
 for(const language of ['',null,'und','unknown'])assert.deepEqual(defaultLanguageTracks(language,audio,subs),{audio:null,subtitle:null});
});
test('language tags normalize Samsung codes, ISO codes and region tags',()=>{
 for(const language of ['tu','tur','tr-TR','TR','tr  '])assert.equal(normalizeLanguage(language),'tr');
 assert.equal(normalizeLanguage('eng'),'en');assert.equal(normalizeLanguage('deu'),'de');
});
test('subtitle label identifies Turkish when a provider supplies no valid language code',()=>{
 assert.equal(defaultLanguageTracks('en',audio,[{id:9,language:'und',label:'Türkçe'}]).subtitle.id,9);
});
