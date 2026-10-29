// Balance check: speed of every sim build, run in parallel (6 at a time).
//   node tools/sim-pace.js <label> [hours=336] [build,build…]    (SIM_TLV=5 tattoo level, SIM_SRC=<older game file> to compare)
//   SIM_ECON=1: every build starts from a new save and earns its gems, slots and tattoos (see sim.js); SIM_TLV is ignored then.
//   SIM_REPS=n (default 3): each build runs n times with a different seed; prints mean ± half-range at 168h instead of one lucky/unlucky run.
// Prints the effective wave each build reaches after 42/84/168/336 hours and the hours to wave 100 / 200 / 300, plus the
// min / median / max / max÷min at 168h. A healthy spread is about x1.7; the old game was x2.65.
const {spawn}=require('child_process');
const label=process.argv[2],hours=process.argv[3]||'336';
const builds=(process.argv[4]||'offense,swarm,tank,thornsTank,bruiser,active,control,shatter,chillNoKb,reaper,farm,greedy').split(',');
const REPS=+process.env.SIM_REPS||3;
const res={};   // res[build] = array of REPS per-seed PACE results
let running=0,jobs=[];for(const b of builds)for(let s=1;s<=REPS;s++)jobs.push([b,s]);
let idx=0;
function next(){
  while(running<6&&idx<jobs.length){
    const [b,seed]=jobs[idx++];running++;
    const p=spawn('node',['tools/sim.js',hours,b],{cwd:require('path').join(__dirname,'..'),env:{...process.env,SIM_PACE:'1',SIM_TLV:process.env.SIM_TLV||'5',SIM_SEED:String(seed)}});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const m=out.match(/PACE (.*)/);
      if(m){(res[b]=res[b]||[]).push(JSON.parse(m[1]));}else console.log(b,'seed'+seed,'FAILED',out.slice(-200));
      next();if(running===0&&idx>=jobs.length)finish();});
  }
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const halfRange=a=>(Math.max(...a)-Math.min(...a))/2;
function finish(){
  const AT=[42,84,168,336];
  console.log('== '+label+': effective wave after N hours, mean of '+REPS+' seeds ±half-range ('+(process.env.SIM_ECON==='1'?'economy: tattoos earned':'tattoos Lv'+(process.env.SIM_TLV||5))+') | hours to w100 / w200 / w300');
  console.log('build'.padEnd(10)+AT.map(h=>(h+'h').padStart(10)).join('')+'   w100h   w200h   w300h');
  const vals=[],spreads=[];
  for(const b of builds){const runs=res[b];if(!runs||!runs.length){console.log(b,'NO DATA');continue;}
    const atStr=AT.map(h=>{const a=runs.map(r=>r.at[h]).filter(x=>x!==undefined);if(!a.length)return '-'.padStart(10);
      return (Math.round(mean(a))+'±'+halfRange(a).toFixed(0)).padStart(10);}).join('');
    const hitStr=[100,200,300].map(w=>{const a=runs.map(r=>r.hit[w]).filter(x=>x!==undefined);return a.length?String((mean(a)).toFixed(1)).padStart(8):'-'.padStart(8);}).join('');
    console.log(b.padEnd(10)+atStr+hitStr);
    const a168=runs.map(r=>r.at[168]||0);
    vals.push(mean(a168));spreads.push(halfRange(a168));
  }
  const mx=Math.max(...vals),mn=Math.min(...vals),md=vals.slice().sort((a,b)=>a-b)[Math.floor(vals.length/2)];
  console.log('eff@168h: min '+mn.toFixed(0)+' median '+md.toFixed(0)+' max '+mx.toFixed(0)+'  (max/min x'+(mx/mn).toFixed(2)+')'
    +'  typical per-build seed noise ±'+mean(spreads).toFixed(1)+' waves');
  require('fs').writeFileSync(require('path').join(require('os').tmpdir(),'pace_'+label+'.json'),JSON.stringify(res));
}
next();
