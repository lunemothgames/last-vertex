// Builds index.html from src/index.src.html: embeds the fonts as base64 and syntax-checks the script.
// Usage:  node tools/build.js
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const LATIN='U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT='U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+1E00-1E9F, U+20A0-20AB, U+20AD-20C4';
const FONTS=[
  ['VT323',400,'VT323-400-latin.woff2',LATIN],
  ['VT323',400,'VT323-400-latinext.woff2',LATIN_EXT],
  ['IBM Plex Mono',400,'IBMPlexMono-400-latin.woff2',LATIN],
  ['IBM Plex Mono',400,'IBMPlexMono-400-latinext.woff2',LATIN_EXT],
  ['IBM Plex Mono',600,'IBMPlexMono-600-latin.woff2',LATIN],
  ['IBM Plex Mono',600,'IBMPlexMono-600-latinext.woff2',LATIN_EXT],
];
const css=FONTS.map(([fam,w,file,range])=>{
  const b64=fs.readFileSync(path.join(root,'src','fonts',file)).toString('base64');
  return `@font-face{font-family:'${fam}';font-style:normal;font-weight:${w};font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');unicode-range:${range};}`;
}).join('\n');

const src=fs.readFileSync(path.join(root,'src','index.src.html'),'utf8');
if(!src.includes('/*@@FONTS@@*/'))throw new Error('font placeholder missing in src/index.src.html');
// translations: every src/lang/<code>.json is inlined at /*@@LANG@@*/
const langDir=path.join(root,'src','lang'),langs={};
if(fs.existsSync(langDir))for(const f of fs.readdirSync(langDir).filter(f=>/^[a-z]{2}\.json$/.test(f)))
  langs[f.slice(0,-5)]=JSON.parse(fs.readFileSync(path.join(langDir,f),'utf8'));
if(!src.includes('/*@@LANG@@*/'))throw new Error('language placeholder missing in src/index.src.html');
// cloud client: src/cloud.js with src/cloud.config.json (Supabase URL + public anon key) inlined at /*@@CLOUD@@*/
if(!src.includes('/*@@CLOUD@@*/'))throw new Error('cloud placeholder missing in src/index.src.html');
const cloudCfg=fs.readFileSync(path.join(root,'src','cloud.config.json'),'utf8').trim();
const cloudJs=fs.readFileSync(path.join(root,'src','cloud.js'),'utf8').replace('/*@@CLOUD_CONFIG@@*/{url:\'\',key:\'\'}',()=>cloudCfg);
const out=src.replace('/*@@FONTS@@*/',()=>css).replace('/*@@LANG@@*/',()=>'Object.assign(LANG_DATA,'+JSON.stringify(langs)+');').replace('/*@@CLOUD@@*/',()=>cloudJs);

const js=out.slice(out.indexOf('<script>')+8,out.lastIndexOf('</script>'));
try{new Function(js);}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}

fs.writeFileSync(path.join(root,'index.html'),out);

// Collect all cacheable static assets at the root (exclude sw.js itself and dot-files/tools).
const STATIC_EXTS=new Set(['.html','.webmanifest','.png','.jpg','.svg','.ico','.txt']);
const rootFiles=fs.readdirSync(root).filter(f=>{
  if(f==='sw.js'||f.startsWith('.'))return false;
  const st=fs.statSync(path.join(root,f));
  return st.isFile()&&STATIC_EXTS.has(path.extname(f).toLowerCase());
}).map(f=>`'./${f}'`);
const assetList=`['./',${rootFiles.join(',')}]`;

// Update sw.js: cache version (content hash) + asset list.
const hash=crypto.createHash('sha1').update(out).digest('hex').slice(0,8);
const swPath=path.join(root,'sw.js');
const sw=fs.readFileSync(swPath,'utf8');
const swNew=sw
  .replace(/const CACHE='[^']*'/,`const CACHE='last-vertex-${hash}'`)
  .replace(/const ASSETS=\[[^\]]*\]/,`const ASSETS=${assetList}`);
if(swNew!==sw){fs.writeFileSync(swPath,swNew);console.log(`sw.js cache → last-vertex-${hash}, assets: ${rootFiles.length}`);}

console.log(`index.html built (${(out.length/1024).toFixed(0)} KB), syntax OK`);
