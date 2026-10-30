// Before/after compare + wall scanner (cetvel duzeltme 4b-2: the tools for the game review B6).
//   node tools/sim-diff.js pace before=<v> [after=<v>] [hours=168] [builds=a,b…]           (npm run diff -- before=HEAD)
//   node tools/sim-diff.js wall [before=<v>] [after=<v>] [days=30] [builds=…] [types=…]     (npm run wall, npm run wall -- before=HEAD)
// <v> = a game file, or a git version (HEAD, HEAD~2, a commit id: its src/index.src.html); after defaults to the working copy.
// Both sides run with the SAME seeds (SIM_REPS, default 3), so a change is read per seed (paired): mean change ± half-range of the
// per-seed changes. `*` = real: every seed moved the same way and by more than the noise (and 2+ waves / 1+ day). Other SIM_* settings
// pass through to both sides (SIM_ECON=1, SIM_MODE=burst, SIM_TLV…).
//   pace: effective wave after 42/84/168/336 h (up to hours) per build, the pace check's builds (tools/sim-pace.js).
//   wall: player types on the calendar (tools/sim-types.js): day Tier 2 opens, the Tier 1 wall (longest stretch of days without a
//         higher effective wave while still in Tier 1), the longest wall of the whole stretch, effective wave on the last day.
//         Quick question it answers: did a change shorten the Tier 1 wall (found in A3: days ~4-20, Tier 2 needs wave 30).
const {spawn,execFileSync}=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const ROOT=path.join(__dirname,'..');
const cmd=process.argv[2];
const A=Object.fromEntries(process.argv.slice(3).map(s=>{const i=s.indexOf('=');if(i<0)throw new Error('use name=value: '+s);return [s.slice(0,i),s.slice(i+1)];}));
if(cmd!=='pace'&&cmd!=='wall')throw new Error('usage: node tools/sim-diff.js pace|wall before=<file|git version> [after=…] … (see the top of the file)');
if(cmd==='pace'&&!A.before)throw new Error('pace needs before=<file or git version>, e.g. before=HEAD');
const REPS=+process.env.SIM_REPS||3,WALL=+process.env.SIM_WALL||4;
// a game version → a file the sim can read (SIM_SRC); a git version is written to the temp folder
function gameFile(v){
  if(!v||v==='now')return null;
  if(fs.existsSync(v))return path.resolve(v);
  const f=path.join(os.tmpdir(),'simdiff_'+v.replace(/[^A-Za-z0-9]/g,'_')+'.html');
  fs.writeFileSync(f,execFileSync('git',['show',v+':src/index.src.html'],{cwd:ROOT,maxBuffer:64<<20}));
  return f;}
const SIDES=A.before?[['before',gameFile(A.before)],['after',gameFile(A.after)]]:[['now',gameFile(A.after)]];
const hours=+A.hours||168,days=+A.days||30;
const builds=(A.builds||(cmd==='pace'?'offense,swarm,tank,thornsTank,bruiser,active,control,shatter,chillNoKb,reaper,farm,greedy':'offense,active,tank')).split(',');
const types=(A.types||'short,normal').split(',');
const ROWS=cmd==='pace'?builds.map(b=>[b]):types.flatMap(t=>builds.map(b=>[t,b]));
const res={};   // res[side][row key][seed] = parsed PACE / DAYS line
const jobs=[];for(const [side,file] of SIDES)for(const row of ROWS)for(let s=1;s<=REPS;s++)jobs.push({side,file,row,seed:s});
let running=0,idx=0;const t0=Date.now();
function next(){
  while(running<6&&idx<jobs.length){
    const j=jobs[idx++];running++;
    const env={...process.env,SIM_SEED:String(j.seed)};delete env.SIM_SRC;if(j.file)env.SIM_SRC=j.file;
    if(cmd==='pace')Object.assign(env,{SIM_PACE:'1',SIM_TLV:process.env.SIM_TLV||'5'});else Object.assign(env,{SIM_TYPE:j.row[0],SIM_DAYS:String(days)});
    const p=spawn('node',['tools/sim.js',cmd==='pace'?String(hours):'0',j.row[j.row.length-1]],{cwd:ROOT,env});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const m=out.match(cmd==='pace'?/PACE (.*)/:/DAYS (.*)/);
      if(m)((res[j.side]=res[j.side]||{})[j.row.join('/')]=res[j.side][j.row.join('/')]||{})[j.seed]=JSON.parse(m[1]);
      else console.log(j.side,j.row.join('/'),'seed'+j.seed,'FAILED',out.slice(-300));
      next();if(running===0&&idx>=jobs.length)finish();});
  }
}
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,half=a=>(Math.max(...a)-Math.min(...a))/2;
// one cell: before → after, the paired change and its noise; `*` when every seed agrees and it is bigger than the noise
// (min = the smallest change worth a star: 2 waves, 1 day); null values (never reached) count as the stretch's end + 1
function cell(get,key,min,cap,w){
  if(SIDES.length===1){const v=Object.values(res.now[key]||{}).map(get).map(x=>x==null?cap:x);return (v.length?Math.round(mean(v))+(cap&&v.some(x=>x===cap)?'+':''):'-').padStart(w);}
  const B=res.before[key]||{},F=res.after[key]||{},S=Object.keys(B).filter(s=>F[s]);if(!S.length)return '-'.padStart(w);
  const b=S.map(s=>get(B[s])??cap),f=S.map(s=>get(F[s])??cap),d=S.map((s,i)=>f[i]-b[i]),md=mean(d),nz=half(d);
  const real=S.length>1&&Math.abs(md)>=min&&Math.abs(md)>nz&&(d.every(x=>x>0)||d.every(x=>x<0));
  return `${Math.round(mean(b))}→${Math.round(mean(f))} ${md>=0?'+':''}${md.toFixed(md%1&&Math.abs(md)<10?1:0)}±${nz.toFixed(0)}${real?'*':' '}`.padStart(w);}
// walls from a DAYS log: longest stretch without a higher effective wave (from day 2, day 0 is the empty save); t1 = only while in Tier 1
function walls(d){let all=0,t1=0,n=0,n1=0;
  for(let i=2;i<d.length;i++){const up=d[i].e>d[i-1].e;n=up?0:n+1;all=Math.max(all,n);
    n1=up||d[i-1].t>1?0:n1+1;t1=Math.max(t1,n1);}
  const t2=d.findIndex(x=>x.t>=2);return {t2:t2<0?null:t2,t1,all,end:d[d.length-1].e};}
function finish(){
  const cmp=SIDES.length===2,head=cmp?`before ${A.before} → after ${A.after||'working copy'}`:`game ${A.after||'working copy'}`;
  const note=cmp?`, cells: before→after change±noise (paired seeds), * = every seed moved that way, beyond the noise`:'';
  if(cmd==='pace'){
    const AT=[42,84,168,336].filter(h=>h<=hours);
    console.log(`== pace ${head} · ${hours} h · ${REPS} seeds · effective wave after N hours (mean${note})`);
    console.log('build'.padEnd(11)+AT.map(h=>(h+'h').padStart(cmp?19:7)).join(''));
    for(const [b] of ROWS)console.log(b.padEnd(11)+AT.map(h=>cell(r=>r.at[h],b,2,0,cmp?19:7)).join(''));
    if(cmp){const h=AT[AT.length-1],ch=ROWS.map(([b])=>{const B=res.before[b]||{},F=res.after[b]||{};const S=Object.keys(B).filter(s=>F[s]);
        return S.length?mean(S.map(s=>(F[s].at[h]||0)/(B[s].at[h]||1))):1;});
      console.log(`\nat ${h} h: median change x${ch.slice().sort((a,b)=>a-b)[ch.length>>1].toFixed(3)} · smallest x${Math.min(...ch).toFixed(3)} · biggest x${Math.max(...ch).toFixed(3)}`);}
  }else{
    console.log(`== wall scanner ${head} · ${days} days · ${REPS} seeds (mean${note})`);
    console.log(`T2 day = day Tier 2 opens (${days+1} = not in ${days} days, shown with +) · T1 wall = longest stretch of days with no higher effective wave while in Tier 1 · wall = the same, whole stretch`);
    const w=cmp?18:8;
    console.log('type    build    '+['T2 day','T1 wall','wall',`eff d${days}`].map(s=>s.padStart(w)).join(''));
    const flags=[];
    for(const [t,b] of ROWS){const k=t+'/'+b,W=r=>walls(r.days);
      console.log(t.padEnd(8)+b.padEnd(9)+[cell(r=>W(r).t2,k,1,days+1,w),cell(r=>W(r).t1,k,1,0,w),cell(r=>W(r).all,k,1,0,w),cell(r=>W(r).end,k,2,0,w)].join(''));
      const last=res[SIDES[SIDES.length-1][0]][k]||{},worst=Math.max(0,...Object.values(last).map(r=>W(r).t1));
      if(worst>=WALL)flags.push(`${k}: Tier 1 wall ${worst} days (worst seed${cmp?', after':''})`);}
    console.log('\n'+(flags.length?'WALLS ('+WALL+'+ days, SIM_WALL):\n  '+flags.join('\n  '):`no Tier 1 wall of ${WALL}+ days`));
  }
  console.log(`(${((Date.now()-t0)/60000).toFixed(1)} min)`);
  fs.writeFileSync(path.join(os.tmpdir(),'simdiff_'+cmd+'.json'),JSON.stringify({args:A,res}));
}
next();
