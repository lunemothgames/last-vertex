// Tattoo report card (overhaul step A4): every tattoo alone in its slot against no tattoo, graded with alarms.
//   node tools/sim-card.js [levels=2,7]      (npm run card)      SIM_N=3 runs per case, SIM_ECON must NOT be set (shop styles are fixed)
// Each tattoo is measured by `tools/sim.js tattoocard` in 9 cases (offense / swarm / tank shop x 3 budgets), at a low level
// (what most players own for a long time, Lv2) and a high one (Lv7). Value = "as good as this much more budget": a depth gain is turned into the
// budget that would give the same depth (using how fast depth grows with budget, `e`), a coins/hour gain already is extra budget over time; the larger of the two.
// Raw results are saved to <tmp>/card_raw.json; SIM_CARD_RAW=<file> grades those again without running (to tune the thresholds).
// Alarms (thresholds in ALARM below, change with SIM_ALARM='{"dead":0.02}'):
//   DEAD    the high-level value is under `dead` (indistinguishable from noise) · LATE the low-level value is under `dead` but the high one is not
//   WEAK    the high-level value is under `weak` x the median of its rarity · STRONG over `strong` x the median and above `strongMin`
//   RARITY  a rarer group's median is below a cheaper group's (the rarer one should feel better)
// Alone-in-a-slot ignores synergy and a bomb or active is cast by a perfect player, so read WEAK/STRONG as "look at this one", not as a verdict.
const {spawn}=require('child_process'),path=require('path');
const LV=(process.argv[2]||'2,7').split(',').map(Number),LOW=LV[0],HIGH=LV[LV.length-1];
const ALARM=Object.assign({dead:0.10,weak:0.5,strong:2,strongMin:0.5},JSON.parse(process.env.SIM_ALARM||'{}'));
const RAR=['COMMON','UNCOMMON','RARE','EPIC'];
const src=require('fs').readFileSync(process.env.SIM_SRC||path.join(__dirname,'..','src','index.src.html'),'utf8');
const ids=[...src.match(/const TAT_TYPES=\[([\s\S]*?)\n\];/)[1].matchAll(/\{id:'(\w+)'/g)].map(x=>x[1]);
let res={};let running=0,idx=0;const t0=Date.now();const RAW=path.join(require('os').tmpdir(),'card_raw.json');
function next(){
  while(running<6&&idx<ids.length){
    const id=ids[idx++];running++;
    const p=spawn('node',['tools/sim.js','tattoocard',id,LV.join(',')],{cwd:path.join(__dirname,'..'),env:process.env});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const m=out.match(/CARD (.*)/);
      if(m){const r=JSON.parse(m[1]);res[r.id]=r;}else console.log(id,'FAILED',out.slice(-300));
      next();if(running===0&&idx>=ids.length)finish();});
  }
}
const val=(r,lv)=>{const x=r.lv[lv],e=Math.max(0.05,r.e);return Math.max(Math.pow(x.w,1/e)-1,x.c-1);};
const median=a=>{const s=a.slice().sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2;};
const pct=x=>((x>=0?'+':'')+(x*100).toFixed(1)+'%').padStart(7);
function finish(){
  require('fs').writeFileSync(RAW,JSON.stringify(res));
  const rows=Object.values(res),med={};
  for(let r=0;r<4;r++){const g=rows.filter(x=>x.rar===r);if(g.length)med[r]={low:median(g.map(x=>val(x,LOW))),high:median(g.map(x=>val(x,HIGH))),n:g.length};}
  console.log(`== tattoo report card · Lv${LOW} and Lv${HIGH} alone in a slot vs none · 9 cases, ${process.env.SIM_N||3} runs each · ${((Date.now()-t0)/60000).toFixed(1)} min`);
  console.log('value = extra budget it is worth (x) · depth grows ~x'+(rows.reduce((a,r)=>a+r.e,0)/rows.length).toFixed(2)+' per budget x (e) · columns: depth gain, coins/h gain, value (Lv'+LOW+' | Lv'+HIGH+')');
  const alarms=[];
  for(let r=0;r<4;r++){
    if(!med[r])continue;
    console.log(`\n${RAR[r]} (${med[r].n}) median value Lv${LOW} ${pct(med[r].low)} · Lv${HIGH} ${pct(med[r].high)}`);
    for(const x of rows.filter(y=>y.rar===r).sort((a,b)=>val(b,HIGH)-val(a,HIGH))){
      const l=x.lv[LOW],h=x.lv[HIGH],vl=val(x,LOW),vh=val(x,HIGH),flags=[];
      if(vh<ALARM.dead)flags.push('DEAD');
      else if(vl<ALARM.dead)flags.push('LATE');
      if(med[r].n>=3&&vh>=ALARM.dead&&vh<med[r].high*ALARM.weak)flags.push('WEAK');
      if(med[r].n>=3&&vh>med[r].high*ALARM.strong&&vh>ALARM.strongMin)flags.push('STRONG');
      if(flags.length)alarms.push(x.id+' '+flags.join('+'));
      console.log(x.id.padEnd(12)+`${pct(l.w-1)}${pct(l.c-1)}${pct(vl)} |${pct(h.w-1)}${pct(h.c-1)}${pct(vh)}  ${flags.join(' ')}`);
    }
  }
  for(let r=1;r<4;r++)if(med[r]&&med[r-1]&&med[r].high<med[r-1].high){const m=`RARITY ${RAR[r]} median ${pct(med[r].high).trim()} is below ${RAR[r-1]} ${pct(med[r-1].high).trim()}`;alarms.push(m);}
  console.log('\nALARMS: '+(alarms.length?'\n  '+alarms.join('\n  '):'none'));
}
if(process.env.SIM_CARD_RAW){res=JSON.parse(require('fs').readFileSync(process.env.SIM_CARD_RAW,'utf8'));finish();}else next();
