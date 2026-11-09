// Home card: every tattoo's worth inside its own build (tools/sim.js homecard), all builds in parallel, one table.
//   node tools/sim-home.js [builds=all] [lv=5]     SIM_N runs per case (12), SIM_BUDGETS (1e6,1e8,1e10,1e12)
// Cell = share of waves lost without that tattoo (mean of the frontier tier and the one below, every budget). A tattoo the build never
// misses (under 2%, "-") does nothing for that build: either it is dead or something else already covers its job.
const {spawn}=require('child_process'),path=require('path');
const ROOT=path.join(__dirname,'..'),src=require('fs').readFileSync(process.env.SIM_SRC||path.join(ROOT,'src','index.src.html'),'utf8');
const all='offense,swarm,tank,thornsTank,bruiser,bomb,goo,virus,active,control,shatter,chillNoKb,reaper,farm,greedy';
const builds=(process.argv[2]&&process.argv[2]!=='all'?process.argv[2]:all).split(','),LV=process.argv[3]||'5',t0=Date.now();
const rows={};let run=0,i=0;
function next(){while(run<6&&i<builds.length){const b=builds[i++];run++;
  const p=spawn('node',[path.join(__dirname,'sim.js'),'homecard',b,LV],{cwd:ROOT,env:process.env});let out='';
  p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
  p.on('close',()=>{run--;rows[b]=[...out.matchAll(/HOME (.*)/g)].map(m=>JSON.parse(m[1]));if(!rows[b].length)console.log(b,'FAILED',out.slice(-300));
    if(run===0&&i>=builds.length)finish();else next();});}}
function finish(){
  console.log(`== home card · each tattoo taken out of its own build (Lv${LV}) · share of waves lost, mean over budgets x (frontier tier, one below) · ${((Date.now()-t0)/60000).toFixed(1)} min`);
  for(const b of builds){const R=rows[b]||[];if(!R.length)continue;const ids=Object.keys(R[0].loss),avg={};
    for(const id of ids)avg[id]=R.reduce((a,r)=>a+r.loss[id],0)/R.length;
    console.log(b.padEnd(11)+ids.map(id=>(id+' '+(avg[id]<.02?'-':(avg[id]*100).toFixed(0)+'%')).padEnd(22)).join(''));
    console.log(''.padEnd(11)+R.map(r=>`${(+r.B).toExponential(0)} T${r.tier} ${r.full}w`).join(' · '));}
}
next();
