// Shop report card (overhaul step A4b): every shop upgrade against the normal way of spending, graded with alarms.
//   node tools/sim-shopcard.js      (npm run shopcard)      SIM_N=24 runs per case, SIM_EXTRA=1 (extra budget, x B), SIM_BUDGETS=1e5,3e6,3e8
// `tools/sim.js shopcard <id>` takes each style's normal shopping (offense / swarm / tank) at 3 budgets, puts SIM_EXTRA x the budget more
// into that ONE upgrade and plays the first tier the base cannot clear; `mix` does the same with the style's normal shopping list.
// Grades, per coin really spent, against the mix (1.00 = as good as normal spending, 0 = nothing, 2 = twice as good):
//   fight = extra waves per coin / the mix's extra waves per coin (cases where the mix gains under 0.5 waves are skipped: no signal)
//   coins = extra coins per hour per coin / the mix's (the mix gets coins by going deeper; a coin upgrade should beat that)
// Attack and defence upgrades are graded on fight, the utility ones (coins, looter, bounty, game speed, idle income) on coins.
// IDLE INCOME's coins are a normal player's day (45 min play, idle income for the time away, doubled by an ad), see sim.js.
// A case where the upgrade reaches its last level for under `cheap` x the budget is not divided by what was spent (tiny spend = huge
// noisy ratio); it is shown as "cheap": what maxing it gives, against what doubling the budget the normal way gives.
// Raw results are saved to <tmp>/shopcard_raw.json; SIM_CARD_RAW=<file> grades those again without running (to tune the thresholds).
// Alarms (thresholds in ALARM below, change with SIM_ALARM='{"weak":0.3}'):
//   DEAD    under `dead` overall · WEAK under `weak` · STRONG over `strong` (a must-buy: better than everything else together)
//   FADES   at least `fades` at the first budget, under `dead` at the last (the price outgrows the effect)
//   CHEAP   maxed for almost nothing and gives at least `cheapBig` x what doubling the budget gives (the price is far too low)
//   MAXED   reaches its last level before the extra budget is used up (informational: the price is not the limit then)
// The extra goes into one upgrade from the mix's own levels, so an upgrade the style already buys a lot of shows less (as for a real player).
// slowChance+slowAmt and critChance+critMult are also measured as pairs: one without the other does little.
const {spawn}=require('child_process'),path=require('path');
const ALARM=Object.assign({dead:0.1,weak:0.4,strong:2.5,fades:0.5,cheap:0.1,cheapBig:0.5},JSON.parse(process.env.SIM_ALARM||'{}'));
if(!process.env.SIM_BUDGETS)process.env.SIM_BUDGETS='1e5,3e6,3e8';
const BUD=process.env.SIM_BUDGETS.split(',').map(Number);
const src=require('fs').readFileSync(process.env.SIM_SRC||path.join(__dirname,'..','src','index.src.html'),'utf8');
const ids=['mix',...[...src.match(/const PERM_UPGRADES=\[([\s\S]*?)\n\];/)[1].matchAll(/\{id:'(\w+)'/g)].map(x=>x[1]),'slowChance+slowAmt','critChance+critMult'];
let res={};let running=0,idx=0;const t0=Date.now();const RAW=path.join(require('os').tmpdir(),'shopcard_raw.json');
function next(){
  while(running<6&&idx<ids.length){
    const id=ids[idx++];running++;
    const p=spawn('node',['tools/sim.js','shopcard',id],{cwd:path.join(__dirname,'..'),env:process.env});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const m=out.match(/SHOP (.*)/);
      if(m){const r=JSON.parse(m[1]);res[r.id]=r;}else console.log(id,'FAILED',out.slice(-300));
      next();if(running===0&&idx>=ids.length)finish();});
  }
}
const f2=x=>x===null?'    -':x.toFixed(2).padStart(5);
const avg=a=>{a=a.filter(x=>x!==null);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null;};
function finish(){
  require('fs').writeFileSync(RAW,JSON.stringify(res));
  const mix=res.mix;if(!mix){console.log('mix FAILED, nothing to grade against');return;}
  const keys=Object.keys(mix.cases),bud=k=>+k.split(' ')[1],X=+process.env.SIM_EXTRA||1;
  // per case, fight and coins against the mix: per coin when a real part of the extra was spent; "cheap" (maxed for almost nothing) =
  // what maxing it gives against what doubling gives; null = no signal, or the normal shopping had maxed it already
  const grade=r=>{const g={};for(const k of keys){const x=r.cases[k],m=mix.cases[k],dm=m.w-m.w0,cheap=x.spent>0&&x.spent<ALARM.cheap*X;
    const q=(gain,mg)=>x.spent<=0?null:cheap?gain/mg:(gain/x.spent)/(mg/m.spent);
    g[k]={fight:dm>=0.5?q(x.w-x.w0,dm):null,coins:m.c>1.01?q(x.c-1,m.c-1):null,cheap,full:x.spent<=0,maxed:x.spent<0.5*X,lv:x.lv,lv0:x.lv0};}
    return g;};
  const BN=BUD.map(b=>b.toExponential(0).replace('+','')),cols=BN.map(b=>b.padStart(5)).join(' ');
  console.log(`== shop report card · the budget once more into ONE upgrade vs the normal mix · offense/swarm/tank x ${BN.join('/')} · ${process.env.SIM_N||24} runs each · ${((Date.now()-t0)/60000).toFixed(1)} min`);
  console.log('1.00 = as good per coin as normal spending · fight = waves, coins = coins/hour (a day of a normal player) · per budget (mean of the 3 styles), then overall');
  console.log('c0.40 = maxed for under '+ALARM.cheap*100+'% of the budget, gives 0.40 of what doubling the budget gives · max = the normal shopping maxes it already');
  const mixW=keys.map(k=>`${k} T${mix.cases[k].T} ${mix.cases[k].w0.toFixed(1)}→${mix.cases[k].w.toFixed(1)} x${mix.cases[k].c.toFixed(2)}`);
  console.log('mix (base wave → with the budget doubled, coins x): '+mixW.join(' · '));
  const alarms=[],CAT={atk:'ATTACK',def:'DEFENCE',util:'UTILITY'};
  for(const cat of ['atk','def','util']){
    const main=cat==='util'?'coins':'fight',side=main==='fight'?'coins':'fight';
    console.log(`\n${CAT[cat]} (graded on ${main})      ${main}: ${cols}   all |  ${side}: all | levels bought at ${BN[0]} / ${BN[BN.length-1]}`);
    const rows=Object.values(res).filter(r=>r.cat===cat).map(r=>{const g=grade(r);
      // per budget: the per-coin grade of the styles that really spent; if all of them maxed it for almost nothing, the "cheap" value
      const per=BUD.map(b=>{const c=keys.filter(k=>bud(k)===b).map(k=>g[k]),n=c.filter(q=>!q.cheap&&!q.full);
        if(n.length)return{v:avg(n.map(q=>q[main]))};if(c.some(q=>q.cheap))return{v:avg(c.filter(q=>q.cheap).map(q=>q[main])),cheap:1};return{v:null,full:1};});
      const nc=keys.filter(k=>!g[k].cheap&&!g[k].full);
      return{r,g,per,all:avg(nc.map(k=>g[k][main])),other:avg(nc.map(k=>g[k][side]))};});
    const cell=p=>p.full?'  max':p.cheap&&p.v!==null?('c'+p.v.toFixed(p.v<0||p.v>=10?1:2)).padStart(5):f2(p.v);
    for(const x of rows.sort((a,b)=>(b.all??-9)-(a.all??-9))){
      const flags=[],ok=x.per.filter(p=>!p.cheap&&!p.full),first=ok.length?ok[0].v:null,last=ok.length>1?ok[ok.length-1].v:null;
      if(x.all===null)flags.push('NO DATA');
      else if(x.all<ALARM.dead)flags.push('DEAD');
      else if(x.all<ALARM.weak)flags.push('WEAK');
      if(x.all!==null&&x.all>ALARM.strong)flags.push('STRONG');
      if(first!==null&&last!==null&&first>=ALARM.fades&&last<ALARM.dead)flags.push('FADES');
      if(x.per.some(p=>p.cheap&&p.v>=ALARM.cheapBig))flags.push('CHEAP');
      const mx=BUD.filter(b=>keys.some(k=>bud(k)===b&&x.g[k].maxed)).map(b=>b.toExponential(0).replace('+',''));
      if(mx.length)flags.push('MAXED@'+mx.join(','));
      if(flags.some(f=>!f.startsWith('MAXED')))alarms.push(x.r.id+' '+flags.filter(f=>!f.startsWith('MAXED')).join('+'));
      const lv=b=>{const c=keys.filter(k=>bud(k)===b).map(k=>x.g[k]);return Math.round(avg(c.map(q=>q.lv0)))+'→'+Math.round(avg(c.map(q=>q.lv)));};
      console.log(x.r.id.padEnd(19)+`${main.padStart(6)}: ${x.per.map(cell).join(' ')}  ${f2(x.all)} | ${side}:${f2(x.other)} | ${lv(BUD[0])} / ${lv(BUD[BUD.length-1])}  ${flags.join(' ')}`);
    }
  }
  console.log('\nALARMS: '+(alarms.length?'\n  '+alarms.join('\n  '):'none'));
}
if(process.env.SIM_CARD_RAW){res=JSON.parse(require('fs').readFileSync(process.env.SIM_CARD_RAW,'utf8'));finish();}else next();
