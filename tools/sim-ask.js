// The questions the other reports do not ask (added 2026-11-09 after a review of the sim with Ahmet: "are we asking every question?").
//   node tools/sim-ask.js <question|all> [days=90] [reps=…]      (npm run ask -- combos)
// Every question prints a table and ALARMS at the end. Other SIM_* settings pass through (SIM_SRC=<older game> asks an older game).
//   combos  S1  Is there a mix of tattoos nobody planned that beats every hand-made build? Random 5-tattoo sets (the shop a sensible player
//               picks for them), then the best ones improved one slot at a time, all in the same tier at fixed budgets, the winners measured
//               again with other random numbers. lv=n (default 5): every tattoo at that level. ALARM: a found set 15%+ deeper than the best hand-made build.
//   farm    S2  Does an easier tier pay more coins per hour than the one being climbed? (normal player, every 10 days; played and on AUTO
//               RETRY) ALARM: a lower tier pays 10%+ more (players would farm it: dull, and faster than the pace check thinks).
//   skill   S3  How much does each build lose with a normal-skill player (taps 1.5 s late, bombs up to 0.4 x the radius off) instead of
//               the perfect one every other report uses? ALARM: 15%+ shorter runs.
//   messy   S4  Does a player without a plan fall far behind? switcher (a random style every 14 days) and drifter (random shop, shiniest
//               tattoos) against the planned builds. ALARM: under 70% of the planned median's effective wave.
//   feel    S5  What is a run like at the tier being pushed: minutes, how the player dies (sudden = 80% health to dead in under 5 s), the
//               biggest single hit, which enemies do the damage. ALARM: half the deaths sudden · an enemy type under 2% of the damage
//               taken wherever it appears (it does not matter).
//   luck    S6  How bad is the unluckiest player? 10 seeds (SIM_REPS) per build: median against the worst. ALARM: worst effective wave
//               under 80% of the median, or its first own tattoo 2x later than the median (and after day 21).
//   extras  S7  NEXT RUN boosts (each one, all of them, none: do they pay for themselves?), gems spent on themes (how much slower),
//               gems bought with money (how much faster). ALARM: a boost that makes progress slower · all boosts 10%+ faster (must-buy).
const {spawn}=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const SIM=path.join(__dirname,'sim.js');
const A=Object.fromEntries(process.argv.slice(3).map(s=>{const i=s.indexOf('=');return i<0?[s,'1']:[s.slice(0,i),s.slice(i+1)];}));
const Q=process.argv[2]||'all',DAYS=+A.days||90,TMP=fs.mkdtempSync(path.join(os.tmpdir(),'simask-'));
const {CORE}=require('./sim-health.js'),SM=require(SIM),TATS=SM.TAT_TYPES.map(t=>t.id),HAND=Object.keys(SM.BUILDS).filter(n=>!n.startsWith('__'));
const L=s=>console.log(s),alarms=[],t0=Date.now();
const med=a=>{a=a.filter(x=>x!==undefined&&x!==null&&!isNaN(x)).sort((x,y)=>x-y);return a.length?a[(a.length-1)>>1]:undefined;};   // even count: the worse
const pct=x=>x===undefined||isNaN(x)?'   -':String(Math.round(x*100)).padStart(3)+'%';
const pad=(s,n)=>String(s).padStart(n);

// run jobs (8 at a time), each = sim.js args + env; resolves with the stdout lines that start with a tag
function runAll(jobs){return new Promise(res=>{let i=0,run=0,done=0;if(!jobs.length)return res(jobs);
  const next=()=>{while(run<8&&i<jobs.length){const j=jobs[i++];run++;
    const p=spawn(process.execPath,[SIM,...j.args],{env:{...process.env,...(j.env||{})}});let buf='';p.stdout.on('data',d=>buf+=d);p.stderr.on('data',d=>process.stderr.write(d));
    p.on('close',()=>{run--;done++;j.out=buf.split('\n');process.stderr.write(`\r  ${done}/${jobs.length}   `);if(done===jobs.length){process.stderr.write('\n');res(jobs);}else next();});}};next();});}
const tagged=(jobs,tag)=>jobs.flatMap(j=>j.out.filter(l=>l.startsWith(tag+' ')).map(l=>Object.assign(JSON.parse(l.slice(tag.length+1)),{job:j})));
const cal=(b,seed,env={},days=DAYS)=>({b,seed,args:['0',b],env:{SIM_TYPE:'normal',SIM_DAYS:String(days),SIM_SEED:String(seed),...env}});
const daysOf=j=>tagged([j],'DAYS')[0];

// ── S1 combos ──
async function combos(){
  const LV=A.lv||'5';
  L(`\nS1 COMBOS: random 5-tattoo sets (Lv${LV}, the shop their tattoos call for) against the hand-made builds (Lv${LV}), same tier, same budget`);
  const BUD=(A.budgets||'1e6,1e8,1e10,1e12').split(',').map(Number),RAND=+A.rand||160,TOP=4,NB=40;
  let rs=+(process.env.SIM_SEED||1)*2654435761>>>0||1;const rnd=()=>{rs^=rs<<13;rs^=rs>>>17;rs^=rs<<5;rs>>>=0;return rs/4294967296;};
  const key=t=>t.slice().sort().join(','),file=(n,list)=>{const f=path.join(TMP,n+'.json');fs.writeFileSync(f,JSON.stringify(list));return f;};
  const pick5=()=>{const s=new Set();while(s.size<5)s.add(TATS[Math.floor(rnd()*TATS.length)]);return[...s];};
  const evalSets=async(sets,T,extra={})=>{const jobs=[];for(const B of BUD){const l=sets[B];for(let i=0;i<l.length;i+=12)jobs.push({args:['combo',String(B),String(T[B]),file('c'+B+'_'+i+'_'+Math.random().toString(36).slice(2),l.slice(i,i+12)),LV],env:extra});}
    return tagged(await runAll(jobs),'COMBO');};
  // 1 the tier per budget + the hand-made builds there
  const first=await runAll(BUD.map(B=>({args:['combo',String(B),'auto',file('hand'+B,HAND),LV]})));
  const T={},hand={};for(const x of tagged(first,'TIER'))T[x.B]=x.T;for(const x of tagged(first,'COMBO'))(hand[x.B]=hand[x.B]||[]).push(x);
  // 2 random sets, 3 the best ones improved one slot at a time (two rounds)
  const seen={},all={};for(const B of BUD){seen[B]=new Set(hand[B].map(x=>key(x.tat)));all[B]=[];}
  const add=(B,t,list)=>{const k=key(t);if(seen[B].has(k))return;seen[B].add(k);list[B].push({tat:t});};
  let sets={};for(const B of BUD){sets[B]=[];for(let i=0;i<RAND;i++)add(B,pick5(),sets);}
  for(let round=0;round<3;round++){
    process.stderr.write(round?`  improving, round ${round}\n`:`  ${RAND} random sets per budget\n`);
    for(const x of await evalSets(sets,T))all[x.B].push(x);if(round===2)break;
    sets={};for(const B of BUD){sets[B]=[];const best=all[B].concat(hand[B]).sort((a,b)=>b.w-a.w).slice(0,TOP);
      for(const c of best)for(let n=0;n<NB/TOP*2;n++){const t=c.tat.slice();t[Math.floor(rnd()*5)]=TATS[Math.floor(rnd()*TATS.length)];if(new Set(t).size===5)add(B,t,sets);}}
  }
  // 4 the winners and the best hand-made builds again with other random numbers and more runs (luck in the search inflates winners)
  const fin={};for(const B of BUD){fin[B]=all[B].sort((a,b)=>b.w-a.w).slice(0,5).map(x=>({tat:x.tat}));}
  const hb={};for(const B of BUD){hb[B]=hand[B].slice().sort((a,b)=>b.w-a.w).slice(0,3).map(x=>x.name);}
  const re=await evalSets(Object.fromEntries(BUD.map(B=>[B,[...fin[B],...hb[B]]])),T,{SIM_N:'24',SIM_CSEED:'9191'});
  for(const B of BUD){
    const H=re.filter(x=>x.B===B&&x.name).sort((a,b)=>b.w-a.w),F=re.filter(x=>x.B===B&&!x.name).sort((a,b)=>b.w-a.w),h=H[0];
    L(`\n  budget ${B.toExponential(0)} · Tier ${T[B]} · ${all[B].length} sets tried · best hand-made: ${h.name} ${h.w.toFixed(1)} waves (then ${H.slice(1).map(x=>x.name+' '+x.w.toFixed(1)).join(', ')})`);
    for(const f of F){const r=f.w/h.w;L(`    ${pad((r*100).toFixed(0)+'%',5)}  ${f.w.toFixed(1).padStart(5)} waves  ${f.tat.join(', ')}`);
      if(r>=1.15)alarms.push(`COMBOS Lv${LV} ${B.toExponential(0)}: [${f.tat.join(', ')}] reaches ${f.w.toFixed(1)} waves, ${pct(r-1).trim()} more than the best hand-made build (${h.name} ${h.w.toFixed(1)})`);}
    // which tattoos the top tenth of everything tried is made of (a meta shows as one tattoo in nearly all of them)
    const top=all[B].slice(0,Math.max(5,Math.round(all[B].length/10))),cnt={};for(const x of top)for(const id of x.tat)cnt[id]=(cnt[id]||0)+1;
    L('    in the top tenth: '+Object.entries(cnt).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+Math.round(v/top.length*100)+'%').join(', '));
    const never=TATS.filter(id=>!cnt[id]);if(never.length)L('    never in the top tenth: '+never.join(', '));
    for(const [k,v] of Object.entries(cnt))if(v/top.length>=.9)alarms.push(`COMBOS Lv${LV} ${B.toExponential(0)}: ${k} is in ${Math.round(v/top.length*100)}% of the best tenth of all sets (a must-have)`);}
}

// ── S2 farm ──
async function farm(){
  L(`\nS2 FARM: coins per hour in the tier being climbed against the best tier below it (normal player, every 10 days; played / AUTO RETRY)`);
  const B=(A.builds||'offense,tank,control,bomb,farm').split(','),R=+A.reps||2;
  const jobs=await runAll(B.flatMap(b=>[...Array(R).keys()].map(s=>cal(b,s+1,{SIM_FARMCHECK:'10'}))));
  L('  build      day  tier   played: best lower   AUTO RETRY: best lower');
  for(const b of B){const rows={};
    for(const j of jobs.filter(j=>j.b===b)){const d=daysOf(j);d.days.forEach((x,i)=>{if(!x.fc)return;const ts=Object.keys(x.fc).map(Number),top=Math.max(...ts);
      const lo=k=>{let bt=null;for(const t of ts)if(t<top&&x.fc[t][k]>0&&(!bt||x.fc[t][k]>x.fc[bt][k]))bt=t;return bt?[bt,x.fc[bt][k]/x.fc[top][k]]:null;};
      (rows[i]=rows[i]||[]).push({top,a:lo('a'),f:x.fc[top].f>0?lo('f'):null});});}
    for(const [i,rs] of Object.entries(rows)){const w=k=>rs.map(r=>r[k]).filter(Boolean).sort((p,q)=>q[1]-p[1])[0];const a=w('a'),f=w('f');
      L(`  ${b.padEnd(10)}${pad(i,4)}   T${rs[0].top}    `+(a?`T${a[0]} ${pct(a[1])}`:'   -    ').padEnd(21)+(f?`T${f[0]} ${pct(f[1])}`:'-'));
      if(a&&a[1]>=1.1)alarms.push(`FARM ${b} day ${i}: playing Tier ${a[0]} pays ${pct(a[1]-1).trim()} more coins per hour than climbing Tier ${rs[0].top}`);
      if(f&&f[1]>=1.1)alarms.push(`FARM ${b} day ${i}: AUTO RETRY on Tier ${f[0]} pays ${pct(f[1]-1).trim()} more than on Tier ${rs[0].top} (the sim's AFK player always uses the top tier)`);}}
  L('  (best lower = the best tier below, as a share of the climbing tier\'s coins per hour; worst seed shown = the highest share)');
}

// ── S3 skill ──
async function skill(){
  L('\nS3 SKILL: mean wave with a normal-skill player against the perfect one, the build\'s frontier tier and the one below');
  const B=(A.builds||HAND.join(',')).split(','),rows=tagged(await runAll(B.map(b=>({b,args:['skill',b]}))),'SKILL');
  L('  build        '+['1e6','1e8','1e10','1e12'].map(x=>x.padStart(8)).join(''));
  for(const b of B){let l='  '+b.padEnd(12);for(const bud of [1e6,1e8,1e10,1e12]){const r=rows.filter(x=>x.b===b&&x.B===bud),m=r.length?Math.max(...r.map(x=>x.loss)):undefined;l+=(m===undefined?'-':(m>0?'-':'+')+pct(Math.abs(m)).trim()).padStart(8);
      if(m>=.15)alarms.push(`SKILL ${b} ${bud.toExponential(0)}: a normal-skill player gets ${pct(m).trim()} shorter runs than the perfect one`);}L(l);}
  L('  (biggest loss of the two tiers; the pace and the cards assume the perfect player)');
}

// ── S4 messy ──
async function messy(){
  L('\nS4 MESSY: effective wave of players without a plan against the planned builds (normal player, median of the seeds)');
  const P=(A.builds||'offense,swarm,tank,control,bomb,reaper,farm').split(','),M=['switcher','drifter'],R=+A.reps||3,CK=[14,30,60,DAYS].filter((x,i,a)=>x<=DAYS&&a.indexOf(x)===i);
  const jobs=await runAll([...P,...M].flatMap(b=>[...Array(R).keys()].map(s=>cal(b,s+1))));
  const at=(b,d)=>med(jobs.filter(j=>j.b===b).map(j=>{const D=daysOf(j).days;return D[Math.min(d,D.length-1)].e;}));
  L('  '.padEnd(14)+CK.map(d=>('day '+d).padStart(9)).join(''));
  const pm={};for(const d of CK)pm[d]=med(P.map(b=>at(b,d)));
  for(const b of P)L('  '+b.padEnd(12)+CK.map(d=>pad(at(b,d),9)).join(''));
  L('  '+'planned med'.padEnd(12)+CK.map(d=>pad(pm[d],9)).join(''));
  for(const b of M){L('  '+b.padEnd(12)+CK.map(d=>pad(at(b,d)+' '+pct(at(b,d)/pm[d]).trim(),9)).join(''));
    for(const d of CK)if(at(b,d)/pm[d]<.7)alarms.push(`MESSY ${b} day ${d}: effective wave ${at(b,d)} = ${pct(at(b,d)/pm[d]).trim()} of the planned builds' median ${pm[d]}`);}
}

// ── S5 feel ──
async function feel(){
  L('\nS5 FEEL: a run at the tier being pushed (median of 12 runs): minutes, waves, sudden deaths, biggest hit, top damage sources');
  const B=(A.builds||'offense,swarm,tank,thornsTank,bruiser,bomb,active,control,shatter,reaper,farm').split(','),rows=tagged(await runAll(B.map(b=>({b,args:['feel',b]}))),'FEEL');
  L('  build       budget  tier   min  waves  80%→dead  sudden  big hit   damage taken from');
  const share={},seen={};
  for(const r of rows){L(`  ${r.b.padEnd(10)}${pad(r.B.toExponential(0),7)}  T${String(r.T).padEnd(3)}${pad(r.min,6)}${pad(r.w,7)}${pad(r.s80===null?'-':r.s80+' s',10)}${pad(pct(r.sudden),8)}${pad(pct(r.big),9)}   `+
      Object.entries(r.hurt).slice(0,4).map(([k,v])=>k+' '+pct(v).trim()).join(', '));
    for(const [k,v] of Object.entries(r.hurt)){share[k]=Math.max(share[k]||0,v);seen[k]=1;}
    if(r.sudden>=.5)alarms.push(`FEEL ${r.b} ${r.B.toExponential(0)}: ${pct(r.sudden).trim()} of the deaths go from 80% health to dead in under 5 s (biggest hit ${pct(r.big).trim()} of max health)`);}
  // enemies whose job is not hitting (MENDER heals the others) are left out
  const low=Object.entries(share).filter(([k,v])=>v<.02&&!/burn|pulse/.test(k)&&!(SM.ENEMY_TYPES&&SM.ENEMY_TYPES[k]&&SM.ENEMY_TYPES[k].heal));
  L('  most any build takes from each source: '+Object.entries(share).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+pct(v).trim()).join(', '));
  for(const [k,v] of low)alarms.push(`FEEL: ${k} never does more than ${pct(v).trim()} of the damage a build takes (it does not matter)`);
  // how the deaths came (2026-11-09, D1): one hit = a single hit took half the health or more · flood = 6+ hits from 80% health, none that big
  L('\n  HOW THE DEATHS CAME: one hit (a single hit took 50%+ of max health) · few (2-5 hits from 80%) · flood (6+ hits) · what the falls were made of');
  L('  build       budget  tier  one hit  few  flood  hits  in last 5 s   fall made of');
  for(const r of rows){if(r.one===undefined)continue;const few=Math.max(0,1-r.one-r.flood);
    L(`  ${r.b.padEnd(10)}${pad(r.B.toExponential(0),7)}  T${String(r.T).padEnd(3)}${pad(pct(r.one),8)}${pad(pct(few),5)}${pad(pct(r.flood),7)}${pad(r.hits??'-',6)}${pad(r.n5??'-',13)}   `+
      Object.entries(r.fall||{}).slice(0,4).map(([k,v])=>k+' '+pct(v).trim()).join(', '));}
}

// ── S6 luck ──
async function luck(){
  const B=(A.builds||'offense,swarm,tank,control,bomb,reaper').split(','),R=+process.env.SIM_REPS||10,CK=[30,60,DAYS].filter((x,i,a)=>x<=DAYS&&a.indexOf(x)===i);
  L(`\nS6 LUCK: ${R} seeds per build (normal player): median / worst`);
  const jobs=await runAll(B.flatMap(b=>[...Array(R).keys()].map(s=>cal(b,s+1))));
  const sig=d=>[d.o,Object.values(d.tl||{}).reduce((a,x)=>a+x,0),d.s,d.t,d.st].join();
  L('  build       '+CK.map(d=>('eff day '+d).padStart(13)).join('')+'   Tier 3 day   own tattoo day   longest drought');
  for(const b of B){const S=jobs.filter(j=>j.b===b).map(j=>{const D=daysOf(j).days;let dr=0,run=0;for(let i=1;i<D.length;i++){if(sig(D[i])===sig(D[i-1])){run++;dr=Math.max(dr,run);}else run=0;}
      const f=D.findIndex(d=>(CORE[b]||[]).some(id=>d.tl&&d.tl[id])),t3=D.findIndex(d=>d.t>=3);
      return{e:CK.map(d=>D[Math.min(d,D.length-1)].e),core:f<0?Infinity:f,t3:t3<0?Infinity:t3,dr};});
    const mw=(a,lo)=>{a=a.slice().sort((x,y)=>x-y);return[a[(a.length-1)>>1],lo?a[0]:a[a.length-1]];},fmt=([m,w])=>(m===Infinity?'never':m)+' / '+(w===Infinity?'never':w);
    const e=CK.map((d,i)=>mw(S.map(s=>s.e[i]),true)),c=mw(S.map(s=>s.core)),t=mw(S.map(s=>s.t3)),dr=mw(S.map(s=>s.dr));
    L('  '+b.padEnd(12)+e.map(x=>fmt(x).padStart(13)).join('')+fmt(t).padStart(13)+fmt(c).padStart(17)+fmt(dr).padStart(18));
    CK.forEach((d,i)=>{if(e[i][1]<e[i][0]*.8)alarms.push(`LUCK ${b} day ${d}: the unluckiest seed is at ${e[i][1]}, ${pct(e[i][1]/e[i][0]).trim()} of the median ${e[i][0]}`);});
    if(c[1]>21&&c[1]>=2*c[0])alarms.push(`LUCK ${b}: the unluckiest seed gets its own tattoo on day ${c[1]===Infinity?'never':c[1]} (median ${c[0]===Infinity?"never":c[0]})`);}
}

// ── S7 extras ──
async function extras(){
  const D=+A.xdays||60,CK=[14,30,D],B=(A.builds||'offense,tank,swarm').split(','),R=+A.reps||2;
  const BO=['lucky','power','berserk','rapid','shield','invincible','focus'];
  const V0=[['none',{}],...BO.map(b=>[b,{SIM_BOOST:b}]),['all boosts',{SIM_BOOST:'all'}],['2 themes',{SIM_THEMES:'2'}],['all themes',{SIM_THEMES:'99'}],
    ['starter pack',{SIM_PAID:'1:300'}],['spender',{SIM_PAID:'1:300,7:1200,14:1200,30:1200,45:1200'}]];
  const V=A.only==='boosts'?V0.filter(([n])=>n==='none'||BO.includes(n)||n==='all boosts'):V0;   // only=boosts: the boosts alone (to re-measure with more seeds)
  L(`\nS7 EXTRAS: effective wave against a player who uses none of them (normal player, ${D} days, median of ${B.length} builds x ${R} seeds)`);
  const jobs=await runAll(V.flatMap(([n,env])=>B.flatMap(b=>[...Array(R).keys()].map(s=>Object.assign(cal(b,s+1,env,D),{v:n})))));
  const eff=(v,d)=>{const r=[];for(const b of B)for(let s=1;s<=R;s++){const j=jobs.find(j=>j.v===v&&j.b===b&&j.seed===s),j0=jobs.find(j=>j.v==='none'&&j.b===b&&j.seed===s);
    const x=daysOf(j).days,y=daysOf(j0).days;r.push(x[Math.min(d,x.length-1)].e/y[Math.min(d,y.length-1)].e);}return med(r);};
  L('  '.padEnd(16)+CK.map(d=>('day '+d).padStart(9)).join(''));
  for(const [n] of V.slice(1)){const r=CK.map(d=>eff(n,d));L('  '+n.padEnd(14)+r.map(x=>pad((x>=1?'+':'')+((x-1)*100).toFixed(0)+'%',9)).join(''));
    if(BO.includes(n)&&r[r.length-1]<.95)alarms.push(`EXTRAS boost ${n}: progress ${((r[r.length-1]-1)*100).toFixed(0)}% by day ${D} (it costs more than it gives)`);
    if(n==='all boosts'&&r[r.length-1]>=1.1)alarms.push(`EXTRAS: buying every boost before every run is ${((r[r.length-1]-1)*100).toFixed(0)}% faster by day ${D} (a must-buy)`);}
  L('  (boosts: bought before every run when the coins are there · themes: the cheapest first, as soon as the gems are there ·');
  L('   starter pack: 300 gems on day 1 · spender: + 1200 gems on days 7, 14, 30, 45)');
}

const Qs={combos,farm,skill,messy,feel,luck,extras};
(async()=>{
  const list=Q==='all'?Object.keys(Qs):Q.split(',');for(const q of list)if(!Qs[q])throw new Error('unknown question '+q+' (one of '+Object.keys(Qs).join(', ')+', all)');
  L(`== SIM QUESTIONS · ${list.join(', ')}${process.env.SIM_SRC?' · game '+process.env.SIM_SRC:''}`);
  for(const q of list)await Qs[q]();
  L('\n== ALARMS ('+alarms.length+')');for(const a of alarms)L('  ! '+a);
  L(`(${((Date.now()-t0)/60000).toFixed(1)} min)`);
  fs.rmSync(TMP,{recursive:true,force:true});
})();
