// Lists every text the game translates, so src/lang/<code>.json files can be checked for gaps.
// Usage:  node tools/i18n-keys.js            → coverage of each language file (and missing keys)
//         node tools/i18n-keys.js --dump     → writes all English keys to src/lang/_keys.json
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'src','index.src.html'),'utf8');
const keys=new Set();
const unq=s=>s.replace(/\\'/g,"'");
const add=k=>{k=unq(k).trim();if(k&&/[A-Za-z]{2}/.test(k))keys.add(k);};
const STR="'((?:[^'\\\\]|\\\\.)*)'";             // a single-quoted JS string, escapes allowed
const strs=t=>[...t.matchAll(new RegExp(STR,'g'))].map(m=>m[1]);

// 1) T('…', …) and T(cond?'a':'b', …): the string(s) before the first top-level comma
for(const m of src.matchAll(/\bT\(/g)){
  let i=m.index+2,depth=0,q=false,buf='';
  for(;i<src.length;i++){
    const c=src[i];
    if(q){buf+=c;if(c==='\\'){buf+=src[++i];continue;}if(c==="'")q=false;continue;}
    if(c==="'"){q=true;buf+=c;continue;}
    if(c==='('){depth++;buf+=c;continue;}
    if(c===')'){if(depth===0)break;depth--;buf+=c;continue;}
    if(c===','&&depth===0)break;
    buf+=c;
  }
  strs(buf).forEach(add);
}
// 2) static HTML text (what applyLang() translates)
const html=src.slice(src.indexOf('<body>'),src.indexOf('<script>'));
for(const m of html.matchAll(/>([^<>]+)</g)){const t=m[1].replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&minus;/g,'−').trim();if(t)add(t);}
// 3) data tables that are passed through T() when shown
for(const f of ['name','info','note','desc','text'])for(const m of src.matchAll(new RegExp('\\b'+f+':'+STR,'g')))add(m[1]);
for(const n of ['RAR_NAMES','TARGET_MODES'])for(const m of src.matchAll(new RegExp(n+'=\\[([^\\]]+)\\]','g')))strs(m[1]).forEach(add);
for(const m of src.matchAll(/(?:high|mid|low):'([^']+)'/g))add(m[1]);
for(const m of src.matchAll(/\[\s*'[a-z_]+'\s*,\s*'([A-Z][A-Z %/.]+)'\s*,\s*'[^']*'\s*\]/g))add(m[1]);      // tattoo chart headers
for(const m of src.matchAll(/HELP_TOPICS=\[([\s\S]*?)\n\];/g))for(const t of m[1].matchAll(/\['[a-z]+','[a-z0-9]+','([^']+)'/g))add(t[1]);
for(const m of src.matchAll(/\bach\(([^;]+?)\);?\n/g)){const a=strs(m[1]);a.slice(1,3).forEach(add);}   // achievement name / desc
for(const m of src.matchAll(/,\['([^']*\{0\}[^']*)',/g))add(m[1]);                                         // ['TEXT {0}',arg] pairs
for(const m of src.matchAll(/HINTS=\{([\s\S]*?)\n\};/g))strs(m[1]).forEach(add);

// texts that are not language, and keys only built at run time
const NOISE=new Set(['ECDSA','English text','EN','ES','PT','TR','BEST 0 · COINS x1.0','TIER 1','LAST VERTEX // SYS OK','> BOOTING_']);
['DAILY','OVERWRITE','OVERWRITE PROGRESS?','SLOW DEVICE?','USE LOW'].forEach(k=>keys.add(k));
NOISE.forEach(k=>keys.delete(k));
const out=[...keys].filter(k=>!/^[a-z_\-]+$/.test(k)&&!/^[\d\s.,x%/+\-·:★☆>]+$/.test(k)&&k!=='LAST'&&k!=='VERTEX'&&k.length<700).sort();
const dir=path.join(root,'src','lang');fs.mkdirSync(dir,{recursive:true});
if(process.argv.includes('--dump')){fs.writeFileSync(path.join(dir,'_keys.json'),JSON.stringify(out,null,1));console.log(out.length,'keys → src/lang/_keys.json');}
else for(const f of fs.readdirSync(dir).filter(f=>/^[a-z]{2}\.json$/.test(f))){
  const d=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')),miss=out.filter(k=>!(k in d)),extra=Object.keys(d).filter(k=>!keys.has(k));
  console.log(`${f}: ${out.length-miss.length}/${out.length} translated`+(miss.length?'\n  missing:\n    '+miss.join('\n    '):'')+(extra.length?'\n  unused: '+extra.join(' | '):''));
}
