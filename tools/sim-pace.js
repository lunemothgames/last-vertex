// Balance check: speed of every sim build, run in parallel (6 at a time).
//   node tools/sim-pace.js <label> [hours=336] [build,build…]    (SIM_TLV=5 tattoo level, SIM_SRC=<older game file> to compare)
// Prints the effective wave each build reaches after 42/84/168/336 hours and the hours to wave 100 / 200, plus the
// min / median / max / max÷min at 168h. A healthy spread is about x1.7; the old game was x2.65.
// was: node pace.js <label> [hours=336] [builds,comma] : effective wave reached after 42/84/168/336h + hours to w100/w200, per build in parallel
const {spawn}=require('child_process');
const label=process.argv[2],hours=process.argv[3]||'336';
const builds=(process.argv[4]||'offense,swarm,tank,thornsTank,bruiser,active,control,shatter,chillNoKb,reaper,farm,greedy').split(',');
const res={};let running=0,idx=0;
function next(){
  while(running<6&&idx<builds.length){
    const b=builds[idx++];running++;
    const p=spawn('node',['tools/sim.js',hours,b],{cwd:require('path').join(__dirname,'..'),env:{...process.env,SIM_PACE:'1',SIM_TLV:process.env.SIM_TLV||'5'}});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const m=out.match(/PACE (.*)/);if(m)res[b]=JSON.parse(m[1]);else console.log(b,'FAILED',out.slice(-200));next();if(running===0&&idx>=builds.length)finish();});
  }
}
function finish(){
  const AT=[42,84,168,336];
  console.log('== '+label+': effective wave after N hours (tattoos Lv'+(process.env.SIM_TLV||5)+') | hours to w100 / w200');
  console.log('build'.padEnd(10)+AT.map(h=>(h+'h').padStart(6)).join('')+'   w100h   w200h');
  const vals=[];
  for(const b of builds){const r=res[b];if(!r)continue;
    console.log(b.padEnd(10)+AT.map(h=>String(r.at[h]!==undefined?r.at[h]:'-').padStart(6)).join('')+String(r.hit[100]!==undefined?r.hit[100]:'-').padStart(8)+String(r.hit[200]!==undefined?r.hit[200]:'-').padStart(8));
    vals.push(r.at[168]||0);}
  const mx=Math.max(...vals),mn=Math.min(...vals),md=vals.slice().sort((a,b)=>a-b)[Math.floor(vals.length/2)];
  console.log('eff@168h: min '+mn+' median '+md+' max '+mx+'  (max/min x'+(mx/mn).toFixed(2)+')');
  require('fs').writeFileSync(require('path').join(require('os').tmpdir(),'pace_'+label+'.json'),JSON.stringify(res));
}
next();
