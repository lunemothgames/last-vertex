// Gem source report card (overhaul step A4c): where each player type's gems come from, per stretch of days, graded with alarms.
//   node tools/sim-gemcard.js [days=90] [build=offense]      (npm run gemcard)      SIM_REPS=3 seeds per type
// Every player type (tools/sim.js PTYPES) plays `days` calendar days from a new save (SIM_TYPE + SIM_DAYS, as tools/sim-types.js);
// `noads` = the normal type without ads (what ads add). Sources: field = gem drops tapped in runs (active play), qday / qweek = daily /
// weekly quests, daily = the 7-day daily reward, weekly = the weekly op, ach = achievements, ads = rewarded ads (the first ad of a day
// doubles the idle income instead, as in the game). Every quest kind is counted in the runs where the game counts it (r.qe in sim.js).
// Raw results are saved to <tmp>/gemcard_raw.json; SIM_CARD_RAW=<file> grades those again without running (to tune the thresholds).
// Alarms (thresholds in ALARM below, change with SIM_ALARM='{"dom":0.5}'):
//   ACTIVE   field gems outweigh quests + weekly op + ads together in a stretch (rule: active-play rewards must not outweigh them)
//   IDLE     the afk type (20 min + 6 h AUTO RETRY) earns more gems a day than the normal type (active play may lead, never idle)
//   DOMINANT one source is over `dom` of a type's gems (the economy hangs on one thing)
//   TINY     a source is under `tiny` of the gems for every type (a feature nobody notices)
//   ADS      ads are over `ads` of a type's gems · NOADS the normal type without ads gets under `noads` of the gems with them
const {spawn}=require('child_process'),path=require('path'),fs=require('fs');
const ALARM=Object.assign({dom:0.6,tiny:0.03,ads:0.5,noads:0.5},JSON.parse(process.env.SIM_ALARM||'{}'));
const RE=process.env.SIM_CARD_RAW?JSON.parse(fs.readFileSync(process.env.SIM_CARD_RAW,'utf8')):null;
const days=RE?RE.days:+process.argv[2]||90,build=RE?RE.build:process.argv[3]||'offense',REPS=+process.env.SIM_REPS||3;
const src=fs.readFileSync(process.env.SIM_SRC||path.join(__dirname,'..','src','index.src.html'),'utf8');
const PACK=+(src.match(/pull10Cost:(\d+)/)||[0,180])[1];   // a 10-ink pack, to put gems a day into game terms
const TYPES={short:{},normal:{},noads:{SIM_TYPE:'normal',SIM_ADS:'0'},keen:{},afk:{}};
const SRC=[['drop','field'],['qday','q-day'],['qweek','q-week'],['daily','daily'],['weekly','weekly'],['ach','ach'],['ad','ads']];
const SPANS=[[0,7],[7,30],[30,90],[90,180],[180,365]].filter(([a])=>a<days).map(([a,b])=>[a,Math.min(b,days)]);
const RAW=path.join(require('os').tmpdir(),'gemcard_raw.json');
let res={};let running=0,idx=0;const t0=Date.now(),jobs=[];
for(const t in TYPES)for(let s=1;s<=REPS;s++)jobs.push([t,s]);
function next(){
  while(running<6&&idx<jobs.length){
    const [t,seed]=jobs[idx++];running++;
    const p=spawn('node',['tools/sim.js','0',build],{cwd:path.join(__dirname,'..'),env:{...process.env,SIM_TYPE:t,...TYPES[t],SIM_DAYS:String(days),SIM_SEED:String(seed)}});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const m=out.match(/DAYS (.*)/);
      if(m)(res[t]=res[t]||[]).push(JSON.parse(m[1]));else console.log(t,'seed'+seed,'FAILED',out.slice(-300));
      next();if(running===0&&idx>=jobs.length)finish();});
  }
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,pct=x=>(Math.round(x*100)+'%').padStart(5);
// a stretch of days [a,b) for one type, mean of the seeds: gems a day by source, hours played a day, quests claimed / offered
function span(R,a,b){const at=(r,d)=>r.days[Math.min(d,r.days.length-1)],n=b-a,o={};
  for(const [k] of SRC)o[k]=mean(R.map(r=>(at(r,b).gs[k]-at(r,a).gs[k])/n));
  o.all=SRC.reduce((s,[k])=>s+o[k],0);
  o.h=mean(R.map(r=>(at(r,b).h-at(r,a).h)/n));
  const q=k=>mean(R.map(r=>at(r,b).q[k]-at(r,a).q[k]));
  o.qd=q('dDone')/Math.max(1,q('dOff'));o.qw=q('wDone')/Math.max(1,q('wOff'));return o;}
function finish(){
  if(!process.env.SIM_CARD_RAW)fs.writeFileSync(RAW,JSON.stringify({days,build,res}));
  console.log(`== gem source report card · ${build} · ${days} days · ${REPS} seeds per type (mean)`+(process.env.SIM_CARD_RAW?'':` · ${((Date.now()-t0)/60000).toFixed(1)} min`));
  console.log(`gems/day = all sources · pack = days for one 10-ink pack (${PACK} gems) · share of each source · field/h = field gems per hour played`);
  console.log(`quests = daily / weekly quests claimed of those offered · passive = quests + weekly op + ads, the field must stay below it`);
  console.log('\ntype    days     gems/day  pack '+SRC.map(([,n])=>n.padStart(7)).join('')+'  field/h  quests     field:passive');
  const alarms=[],whole={};
  for(const t in TYPES){const R=res[t];if(!R||!R.length){console.log(t.padEnd(8)+'NO DATA');continue;}
    for(const [a,b] of SPANS){const o=span(R,a,b),pas=o.qday+o.qweek+o.weekly+o.ad;
      console.log(t.padEnd(8)+`${a}-${b}`.padEnd(9)+o.all.toFixed(1).padStart(8)+(PACK/o.all).toFixed(1).padStart(6)+' '+
        SRC.map(([k])=>pct(o.all?o[k]/o.all:0).padStart(7)).join('')+(o.h?(o.drop/o.h).toFixed(1):'-').padStart(9)+
        `  ${pct(o.qd)}/${pct(o.qw).trim().padEnd(5)}`+`  ${o.drop.toFixed(1)} : ${pas.toFixed(1)}`);
      if(o.drop>pas)alarms.push(`ACTIVE ${t} days ${a}-${b}: field ${o.drop.toFixed(1)} gems/day > quests + weekly op + ads ${pas.toFixed(1)}`);}
    whole[t]=span(R,0,days);
  }
  // the whole run per type: one source too big, ads too big, then the checks across types
  for(const t in whole){const o=whole[t];
    for(const [k,n] of SRC)if(o[k]/o.all>ALARM.dom)alarms.push(`DOMINANT ${t}: ${n} is ${pct(o[k]/o.all).trim()} of all gems`);
    if(o.ad/o.all>ALARM.ads)alarms.push(`ADS ${t}: ads are ${pct(o.ad/o.all).trim()} of all gems`);}
  for(const [k,n] of SRC)if(Object.values(whole).every(o=>o[k]/o.all<ALARM.tiny))alarms.push(`TINY ${n}: under ${pct(ALARM.tiny).trim()} of the gems for every type (most ${pct(Math.max(...Object.values(whole).map(o=>o[k]/o.all))).trim()})`);
  if(whole.afk&&whole.normal&&whole.afk.all>whole.normal.all)alarms.push(`IDLE afk ${whole.afk.all.toFixed(1)} gems/day > normal ${whole.normal.all.toFixed(1)}`);
  if(whole.noads&&whole.normal&&whole.noads.all<ALARM.noads*whole.normal.all)alarms.push(`NOADS normal without ads gets ${pct(whole.noads.all/whole.normal.all).trim()} of the gems`);
  console.log(`\nwhole ${days} days, gems/day: `+Object.entries(whole).map(([t,o])=>`${t} ${o.all.toFixed(1)}`).join(' · ')+
    (whole.noads&&whole.normal?` · ads add ${pct(whole.normal.all/whole.noads.all-1).trim()} for normal`:''));
  console.log('\nALARMS: '+(alarms.length?'\n  '+alarms.join('\n  '):'none'));
}
if(RE){res=RE.res;finish();}else next();
