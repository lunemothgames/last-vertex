// Referee: plays runs with the REAL game code (the built index.html in headless Edge, nothing drawn) and prints them next to
// tools/sim.js for the same build, budget and tier. The fast sim re-writes the wave loop by hand and drifts from the game;
// this is the check that says by how much. Simulator overhaul step 2 (GUIDE.md 8.1).
//
//   npm run build  →  node tools/referee.js [builds=offense] [budgets=1e8] [tier=sim] [lv=5]
//     builds / budgets: comma lists, every pair is measured · tier: a number, or "sim" = the tier where the sim build
//     stops climbing (its frontier, where waves are informative) · lv: tattoo level
//   node tools/referee.js calibrate        a fixed spread of builds and budgets, then the mean game/sim ratio
//   REF_N=8 runs per side · REF_SEED=1 · REF_DT=1/60 (frame length in seconds; the game caps frames at 0.05)
//   REF_MAXW = wave cap (default unlock wave + 10, same as the sim's depth()) · REF_PICKUPS=0 leaves field drops alone
//   REF_TRACE=1 also prints the first game run and the first sim run wave by wave (health, kills, perimeter hits, damage taken
//   and dealt, coins, enemies left, bullets that never hit), when each boss died, where the enemies stand, bullet hits per
//   second and where the coins came from. Rows are noisy (waves cluster at the boss waves 10/20/30): check one with REF_N=24.
//   REF_WEEKLY=glass,horde plays weekly-op runs with these mutators on both sides (no wave events, as in the game).
//   SIM_MODE=burst plays BURST on both sides, SIM_NOEVENTS=1 switches wave events off on both. The other SIM_* what-ifs only change the sim side.
//
// The player on the game side is as perfect as the sim's: actives are used by the same rules as sim.js, a bomb goes on the
// enemy with the most others inside its circle, field drops are tapped the moment they appear (both sides; the drop share of
// the coins is printed in brackets). Mastery stars stay at 0 during the run on both sides (the game would add them as it goes).
const path=require('path'),fs=require('fs');
const puppeteer=require('puppeteer-core');
const S=require('./sim.js');
const root=path.join(__dirname,'..');
const BROWSER=process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAME='file:///'+path.join(root,'index.html').replace(/\\/g,'/');
const N=+process.env.REF_N||8,SEED=+process.env.REF_SEED||1,DT=eval(process.env.REF_DT||'1/60'),PICK=process.env.REF_PICKUPS!=='0';
const MAXW=+process.env.REF_MAXW||S.TIERS.unlockWave+10,TRACE=process.env.REF_TRACE==='1';
const CAL=process.argv[2]==='calibrate',WEEKLY=process.env.REF_WEEKLY?process.env.REF_WEEKLY.split(','):null;
const BUILDS=(CAL?'offense,swarm,tank,bruiser,active,control,bomb,farm':process.argv[2]||'offense').split(',');
const BUDGETS=(CAL?'1e6,1e9':process.argv[3]||'1e8').split(',').map(Number);
const TIER=CAL?'sim':process.argv[4]||'sim',LV=+process.argv[5]||5;
for(const b of BUILDS)if(!S.BUILDS[b])throw new Error('unknown build '+b);
if(fs.statSync(path.join(root,'src','index.src.html')).mtimeMs>fs.statSync(path.join(root,'index.html')).mtimeMs)
  console.log('! src/index.src.html is newer than index.html: run npm run build first, or the game side measures old code');

// one run in the page: fresh save, seeded random, a virtual clock, then updatePlay() frame after frame until death or the cap
function pageRun(cfg){
  let r=cfg.seed>>>0||1;Math.random=()=>{r^=r<<13;r^=r>>>17;r^=r<<5;r>>>=0;return r/4294967296;};
  save=Object.assign(defaultSave(),JSON.parse(cfg.save));
  if(cfg.weekly)weeklyKeys=()=>cfg.weekly;
  startRun(!!cfg.weekly);runTier=cfg.tier;
  const acts=activeIds();let frames=0,pickCoins=0,gems=save.gems,c0=save.coins;
  const step=()=>{
    const st=stats(),sp=st.speed,n=Math.ceil(sp);
    runPlayT+=cfg.dt;__clock+=cfg.dt*1000;
    // the player: same rules as sim.js casts them, as soon as they are ready
    for(const id of acts){
      if((actCD[id]||0)>0||state!==ST.PLAY)continue;
      const live=enemies.filter(e=>e.hp>0&&e.y>GH*.1);
      if(TT[id].gren){
        if(live.length<3)continue;
        const R=GW*TT[id].r;let best=null,bn=0;
        for(const c of live){let k=0;for(const o of live)if(inBlast(o,c.x,c.y,R))k++;if(k>bn){bn=k;best=c;}}
        if(bn<3)continue;
        armed=id;throwBomb(best.x,best.y);
      }
      else if(id==='nova'?live.length>=3:id==='overdrive'?enemies.some(e=>e.y>st.rangeY):id==='midas'?enemies.length>=3:
        id==='stasis'?enemies.some(e=>e.y>GH*.7):id==='mend'?hp<st.maxHp*.5:false)useActive(id);
    }
    if(cfg.pick)for(const g of pickups.slice()){const before=runCoins;playClick(g.x,g.y);pickCoins+=runCoins-before;}
    for(let i=0;i<n&&state===ST.PLAY;i++){
      const was=cfg.trace?bullets.slice():null;
      updatePlay(cfg.dt*sp/n);
      if(was){const now=new Set(bullets),d=cfg.dt*sp/n;for(const b of was){if(!b.seen){b.seen=1;nf++;}if(now.has(b))continue;
        const x=b.x+b.vx*d,y=b.y+b.vy*d;if(!b.hits&&(y<=-GH*.05||y>=GH||x<=-60||x>=GW+60||b.left<=0))nm++;}
        for(const b of bullets)if(!b.seen){b.seen=1;nf++;}}
    }
    frames++;
  };
  // REF_TRACE=1: one line per wave (as sim.js trace prints them), from the game side
  const tr=[];let tc=save.coins,tw=waveNum,tk=runKills,tt=runDmgTaken,td=runDmgDealt,nc=0,nf=0,nm=0,nf0=0,nm0=0;
  if(cfg.trace&&!window.__wrapped){window.__wrapped=1;const c0=contactHit;contactHit=(...a)=>{window.__nc=(window.__nc||0)+1;return c0(...a);};
    // where the coins come from: kills, the wave bounty (paid in spawnWave), drops (counted in step)
    const k0=killEnemy;killEnemy=(...a)=>{const c=save.coins;window.__ky+=a[0].y/GH;window.__kn++;if(a[0].boss)window.__tr.push(`  boss down in wave ${waveNum}, ${wavePhase==='active'?(waveDuration-waveTimer).toFixed(1)+' s in':'in the break'}`);const r=k0(...a);window.__ck+=save.coins-c;return r;};
    const d0=dmgText;dmgText=(e,d,c)=>{window.__hn++;window.__hd+=d;return d0(e,d,c);};
    const w0=spawnWave;spawnWave=(...a)=>{const c=save.coins;const r=w0(...a);window.__cb+=save.coins-c;return r;};}
  window.__ck=window.__cb=0;window.__tr=tr;window.__ky=window.__kn=window.__hn=window.__hd=0;
  window.__nc=0;
  const mark=()=>{tr.push(`wave ${String(tw).padStart(3)}  hp ${String(Math.round(hp/stats().maxHp*100)).padStart(3)}%  kills ${String(runKills-tk).padStart(4)}  contacts ${String(window.__nc-nc).padStart(4)}  dmg taken ${((runDmgTaken-tt)/stats().maxHp*100).toFixed(1)}% of maxHp  dealt ${fmtN(runDmgDealt-td)}  coins ${fmtN(save.coins-tc)}  left on field ${enemies.length}${enemies.some(e=>e.boss)?' +boss':''} (${enemies.filter(e=>e.type==='mini').length} shards)  bullets ${nf-nf0}, ${nf>nf0?Math.round((nm-nm0)/(nf-nf0)*100):0}% missed`);
    tc=save.coins;nc=window.__nc;nf0=nf;nm0=nm;tw=waveNum;tk=runKills;tt=runDmgTaken;td=runDmgDealt;};
  // field sample once a game second: average height of the living enemies and how many are past 60% of the screen
  let fy=0,fl=0,fn=0,fk=0;
  while(state===ST.PLAY&&waveNum<=cfg.maxW){step();if(cfg.trace){if(frames%Math.round(1/cfg.dt)===0){const L=enemies.filter(e=>e.hp>0&&e.y>0);fy+=L.reduce((a,e)=>a+e.y/GH,0);fn+=L.length;fl+=L.filter(e=>e.y>GH*.6).length;fk++;}if(waveNum!==tw)mark();}}
  if(cfg.trace)tr.push(`field: ${(fn/fk).toFixed(1)} enemies on screen, average height ${(fy/fn).toFixed(3)}, ${(fl/fk).toFixed(1)} past 60%`);
  if(cfg.trace&&state!==ST.PLAY)mark();
  if(cfg.trace)tr.push(`mean height of kills ${(window.__ky/window.__kn).toFixed(3)} · bullet hits ${window.__hn}, ${fmtN(window.__hd/window.__hn)} each, per second ${(window.__hn/(frames*cfg.dt)).toFixed(2)} · bullets fired ${nf}, ${(nm/nf*100).toFixed(0)}% never hit`);tr.push(`coins: kills ${fmtN(window.__ck)}, wave bounty ${fmtN(window.__cb)}, drops ${fmtN(pickCoins)}`);
  const w=state===ST.PLAY?cfg.maxW:runWave;
  if(state===ST.PLAY)state=ST.MENU;
  return{w,t:frames*cfg.dt,coins:save.coins-c0,pickCoins,gems:save.gems-gems,trace:tr};
}

const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const half=a=>(Math.max(...a)-Math.min(...a))/2;
const fmtW=a=>(mean(a).toFixed(1)+' ±'+half(a).toFixed(1)).padEnd(12);

(async()=>{
  // a Windows compatibility setting inherited from some terminals (VS Code: __COMPAT_LAYER) makes Edge restart itself, which puppeteer reads as a failed launch
  const env={...process.env};delete env.__COMPAT_LAYER;
  const br=await puppeteer.launch({executablePath:BROWSER,headless:true,env,protocolTimeout:0});
  const p=await br.newPage();
  await p.setViewport({width:405,height:720});   // 9:16, the field shape sim.js assumes (GWH)
  // before the game's script: no frame loop (the referee drives updatePlay itself) and a clock that only moves with the run
  await p.evaluateOnNewDocument(()=>{window.requestAnimationFrame=()=>0;window.__clock=Date.now();Date.now=()=>window.__clock;});
  await p.goto(GAME);
  // no sound, notes or saving; saveProgress would also add mastery stars mid-run, which the sim does not
  // (function declarations are global bindings: reassigning them by name is what the game's own calls see)
  await p.evaluate(()=>{saveLocked=true;snd=toast=hint=track=startMusic=keepAwake=saveProgress=coachClear=()=>{};});
  // SIM_NOEVENTS=1 switches the wave events off on the game side too (the sim reads the same setting)
  if(process.env.SIM_NOEVENTS==='1')await p.evaluate(()=>{eventFor=()=>null;});
  const ratios=[];
  console.log(`tattoos Lv${LV} · ${N} runs per side · wave cap ${MAXW} · ${S.save.mode.toUpperCase()} · frame ${(DT*1000).toFixed(1)} ms · drops ${PICK?'tapped':'ignored'}`);
  console.log('build      budget  tier   sim waves    game waves   game/sim   sim min  game min   sim coins (drops) game coins (drops)  gems sim / game');
  for(const b of BUILDS)for(const B of BUDGETS){
    S.save.perm={};S.shop(b,B,{gameSpeed:1});S.equip(b,LV);S.save.tierBest={1:0};
    S.reseed(SEED);S.resetDrops();const T=TIER==='sim'?S.depth().tier:+TIER;   // drops reset: the tier must not depend on the builds measured before
    const sim=[];for(let i=0;i<N;i++){S.reseed(SEED+i);S.resetDrops();sim.push(S.run(T,MAXW,WEEKLY?{mods:S.weeklyMods(WEEKLY)}:{}));}
    const gsave=JSON.stringify({perm:S.save.perm,tatCol:S.save.tatCol,equipped:S.save.equipped,tatSlots:5,mode:S.save.mode,
      tier:1,tierBest:{},settings:{fx:'low',target:0,lang:'en'},tatV6:1,permV6:1});
    const game=[];const t0=Date.now();
    for(let i=0;i<N;i++)game.push(await p.evaluate(pageRun,{save:gsave,tier:T,seed:SEED+i,dt:DT,maxW:MAXW,pick:PICK,trace:TRACE,weekly:WEEKLY}));
    if(TRACE){console.log(`-- ${b} ${S.fmtN(B)} T${T}, game run 1:`);console.log(game[0].trace.join('\n'));
      console.log('-- sim run 1:');process.env.SIM_TRACE='1';S.reseed(SEED);S.run(T,MAXW);delete process.env.SIM_TRACE;}
    const sw=sim.map(x=>x.w),gw=game.map(x=>x.w),ratio=mean(gw)/mean(sw);ratios.push(ratio);
    const gc=mean(game.map(x=>x.coins)),dc=mean(game.map(x=>x.pickCoins)),sc=mean(sim.map(x=>x.coins)),sd=mean(sim.map(x=>x.drops||0));
    console.log(`${b.padEnd(10)} ${S.fmtN(B).padStart(6)}  T${String(T).padEnd(4)} ${fmtW(sw)} ${fmtW(gw)} x${ratio.toFixed(2).padEnd(8)} `+
      `${(mean(sim.map(x=>x.t))/60).toFixed(1).padStart(6)} ${(mean(game.map(x=>x.t))/60).toFixed(1).padStart(9)} `+
      `${S.fmtN(sc).padStart(11)} (${sc?Math.round(sd/sc*100):0}%) ${S.fmtN(gc).padStart(9)} (${gc?Math.round(dc/gc*100):0}%)`+
      `  gems ${mean(sim.map(x=>x.gems||0)).toFixed(1)} / ${mean(game.map(x=>x.gems)).toFixed(1)}`+
      `   [${((Date.now()-t0)/1000).toFixed(0)} s]`);
  }
  if(ratios.length>1)console.log(`mean game/sim waves: x${mean(ratios).toFixed(2)}  (range x${Math.min(...ratios).toFixed(2)} – x${Math.max(...ratios).toFixed(2)})`);
  await br.close();
})().catch(e=>{console.error(e);process.exit(1);});
