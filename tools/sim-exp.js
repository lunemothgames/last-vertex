// What-if runner: several variants x builds in parallel (8 at a time), without editing the game.
//   node tools/sim-exp.js <hours> <build,build…> '[{"name":"A","TT":{...},"PU":{...},"ECO":{...},"ENEMY":{...},"EVT":{...},"BUILD":{...},"SHOP":"swarm"}]'
// TT = tattoo values, PU = shop upgrades, ECO = economy constants, ENEMY = enemy types, EVT = wave events, BUILD = replace a sim build.
// was: node exp.js <hours> <builds,comma> '<json array>'
// runs every (variant x build) in parallel (8 at a time) with SIM_PACE and prints eff wave at 42/84/168h per variant
const {spawn}=require('child_process');
const hours=process.argv[2],builds=process.argv[3].split(','),variants=JSON.parse(process.argv[4]);
const jobs=[];for(const v of variants)for(const b of builds)jobs.push({v,b});
const out={};let running=0,idx=0;
function next(){
  while(running<8&&idx<jobs.length){
    const {v,b}=jobs[idx++];running++;
    const env={...process.env,SIM_PACE:'1',SIM_TLV:v.TLV||process.env.SIM_TLV||'5'};
    if(v.BUILD)env.SIM_BUILD=JSON.stringify(v.BUILD);if(v.EVT)env.SIM_EVT=JSON.stringify(v.EVT);if(v.TT)env.SIM_TT=JSON.stringify(v.TT);if(v.ENEMY)env.SIM_ENEMY=JSON.stringify(v.ENEMY);if(v.ECO)env.SIM_ECO=JSON.stringify(v.ECO);if(v.PU)env.SIM_PU=JSON.stringify(v.PU);
    if(v.SHOP)env.SIM_SHOP=v.SHOP;
    const p=spawn('node',['tools/sim.js',hours,b],{cwd:require('path').join(__dirname,'..'),env});
    let s='';p.stdout.on('data',d=>s+=d);p.stderr.on('data',d=>s+=d);
    p.on('close',()=>{running--;const m=s.match(/PACE (.*)/);(out[v.name]=out[v.name]||{})[b]=m?JSON.parse(m[1]):null;next();if(running===0&&idx>=jobs.length)finish();});
  }
}
function finish(){
  const AT=[42,84,168];
  const w=Math.max(14,...variants.map(v=>v.name.length+1));
  console.log('build'.padEnd(11)+variants.map(v=>v.name.padEnd(w)).join('')+'  (eff wave @42/84/168h)');
  const col={};
  for(const b of builds){
    console.log(b.padEnd(11)+variants.map(v=>{const r=out[v.name][b];return(r?AT.map(h=>r.at[h]!==undefined?r.at[h]:'-').join('/'):'FAIL').padEnd(w);}).join(''));
  }
  console.log('--- @168h: min / median / max / max÷min');
  console.log(''.padEnd(11)+variants.map(v=>{
    const a=builds.map(b=>out[v.name][b]&&out[v.name][b].at[168]).filter(x=>x!==undefined&&x!==null).sort((x,y)=>x-y);
    if(!a.length)return 'n/a'.padEnd(w);
    return (a[0]+'/'+a[Math.floor(a.length/2)]+'/'+a[a.length-1]+' x'+(a[a.length-1]/a[0]).toFixed(2)).padEnd(w);}).join(''));
}
next();
