// Player types side by side on a real calendar (overhaul step A3): every type plays the same builds for N days from a new save.
//   node tools/sim-types.js [days=90] [build,build…] [type,type…]      (npm run types -- 90 offense,active)
//   SIM_REPS=n (default 3): seeds per type and build; the table shows the mean, walls are the worst seed.
// Types (tools/sim.js PTYPES, agreed with Ahmet 2026-10-30, placeholders until real data): short 15 min a day, 1 ad, no AUTO RETRY ·
// normal 45 min, 4 ads, 1 h AUTO RETRY · keen 2 h, 10 ads, 3 h AUTO RETRY · afk 20 min, 2 ads, 6 h AUTO RETRY.
// Balance aims at normal; the others only check that nobody is stuck for days and nobody finishes the content in a week.
// A "wall" is a stretch of days in which the effective wave does not go up at all.
const {spawn}=require('child_process'),path=require('path');
const days=+process.argv[2]||90;
const builds=(process.argv[3]||'offense,active,tank').split(',');
const types=(process.argv[4]||'short,normal,keen,afk').split(',');
const REPS=+process.env.SIM_REPS||3,WALL=+process.env.SIM_WALL||4;   // SIM_WALL: walls this long or longer are flagged
const AT=[1,3,7,14,30,60,90,180].filter(d=>d<=days);
const res={};let running=0,idx=0;const jobs=[];
for(const t of types)for(const b of builds)for(let s=1;s<=REPS;s++)jobs.push([t,b,s]);
const t0=Date.now();
function next(){
  while(running<6&&idx<jobs.length){
    const [t,b,seed]=jobs[idx++];running++;
    const p=spawn('node',['tools/sim.js','0',b],{cwd:path.join(__dirname,'..'),env:{...process.env,SIM_TYPE:t,SIM_DAYS:String(days),SIM_SEED:String(seed)}});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const m=out.match(/DAYS (.*)/);
      if(m)((res[t]=res[t]||{})[b]=res[t][b]||[]).push(JSON.parse(m[1]));else console.log(t,b,'seed'+seed,'FAILED',out.slice(-300));
      next();if(running===0&&idx>=jobs.length)finish();});
  }
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
// longest stretch of days with no rise in effective wave (ignores day 0, the empty save): [length, first day]
const wall=d=>{let best=[0,0],n=0;for(let i=2;i<d.length;i++){if(d[i].e>d[i-1].e)n=0;else if(++n>best[0])best=[n,i-n];}return best;};
// first day a value reaches a goal
const firstDay=(d,f)=>{const i=d.findIndex(f);return i<0?'-':String(i);};
function finish(){
  console.log(`== player types, ${days} days, ${REPS} seeds (mean; wall = longest stretch of days without a higher effective wave, worst seed)`);
  console.log('type   build    '+AT.map(d=>('d'+d).padStart(6)).join('')+'   tier@7 tier@30 tier@end  slots@30 tat@end  gems/day  play h  wall');
  const flags=[];
  for(const t of types)for(const b of builds){const R=(res[t]||{})[b];if(!R||!R.length){console.log(t,b,'NO DATA');continue;}
    const at=d=>Math.round(mean(R.map(r=>(r.days[d]||r.days[r.days.length-1]).e)));
    const f=(d,k)=>mean(R.map(r=>(r.days[Math.min(d,r.days.length-1)])[k]));
    const W=R.map(r=>wall(r.days)).sort((a,b)=>b[0]-a[0])[0];
    console.log(t.padEnd(7)+b.padEnd(9)+AT.map(d=>String(at(d)).padStart(6)).join('')+
      f(7,'t').toFixed(1).padStart(9)+f(30,'t').toFixed(1).padStart(8)+f(days,'t').toFixed(1).padStart(9)+
      f(30,'s').toFixed(1).padStart(10)+f(days,'o').toFixed(1).padStart(8)+(f(days,'g')/days).toFixed(1).padStart(10)+
      mean(R.map(r=>r.playH)).toFixed(0).padStart(8)+`  ${W[0]}d from day ${W[1]}`);
    if(W[0]>=WALL)flags.push(`${t}/${b}: stuck ${W[0]} days from day ${W[1]} (eff ${R.map(r=>r.days[W[1]]&&r.days[W[1]].e).join('/')})`);
  }
  // when the content is used up: day all tattoos are found, day all slots are bought, day of the last tier
  console.log('\n-- content: first day (luckiest seed) all tattoos owned / all slots / tier 10 / tier 20');
  for(const t of types)for(const b of builds){const R=(res[t]||{})[b];if(!R)continue;
    const early=f=>{const v=R.map(r=>firstDay(r.days,f));return v.includes('-')?'-':String(Math.min(...v.map(Number)));};
    console.log(t.padEnd(7)+b.padEnd(9)+[early(x=>x.o>=R[0].tatTotal),early(x=>x.s>=R[0].maxSlots),early(x=>x.t>=10),early(x=>x.t>=20)].map(x=>x.padStart(6)).join(''));
    if(R.some(r=>r.days.length>7&&r.days[7].o>=r.tatTotal))flags.push(`${t}/${b}: owns every tattoo within a week`);
  }
  console.log('\n'+(flags.length?'FLAGS:\n  '+flags.join('\n  '):'no flags (no wall of '+WALL+'+ days, nobody owns everything in a week)'));
  console.log(`(${((Date.now()-t0)/1000).toFixed(0)} s)`);
  require('fs').writeFileSync(path.join(require('os').tmpdir(),'types_'+days+'.json'),JSON.stringify(res));
}
next();
