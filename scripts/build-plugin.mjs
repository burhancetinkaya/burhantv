import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env={...loadEnv('production',root,''),...process.env};
const origin=new URL(env.COMPANION_PUBLIC_URL||env.VITE_COMPANION_URL||'');
if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error('Set COMPANION_PUBLIC_URL to your own HTTPS origin.');
const source=path.join(root,'chatgpt-plugin/burhantv-assistant'),out=path.join(root,'build/chatgpt-plugin/burhantv-assistant');
fs.mkdirSync(out,{recursive:true});
fs.cpSync(source,out,{recursive:true});
const manifest=JSON.parse(fs.readFileSync(path.join(out,'plugin.json'),'utf8'));
if(env.CHATGPT_APP_ID){
 if(!/^asdk_app_[a-zA-Z0-9_]+$/.test(env.CHATGPT_APP_ID))throw Error('Invalid CHATGPT_APP_ID');
 manifest.extensions['com.openai'].apps='./.app.json';
 fs.writeFileSync(path.join(out,'.app.json'),JSON.stringify({apps:{burhantv:{id:env.CHATGPT_APP_ID}}},null,2));
}
fs.writeFileSync(path.join(out,'plugin.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(out,'mcp.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{burhantv:{type:'streamable-http',url:origin.origin+'/mcp',extensions:{'com.openai':{auth:{type:'oauth',client:{mode:'dcr'},baseScopes:['tv:read','tv:play']}}}}}},null,2)+'\n');
console.log('Configured plugin written to ignored build/chatgpt-plugin/burhantv-assistant');
