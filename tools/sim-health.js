// Health report: the questions the pace / wall checks do not ask (added 2026-11-08, after the sim missed that most builds could not get
// their own tattoos for months, and before that that the shop SLOW pair was a cheap must-buy the sim's builds never bought).
//   node tools/sim-health.js [days=90] [builds=…] [type=normal]      (npm run health)      SIM_REPS=3 seeds per build, SIM_N runs per fixed case
//   Other SIM_* settings pass through (SIM_SRC=<older game file> grades an older game).
// The questions, each with an alarm:
//   1 IDENTITY  Can a player who wants a style actually play it, and is the style doing the work? For every build on the calendar
//               (player type `type`, from a new save): the day its own (CORE) tattoos are first owned / all owned, and the share of
//               damage that comes from its own mechanics (IDSRC) over the week before day 14 / 30 / 60 / the end.
//               ALARM: first CORE tattoo after day 21 · own share at the end under 15% (the build plays as something else).
//   2 CARRY     Does one damage source carry every build? Top source per build at the end. ALARM: the same one is top in 2/3 of the
//               builds with 35%+ (a meta).
//   3 DROUGHT   How long does a player go with nothing new (no new tattoo, tattoo level, slot, tier or mastery star)?
//               ALARM: 7+ days in a row.
//   4 DEAD      Tattoos that no build ever puts on (owned but never worth a slot). ALARM: owned by some build, equipped by none.
//   5 TRAP      Does a new player who leans into one style's shop upgrades fall far behind? (tools/sim.js trap) ALARM: under 70%.
//   6 MUST-BUY  Is there a cheap capped shop upgrade everyone needs late? (tools/sim.js mustbuy: everything bought, one taken back)
//               ALARM (sim blind spot): costs under 1% of the budget, runs 10%+ shorter without it, and some sim build never buys it
//               even late (the sim then underrates that build, like the SLOW pair before 0.7.3 and BOSS HUNTER before sim.js ALLCAP).
//               Without a blind spot it is only listed.
// Reading it (first run 2026-11-08, 0.7.4): "median" of an even number of seeds is the worse one. IDENTITY share is a damage share,
// so styles whose worth is not damage (control: slowing, reaper: the kill itself) read low by nature; compare them over time, not to 15%.
const {spawn}=require('child_process'),path=require('path');
const SIM=path.join(__dirname,'sim.js');
const A=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');return i<0?[s,'1']:[s.slice(0,i),s.slice(i+1)];}));
const DAYS=+A.days||90,TYPE=A.type||'normal',REPS=+process.env.SIM_REPS||3;
const BUILDS=(A.builds||'offense,swarm,tank,thornsTank,bruiser,bomb,goo,virus,active,control,shatter,chillNoKb,reaper,farm,greedy').split(',');
// a build's own tattoos, and the damage sources that are its style (tools/sim.js TOT.by keys); null = an economy build (no damage style)
const CORE={offense:['crit_chance','crit_mult'],swarm:['twin','arc','ricochet'],tank:['thorns','aegis'],thornsTank:['thorns'],bruiser:['thorns','shockwave'],
  bomb:['logic_bomb'],goo:['goo_bomb'],virus:['virus_bomb'],active:['nova','overdrive'],control:['frost'],shatter:['frost','shatter'],chillNoKb:['frost'],
  reaper:['reaper'],farm:['coin_mult','midas'],greedy:['midas','twin']};
const IDSRC={offense:['crit','crit_mult'],swarm:['twin','arc','bounce','lance'],tank:['thorns','aegis'],thornsTank:['thorns','aegis'],bruiser:['thorns','shockwave','mend'],
  bomb:['logic_bomb'],goo:['goo_bomb'],virus:['virus_bomb'],active:['nova','overdrive','mend'],control:['chill'],shatter:['shatter','chill'],chillNoKb:['chill'],
  reaper:['reaper'],farm:null,greedy:['twin','arc','bounce','lance']};

const jobs=[];
for(const b of BUILDS)for(let s=1;s<=REPS;s++)jobs.push({kind:'cal',b,seed:s,args:[SIM,'0',b],env:{SIM_TYPE:TYPE,SIM_DAYS:String(DAYS),SIM_SEED:String(s)}});
jobs.push({kind:'trap',args:[SIM,'trap'],env:{}});
jobs.push({kind:'mustbuy',args:[SIM,'mustbuy','1e10,1e12'],env:{}});
const out={cal:{},trap:[],mustbuy:[]};let running=0,idx=0,done=0;const t0=Date.now();
function next(){
  while(running<6&&idx<jobs.length){const j=jobs[idx++];running++;
    const p=spawn(process.execPath,j.args,{env:{...process.env,...j.env}});let buf='';p.stdout.on('data',d=>buf+=d);p.stderr.on('data',d=>process.stderr.write(d));
    p.on('close',()=>{running--;done++;
      for(const l of buf.split('\n')){
        if(j.kind==='cal'&&l.startsWith('DAYS '))(out.cal[j.b]=out.cal[j.b]||[]).push(JSON.parse(l.slice(5)));
        if(l.startsWith('TRAP '))out.trap.push(JSON.parse(l.slice(5)));
        if(l.startsWith('MUSTBUY '))out.mustbuy.push(JSON.parse(l.slice(8)));}
      process.stderr.write(`\r${done}/${jobs.length} done  `);
      if(done===jobs.length)report();else next();});}
}
next();

const med=a=>{a=a.filter(x=>x!==undefined&&x!==null).sort((x,y)=>x-y);return a.length?a[a.length>>1]:undefined;};
const pct=x=>x===undefined||isNaN(x)?'  -':String(Math.round(x*100)).padStart(3)+'%';
const dayStr=d=>d===undefined?'  never':String(d).padStart(4)+'   ';
function report(){
  process.stderr.write('\n');const alarms=[];
  const L=s=>console.log(s);
  L(`== HEALTH REPORT · ${TYPE} player · ${DAYS} days · ${REPS} seeds per build${process.env.SIM_SRC?' · game '+process.env.SIM_SRC:''}`);
  // ── 1 IDENTITY ──
  L('\n1 IDENTITY: day the build\'s own tattoos are first owned / all owned, first equipped; share of damage from its own style (week before the day)');
  L('build        first   all   equip    d14  d30  d60  end   end tier');
  const win=(days,d,keys)=>{let own=0,all=0;for(let i=Math.max(0,d-7);i<Math.min(days.length,d);i++){const by=days[i].by||{};for(const k in by){all+=by[k];if(keys&&keys.includes(k))own+=by[k];}}return all?own/all:undefined;};
  const topEnd={},equippedEver={},ownedEver={};
  for(const b of BUILDS){const runs=out.cal[b]||[];if(!runs.length){L(b.padEnd(12)+' (no data)');continue;}
    const core=CORE[b]||[],keys=IDSRC[b];
    const first=[],all=[],eq=[],sh={14:[],30:[],60:[],end:[]},tiers=[];
    for(const r of runs){const D=r.days;
      first.push(D.findIndex(d=>core.some(id=>d.tl&&d.tl[id])));all.push(D.findIndex(d=>core.every(id=>d.tl&&d.tl[id])));eq.push(D.findIndex(d=>core.some(id=>(d.eq||[]).includes(id))));
      for(const k of [14,30,60])sh[k].push(k<=D.length&&keys?win(D,k,keys):undefined);sh.end.push(keys?win(D,D.length,keys):undefined);
      tiers.push(D[D.length-1].t);
      for(const d of D){for(const id of d.eq||[])equippedEver[id]=(equippedEver[id]||new Set()).add(b);for(const id in d.tl||{})ownedEver[id]=(ownedEver[id]||new Set()).add(b);}
      const by={};for(let i=Math.max(0,D.length-7);i<D.length;i++)for(const k in D[i].by||{})by[k]=(by[k]||0)+D[i].by[k];
      const tot=Object.values(by).reduce((a,x)=>a+x,0),top=Object.entries(by).sort((x,y)=>y[1]-x[1])[0];if(top)(topEnd[b]=topEnd[b]||[]).push([top[0],top[1]/tot]);}
    const fx=a=>med(a.map(x=>x<0?Infinity:x)),f=fx(first),al=fx(all),e=fx(eq);
    const s=k=>keys?med(sh[k]):undefined;
    L(b.padEnd(12)+dayStr(f===Infinity?undefined:f)+dayStr(al===Infinity?undefined:al).slice(1)+dayStr(e===Infinity?undefined:e).slice(1)+'  '+[14,30,60,'end'].map(k=>pct(s(k))).join(' ')+'   T'+med(tiers));
    if(f===Infinity||f>21)alarms.push(`IDENTITY ${b}: its own tattoo (${core.join('/')}) first owned ${f===Infinity?'never in '+DAYS+' days':'on day '+f} (alarm: after day 21)`);
    if(keys&&s('end')!==undefined&&s('end')<.15)alarms.push(`IDENTITY ${b}: only ${pct(s('end')).trim()} of its damage comes from its style at the end (alarm: under 15%)`);
  }
  // ── 2 CARRY ──
  L('\n2 CARRY: the biggest damage source of each build over the last week');
  const cnt={};for(const b in topEnd){const t=topEnd[b][0];L('  '+b.padEnd(12)+t[0].padEnd(11)+pct(t[1]));if(t[1]>=.35)cnt[t[0]]=(cnt[t[0]]||0)+1;}
  for(const [k,n] of Object.entries(cnt))if(n>=Object.keys(topEnd).length*2/3)alarms.push(`CARRY: '${k}' is the biggest damage source (35%+) in ${n} of ${Object.keys(topEnd).length} builds`);
  // ── 3 DROUGHT ──
  L('\n3 DROUGHT: longest stretch of days with nothing new (new tattoo, tattoo level, slot, tier, mastery star); worst seed');
  for(const b of BUILDS){const runs=out.cal[b]||[];let worst=0,at=0;
    for(const r of runs){const D=r.days,sig=d=>[d.o,Object.values(d.tl||{}).reduce((a,x)=>a+x,0),d.s,d.t,d.st].join();let run=0;
      for(let i=1;i<D.length;i++){if(sig(D[i])===sig(D[i-1])){run++;if(run>worst){worst=run;at=i-run;}}else run=0;}}
    L('  '+b.padEnd(12)+String(worst).padStart(3)+' days'+(worst?' (from day '+at+')':''));
    if(worst>=7)alarms.push(`DROUGHT ${b}: ${worst} days in a row with nothing new (from day ${at})`);}
  // ── 4 DEAD ──
  L('\n4 DEAD: tattoos owned by some build but never put on by any');
  const dead=Object.keys(ownedEver).filter(id=>!equippedEver[id]);
  L('  '+(dead.length?dead.join(', '):'none'));
  for(const id of dead)alarms.push(`DEAD: ${id} is owned (by ${ownedEver[id].size} builds) but never equipped`);
  // ── 5 TRAP ──
  L('\n5 TRAP: a new player leaning into one style\'s shop upgrades, waves vs the normal way (tier / budget)');
  const cases=[...new Set(out.trap.map(x=>x.T+'/'+x.B))];
  L('  style     '+cases.map(c=>{const [t,b]=c.split('/');return ('T'+t+' '+(+b).toExponential(0)).padStart(10);}).join(''));
  for(const st of [...new Set(out.trap.map(x=>x.style))]){let l='  '+st.padEnd(10);
    for(const c of cases){const x=out.trap.find(y=>y.style===st&&y.T+'/'+y.B===c),r=x.w/x.normal;l+=pct(r).padStart(10);if(r<.7)alarms.push(`TRAP ${st}: ${pct(r).trim()} of the normal way at Tier ${x.T}, budget ${x.B.toExponential(0)}`);}
    L(l);}
  // ── 6 MUST-BUY ──
  L('\n6 MUST-BUY: cheap shop upgrades (under 1% of the budget) whose loss makes runs 10%+ shorter; * = some sim build never buys it');
  const SM=require(SIM),SB=SM.BUILDS,never=id=>Object.entries(SB).filter(([n,x])=>!n.startsWith('__')&&!(x.shop||{})[id]).map(([n])=>n);
  for(const x of out.mustbuy.filter(x=>x.cost<.01&&x.loss>=.1).sort((a,b)=>b.loss-a.loss)){
    // not blind when the calendar sim makes every build buy it late anyway (sim.js ALLSLOW / ALLCAP)
    const nv=never(x.id),late=SM.ALLCAP&&SM.CAPPED.includes(x.id)||SM.ALLSLOW&&['slowChance','slowAmt'].includes(x.id),blind=nv.length&&!late;
    L(`  ${blind?'*':' '} ${x.id.padEnd(11)} budget ${x.B.toExponential(0)} T${x.T}: ${pct(x.loss).trim()} shorter without it, cost ${(x.cost*100).toPrecision(2)}% of the budget`+(blind?`  (never bought by: ${nv.join(', ')})`:''));
    if(blind)alarms.push(`MUST-BUY (sim blind spot) ${x.id}: ${pct(x.loss).trim()} shorter runs without it at ${x.B.toExponential(0)}, costs ${(x.cost*100).toPrecision(2)}%, but never bought by ${nv.join(', ')}`);}
  L('\n== ALARMS ('+alarms.length+')');for(const a of alarms)L('  ! '+a);
  L(`(${((Date.now()-t0)/60000).toFixed(1)} min)`);
}
