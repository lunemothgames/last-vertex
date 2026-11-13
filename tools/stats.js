// What real players do: Firebase Analytics + Crashlytics daily exports in BigQuery, answering the analytics questions in GUIDE.md §7
// (A first day · B difficulty · C economy · D retention · E ads · F tech · G daily/weekly · H sim placeholders vs real players).
//   npm run stats                       → download new or changed days into stats-data/, then print the report (also saved there)
//   node tools/stats.js sync            → download only
//   node tools/stats.js report [from=YYYYMMDD] [to=YYYYMMDD] [ver=0.7.5] [all]   → report from the local copy only, no network
//       all = keep the users listed in stats-data/ignore.txt (our own phones, one id or id start per line); default leaves them out
//   STATS_DATA=<dir> reads another copy (e.g. made-up test data); STATS_KEY=<json> another service account key
// stats-data/ is player data: never committed (.gitignore). The BigQuery sandbox deletes tables after 60 days, so the local copy is the
// real archive; a day is downloaded again only when Google changed its table (late events arrive for up to 3 days).
// The robot is play-uploader@last-vertex (BigQuery Data Viewer + Job User); reading a day costs a few MB of the free monthly quota.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=path.join(__dirname,'..'),DATA=process.env.STATS_DATA||path.join(ROOT,'stats-data'),EV=path.join(DATA,'events');
const KEY=process.env.STATS_KEY||path.join(ROOT,'keys','play-service-account.json'),PROJ='last-vertex';
const SRC=fs.readFileSync(path.join(ROOT,'src','index.src.html'),'utf8'),SIMSRC=fs.readFileSync(path.join(__dirname,'sim.js'),'utf8');
const TIERS=new Function('return '+SRC.match(/const TIERS=(\{[^;]+\});/)[1])();
const COACH_IDS=[...SRC.slice(SRC.indexOf('const COACH=['),SRC.indexOf('\n];',SRC.indexOf('const COACH=['))).matchAll(/\{id:'(\w+)'/g)].map(m=>m[1]);
const PTYPES=new Function('return '+SIMSRC.match(/const PTYPES=(\{.+?\}\});/)[1])();
const SKILLS=new Function('return '+SIMSRC.match(/const SKILLS=(\{.+?\}\}),/)[1])();
const DAY=864e8;   // one day in microseconds (event times are microseconds)

// ── BigQuery over plain HTTPS (no extra packages) ──
let TOK=null;
async function token(){
  if(TOK&&TOK.exp>Date.now()+6e4)return TOK.v;
  const key=JSON.parse(fs.readFileSync(KEY,'utf8')),b=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),now=Math.floor(Date.now()/1000);
  const un=b({alg:'RS256',typ:'JWT'})+'.'+b({iss:key.client_email,scope:'https://www.googleapis.com/auth/bigquery',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600});
  const jwt=un+'.'+crypto.createSign('RSA-SHA256').update(un).sign(key.private_key,'base64url');
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})}).then(r=>r.json());
  if(!r.access_token)throw new Error('login failed: '+JSON.stringify(r));
  TOK={v:r.access_token,exp:Date.now()+r.expires_in*1000};return TOK.v;
}
async function api(p,body){
  const r=await fetch('https://bigquery.googleapis.com/bigquery/v2/projects/'+PROJ+p,{method:body?'POST':'GET',
    headers:{authorization:'Bearer '+await token(),'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  const j=await r.json();if(j.error)throw new Error(p+': '+j.error.message);return j;
}
async function list(p,field){let out=[],pt='';do{const j=await api(p+(pt?(p.includes('?')?'&':'?')+'pageToken='+encodeURIComponent(pt):''));out=out.concat(j[field]||[]);pt=j.nextPageToken;}while(pt);return out;}
// a query whose columns are all plain values → array of objects {column: string|null}
async function query(sql,loc){
  let j=await api('/queries',{query:sql,useLegacySql:false,location:loc,timeoutMs:60000,maxResults:20000});
  const id=j.jobReference.jobId,more=pt=>api('/queries/'+id+'?location='+loc+'&maxResults=20000'+(pt?'&pageToken='+encodeURIComponent(pt):''));
  while(!j.jobComplete)j=await more('');
  const names=j.schema.fields.map(f=>f.name),rows=[];
  for(;;){for(const r of j.rows||[]){const o={};r.f.forEach((c,i)=>o[names[i]]=c.v);rows.push(o);}if(!j.pageToken)break;j=await more(j.pageToken);}
  return rows;
}
const flat=json=>{const o={};for(const e of JSON.parse(json||'[]')){const v=e.value||{};const x=v.string_value??v.int_value??v.double_value??v.float_value;
  if(x!=null&&!e.key.startsWith('firebase_'))o[e.key]=x;}return o;};
const has=(fields,p)=>{let fs_=fields;for(const k of p.split('.')){const f=(fs_||[]).find(f=>f.name===k);if(!f)return false;fs_=f.fields;}return true;};

async function sync(){
  fs.mkdirSync(EV,{recursive:true});
  const dss=await list('/datasets','datasets');
  const an=dss.find(d=>d.datasetReference.datasetId.startsWith('analytics_'));
  if(!an)console.log('No analytics data in BigQuery yet (the first daily export arrives the day after linking).');
  else{
    const ds=an.datasetReference.datasetId,loc=an.location;
    const tabs=(await list('/datasets/'+ds+'/tables','tables')).map(t=>t.tableReference.tableId).filter(t=>/^events_\d{8}$/.test(t)).sort();
    let got=0;
    for(const t of tabs){
      const f=path.join(EV,t.slice(7)+'.json'),meta=await api('/datasets/'+ds+'/tables/'+t),mod=+meta.lastModifiedTime;
      if(fs.existsSync(f)&&JSON.parse(fs.readFileSync(f,'utf8')).mod>=mod)continue;
      const S=meta.schema.fields,col=(p,a)=>has(S,p)?p+' '+a:'NULL '+a;
      const rows=await query(`SELECT event_timestamp t,event_name n,user_pseudo_id u,TO_JSON_STRING(event_params) p,TO_JSON_STRING(user_properties) up,
        ${col('app_info.version','v')},${col('geo.country','c')},${col('device.mobile_model_name','m')},${col('device.language','l')},
        ${col('device.operating_system_version','os')},${col('user_first_touch_timestamp','ft')} FROM \`${PROJ}.${ds}.${t}\``,loc);
      const out=rows.map(r=>({t:+r.t,n:r.n,u:r.u,p:flat(r.p),up:flat(r.up),v:r.v,c:r.c,m:r.m,l:r.l,os:r.os,ft:+r.ft||0}));
      fs.writeFileSync(f,JSON.stringify({table:t,mod,fetched:new Date().toISOString(),rows:out}));
      console.log('day '+t.slice(7)+': '+out.length+' events');got++;
    }
    console.log('analytics: '+tabs.length+' days in BigQuery, '+got+' downloaded now');
  }
  const cr=dss.find(d=>d.datasetReference.datasetId==='firebase_crashlytics');
  if(cr){
    const loc=cr.location,f=path.join(DATA,'crash.json'),old=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):{rows:{}};
    const tabs=(await list('/datasets/firebase_crashlytics/tables','tables')).map(t=>t.tableReference.tableId).filter(t=>!/_REALTIME$/.test(t));
    const last=Math.max(0,...Object.values(old.rows).map(r=>r.t));let n=0;
    for(const t of tabs){
      const S=(await api('/datasets/firebase_crashlytics/tables/'+t)).schema.fields,col=(p,a)=>has(S,p)?p+' '+a:'NULL '+a;
      const ex=has(S,'exceptions.exception_message')?'TO_JSON_STRING(ARRAY(SELECT AS STRUCT e.type,e.exception_message FROM UNNEST(exceptions) e LIMIT 2)) ex':'NULL ex';
      const rows=await query(`SELECT event_id id,UNIX_MICROS(event_timestamp) t,${col('is_fatal','fatal')},${col('error_type','et')},${col('issue_id','iid')},
        ${col('issue_title','title')},${col('issue_subtitle','sub')},${col('application.display_version','v')},${col('device.manufacturer','mf')},
        ${col('device.model','m')},${col('operating_system.display_version','os')},${col('installation_uuid','iu')},${col('process_state','ps')},${ex}
        FROM \`${PROJ}.firebase_crashlytics.${t}\` WHERE event_timestamp>=TIMESTAMP_MICROS(${Math.max(0,last-7*DAY)})`,loc);
      for(const r of rows){old.rows[r.id]={...r,t:+r.t,fatal:r.fatal==='true',app:t};n++;}
    }
    fs.writeFileSync(f,JSON.stringify(old));console.log('crashlytics: '+Object.keys(old.rows).length+' reports kept ('+n+' read now)');
  }
}

// ── small helpers for the report ──
const num=x=>+x||0;
const q=(a,p)=>{if(!a.length)return NaN;const s=[...a].sort((x,y)=>x-y),i=(s.length-1)*p,lo=Math.floor(i);return s[lo]+(s[Math.ceil(i)]-s[lo])*(i-lo);};
const med=a=>q(a,.5),mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:NaN;
const f1=x=>isNaN(x)?'-':Math.abs(x)>=100?Math.round(x).toString():(+x.toFixed(Math.abs(x)>=10?1:2)).toString();
const pc=(a,b)=>b?Math.round(100*a/b)+'%':'-';
const spread=a=>a.length?`med ${f1(med(a))} (${f1(q(a,.25))}-${f1(q(a,.75))}) n${a.length}`:'n0';
const count=(a,key)=>{const m=new Map();for(const x of a){const k=key(x);if(k!=null&&k!=='')m.set(k,(m.get(k)||0)+1);}return [...m].sort((x,y)=>y[1]-x[1]);};
let OUT=[];const say=s=>OUT.push(s);
const head=s=>{say('');say('== '+s+' '+'='.repeat(Math.max(0,70-s.length)));};
function table(cols,rows){
  if(!rows.length){say('  (none)');return;}
  const all=[cols,...rows.map(r=>r.map(c=>String(c)))],w=cols.map((_,i)=>Math.max(...all.map(r=>(r[i]||'').length)));
  for(const r of all)say('  '+r.map((c,i)=>i?(c||'').padStart(w[i]):(c||'').padEnd(w[i])).join('  '));
}
const dayStr=t=>new Date(t/1000).toISOString().slice(0,10);

function report(args){
  const opt=Object.fromEntries(args.map(a=>a.includes('=')?a.split('='):[a,true]));
  const files=fs.existsSync(EV)?fs.readdirSync(EV).filter(f=>/^\d{8}\.json$/.test(f)).sort():[];
  const days=files.map(f=>f.slice(0,8)).filter(d=>(!opt.from||d>=opt.from)&&(!opt.to||d<=opt.to));
  if(!days.length){console.log('No downloaded days'+(files.length?' in that range':'')+'. Run: npm run stats');return;}
  const ignF=path.join(DATA,'ignore.txt'),ign=!opt.all&&fs.existsSync(ignF)?fs.readFileSync(ignF,'utf8').split(/\r?\n/).map(s=>s.replace(/#.*/,'').trim()).filter(Boolean):[];
  let E=[];for(const d of days)for(const r of JSON.parse(fs.readFileSync(path.join(EV,d+'.json'),'utf8')).rows)E.push(r);
  const ignored=new Set(E.filter(r=>ign.some(i=>r.u.startsWith(i))).map(r=>r.u));
  E=E.filter(r=>!ignored.has(r.u)&&(!opt.ver||r.v===opt.ver)).sort((a,b)=>a.t-b.t);
  if(!E.length){console.log('No events left after the filters.');return;}
  const t0=Math.min(...E.map(r=>r.t)),tEnd=Math.max(...E.map(r=>r.t));
  // per player: their events, first touch, days since install
  const U=new Map();
  for(const r of E){let u=U.get(r.u);if(!u)U.set(r.u,u={id:r.u,ev:[],ft:r.ft||r.t,up:{}});u.ev.push(r);if(r.ft)u.ft=Math.min(u.ft,r.ft);Object.assign(u.up,r.up);
    u.last=r.t;u.m=r.m||u.m;u.c=r.c||u.c;u.v=r.v||u.v;}
  for(const u of U.values()){u.fresh=u.ft>=t0-36e8;   // installed inside the data window (an hour of slack): their first day is all here
    u.runs=u.ev.filter(r=>r.n==='run_end');u.best=Math.max(0,...u.runs.filter(r=>num(r.p.weekly)===0).map(r=>num(r.p.eff)));
    u.tier=Math.max(num(u.up.max_tier),...u.ev.filter(r=>r.n==='tier_unlock').map(r=>num(r.p.tier)),1);
    u.days=new Set(u.ev.map(r=>Math.floor((r.t-u.ft)/DAY)));u.playH=u.runs.reduce((s,r)=>s+num(r.p.secs),0)/3600;}
  const users=[...U.values()],fresh=users.filter(u=>u.fresh),runs=E.filter(r=>r.n==='run_end'),ev=n=>E.filter(r=>r.n===n);
  OUT=[];
  say('LAST VERTEX · REAL PLAYERS · '+dayStr(t0)+' .. '+dayStr(tEnd)+(opt.ver?' · version '+opt.ver:'')+' · made '+new Date().toLocaleString('sv').slice(0,16));
  say(`players ${users.length} (installed in this window ${fresh.length}) · events ${E.length} · runs ${runs.length}`+(ignored.size?` · left out ${ignored.size} own phone(s) (ignore.txt)`:''));
  say('versions (players): '+count(users,u=>u.v).map(([k,n])=>k+' '+n).join(', '));
  say('countries: '+count(users,u=>u.c).slice(0,12).map(([k,n])=>k+' '+n).join(', '));
  say('small numbers: under ~30 players a share can swing by 10-20 points from one person; each row shows its n');

  head('DAYS');
  const byDay=new Map();for(const r of E){const d=dayStr(r.t);let o=byDay.get(d);if(!o)byDay.set(d,o={u:new Set(),inst:0,runs:0,ads:0,h:0});
    o.u.add(r.u);if(r.n==='first_open')o.inst++;if(r.n==='run_end'){o.runs++;o.h+=num(r.p.secs)/3600;}if(r.n==='ad_watched')o.ads++;}
  table(['day','players','installs','runs','play h','ads'],[...byDay].map(([d,o])=>[d,o.u.size,o.inst,o.runs,f1(o.h),o.ads]));

  head('MOST ACTIVE PLAYERS (find our own phones here → stats-data/ignore.txt)');
  table(['id','model','first seen','days','runs','play h','tier','best eff','ver'],[...users].sort((a,b)=>b.playH-a.playH).slice(0,10).map(u=>
    [u.id.slice(0,10),(u.m||'').slice(0,18),dayStr(u.ft),u.days.size,u.runs.length,f1(u.playH),u.tier,u.best,u.v]));

  // A ─ first day
  head('A1 COACH STEPS (players installed in this window)');
  const coach=n=>new Set(E.filter(r=>r.n===n&&U.get(r.u).fresh).map(r=>r.p.step+'|'+r.u));
  const sh=coach('coach_show'),dn=coach('coach_done'),sk=coach('coach_skip'),cnt=(s,st)=>[...s].filter(k=>k.startsWith(st+'|')).length;
  const startedRun=fresh.filter(u=>u.ev.some(r=>r.n==='run_start')).length;
  say(`  installed ${fresh.length} · started a run ${startedRun} (${pc(startedRun,fresh.length)})`);
  table(['step','shown','done','skipped','done of installs'],COACH_IDS.map(s=>[s,cnt(sh,s),cnt(dn,s),cnt(sk,s),pc(cnt(dn,s),fresh.length)]));
  const gone=fresh.filter(u=>tEnd-u.last>=3*DAY);   // not seen for 3+ days
  say(`  left (nothing for 3+ days) ${gone.length} of ${fresh.length}; last coach step they reached:`);
  table(['last step','players'],count(gone,u=>{const c=u.ev.filter(r=>r.n.startsWith('coach_'));return c.length?c[c.length-1].p.step+' ('+c[c.length-1].n.slice(6)+')':'(none)';}));

  head('A2 FIRST RUNS');
  table(['run','n','wave','secs','quit'],[1,2,3].map(k=>{const a=runs.filter(r=>num(r.p.run_no)===k&&U.get(r.u).fresh);
    return [k,a.length,spread(a.map(r=>num(r.p.wave))),f1(med(a.map(r=>num(r.p.secs)))),pc(a.filter(r=>num(r.p.quit)).length,a.length)];}));

  head('A3 FIRST TIME (installed in this window): minutes after install · runs finished before');
  table(['first','players','minutes','runs before'],[['shop buy','shop_buy'],['ink (summon)','summon'],['boost','boost_buy'],['ad','ad_watched'],['daily reward','daily_claim'],['tier 2','tier_unlock']].map(([lab,n])=>{
    const m=[],rb=[];for(const u of fresh){const i=u.ev.findIndex(r=>r.n===n);if(i<0)continue;m.push((u.ev[i].t-u.ft)/6e7);rb.push(u.ev.slice(0,i).filter(r=>r.n==='run_end').length);}
    return [lab,m.length+' ('+pc(m.length,fresh.length)+')',spread(m),f1(med(rb))];}));

  // B ─ difficulty
  head('B1 RUNS BY TIER (normal runs, weekly left out)');
  const norm=runs.filter(r=>num(r.p.weekly)===0);
  table(['tier','runs','players','wave','reached '+TIERS.unlockWave,'secs med'],count(norm,r=>num(r.p.tier)).sort((a,b)=>a[0]-b[0]).map(([t])=>{const a=norm.filter(r=>num(r.p.tier)===t);
    return [t,a.length,new Set(a.map(r=>r.u)).size,spread(a.map(r=>num(r.p.wave))),pc(a.filter(r=>num(r.p.wave)>=TIERS.unlockWave).length,a.length),f1(med(a.map(r=>num(r.p.secs))))];}));
  say('  players by highest tier: '+count(users,u=>u.tier).sort((a,b)=>a[0]-b[0]).map(([k,n])=>'T'+k+' '+n).join(', '));
  const stuck=users.filter(u=>u.days.size>=4).filter(u=>{const d=[...u.days].sort((a,b)=>a-b),cut=d[d.length-3];
    const before=Math.max(0,...u.runs.filter(r=>Math.floor((r.t-u.ft)/DAY)<cut&&num(r.p.weekly)===0).map(r=>num(r.p.eff)));return u.best<=before;});
  say(`  stuck (4+ active days, best wave not higher in their last 3 active days): ${stuck.length} · tiers `+count(stuck,u=>'T'+u.tier).map(([k,n])=>k+' '+n).join(', '));

  head('B2 WHAT ENDS RUNS (most damage taken from; quits left out)');
  const died=norm.filter(r=>!num(r.p.quit)&&r.p.foe);
  table(['enemy','runs','share','its share of damage (med)','tier med'],count(died,r=>r.p.foe).slice(0,15).map(([k,n])=>{const a=died.filter(r=>r.p.foe===k);
    return [k,n,pc(n,died.length),f1(med(a.map(r=>num(r.p.foe_pct))))+'%',f1(med(a.map(r=>num(r.p.tier))))];}));
  say(`  one enemy did 70%+ of the damage taken in ${pc(died.filter(r=>num(r.p.foe_pct)>=70).length,died.length)} of deaths · quits ${pc(norm.filter(r=>num(r.p.quit)).length,norm.length)} of runs`);

  head('B3 TATTOOS IN RUNS (equipped) · top damage sources');
  const tats=r=>[r.p.tats1,r.p.tats2].filter(Boolean).join(',').split(',').filter(Boolean);
  const withT=norm.filter(r=>tats(r).length);
  say(`  runs with tattoos ${pc(withT.length,norm.length)} · tattoos per run: `+count(norm,r=>tats(r).length).sort((a,b)=>a[0]-b[0]).map(([k,n])=>k+':'+n).join(' '));
  const effOf=new Map();for(const u of users)effOf.set(u.id,med(u.runs.filter(r=>num(r.p.weekly)===0).map(r=>num(r.p.eff))));
  table(['tattoo','runs','players','eff vs own median','top damage when worn'],count(withT.flatMap(r=>tats(r).map(t=>({t,r}))),x=>x.t).map(([t,n])=>{
    const a=withT.filter(r=>tats(r).includes(t));
    return [t,n,new Set(a.map(r=>r.u)).size,f1(mean(a.map(r=>num(r.p.eff)/(effOf.get(r.u)||1))))+'x',pc(a.filter(r=>r.p.dmg1===t).length,a.length)];}));
  table(['top damage source','runs','share'],count(norm,r=>r.p.dmg1).slice(0,15).map(([k,n])=>[k,n,pc(n,norm.length)]));

  head('B4 TAP TATTOOS (actives and bombs)');
  const tapR=norm.filter(r=>num(r.p.rdy)>0||num(r.p.act)>0),used=tapR.filter(r=>num(r.p.act)>0);
  say(`  runs with a tap tattoo ${tapR.length} · never tapped in ${pc(tapR.length-used.length,tapR.length)}`);
  say(`  taps per minute: ${spread(used.map(r=>num(r.p.act)/Math.max(1,num(r.p.secs))*60))}`);
  say(`  ready-and-waiting per tap (game seconds, rdy/act): ${spread(used.map(r=>num(r.p.rdy)/num(r.p.act)))}`);
  say(`  (sim normal player: ${SKILLS.normal.h} real s late x game speed; rdy also counts a tattoo nobody taps, so it runs high)`);

  head('B5 AUTO RETRY · BOOSTS · B6 MODE');
  say(`  AUTO runs ${pc(norm.filter(r=>num(r.p.auto)).length,norm.length)} of runs, ${pc(norm.filter(r=>num(r.p.auto)).reduce((s,r)=>s+num(r.p.secs),0),norm.reduce((s,r)=>s+num(r.p.secs),0))} of run time · players who used it ${new Set(norm.filter(r=>num(r.p.auto)).map(r=>r.u)).size}`);
  const bb=ev('boost_buy');say(`  runs with a boost ${pc(norm.filter(r=>r.p.boosts).length,norm.length)} · boost buys ${bb.length} (auto-buy ${pc(bb.filter(r=>num(r.p.auto)).length,bb.length)})`);
  table(['boost','bought','players'],count(bb,r=>r.p.id).map(([k,n])=>[k,n,new Set(bb.filter(r=>r.p.id===k).map(r=>r.u)).size]));
  say('  mode (runs): '+count(norm,r=>r.p.mode).map(([k,n])=>k+' '+pc(n,norm.length)).join(', ')+' · mode picks: '+count(ev('mode_pick'),r=>r.p.mode).map(([k,n])=>k+' '+n).join(', '));

  // C ─ economy
  head('C1 GEMS IN AND OUT');
  const earn=ev('earn_virtual_currency'),spend=ev('spend_virtual_currency'),sum=a=>a.reduce((s,r)=>s+num(r.p.value),0);
  const src=r=>String(r.p.src||'').replace(/^ad_.*/,'ads').replace(/^quest_.*/,'quests');
  table(['source','gems','share','players'],count(earn,src).map(([k])=>{const a=earn.filter(r=>src(r)===k);return [k,sum(a),pc(sum(a),sum(earn)),new Set(a.map(r=>r.u)).size];}));
  say(`  in runs (drops + weekly, from run_end): ${runs.reduce((s,r)=>s+num(r.p.gems),0)} · weekly part above is inside it too`);
  table(['spent on','gems','share','players'],count(spend,r=>r.p.item_name).map(([k])=>{const a=spend.filter(r=>r.p.item_name===k);return [k,sum(a),pc(sum(a),sum(spend)),new Set(a.map(r=>r.u)).size];}));
  say('  inks per summon: '+count(ev('summon'),r=>num(r.p.count)).map(([k,n])=>k+' x'+n).join(', '));

  head('C2 SHOP BUYS (coins)');
  const sb=ev('shop_buy');
  table(['upgrade','buys','levels','players','top level'],count(sb,r=>r.p.id).map(([k,n])=>{const a=sb.filter(r=>r.p.id===k);
    return [k,n,a.reduce((s,r)=>s+num(r.p.n),0),new Set(a.map(r=>r.u)).size,Math.max(...a.map(r=>num(r.p.lv)))];}));

  head('C3 IDLE INCOME');
  const oc=ev('offline_claim');
  say(`  claims ${oc.length} by ${new Set(oc.map(r=>r.u)).size} players · hours away ${spread(oc.map(r=>num(r.p.secs)/3600))} · doubled by ad ${pc(oc.filter(r=>num(r.p.x2)).length,oc.length)}`);

  // D ─ retention
  head('D1 RETURN (installed in this window; day N = 24 h steps after install)');
  table(['day','could return','came back that day','came back that day or later'],[1,2,3,7,14,30].map(N=>{const el=fresh.filter(u=>u.ft+(N+1)*DAY<=tEnd);
    return [N,el.length,pc(el.filter(u=>u.days.has(N)).length,el.length),pc(el.filter(u=>[...u.days].some(d=>d>=N)).length,el.length)];}));
  head('D2 SESSIONS (all players)');
  const ses=new Map(),pd=new Map();
  for(const r of E){const s=r.p.ga_session_id;if(s!=null){const k=r.u+'|'+s;const o=ses.get(k)||{ms:0,a:r.t,b:r.t};o.ms+=num(r.p.engagement_time_msec);o.b=r.t;ses.set(k,o);}
    const k=r.u+'|'+dayStr(r.t);let o=pd.get(k);if(!o)pd.set(k,o={s:new Set(),ms:0,run:0,ads:0,idle:0});if(s!=null)o.s.add(s);o.ms+=num(r.p.engagement_time_msec);
    if(r.n==='run_end')o.run+=num(r.p.secs);if(r.n==='ad_watched')o.ads++;if(r.n==='offline_claim')o.idle+=num(r.p.secs);}
  const S=[...ses.values()],P=[...pd.values()];
  say(`  session minutes on screen: ${spread(S.map(o=>o.ms/6e4))}`);
  say(`  per active player-day: sessions ${spread(P.map(o=>o.s.size))} · minutes on screen ${spread(P.map(o=>o.ms/6e4))} · run minutes ${spread(P.map(o=>o.run/60))}`);
  head('D3 PLAYERS WHO LEFT (nothing for 3+ days)');
  const left=users.filter(u=>tEnd-u.last>=3*DAY);
  say(`  ${left.length} of ${users.length} · uninstalls seen ${new Set(ev('app_remove').map(r=>r.u)).size}`);
  table(['last tier','players','runs med','best eff med','play h med'],count(left,u=>u.tier).sort((a,b)=>a[0]-b[0]).map(([t,n])=>{const a=left.filter(u=>u.tier===t);
    return ['T'+t,n,f1(med(a.map(u=>u.runs.length))),f1(med(a.map(u=>u.best))),f1(med(a.map(u=>u.playH)))];}));

  // E ─ ads
  head('E1 ADS WATCHED · E2 OFFERED vs RESULT');
  const aw=ev('ad_watched'),ar=ev('ad_result');
  table(['place','watched','players'],count(aw,r=>r.p.place).map(([k,n])=>[k,n,new Set(aw.filter(r=>r.p.place===k).map(r=>r.u)).size]));
  say(`  ads per active player-day: ${spread(P.map(o=>o.ads))}`);
  table(['place','tries','ok','closed early','no ad'],count(ar,r=>r.p.place).map(([k,n])=>{const a=ar.filter(r=>r.p.place===k);
    return [k,n,pc(a.filter(r=>r.p.res==='ok').length,n),pc(a.filter(r=>r.p.res==='quit').length,n),pc(a.filter(r=>r.p.res==='none').length,n)];}));
  table(['ad error','times'],count(ar.filter(r=>r.p.err),r=>r.p.err).slice(0,6));

  // F ─ tech
  head('F1 CRASHES AND ERRORS');
  const cf=path.join(DATA,'crash.json');
  const CR=fs.existsSync(cf)?Object.values(JSON.parse(fs.readFileSync(cf,'utf8')).rows).filter(r=>r.t>=t0&&r.t<=tEnd+DAY&&(!opt.ver||r.v===opt.ver)):[];
  table(['issue','kind','reports','phones','versions','top model'],count(CR,r=>r.iid||r.title).slice(0,12).map(([k,n])=>{const a=CR.filter(r=>(r.iid||r.title)===k);
    const ex=a[0].ex?JSON.parse(a[0].ex)[0]:null;
    return [((a[0].title||'')+' '+(a[0].sub||'')+(ex&&ex.exception_message?' · '+ex.exception_message:'')).trim().slice(0,70),a[0].et||(a[0].fatal?'FATAL':'NON_FATAL'),n,
      new Set(a.map(r=>r.iu)).size,[...new Set(a.map(r=>r.v))].join(','),(count(a,r=>r.m)[0]||['?'])[0]];}));
  say(`  crashes ${CR.filter(r=>r.fatal).length} on ${new Set(CR.filter(r=>r.fatal).map(r=>r.iu)).size} phones · caught errors ${CR.filter(r=>!r.fatal).length} · players in the window ${users.length}`);
  head('F2 SPEED (frames a second while playing)');
  const fr=norm.filter(r=>num(r.p.fps)>0),fx=r=>U.get(r.u).up.fx||'?';
  say(`  all runs: ${spread(fr.map(r=>num(r.p.fps)))} · runs under 40 fps ${pc(fr.filter(r=>num(r.p.fps)<40).length,fr.length)}`);
  table(['effects','runs','fps'],count(fr,fx).map(([k])=>{const a=fr.filter(r=>fx(r)===k);return [k,a.length,spread(a.map(r=>num(r.p.fps)))];}));
  const mods=count(fr,r=>U.get(r.u).m).filter(([,n])=>n>=3).map(([k])=>[k,med(fr.filter(r=>U.get(r.u).m===k).map(r=>num(r.p.fps)))]).sort((a,b)=>a[1]-b[1]);
  table(['slowest phones (3+ runs)','fps med'],mods.slice(0,8).map(([k,v])=>[k,f1(v)]));
  head('F3 SETTINGS (each player\'s latest)');
  for(const k of ['lang','fx','theme','slots','max_tier'])say(`  ${k}: `+count(users,u=>u.up[k]).map(([v,n])=>v+' '+n).join(', '));
  say('  phone language: '+count(users,u=>(u.ev.find(r=>r.l)||{}).l).slice(0,10).map(([v,n])=>v+' '+n).join(', '));

  // G ─ daily / weekly
  head('G DAILY REWARD · QUESTS · WEEKLY');
  const dc=ev('daily_claim'),qc=ev('quest_claim'),wk=runs.filter(r=>num(r.p.weekly));
  say(`  daily reward: ${dc.length} claims by ${new Set(dc.map(r=>r.u)).size} players · streak day `+count(dc,r=>num(r.p.day)).sort((a,b)=>a[0]-b[0]).map(([k,n])=>k+':'+n).join(' '));
  table(['quest','claims','players'],count(qc,r=>r.p.kind+' '+r.p.k).map(([k,n])=>[k,n,new Set(qc.filter(r=>r.p.kind+' '+r.p.k===k).map(r=>r.u)).size]));
  say(`  weekly runs ${wk.length} (${pc(wk.length,runs.length)} of runs) by ${new Set(wk.map(r=>r.u)).size} players · wave ${spread(wk.map(r=>num(r.p.wave)))}`);
  say(`  other: cloud save turned on ${ev('cloud_on').length} · inbox opened ${ev('inbox_open').length} · tier gifts ${ev('tier_gift').length}`);

  // H ─ the simulator's guesses against real players
  head('H SIM PLACEHOLDERS vs REAL PLAYERS (per active player-day)');
  const pn=PTYPES.normal;
  table(['','sim normal','real'],[
    ['play hours a day',pn.dayH,spread(P.map(o=>o.run/3600))],
    ['ads a day',pn.ads,spread(P.map(o=>o.ads))],
    ['idle hours claimed a day',pn.afkH,spread(P.filter(o=>o.idle).map(o=>o.idle/3600))+' (days with a claim)'],
    ['sessions a day',pn.sess,spread(P.map(o=>o.s.size))],
    ['tap delay',SKILLS.normal.h+' s','see B4']]);
  // each player with 2+ active days, put next to the nearest sim type by play hours and ads a day
  const types=Object.entries(PTYPES),mix=new Map();
  for(const u of users){const mine=[...pd].filter(([k])=>k.startsWith(u.id+'|')).map(([,o])=>o);if(mine.length<2)continue;
    const h=mean(mine.map(o=>o.run/3600)),a=mean(mine.map(o=>o.ads)),idle=mean(mine.map(o=>o.idle/3600));
    const best=types.map(([k,t])=>[k,Math.abs(Math.log((h+.05)/(t.dayH+.05)))+.5*Math.abs(Math.log((a+1)/(t.ads+1)))+.3*Math.abs(Math.log((idle+.5)/(t.afkH+.5)))]).sort((x,y)=>x[1]-y[1])[0][0];
    mix.set(best,(mix.get(best)||0)+1);}
  say('  nearest sim player type (players with 2+ active days): '+([...mix].map(([k,n])=>k+' '+n).join(', ')||'none yet'));
  table(['tier reached','players','days after install','play hours before'],[2,3,4,5].map(t=>{const d=[],h=[];
    for(const u of fresh){const e=u.ev.find(r=>r.n==='tier_unlock'&&num(r.p.tier)===t);if(!e)continue;d.push((e.t-u.ft)/DAY);h.push(u.runs.filter(r=>r.t<=e.t).reduce((s,r)=>s+num(r.p.secs),0)/3600);}
    return ['T'+t,d.length,spread(d),spread(h)];}));
  say('  compare the tier days with `npm run types` (sim days per tier for each player type)');

  const txt=OUT.join('\n');console.log(txt);
  if(!process.env.STATS_DATA||opt.save){fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(path.join(DATA,'report-'+days[days.length-1]+'.txt'),txt+'\n');}
}

(async()=>{
  const [cmd,...rest]=process.argv.slice(2);
  if(cmd==='report')return report(rest);
  if(cmd==='sync')return sync();
  await sync();console.log('');report(cmd?[cmd,...rest]:rest);
})().catch(e=>{console.error('stats: '+e.message);process.exit(1);});
