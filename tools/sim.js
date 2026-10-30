// Balance sim using the game's own data AND its own stats() function.
// Models continuous spawning, every tattoo mechanic and the active tattoos (cast on cooldown) on a 2-D field like the game's
// (see run()); tools/referee.js plays the real game next to it and says how far apart they are (npm run referee -- calibrate).
//
//   node tools/sim.js [hours=600] [build=offense]   long-term progression of one build
//   node tools/sim.js compare [lv=5] [build,build…] same coin budget for every build → how deep each one gets
//   node tools/sim.js modes [builds] [budgets]      RAPID vs BURST attack mode, same shop and tattoos
//   SIM_MODE=burst npm run pace                      the pace check with every build in BURST
//
// Builds = a shop shopping list (weights) + 5 equipped tattoos (see BUILDS below).
// What-ifs without editing the game: SIM_ECO='{"bossHpMul":6}' SIM_PU='{"damage":{"ms":[100,1.15]}}'
const fs=require('fs'),path=require('path');
// seeded RNG so a run is repeatable: SIM_SEED=n (default 1) picks the stream; same seed + same settings = same numbers,
// which is what lets later sessions check a fix against a fixed baseline instead of noise. A different SIM_SEED is an
// independent sample (sim-pace.js uses this to run each build several times and print a mean ± range, not one lucky/unlucky run).
let _seed=((+process.env.SIM_SEED||1)>>>0)||1;
function rand(){_seed^=_seed<<13;_seed^=_seed>>>17;_seed^=_seed<<5;_seed>>>=0;return _seed/4294967296;}
Math.random=rand;   // the game's own copied-in code (via `new Function`) also calls Math.random(), so this seeds it too
// SIM_SRC=<file> measures another copy of the game (e.g. an older version) with the same builds
const src=fs.readFileSync(process.env.SIM_SRC||path.join(__dirname,'..','src','index.src.html'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);if(i<0||j<0)throw new Error('marker '+a);return src.slice(i,j);};
const opt=(a,b)=>{try{return cut(a,b);}catch(e){return '';}};   // a part an older game (SIM_SRC) may not have
// the economy outside the runs (SIM_ECON=1): inks, quests, achievements and the daily reward, taken from the game itself
const ECON_SRC=[opt('const tatPool=','function doPull'),opt('const pityRar=','\n'),opt('// ── QUESTS','const weekStartMs'),
  opt('// ── LIFETIME STATS','function achCheck'),opt('const DAILY=','function renderDailyDot')].join('\n');
const ECON_OUT=['tatPool','rollType','pityRar','addTatCopy','tatOf','TAT_SLOT_PRICES','MAX_SLOTS','makeQuest','QUEST','DAILY','dailyCoins',
  'ACHS','achDone','MUTATORS','WEEKLY_REWARDS','weeklyKeys','AUTO_RETRY','maxUnlockedTier'].map(n=>n+':typeof '+n+'==="undefined"?null:'+n).join(',');
const save={settings:{},perm:{},tatCol:{},equipped:[],tatSlots:5,temp:{},tierBest:{1:0},tier:1,bestWave:0,coins:0,gems:0,tatV6:1,permV6:1};
const G=new Function('save','GH','runTier',[cut('const SUFFIX=','// ── AUDIO'),cut('// ── ECONOMY','// ── STATE'),ECON_SRC,
  "return{"+ECON_OUT+",setMods:m=>{runMods=m;},GRENADE:typeof GRENADE===\"undefined\"?null:GRENADE,fmtN,ECO,TIERS,ENEMY_TYPES,PERM_UPGRADES,PU,TT,permVal,coinValueAt,upCost,stats,tb,totalStars,MASTERY,setTier:t=>{runTier=t;},TAT_TYPES,NOMODS,combineMods,BURST:typeof BURST===\"undefined\"?null:BURST,EVENTS:typeof EVENTS===\"undefined\"?null:EVENTS,eventFor:typeof eventFor===\"undefined\"?null:eventFor,EV_TUNE:typeof EV_TUNE===\"undefined\"?null:EV_TUNE,bossKindFor:typeof bossKindFor===\"undefined\"?null:bossKindFor,boostPrice:typeof boostPrice===\"undefined\"?null:boostPrice};"].join('\n'))(save,1,1);
// next-run boosts (SHOP section): SIM_BOOST=all buys every affordable one before each run (lucky, power, berserk, rapid, shield, guardian, focus), or a list: SIM_BOOST=lucky,power
const TEMP=src.includes('const TEMP_UPGRADES=')?new Function(cut('const TEMP_UPGRADES=','const tempCost=')+';return TEMP_UPGRADES;')():[];
const {fmtN,ECO,TIERS,ENEMY_TYPES,PERM_UPGRADES,PU,TT,coinValueAt,upCost,stats,tb,setTier}=G;
// what-ifs for the content added in October 2026:
//   SIM_ENEMY='{"armored":{"w":0}}'  change/remove an enemy type · SIM_BOSSKIND=classic  every boss is the classic one
for(const [id,o] of Object.entries(JSON.parse(process.env.SIM_ENEMY||'{}')))Object.assign(ENEMY_TYPES[id],o);
for(const [k,o] of Object.entries(JSON.parse(process.env.SIM_EVT||'{}')))if(G.EVENTS&&G.EVENTS[k])G.EVENTS[k]=Object.assign({name:k},o);   // SIM_EVT='{"horde":{"ival":0.7}}' replaces an event's rules
for(const k of (process.env.SIM_EVOFF||'').split(',').filter(Boolean))if(G.EVENTS&&G.EVENTS[k])G.EVENTS[k]={name:k};   // SIM_EVOFF=horde,rush  makes those events do nothing
const EVT=Object.assign(G.EV_TUNE||{},JSON.parse(process.env.SIM_TUNE||'{}'));   // SIM_TUNE='{"clingAtk":0.4}' changes the behaviour numbers of the events (dive, rise, berserk, cling)
const FORCE=process.env.SIM_FORCEEV;   // SIM_FORCEEV=cling: that event on EVERY wave from wave 4 (not boss waves), to measure what one event does
let NOEV=process.env.SIM_NOEVENTS==='1';   // SIM_NOEVENTS=1: switch wave events off to see their share
Object.assign(ECO,JSON.parse(process.env.SIM_ECO||'{}'));
// attack mode: SIM_MODE=burst plays every run in BURST (opens at Tier 2 in the game; the sim allows it from the start)
// SIM_BURST='{"rate":0.4}' changes the BURST numbers
if(G.BURST)Object.assign(G.BURST,JSON.parse(process.env.SIM_BURST||'{}'));
save.mode=process.env.SIM_MODE==='burst'?'burst':'rapid';
// bombs: SIM_NOBOMB=1 never throws
const NOBOMB=!!process.env.SIM_NOBOMB;
const PEL={n:0,h:0,f:0},BUL={n:0,m:0,N:0,M:0},GWH=9/16;   // screen width in screen heights
for(const [id,o] of Object.entries(JSON.parse(process.env.SIM_PU||'{}')))Object.assign(PU[id],o);
// SIM_FRAME = frame length in seconds (the game runs at 60 fps; it limits the fire rate to whole frames)
const FRAME=eval(process.env.SIM_FRAME||'1/60');
// tattoo value what-ifs: SIM_TT='{"reaper":{"k":[0.15,0.4]}}' (each effect is [Lv1, Lv7])
for(const [id,o] of Object.entries(JSON.parse(process.env.SIM_TT||'{}')))Object.assign(TT[id].v,o);

// ── builds: shop weights (higher = buy more of it) + tattoos ──
// A real player can buy every shop upgrade, so every build shares the cheap multi-hit / speed core (BASE) and only adds the extras
// of its own style; what really differs between builds are the 5 tattoo slots. (Comparing builds that each spend differently
// mostly measures how good their spending is, not how good their tattoos are.)
const ECON={coinMult:1,lootChance:1,bounty:1,gameSpeed:1};
const BASE={damage:3,fireRate:2,maxHp:1,regen:1,multishot:2,bounce:2,pierce:2,range:1,...ECON};
const plus=x=>({...BASE,...Object.fromEntries(Object.entries(x).map(([k,v])=>[k,(BASE[k]||0)+v]))});
const DEF={defense:2,thorns:3,dodge:1,lifesteal:1,waveHeal:1,regen:2,maxHp:2},CTRL={knockback:1,slowChance:2,slowAmt:2},COIN={coinMult:3,lootChance:2,bounty:2,gameSpeed:2};
// bomb builds: offense shop, the bomb in place of SLAYER
const bombB=t=>({shop:plus({critChance:2,critMult:2,bossDmg:1}),tat:[t,'attack_power','attack_speed','crit_chance','crit_mult']});
const BUILDS={
  offense:   {shop:plus({critChance:2,critMult:2,bossDmg:1}),tat:['attack_power','attack_speed','crit_chance','crit_mult','boss_slayer']},
  swarm:     {shop:plus({}),tat:['twin','arc','ricochet','piercer','attack_power']},
  tank:      {shop:plus(DEF),tat:['thorns','aegis','defense','regen','max_hp']},
  thornsTank:{shop:plus(DEF),tat:['thorns','aegis','defense','regen','lifesteal']},
  bruiser:   {shop:plus(DEF),tat:['thorns','mend','shockwave','attack_power','dodge']},
  bomb:      bombB('logic_bomb'), goo:bombB('goo_bomb'), virus:bombB('virus_bomb'),
  active:    {shop:plus({}),tat:['nova','overdrive','stasis','mend','attack_power']},
  control:   {shop:plus(CTRL),tat:['frost','reach','stasis','attack_power','attack_speed']},
  shatter:   {shop:plus(CTRL),tat:['frost','shatter','stasis','attack_power','attack_speed']},
  chillNoKb: {shop:plus({slowChance:2,slowAmt:2}),tat:['frost','reach','stasis','attack_power','attack_speed']},
  reaper:    {shop:plus({execute:2,critChance:1}),tat:['reaper','attack_speed','crit_chance','attack_power','crit_mult']},
  farm:      {shop:plus(COIN),tat:['coin_mult','luck','midas','attack_power','attack_speed']},
  greedy:    {shop:plus(COIN),tat:['twin','arc','ricochet','coin_mult','midas']},
};
// SIM_BUILD='{"shatter":{"tat":["frost","attack_power"]}}'  replace parts of a build, or add a new one
for(const [n,o] of Object.entries(JSON.parse(process.env.SIM_BUILD||'{}')))BUILDS[n]=Object.assign(BUILDS[n]||{shop:BUILDS.swarm.shop,tat:[]},o);
function equip(b,lv){
  save.tatCol={};save.equipped=[];
  for(const id of BUILDS[b].tat){save.tatCol[id]={lv,copies:0};save.equipped.push(id);}
}
// spend `bank` on the build's list: always the level with the lowest price/weight
function shop(b,bank,skip){
  const W=(process.env.SIM_SHOP&&BUILDS[process.env.SIM_SHOP]?BUILDS[process.env.SIM_SHOP]:BUILDS[b]).shop;   // SIM_SHOP=swarm: every build spends like that one, so only the tattoos differ
  for(;;){let best=null;
    for(const id in W){if(skip&&skip[id])continue;const u=PU[id],l=save.perm[id]||0;if(l>=u.max)continue;
      const c=upCost(u,l);if(c<=bank&&(!best||c/W[id]<best[1]/W[best[0]]))best=[id,c];}
    if(!best)return bank;bank-=best[1];save.perm[best[0]]=(save.perm[best[0]]||0)+1;}
}

// ── one run; positions in screen heights (x from 0 to GWH across, y from the top), time in game seconds ──
// Since overhaul step 3 the field is 2-D like the game's: every enemy has an x, the triangle slides under its target, bullets fly
// (a bullet whose target died, or that pierces, goes on in a straight line), ricochet / ARC / bombs / GOO / VIRUS / SHATTER /
// MENDER use the game's circles, and enemies push each other aside (separateEnemies). Checked against tools/referee.js.
// field drops: the cooldowns run on the real clock and carry over from run to run (game save.lastCoinPickup / lastGemPickup);
// DROP.t = wall seconds played so far, coin / gem = when the next one may appear. tools/referee.js resets it before each run (fresh save).
const DROP={t:0,coin:0,gem:0};
const ETYPE=new Map(Object.entries(ENEMY_TYPES).map(([k,T])=>[T,k]));   // enemy type → its id (game e.type), for the kill_<type> quests
const SHATTER_R=+(src.match(/const SHATTER_R=([\d.]+)/)||[0,.2])[1];
// o.auto: an AUTO RETRY run with nobody watching (game runAuto): every coin pays AUTO_RETRY.share, no actives, no bombs, drops not tapped
// o.mods: a WEEKLY OP run with these mutators (game combineMods(weeklyKeys())): they hold for the whole run, no wave events
function run(tier,maxW=1e9,o={}){
  if(G.setMods)G.setMods(o.mods||null);
  try{return run0(tier,maxW,o);}finally{if(G.setMods)G.setMods(null);}
}
function run0(tier,maxW,o){
  setTier(tier);const st=stats(),AUTO=!!o.auto,WM=o.mods||null;
  const pay=c=>AUTO&&c>0?Math.max(1,Math.round(c*G.AUTO_RETRY.share)):c;   // game runPay()
  // QE = the quest events of this run, counted where the game calls qEvent() / qReach() (kill_<type>, crit, knockback, slow, pierce,
  // multishot, dodge; wave = the last wave whose timer ran out)
  const TOT={k:0,b:0,d:0,bombs:0,taps:0},QE={wave:0},qe=k=>{QE[k]=(QE[k]||0)+1;},
    fin=()=>({kills:TOT.k+tkills,bosses:TOT.b,dealt:TOT.d+tdealt,bombs:TOT.bombs,taps:TOT.taps,qe:QE});
  const LINE=.83,TRI=.9,BY=TRI-.03,BU=G.BURST&&save.mode==='burst'?G.BURST:null;
  const A={};for(const id of save.equipped)if(TT[id].act)A[id]={...tb(id),cd:0,left:0};
  const FS={y:0,n:0,l:0,k:0},HN={n:0,d:0};let ky=0,kn=0,hp=st.maxHp,coins=0,ck=0,cb=0,dropC=0,gems=0,t=0,w=0,aegis=0,shock=0,shots=0,triX=GWH/2;let tdAll=0;const dt=+process.env.SIM_DT||.1,evSeed=Math.floor(Math.random()*1e6);
  const TRACE=process.env.SIM_TRACE==='1';let tkills=0,tdmg=0,tcontacts=0,tdealt=0,tc0=0;
  // the field lives across waves, like the game's: when the wave timer runs out the next wave starts and the leftovers stay
  // (a boss that is not killed walks on into the next waves). Everything below that depends on the wave is set at its start.
  const KD=Math.pow(.03,dt),KI=(1-KD)/Math.log(1/.03);   // knockback fades to x0.03 a second; KI = distance a push of speed 1 carries an enemy in one step
  const FD=FRAME*st.speed/Math.ceil(st.speed),frames=r=>1/(Math.ceil(1/(r*FD)-1e-9)*FD);
  const E=[],Q=[],BOMBS=[],P=[];let SQ=[];let ew=0,M=G.NOMODS,hpB=0,atkB=0,spB=0,pool=[],tw=0,dur=0,iv=0,per=0,left=0,spawnT=0,cd=0,cv=0;
  const mid=()=>A.midas&&A.midas.left>0?A.midas.m:1;   // MIDAS running: every coin multiplier is raised
  const pick=()=>{let r=Math.random()*tw;for(const x of pool){r-=x.w;if(r<0)return x;}return pool[0];};
  // h = size (game e.sz), w = hitbox width for BURST, x defaults to a random spot that keeps the enemy on the field (game spawnEnemy)
  const mk=(T,y,x)=>{const h=T.sz*GWH*(M.esz||1),m=h+.05*GWH;return{T,x:x??m+Math.random()*(GWH-2*m),y,sc:.1,wv:w,h,w:h*1.1,hp:hpB*T.hp*(M.ehp||1),max:hpB*T.hp*(M.ehp||1),atk:atkB*T.atk*(M.eatk||1),sp:spB*T.spd*(M.espd||1),coin:T.coin*(M.ecoin||1),ar:Math.max(T.armor||0,M.armor||0),kb:0,slow:0,frz:0,boss:false,
    sh:T.shield?hpB*T.hp*(M.ehp||1)*T.shield*(T===ENEMY_TYPES.warden?.5+.5*Math.min(1,Math.max(0,(ew-T.from)/90)):1):0,heal:T.heal||0,ht:1,blink:T.blink||0,bt:(T.blink||0)*(.5+Math.random()*.5),gh:T.ghost||0,gt:(T.ghost||0)*(.5+Math.random()*.5),ph:false,rg:M.eregen||0,dv:M.dive||0,rs:M.rise||0,bz:M.berserk||0,cl:M.cling||0};};
  const d2=(a,x,y)=>(a.x-x)**2+(a.y-y)**2;
  const inBlast=(o,x,y,R)=>d2(o,x,y)<=(R+o.h*.5)**2;   // game inBlast(): the circle counts the enemy's own size
  {
    // game spawnEnemy(): a continuously spawned enemy can be an elite (chance grows with the wave, at most 6%); its shield is not tripled
    const elite=e=>{if(Math.random()<Math.min(.06,ew*.0008)){e.hp*=3;e.max=e.hp;e.w*=1.35;e.h*=1.35;e.coin*=2;e.atk*=1.5;}return e;};
    const midas=mid;
    const hit=(e,d)=>{e.hp-=d;tdealt+=d;};   // blasts, ARC, NOVA, SHOCKWAVE, GOO, VIRUS: no lifesteal (game hurt())
    const push=(e,m)=>{if(!e.boss)e.kb=Math.min(e.kb,-e.sp*ECO.kbPush*m);};   // same rule as the game's knock()
    const HD=st.dmg*st.pellet,vul=e=>(e.boss?st.bossDmg:1)*(e.slow>0||e.frz>0?st.frostVuln:1);   // game: st.hitDmg, bombVuln()
    const gooBurst=e=>{const R=G.GRENADE.goo.r*GWH;e.gooT=0;for(const o of E)if(o.hp>0&&(o===e||inBlast(o,e.x,e.y,R)))hit(o,e.gooD*vul(o));};
    // game killEnemy(): GOO bursts, VIRUS jumps to the neighbours, SHATTER queues a burst, coins, SPLITTER leaves 2 shards
    const kill=e=>{const c0=coins;ky+=e.y;kn++;if(TRACE&&e.boss)console.log('  boss down in wave '+w+', '+(left>0?(dur-left).toFixed(1)+' s in':'in the break'));
      if(e.gooT>0)gooBurst(e);
      if(e.virT>0){const R=G.GRENADE.virus.spread*GWH;for(const o of E)if(o!==e&&o.hp>0&&inBlast(o,e.x,e.y,R)){o.virT=Math.max(o.virT||0,e.virT);o.virD=Math.max(o.virD||0,e.virD);}}
      if(st.shatter>0&&(e.slow>0||e.frz>0)&&!e.boss)SQ.push({x:e.x,y:e.y,d:e.max*st.shatter});
      if(e.T===ENEMY_TYPES.splitter)for(const s of[-1,1]){const m=mk(ENEMY_TYPES.mini,e.y,e.x+s*e.h*.45);m.sc=1;m.kb=e.kb;E.push(m);}
      if(e.boss)TOT.b++;
      qe('kill_'+(e.boss?'boss':ETYPE.get(e.T)));
      if(e.boss||e.coin&&Math.random()<st.coinChance)coins+=pay(cv*e.coin*midas()*(Math.random()<st.jackpot?3:1));
      ck+=coins-c0;};   // the x3 jackpot can hit a boss too (game killEnemy)
    // behaviour events (RISING TIDE, DIVE, BERSERK, CLINGERS): same rules as the game, see EV_TUNE
    const riseF=e=>{if(!(e.rs&&e.wv===w&&left>0))return 1;const p=Math.max(0,Math.min(1,1-left/dur));return EVT.rise[0]+(EVT.rise[1]-EVT.rise[0])*p;};
    const evMul=e=>{let m=riseF(e);if(e.dv){const p=Math.max(0,Math.min(1,(e.y-.1)/(LINE-.1)));m*=EVT.dive[0]+(EVT.dive[1]-EVT.dive[0])*p;}if(e.bzOn)m*=EVT.berserkSpd;return m;};
    const contact=(e,mul)=>{
      let taken=0,back=3.5;   // how hard it is pushed back: a dodged enemy less (game contactHit)
      if(Math.random()<st.dodge){back=2;qe('dodge');}
      else if(st.aegisCD&&aegis<=0)aegis=st.aegisCD;
      else{taken=e.atk*Math.sqrt(riseF(e))*mul*st.dmgTaken*(e.slow>0?1-st.slowAmt*(ECO.slowHitCut||0):1);hp-=taken;tdmg+=taken;tdAll+=taken;}
      tcontacts++;
      const th=Math.min(e.hp,e.max*st.thornPct*(e.boss?ECO.bossThorns:1));e.hp-=th;tdealt+=th;
      if(taken>0)hp=Math.min(st.maxHp,hp+Math.min(th*st.ls,taken*ECO.thornHealCap));
      return back;
    };
    // one bullet / pellet hit on e (a crit roll per hit like the game: an average would hide the damage a crit wastes on overkill; armor, shield, reaper, knockback, slow)
    const bulletHit=(e,m)=>{
      const dn=st.dmg*m*(e.boss?st.bossDmg:1)*(e.hp<e.max*ECO.executeAt?st.execute:1)*(e.slow>0||e.frz>0?st.frostVuln:1);
      const cr=Math.random()<st.crit;if(cr)qe('crit');
      let d=dn*(cr?st.critM:1);const before=e.sh>0?Infinity:e.hp;
      if(e.ar)d*=Math.min(1,d/(e.max*e.ar));
      if(e.sh>0){e.sh-=d*.5;tdealt+=d;}else hit(e,d);
      HN.n++;HN.d+=d;
      hp=Math.min(st.maxHp,hp+d*st.ls);   // lifesteal: bullets only (and the capped thorns refund in contact())
      if(!e.boss&&e.hp>0&&e.hp<e.max*st.reap)e.hp=0;
      if(!e.boss&&Math.random()<st.kbChance){e.kb=Math.min(e.kb,-e.sp*ECO.kbPush);qe('knockback');}
      if(st.slowAmt>0&&Math.random()<st.slowChance){if(!(e.slow>0))qe('slow');e.slow=ECO.slowTime;}
      const carry=e.hp<=0&&d>before?1-before/d:0;   // share of the damage left over after a kill (a BURST pellet flies on with it)
      if(e.hp<=0)dead(e);
      return carry;
    };
    // a bullet kill is handled at once, like the game's: SPLITTER shards appear on the spot, where the rest of a BURST salvo
    // (and the pellet that killed, with its leftover damage) still hits them. Other deaths wait for the end of the step.
    const dead=e=>{const i=E.indexOf(e);if(i<0)return;E.splice(i,1);e.td=t;kill(e);tkills++;};
    // a bullet flying straight from (ox,oy) along (ux,uy): the nearest enemy on that line further than `from` whose edge it reaches
    // within `lim`
    // (game: the path test against each enemy's square box, half-size 0.55 x its size), or null if it leaves the screen first
    const along=(ox,oy,ux,uy,from,lim,hits)=>{let best=null,bs=Infinity;
      for(const o of E){if(o.hp<=0||o.ph||hits.has(o)||o.y<-.05)continue;
        const rx=o.x-ox,ry=o.y-oy,s=rx*ux+ry*uy;if(s<=from||s>=bs||s-o.h*.55>lim)continue;
        if(Math.abs(rx*uy-ry*ux)<o.h*.55*(Math.abs(ux)+Math.abs(uy))){bs=s;best=o;}}
      return best;
    };
    const towards=(ox,oy,px,py,from,hits)=>{const L=Math.hypot(px-ox,py-oy)||1;return along(ox,oy,(px-ox)/L,(py-oy)/L,from,Infinity,hits);};
    // a bullet that reached e, coming from (ox,oy). Game order: pierce first (it flies on along its line), else maybe a ricochet
    // to the nearest other enemy from the hit point (it homes in on that one)
    const follow=(e,m,ox,oy,hits,bounces)=>{
      for(;;){
        bulletHit(e,m);hits.add(e);
        if(Math.random()<st.pierce){qe('pierce');const n=towards(ox,oy,e.x,e.y,Math.hypot(e.x-ox,e.y-oy),hits);if(n){e=n;continue;}return;}
        if(bounces<st.chain&&Math.random()<st.bounce){let nx=null,nd=Infinity;for(const o of E){if(o.hp<=0||hits.has(o))continue;const d=d2(o,e.x,e.y);if(d<nd){nd=d;nx=o;}}
          if(nx&&!nx.ph){bounces++;ox=e.x;oy=e.y;e=nx;continue;}}
        return;
      }
    };
    // BURST salvo (game fireBullets): the pellets spread evenly over the cone around the target, each with a little jitter, and fly
    // straight up to reach x the distance to the range line, moved in 1/60 s steps and tested against each enemy's box like the
    // game's bullets (a one-shot straight-line test at fire time hit less: enemies walk into the pellets while they fly).
    // A pellet that kills flies on with the damage it had left.
    const burstSalvo=vis=>{
      const mu=Math.random()<st.multiChance;if(mu)qe('multishot');
      const tg=vis[0],n=st.pellets*(mu?2:1),S=BU.spread,base=Math.atan2(tg.y-BY,tg.x-triX);
      for(let k=0;k<n;k++){const a=base+S*(k/(n-1)-.5)+(Math.random()-.5)*S/n;
        P.push({x:triX,y:BY,ux:Math.cos(a),uy:Math.sin(a),left:(BY-st.rangeY)*BU.reach,m:st.pellet,hits:new Set(),tg});PEL.n++;BUL.n++;}
    };
    // game segBoxHit(): how far along the segment it first touches the square of half-size r around (cx,cy), or -1
    const segBox=(x0,y0,x1,y1,cx,cy,r)=>{let t0=0,t1=1;for(const [p,d,lo,hi] of [[x0,x1-x0,cx-r,cx+r],[y0,y1-y0,cy-r,cy+r]]){if(Math.abs(d)<1e-12){if(p<lo||p>hi)return -1;continue;}let a=(lo-p)/d,b=(hi-p)/d;if(a>b){const q=a;a=b;b=q;}if(a>t0)t0=a;if(b<t1)t1=b;if(t0>t1)return -1;}return t0;};
    const flyPellets=()=>{
      const n=Math.max(1,Math.round(dt*60)),L=.95*dt/n;
      for(let i=P.length-1;i>=0;i--){const p=P[i];let gone=false;
        for(let k=0;k<n&&!gone;k++){const px=p.x,py=p.y;p.x+=p.ux*L;p.y+=p.uy*L;p.left-=L;
          // walk along this step's path: always the nearest enemy it crosses; a kill with damage to spare or a pierce goes on
          for(let g=0;g<12;g++){let e=null,tb=2;
            for(const o of E){if(o.hp<=0||o.ph||p.hits.has(o))continue;const r=o.h*.55;
              if(o.x+r<Math.min(px,p.x)||o.x-r>Math.max(px,p.x)||o.y+r<Math.min(py,p.y)||o.y-r>Math.max(py,p.y))continue;
              const q=segBox(px,py,p.x,p.y,o.x,o.y,r);if(q>=0&&q<tb){tb=q;e=o;}}
            if(!e)break;
            if(!p.hit){p.hit=1;PEL.h++;if(e===p.tg)PEL.f++;}
            const carry=bulletHit(e,p.m);p.hits.add(e);
            if(carry>0){p.m*=carry;continue;}
            if(Math.random()<st.pierce){qe('pierce');continue;}
            if(st.chain>0&&Math.random()<st.bounce){let nx=null,nd=Infinity;for(const o of E){if(o.hp<=0||p.hits.has(o))continue;const d=d2(o,e.x,e.y);if(d<nd){nd=d;nx=o;}}
              if(nx&&!nx.ph)follow(nx,p.m,e.x,e.y,p.hits,1);}
            gone=true;break;}
          if(!gone&&(p.left<=0||p.y<-.05||p.x<-.1||p.x>GWH+.1)){gone=true;if(!p.hit)BUL.m++;}}
        if(gone)P.splice(i,1);}
    };
    // game blastBomb(): one crit roll per bomb; VIRUS infects (refreshes, never stacks), GOO hits and sticks, LOGIC hits and pushes
    const blast=b=>{
      const a=A[b.id],kind=TT[b.id].gren,R=TT[b.id].r*GWH,base=HD*(Math.random()<st.crit?st.critM:1);
      for(const e of E){if(e.hp<=0||!inBlast(e,b.x,b.y,R))continue;
        if(kind==='virus'){e.virT=G.GRENADE.virus.t;e.virD=Math.max(e.virD||0,base*a.m);continue;}
        hit(e,base*a.m*vul(e));
        if(kind==='goo'){e.gooT=G.GRENADE.goo.t;e.gooD=base*a.m2;}else push(e,1.5);}
    };
    // one time step; `active` = the wave timer is running (enemies spawn), false = the short break before the next wave
    var tick=active=>{
      t+=dt;aegis=Math.max(0,aegis-dt);shock=Math.max(0,shock-dt);
      if(active){left-=dt;spawnT-=dt;if(spawnT<=0){spawnT=iv;for(let i=0;i<per;i++){const T=pick();E.push(elite(mk(T,.1-T.sz*GWH/2)));}}}
      hp=Math.min(st.maxHp,hp+st.regen*dt);cd-=dt;
      // field drops (game updatePlay): one may appear once its cooldown is over, the player taps it at once.
      // A coin drop pays 30 s of this run's income (drops not counted), at least 10 kills' worth
      if(!AUTO){const wall=DROP.t+t/st.speed;
        if(wall>=DROP.gem&&Math.random()<dt*ECO.gemDropPerSec*st.dropRate){gems++;TOT.taps++;DROP.gem=wall+ECO.gemPickupCooldown/st.dropRate;}
        if(wall>=DROP.coin&&Math.random()<dt*ECO.coinDropPerSec*st.dropRate){const pt=t/st.speed,rate=pt>5?(coins-dropC)/pt:0;
          const v=Math.max(1,Math.round(Math.max(rate*ECO.coinDropSecs,ECO.coinDropMinKills*coinValueAt(ew)*st.mult*mid())));coins+=v;dropC+=v;TOT.taps++;DROP.coin=wall+ECO.pickupCooldown/st.dropRate;}}
      for(let i=BOMBS.length-1;i>=0;i--)if(BOMBS[i].at<=t){blast(BOMBS[i]);BOMBS.splice(i,1);}
      // the triangle slides under its target: the front enemy in range, or the front one of all (game updatePlay)
      {let tg=null;for(const e of E)if(e.y>=st.rangeY&&e.hp>0&&!e.ph&&(!tg||e.y>tg.y))tg=e;
        if(!tg)for(const e of E)if(!tg||e.y>tg.y)tg=e;
        if(tg)triX=Math.max(GWH*.06,Math.min(GWH*.94,triX+(tg.x-triX)*Math.min(1,dt*1.8)));}
      // active tattoos, cast as soon as they are useful (same rules as the referee's player)
      if(!AUTO)for(const id in A){const a=A[id];a.cd=Math.max(0,a.cd-dt);a.left=Math.max(0,a.left-dt);if(a.cd>0)continue;
        const live=E.filter(e=>e.hp>0&&e.y>.1);
        if(id==='nova'&&live.length>=3){for(const e of E)if(e.hp>0&&e.y>=.1-e.h){hit(e,HD*a.m*(e.boss?st.bossDmg:1));push(e,1.5);}}
        else if(TT[id].gren&&!NOBOMB){   // the player puts the bomb on the enemy with the most others inside its circle, if 3+
          if(live.length<3)continue;
          const R=TT[id].r*GWH;let best=null,bn=0;
          for(const c of live){let n=0;for(const o of live)if(inBlast(o,c.x,c.y,R))n++;if(n>bn){bn=n;best=c;}}
          if(bn<3)continue;
          TOT.bombs++;BOMBS.push({id,x:Math.max(GWH*.03,Math.min(GWH*.97,best.x)),y:Math.max(.1,best.y),at:t+.3});   // game: 0.3 s in the air
        }
        else if(id==='overdrive'&&E.some(e=>e.y>st.rangeY)){a.left=a.dur;}
        else if(id==='midas'&&E.length>=3){a.left=a.dur;}
        else if(id==='stasis'&&E.some(e=>e.y>.7)){for(const e of E)e.frz=e.boss?a.dur/2:a.dur;}
        else if(id==='mend'&&hp<st.maxHp*.5){hp=Math.min(st.maxHp,hp+st.maxHp*a.heal);}
        else continue;
        a.cd=tb(id).cd;
      }
      if(st.shockM&&hp<st.maxHp*.3&&shock<=0){for(const e of E)if(e.hp>0&&e.y>=.45){hit(e,HD*st.shockM*(e.boss?st.bossDmg:1));push(e,2);}shock=st.shockCD;}
      for(const e of E){
        e.sc=Math.min(1,e.sc+dt*(e.boss?.8:4));
        const kb0=e.kb;e.kb*=KD;if(Math.abs(e.kb)<e.sp*.05)e.kb=0;
        if(e.slow>0)e.slow-=dt;
        // GOO and VIRUS keep ticking on a frozen enemy (game updatePlay)
        if(e.gooT>0){e.gooT-=dt;if(e.gooT<=0&&e.hp>0)gooBurst(e);}
        if(e.virT>0&&e.hp>0){e.virT-=dt;e.virA=(e.virA||0)+dt;if(e.virA>=.5-1e-9){hit(e,e.virD*e.virA);e.virA=0;}}
        if(e.frz>0){e.frz-=dt;continue;}
        if(e.rg&&e.hp>0)e.hp=Math.min(e.max,e.hp+e.max*e.rg*dt);
        if(e.bz&&!e.bzOn&&e.hp>0&&e.hp<e.max*EVT.berserkAt){e.bzOn=1;e.atk*=EVT.berserkAtk;}
        if(e.heal&&e.hp>0){e.ht-=dt;if(e.ht<=0){e.ht=1;const r2=(.25*GWH)**2;for(const o of E)if(o.hp>0&&d2(o,e.x,e.y)<r2)o.hp=Math.min(o.max,o.hp+o.max*e.heal);}}
        if(e.blink&&e.hp>0){e.bt-=dt;if(e.bt<=0&&e.y>.1){e.bt=e.blink;e.y=Math.min(LINE-e.h,e.y+.1);}}
        if(e.gh&&e.hp>0&&e.y>.1){e.gt-=dt;if(e.gt<=0){e.ph=!e.ph;e.gt=e.gh*(e.ph?.4:1);}}
        // boss: enrages below half health (faster, shock waves and summons more often); the timers run from the moment it appears
        if(e.boss&&e.hp>0){
          if(!e.enr&&e.hp<e.max*ECO.bossEnrageAt){e.enr=true;e.sp*=1.4;}
          if(ECO.bossPulse){e.pt-=dt;if(e.pt<=0&&e.y>.1){e.pt=ECO.bossPulseEvery*(e.enr?.65:1);
            if(Math.random()<st.dodge){}else if(st.aegisCD&&aegis<=0)aegis=st.aegisCD;else{const d=e.atk*ECO.bossPulse*st.dmgTaken;hp-=d;tdmg+=d;tdAll+=d;}}}
          e.summon-=dt;if(e.summon<=0&&e.y>.1){const ev=ECO.bossSummonEvery*(e.enr?.6:1);
            if(e.kind==='swarmlord'){e.summon=ev*1.4;for(let k=-1;k<=1;k++)E.push({...mk(ENEMY_TYPES.runner,e.y+e.h*.3,e.x+k*e.h*.6),coin:0});}
            else{e.summon=ev;for(const k of[-1,1])E.push(mk(ENEMY_TYPES.mini,e.y+e.h*.3,e.x+k*e.h*.6));}}
        }
        const sp=e.clOn?0:e.sp*(e.slow>0?1-st.slowAmt:1)*evMul(e);e.y+=sp*dt+kb0*KI;
        // the perimeter is touched by the enemy's front edge; it is put back just in front of the line
        if(e.clOn){
          if(e.hp>0){e.kb=0;e.y=LINE-e.h/2-.003;e.clT-=dt;
            if(e.clT<=0){e.clT=EVT.clingEvery;contact(e,EVT.clingAtk);}}
        }else if(e.hp>0&&e.y+e.h/2>LINE&&sp+e.kb>0){
          e.kb=-e.sp*contact(e,1);e.y=LINE-e.h/2-.003;
          if(e.cl&&!e.boss){e.clOn=1;e.clT=EVT.clingEvery;e.kb=0;}
        }
      }
      // bullets landing now: the game's bullets fly (and home in), so the triangle keeps firing at the front enemy while
      // earlier bullets are still on their way to it; once it dies those fly on straight and mostly leave the screen
      if(P.length)flyPellets();
      for(let q=0;q<Q.length;){
        const b=Q[q];if(b.at>t){q++;continue;}Q.splice(q,1);
        let e=b.e;const hits=new Set();
        if(!(e.hp>0&&!e.ph)){e=towards(b.ox,BY,e.x,e.y,Math.min(Math.hypot(e.x-b.ox,e.y-BY)-e.h*.55,.95*((e.td??t)-b.t0)),hits);if(!e){BUL.m++;continue;}}
        follow(e,b.m,b.ox,BY,hits,0);
      }
      // game: one volley per frame at most, and the cooldown restarts at 1/rate, so the rate is rounded up to whole frames
      const rate=frames(st.rate*(A.overdrive&&A.overdrive.left>0?A.overdrive.m:1));
      while(cd<=0){
        const vis=E.filter(e=>e.y>=st.rangeY&&e.hp>0&&!e.ph).sort((a,b)=>b.y-a.y);if(!vis.length){cd=0;break;}
        // main bullet, multishot extras and twin go to the next enemies in line
        const B=BU?[]:[[0,1]];
        if(BU)burstSalvo(vis);
        else if(Math.random()<st.multiChance){qe('multishot');for(let k=1;k<=ECO.multiExtra;k++)if(vis[k])B.push([k,1]);}
        if(st.twin)B.push([vis[1]?1:0,st.twin*st.pellet]);
        // flight: 0.95 screen heights a second from just above the triangle, the enemy walking into it
        for(const [i0,m] of B){const e=vis[i0];Q.push({e,m,ox:triX,t0:t,at:t+Math.max(0,Math.hypot(e.x-triX,BY-e.y)-e.h*.55)/(.95+e.sp)});BUL.n++;}
        // ARC: lightning from the target to the nearest enemies, each within 0.4 screen widths of the last
        if(st.arcEvery&&++shots%st.arcEvery===0){const hs=[vis[0]];let cur=vis[0];const r2=(.4*GWH)**2;
          while(hs.length<st.arcN){let nx=null,nd=r2;for(const o of E){if(o.hp<=0||hs.includes(o))continue;const d=d2(o,cur.x,cur.y);if(d<nd){nd=d;nx=o;}}if(!nx)break;hs.push(nx);cur=nx;}
          for(const e of hs)hit(e,HD*st.arcM*(e.boss?st.bossDmg:1));}
        cd+=1/rate;
      }
      for(let i=E.length-1;i>=0;i--)if(E[i].hp<=0){const d=E[i];E.splice(i,1);d.td=t;kill(d);tkills++;}
      // SHATTER: each burst hurts and slows the nearest enemies around it (at most ECO.shatterMax; 12 bursts a step)
      if(SQ.length){const q=SQ;SQ=[];const r2=(SHATTER_R*GWH)**2;
        for(const b of q.slice(0,12)){const near=[];for(const o of E)if(o.hp>0){const d=d2(o,b.x,b.y);if(d<=r2)near.push([d,o]);}
          near.sort((p,q)=>p[0]-q[0]);for(const [,o] of near.slice(0,ECO.shatterMax)){hit(o,b.d*(o.boss?.25:1));o.slow=Math.max(o.slow,ECO.slowTime);}}}
      separate();
      if(TRACE&&Math.round(t/dt)%Math.round(1/dt)===0){const L=E.filter(e=>e.hp>0&&e.y>0);FS.y+=L.reduce((a,e)=>a+e.y,0);FS.n+=L.length;FS.l+=L.filter(e=>e.y>.6).length;FS.k++;}
      if(hp<=0||t>5400){DROP.t+=t/st.speed;summary();if(TRACE)console.log('DEATH in wave '+w+' (eff '+ew+') after '+((dur-left)).toFixed(0)+'s of '+dur.toFixed(0)+'s: kills '+tkills+', contacts '+tcontacts+', dmg '+(tdmg/st.maxHp*100).toFixed(0)+'% of maxHp, enemies alive '+E.length);return{w,coins,drops:dropC,gems,t:t/st.speed,dmg:tdAll/st.maxHp+1,...fin()};}
    };
    var summary=()=>{if(TRACE)console.log('mean height of kills '+(ky/kn).toFixed(3)+' · bullet hits '+HN.n+', '+fmtN(HN.d/HN.n)+' each, per second '+(HN.n/(t/st.speed)).toFixed(2)+' · bullets fired '+(BUL.N+BUL.n)+', '+((BUL.M+BUL.m)/(BUL.N+BUL.n)*100).toFixed(0)+'% never hit');BUL.N=BUL.M=0;if(TRACE)console.log('field: '+(FS.n/FS.k).toFixed(1)+' enemies on screen, average height '+(FS.y/FS.n).toFixed(3)+', '+(FS.l/FS.k).toFixed(1)+' past 60%');if(TRACE)console.log('coins: kills '+fmtN(ck)+', wave bounty '+fmtN(cb)+', drops '+fmtN(dropC));};
    // game separateEnemies(): overlapping enemies are pushed apart, the lighter one more, mostly sideways
    const separate=()=>{
      const n=E.length;if(n<2)return;const L=E.slice().sort((a,b)=>a.x-b.x);let rmax=0;for(const e of L)if(e.h>rmax)rmax=e.h;rmax*=.5;
      for(let i=0;i<n;i++){const a=L[i];if(a.hp<=0)continue;const ra=a.h*.5*a.sc;
        for(let j=i+1;j<n;j++){const b=L[j];if(b.x-a.x>ra+rmax)break;if(b.hp<=0)continue;
          const rb=b.h*.5*b.sc,dx=b.x-a.x,dy=b.y-a.y,mn=(ra+rb)*.92,dd=dx*dx+dy*dy;if(dd>=mn*mn)continue;
          const d=Math.sqrt(dd),nx=d>1e-5?dx/d:(i%2?1:-1),ny=d>1e-5?dy/d:0,p=mn-d;
          const ma=a.h*a.h*(a.boss?4:1),mb=b.h*b.h*(b.boss?4:1),wa=mb/(ma+mb),wb=1-wa;
          a.x-=nx*p*wa;a.y-=ny*p*wa*.5;b.x+=nx*p*wb;b.y+=ny*p*wb*.5;}}
      for(const e of E){const m=e.h*.5+.003;if(e.x<m)e.x=m;else if(e.x>GWH-m)e.x=GWH-m;}
    };
  }
  for(;;){
    // a weekly op keeps its mutators all run long (BOSS RUSH: a boss every 3 waves) and has no wave events
    const BE=(WM&&WM.bossEvery)||ECO.bossEvery;
    w++;ew=w+(tier-1)*TIERS.offset;const boss=w%BE===0;
    const evk=WM||NOEV?null:FORCE?(w>=4&&w%ECO.bossEvery?FORCE:null):G.eventFor?G.eventFor(w,tier,evSeed):null;M=WM||(evk?G.combineMods([evk],G.EVENTS):G.NOMODS);
    const bk=boss&&G.bossKindFor&&!process.env.SIM_BOSSKIND?G.bossKindFor(w,BE):'classic';
    hpB=ECO.enemyHp*Math.pow(ECO.enemyHpGrowth,ew-1);atkB=ECO.enemyAtk*Math.pow(ECO.enemyAtkGrowth,ew-1);spB=.032*(1+Math.min(ew,150)*.005);
    pool=Object.values(ENEMY_TYPES).filter(x=>x.w>0&&ew>=x.from);tw=pool.reduce((s,x)=>s+x.w,0);cv=coinValueAt(ew)*st.mult;
    if(w>1){const b=pay(cv*st.bounty*mid());coins+=b;cb+=b;}   // MIDAS counts: it is part of the game's coin multiplier   // game: WAVE BOUNTY is paid as each new wave starts (from wave 2)
    if(w>maxW){DROP.t+=t/st.speed;summary();return{w:w-1,coins,drops:dropC,gems,t:t/st.speed,dmg:tdAll/st.maxHp,...fin()};}
    dur=Math.min(45,18+w*.5)*(+process.env.SIM_WAVEK||1);iv=Math.max(.5,2.2-w*.04)*(M.ival||1);per=Math.max(1,Math.round(Math.floor(1+w/20)*(M.spawn||1)));
    // game spawnWave(): a first group queued above the entry line, then the boss in the middle
    for(let i=0,n=Math.min(3+Math.floor(ew/8),8);i<n;i++){const T=pick();E.push(mk(T,.1-T.sz*GWH/2-i*(.07+Math.random()*.04)));}
    if(boss){const bh=hpB*ECO.bossHpMul*(M.ehp||1),h=.13*GWH*(M.esz||1);E.push({x:GWH/2,y:.1-h/2,sc:.1,wv:w,h,w:h*1.1,hp:bh,max:bh,atk:atkB*ECO.bossAtkMul,sp:spB*.5*(M.espd||1),coin:ECO.bossCoins*(M.ecoin||1),kb:0,slow:0,frz:0,boss:true,summon:ECO.bossSummonEvery,pt:ECO.bossPulseFirst||0,enr:false,kind:bk,
      sh:bk==='bulwark'?bh*(ECO.bossShield||0):0,heal:bk==='regen'?(ECO.bossRegen||0):0,ht:1,ar:0});}
    left=dur;spawnT=0;let r;
    while(left>0)if(r=tick(true))return r;
    QE.wave=w;   // game qReach('wave',waveNum) when the wave timer runs out
    hp=Math.min(st.maxHp,hp+st.maxHp*st.waveHeal);
    if(TRACE)console.log('wave '+String(w).padStart(3)+' (eff '+String(ew).padStart(3)+')  hp '+String(Math.round(hp/st.maxHp*100)).padStart(3)+'%  kills '+String(tkills).padStart(4)+'  contacts '+String(tcontacts).padStart(4)+'  dmg taken '+(tdmg/st.maxHp*100).toFixed(1)+'% of maxHp  (atk/contact '+(tcontacts?(tdmg/tcontacts/st.maxHp*100).toFixed(2):'0')+'% of maxHp)  dealt '+fmtN(tdealt)+'  coins '+fmtN(coins-tc0)+'  left on field '+E.length+(E.some(e=>e.boss)?' +boss':'')+' ('+E.filter(e=>e.T===ENEMY_TYPES.mini).length+' shards)  bullets '+BUL.n+', '+Math.round(BUL.m/Math.max(1,BUL.n)*100)+'% missed');BUL.N+=BUL.n;BUL.M+=BUL.m;BUL.n=BUL.m=0;
    TOT.k+=tkills;TOT.d+=tdealt;tkills=0;tdmg=0;tcontacts=0;tdealt=0;tc0=coins;
    // the 2-2.5 s break: nothing spawns, but the field keeps moving and the triangle keeps shooting
    for(let gap=2+Math.random()*.5;gap>0;gap-=dt)if(r=tick(false))return r;
  }
}

// how deep a build gets: climb tiers while it clears the unlock wave, report effective wave + coins/hour
const DEPTH_N=+process.env.SIM_DEPTH_N||4;   // runs per tier (was 2 — raised to cut the ±5-8% noise from a single unlucky/lucky run)
function depth(maxTier=40){
  let best=0,cph=0,t=1,spread=0;
  for(;t<=maxTier;t++){
    const r=[];for(let i=0;i<DEPTH_N;i++)r.push(run(t,TIERS.unlockWave+10));
    const ws=r.map(x=>x.w),w=Math.max(...ws);best=(t-1)*TIERS.offset+w;
    spread=Math.max(...ws)-Math.min(...ws);
    cph=Math.max(cph,r.reduce((s,x)=>s+x.coins,0)/r.reduce((s,x)=>s+x.t,0)*3600);
    if(w<TIERS.unlockWave)break;
  }
  return{eff:best,tier:Math.min(t,maxTier),cph,spread};
}
// required by another tool (tools/referee.js): hand over the builds and the run code, skip the command line below
if(require.main!==module){module.exports={weeklyMods:k=>G.combineMods(k),TAT_TYPES:G.TAT_TYPES,MUTATORS:G.MUTATORS,BUILDS,shop,equip,save,run,depth,TIERS,fmtN,reseed:s=>{_seed=(s>>>0)||1;},resetDrops:()=>{DROP.t=DROP.coin=DROP.gem=0;}};return;}

// trace: one run, wave by wave (health at the end of the wave, kills, perimeter contacts, damage taken)
//   node tools/sim.js trace <build> <budget> <tier> [lv=5]
if(process.argv[2]==='trace'){
  const b=process.argv[3],B=+process.argv[4],T=+process.argv[5]||1;save.perm={};shop(b,B,{gameSpeed:1});equip(b,+process.argv[6]||5);
  process.env.SIM_TRACE='1';const r=run(T,80);console.log('result: wave '+r.w+', '+(r.t/60).toFixed(1)+' min, '+fmtN(r.coins)+' coins');process.exit(0);
}
// evtest: how far each build gets in a FIXED tier (mean wave over N runs) with the current event settings.
//   SIM_FORCEEV=cling node tools/sim.js evtest   (events on every wave)   ·   SIM_NOEVENTS=1 for the baseline
//   prints "mean wave" per build and budget, then the mean over all of them
if(process.argv[2]==='evtest'){
  const names=(process.argv[3]||'offense,thornsTank,control,swarm,farm').split(','),BUD=(process.env.SIM_BUDGETS||'1e6,1e8,1e10').split(',').map(Number),N=+process.env.SIM_N||60;
  let tot=0,n=0,out=[];
  for(const b of names){let line=b.padEnd(11);
    BUD.forEach((B,i)=>{save.perm={};shop(b,B,{gameSpeed:1});equip(b,5);let sw=0,sc=0,sd=0;
      // the tier is picked WITHOUT events (highest tier where 6 runs average the unlock wave), so every event setting is measured in the same place
      const ne=NOEV;NOEV=true;let T=1;for(;T<40;T++){let m=0;for(let k=0;k<6;k++)m+=run(T+1,TIERS.unlockWave+10).w;if(m/6<TIERS.unlockWave)break;}NOEV=ne;
      for(let k=0;k<N;k++){const r=run(T);sw+=r.w;sc+=r.coins;sd+=r.dmg;}
      const m=sw/N;line+=m.toFixed(1).padStart(8);tot+=m;n++;});
    out.push(line);}
  console.log(out.join(String.fromCharCode(10)));console.log('MEAN '+(tot/n).toFixed(2));process.exit(0);
}
// modes: RAPID vs BURST with the same shop and tattoos, in the first tier where RAPID falls short of the unlock wave
//   node tools/sim.js modes [builds] [budgets=1e7,1e9]   (SIM_N runs per mode, default 12) → mean wave per mode
if(process.argv[2]==='modes'){
  const names=(process.argv[3]||'offense,swarm,thornsTank,bruiser,control,active').split(','),BUD=(process.argv[4]||'1e7,1e9').split(',').map(Number),N=+process.env.SIM_N||12;
  let ratio=0,n=0;
  for(const b of names)for(const B of BUD){
    save.perm={};shop(b,B,{gameSpeed:1});equip(b,5);save.mode='rapid';
    let T=1;for(;T<30;T++)if(run(T+1,TIERS.unlockWave).w<TIERS.unlockWave)break;T=Math.max(2,T+1);   // +1: the frontier tier, where RAPID falls short of the unlock wave
    const m={};for(const mode of ['rapid','burst']){save.mode=mode;let s=0;for(let i=0;i<N;i++)s+=run(T,45).w;m[mode]=s/N;}
    ratio+=m.burst-m.rapid;n++;const ph=(PEL.h/PEL.n*100).toFixed(0)+"% hit, "+(PEL.f/PEL.n*100).toFixed(0)+"% front";PEL.n=PEL.h=PEL.f=0;
    console.log(`${b.padEnd(10)} ${B.toExponential(0)} T${T}: rapid ${m.rapid.toFixed(1)}  burst ${m.burst.toFixed(1)}  (${(m.burst-m.rapid>=0?'+':'')+(m.burst-m.rapid).toFixed(1)})  pellets ${ph}`);
  }
  console.log('mean burst - rapid: '+(ratio/n).toFixed(2)+' waves');process.exit(0);
}
if(process.argv[2]==='debug'){
  const b=process.argv[3],B=+process.argv[4];save.perm={};shop(b,B,{gameSpeed:1});equip(b,+process.argv[5]||5);
  setTier(1);const st=stats();console.log(JSON.stringify(save.perm));
  console.log(Object.fromEntries(Object.entries(st).map(([k,v])=>[k,typeof v==='number'?+v.toPrecision(3):v])));
  for(let t=8;t<=13;t++){const r=run(t,40);console.log('T'+t,r.w,fmtN(r.coins),(r.t/60).toFixed(1)+'min');}
  process.exit(0);
}
if(process.argv[2]==='compare'){
  const LV=+process.argv[3]||5,names=(process.argv[4]||Object.keys(BUILDS).join(',')).split(',');
  const BUDGETS=(process.env.SIM_BUDGETS||'1e4,1e6,1e8,1e10,1e12').split(',').map(Number);
  console.log(`tattoos at Lv${LV} · effective wave reached (tier, ±noise at the final tier) · coins per hour at best tier`);
  console.log('build    '+BUDGETS.map(b=>fmtN(b).padStart(20)).join(''));
  for(const b of names){
    let line=b.padEnd(9);
    for(const B of BUDGETS){save.perm={};shop(b,B,{gameSpeed:1});equip(b,LV);const d=depth();line+=`${String(d.eff).padStart(5)}±${d.spread} (T${String(d.tier).padStart(2)}) ${fmtN(d.cph).padStart(7)}/h`;}
    console.log(line);
  }
  process.exit(0);
}

// tattoos: every tattoo alone in its slot (Lv LV) against no tattoo at all, under three shop styles
//   node tools/sim.js tattoos [lv=5]   → depth gain (x) and coins/hour gain (x) per tattoo, averaged over budgets
if(process.argv[2]==='tattoos'){
  const LV=+process.argv[3]||5,BUD=(process.env.SIM_BUDGETS||'3e4,3e6,3e8').split(',').map(Number),STY=['offense','swarm','tank'];
  const N=+process.env.SIM_N||2;
  const mean=(f)=>{let w=0,c=0;for(let i=0;i<N;i++){const d=f();w+=d.eff;c+=d.cph;}return{w:w/N,c:c/N};};
  const base={};
  for(const st of STY)for(const B of BUD){save.perm={};shop(st,B,{gameSpeed:1});save.tatCol={};save.equipped=[];base[st+B]=mean(()=>depth());}
  const rows=[];
  for(const t of G.TAT_TYPES){
    let rw=0,rc=0,n=0;
    for(const st of STY)for(const B of BUD){save.perm={};shop(st,B,{gameSpeed:1});save.tatCol={[t.id]:{lv:LV,copies:0}};save.equipped=[t.id];
      const m=mean(()=>depth()),b=base[st+B];rw+=m.w/b.w;rc+=m.c/b.c;n++;}
    rows.push([t.id,t.rar,rw/n,rc/n]);
  }
  console.log('tattoo at Lv'+LV+' alone vs none: depth x · coins/h x (mean over '+STY.length*BUD.length+' cases)');
  for(const [id,r,w,c] of rows.sort((x,y)=>y[2]-x[2]))console.log(id.padEnd(13)+'rar'+r+'  depth x'+w.toFixed(3)+'   coins/h x'+c.toFixed(2));
  process.exit(0);
}

// tattoocard: one tattoo at several levels against no tattoo, same 9 cases as `tattoos` (3 shop styles x 3 budgets).
//   node tools/sim.js tattoocard <id> [levels=2,7]   → one CARD line of JSON; tools/sim-card.js runs it for every tattoo and grades them
if(process.argv[2]==='tattoocard'){
  const id=process.argv[3],LVS=(process.argv[4]||'2,7').split(',').map(Number),BUD=(process.env.SIM_BUDGETS||'3e4,3e6,3e8').split(',').map(Number),STY=['offense','swarm','tank'];
  const N=+process.env.SIM_N||3;
  const mean=()=>{let w=0,c=0;for(let i=0;i<N;i++){const d=depth();w+=d.eff;c+=d.cph;}return{w:w/N,c:c/N};};
  const put=(st,B,tat,lv)=>{save.perm={};shop(st,B,{gameSpeed:1});save.tatCol=tat?{[tat]:{lv,copies:0}}:{};save.equipped=tat?[tat]:[];};
  const base={};for(const st of STY)for(const B of BUD){put(st,B);base[st+B]=mean();}
  // e = how fast depth grows with budget (waves x per budget x, between 3e6 and 3e8); lets the card turn a depth gain into "as good as N x budget"
  let e=0;for(const st of STY)e+=Math.log(base[st+BUD[BUD.length-1]].w/base[st+BUD[BUD.length-2]].w)/Math.log(BUD[BUD.length-1]/BUD[BUD.length-2])/STY.length;
  const out={id,rar:G.TAT_TYPES.find(t=>t.id===id).rar,e,lv:{}};
  for(const lv of LVS){let rw=0,rc=0,n=0;
    for(const st of STY)for(const B of BUD){put(st,B,id,lv);const m=mean(),b=base[st+B];rw+=m.w/b.w;rc+=m.c/b.c;n++;}
    out.lv[lv]={w:rw/n,c:rc/n};}
  console.log('CARD '+JSON.stringify(out));
  process.exit(0);
}

// player types (SIM_TYPE, see the long-term progression below); up here because `shopcard` reads the normal one
const PTYPES={short:{dayH:.25,ads:1,afkH:0,sess:1},normal:{dayH:.75,ads:4,afkH:1,sess:2},keen:{dayH:2,ads:10,afkH:3,sess:3},afk:{dayH:1/3,ads:2,afkH:6,sess:1}};
// shopcard: one shop upgrade against the normal mix, same 9 cases as `tattoocard` (3 shop styles x 3 budgets, no tattoos).
//   node tools/sim.js shopcard <id|mix>   → one SHOP line of JSON; tools/sim-shopcard.js runs it for every upgrade and grades them
// From each style's normal shopping at budget B (as a real player: GAME SPEED and IDLE INCOME included), SIM_EXTRA x B more (default 1 =
// doubling) goes into that one upgrade only (`mix` = the style's normal way, the yardstick; `a+b` = two upgrades that only work together,
// cheapest level first). Measured in ONE fixed tier per case (the first one the base shopping cannot clear), SIM_N runs (default 24) with
// the same random numbers for base, mix and upgrade, so the difference is the upgrade and not luck: mean wave (w) and coins per hour (c),
// plus what was really spent (x B). IDLE INCOME pays nothing inside a run, so its c is the day's income of a `normal` player type (play
// hours + idle hours away, doubled by an ad) instead.
if(process.argv[2]==='shopcard'){
  const id=process.argv[3],BUD=(process.env.SIM_BUDGETS||'1e5,3e6,3e8').split(',').map(Number),STY=['offense','swarm','tank'],X=+process.env.SIM_EXTRA||1;
  const N=+process.env.SIM_N||24,parts=id==='mix'?[]:id.split('+');for(const p of parts)if(!PU[p])throw new Error('unknown upgrade '+p);
  const SEED=+process.env.SIM_SEED||1,fresh=()=>{_seed=SEED;DROP.t=DROP.coin=DROP.gem=0;};   // drops use random numbers too, so they restart as well
  const measure=T=>{fresh();let w=0,c=0,t=0;for(let i=0;i<N;i++){const r=run(T,60);w+=r.w;c+=r.coins;t+=r.t;}return{w:w/N,c:c/t*3600};};
  const P=PTYPES.normal,dayInc=v=>P.dayH+v*ECO.offlineDayH*(P.ads>0?2:1);   // normal player's day in hours of run income
  for(const st of STY)BUILDS[st].shop={...BUILDS[st].shop,offline:BUILDS[st].shop.offline||1};
  const put=(st,B)=>{save.perm={};shop(st,B);save.tatCol={};save.equipped=[];};
  const lvs=()=>parts.reduce((a,p)=>a+(save.perm[p]||0),0);
  const out={id,cat:parts.length?PU[parts[0]].cat:'mix',cases:{}};
  for(const st of STY)for(const B of BUD){
    put(st,B);fresh();let T=1;for(;T<40;T++){let m=0;for(let k=0;k<6;k++)m+=run(T,TIERS.unlockWave).w;if(m/6<TIERS.unlockWave)break;}
    const b=measure(T),l0=lvs(),v0=G.permVal('offline');let bank=B*X;
    if(id==='mix')bank=shop(st,bank);
    else for(;;){let best=null;for(const p of parts){const l=save.perm[p]||0;if(l<PU[p].max){const c=upCost(PU[p],l);if(!best||c<best[1])best=[p,c];}}
      if(!best||best[1]>bank)break;bank-=best[1];save.perm[best[0]]=(save.perm[best[0]]||0)+1;}
    const spent=(B*X-bank)/B,r={T,lv0:l0,lv:lvs(),spent,w0:b.w,w:b.w,c:1};
    if(spent>0){if(id==='offline')r.c=dayInc(G.permVal('offline'))/dayInc(v0);else{const m=measure(T);r.w=m.w;
      r.c=m.c/b.c*(id==='mix'?dayInc(G.permVal('offline'))/dayInc(v0):1);}}   // the mix may raise IDLE INCOME too
    out.cases[st+' '+B]=r;}
  console.log('SHOP '+JSON.stringify(out));
  process.exit(0);
}

// value: from the same starting point, put an extra 25% of the budget into ONE upgrade and measure
// how many waves it adds (combat) or how much coins/hour (economy). Shows over/under-priced upgrades.
if(process.argv[2]==='value'){
  const B=+process.argv[3]||1e8,base=process.argv[4]||'offense',N=+process.env.SIM_N||6;
  const ids=PERM_UPGRADES.map(u=>u.id).filter(id=>id!=='gameSpeed');
  const setup=()=>{save.perm={};shop(base,B,{gameSpeed:1});save.tatCol={};save.equipped=[];};
  setup();const T=depth().tier,start={...save.perm};
  const measure=()=>{let w=0,c=0,t=0;for(let i=0;i<N;i++){const r=run(T,60);w+=r.w;c+=r.coins;t+=r.t;}return{w:w/N,cph:c/t*3600};};
  const b0=measure();
  console.log(`base ${base} @ ${fmtN(B)} · tier ${T} · ${b0.w.toFixed(1)} waves · ${fmtN(b0.cph)}/h  (extra ${fmtN(B*.25)} into one upgrade)`);
  const rows=[];
  for(const id of ids){
    save.perm={...start};let bank=B*.25;const u=PU[id];
    while((save.perm[id]||0)<u.max){const c=upCost(u,save.perm[id]||0);if(c>bank)break;bank-=c;save.perm[id]=(save.perm[id]||0)+1;}
    const m=measure();rows.push([id,(save.perm[id]||0)-(start[id]||0),m.w-b0.w,m.cph/b0.cph]);
  }
  rows.sort((a,b)=>b[2]-a[2]);
  for(const [id,lv,dw,cr] of rows)console.log(`${id.padEnd(11)} +${String(lv).padStart(5)} lv  ${(dw>=0?'+':'')+dw.toFixed(1).padStart(5)} waves  coins/h x${cr.toFixed(2)}`);
  process.exit(0);
}

// ── long-term progression ──
// SIM_TLV=n: the build's 5 tattoos at Lv n in 5 slots from hour 0 (the old, simple model; npm run pace uses it unless SIM_ECON=1).
// SIM_ECON=1: a new save, and everything outside the shop is earned as in the game (overhaul step A2):
//   gems from field drops, daily + weekly quests, the 7-day daily reward, the weekly op, achievements and ads; they buy tattoo
//   slots and inks (pity, Lv7 cap and the LOGIC BOMB gift as in the game), and the build's tattoos are put on as they turn up.
//   Coins on top of runs: idle income for the time away (8 h a day at most), the daily reward, quest and achievement coins.
//   One "day" = SIM_DAYH play hours (default 2, or SIM_TYPE below), SIM_ADS rewarded ads a day (default 0; the first one doubles
//   the idle income), SIM_AFKH hours a day left on AUTO RETRY with nobody watching (default 0, from Tier 3), SIM_SESS sessions a day
//   (only limits the ads: one per 15 min), SIM_GEMPLAN=slot (save gems for the next slot, default) or ink. Quests wait on the board
//   until the runs finish them; the weekly op is tried once a day until its three rewards are got. Not modelled: themes (gems spent on looks), paid gems.
// SIM_TYPE=short|normal|keen|afk (overhaul step A3, agreed with Ahmet 2026-10-30): a player type sets SIM_ECON=1 and the day
//   (play hours, ads, AUTO RETRY hours, sessions); a SIM_DAYH/SIM_ADS/SIM_AFKH set by hand still wins. Balance aims at normal,
//   the others only check that nobody is stuck for days and nobody finishes the content in a week. Placeholders until real data.
//   SIM_DAYS=n: play n calendar days (the hours argument is ignored then) and print one DAYS line (tools/sim-types.js reads it).
const PT=process.env.SIM_TYPE?PTYPES[process.env.SIM_TYPE]:null;if(process.env.SIM_TYPE&&!PT)throw new Error('unknown player type '+process.env.SIM_TYPE);
const env=(k,d)=>process.env[k]!==undefined&&process.env[k]!==''?+eval(process.env[k]):d;
const DAYH=env('SIM_DAYH',PT?PT.dayH:2),AFKH=env('SIM_AFKH',PT?PT.afkH:0),SESS=env('SIM_SESS',PT?PT.sess:1),DAYS=env('SIM_DAYS',0);
const HOURS=DAYS?DAYS*DAYH:+process.argv[2]||600,BUILD=process.argv[3]||'offense',EC=process.env.SIM_ECON==='1'||!!PT,TLV=EC?0:+process.env.SIM_TLV||0;
if(!BUILDS[BUILD])throw new Error('unknown build '+BUILD);
if(TLV)equip(BUILD,TLV);
const LOG=[1,2,5,10,20,42,84,168,336,600,1000,1500,2000,3000].filter(h=>h<=HOURS);
let bank=0,clock=0,li=0,runs=0,tier=1;const tierBest={1:0};save.tierBest=tierBest;   // mastery stars count
// SIM_PACE=1: print the hours it takes to first reach these effective waves (to compare builds' real speed)
const PACE=process.env.SIM_PACE==='1',MILES=[50,75,100,125,150,175,200,250,300,400],hit={},atH={},AT=[42,84,168,336,600];
const effNow=()=>Object.entries(tierBest).reduce((m,[t,w])=>w?Math.max(m,(t-1)*TIERS.offset+w):m,0);
const BOOST=(process.env.SIM_BOOST==='all'?'lucky,power,berserk,rapid,shield,invincible,focus':process.env.SIM_BOOST||'').split(',').filter(Boolean);
let idleCps=0;   // average income per second of recent runs (game save.idleCps): idle income, daily reward coins, and an older game's (SIM_SRC) boost prices
const buyBoosts=()=>{save.temp={};const e=effNow();for(const id of BOOST){const u=TEMP.find(x=>x.id===id);if(!u)continue;
  const c=G.boostPrice?G.boostPrice(u.base,e,idleCps):Math.ceil(u.base*Math.pow(ECO.tempCostGrowth,e));if(bank>=c){bank-=c;save.temp[id]=1;}}};
// game saveProgress(): runs of 2+ minutes, kills and wave bounty only (field drops are not part of the rate), AUTO RETRY runs never count
const ranRun=r=>{const c=(r.coins-(r.drops||0))/r.t;if(r.t>=120)idleCps=idleCps?idleCps*.7+c*.3:c;save.temp={};};

// ── the economy outside the runs (SIM_ECON=1) ──
// gems by source (qday / qweek = daily / weekly quests); QN = quests offered and claimed (offered = what arrives, the board cap aside)
const GEM={drop:0,qday:0,qweek:0,daily:0,weekly:0,ach:0,ad:0},SPENT={slot:0,ink:0},CX={runs:0,idle:0,daily:0,quest:0,ach:0,afk:0,weekly:0};
const QN={dOff:0,dDone:0,wOff:0,wDone:0};
// ads: the daily cap, and one every adCooldown (15 min) inside a session (nobody watches ads during AUTO RETRY)
const ADS_FIT=SESS*(Math.floor(DAYH*3600/SESS/ECO.adCooldown)+1),ADS=Math.min(ECO.adDailyCap,ADS_FIT,env('SIM_ADS',PT?PT.ads:0)),PLAN=process.env.SIM_GEMPLAN||'slot';
let day=0,afkClock=0;
// idle income is worth buying once the time away pays (every build buys it like a coin upgrade)
if(EC)for(const b in BUILDS)BUILDS[b].shop={...BUILDS[b].shop,offline:BUILDS[b].shop.offline||1};
if(EC)Object.assign(save,{tatCol:{},equipped:[],tatSlots:1,pity:0,gems:0,quests:[],achClaimed:[],daily:{n:0,last:''},
  life:{kills:0,dmg:0,runs:0,bosses:0,levels:0,quests:0,pulls:0,drops:0,boosts:0,bombs:0}});
const owned=()=>G.TAT_TYPES.filter(t=>G.tatOf(t.id).lv>0).map(t=>t.id);
// what goes in the slots: the build's own tattoos first (in its order), then the best of the rest (rarer and higher level first)
const equipBest=()=>{const own=owned(),want=BUILDS[BUILD].tat.filter(id=>own.includes(id));
  const sc=id=>G.tatOf(id).lv*(1+G.TT[id].rar*.5),rest=own.filter(id=>!want.includes(id)).sort((a,b)=>sc(b)-sc(a));
  save.equipped=[...want,...rest].slice(0,save.tatSlots);};
// gems: the next slot first as long as there is a tattoo to put in it (SIM_GEMPLAN=slot), else inks 10 at a time (cheaper each);
// one at a time only while a slot is still empty. The pity counter and the pool work as in the game's doPull().
const spendGems=()=>{
  for(;;){const own=owned().length,sp=G.TAT_SLOT_PRICES[save.tatSlots-1],slotNext=save.tatSlots<G.MAX_SLOTS&&own>save.tatSlots;
    if(slotNext&&save.gems>=sp){save.gems-=sp;SPENT.slot+=sp;save.tatSlots++;continue;}
    if(slotNext&&PLAN==='slot')break;
    const n=save.gems>=ECO.pull10Cost?10:save.gems>=ECO.pullCost&&own<save.tatSlots?1:0;
    if(!n||!G.tatPool().length)break;
    const c=n===10?ECO.pull10Cost:ECO.pullCost;save.gems-=c;SPENT.ink+=c;save.life.pulls+=n;
    for(let i=0;i<n;i++){const top=G.pityRar(),t=G.rollType();if(!t)break;save.pity=t.rar===top?0:(save.pity||0)+1;G.addTatCopy(t.id);}
  }
  equipBest();};
// quests sit on the board (game: refreshQuests) until the runs fill them (game: qEvent / qReach); AUTO RETRY and weekly runs count too.
// Every kind is counted in run() where the game counts it (r.qe); kills, bombs, drops and coins come from the run's totals.
// A finished quest is claimed at once.
const questProg=r=>{for(const q of save.quests){
    const v=q.k==='kill'?r.kills:q.k==='bomb'?r.bombs:q.k==='drop'?r.taps:q.k==='coins'?r.coins:r.qe[q.k];
    if(q.k==='wave'){if(v>q.prog)q.prog=Math.min(q.target,v);}else q.prog=Math.min(q.target,q.prog+Math.floor(v||0));}
  for(const q of save.quests.filter(q=>q.prog>=q.target)){const W=q.kind==='weekly';save.gems+=q.gems;GEM[W?'qweek':'qday']+=q.gems;QN[W?'wDone':'dDone']++;bank+=q.coins;CX.quest+=q.coins;save.life.quests++;}
  save.quests=save.quests.filter(q=>q.prog<q.target);};
// SIM_DAYS: the state at the start of every day (entry d = after d days): effective wave, highest open tier, slots, tattoos owned, gems earned,
// and for tools/sim-gemcard.js the running totals: gems by source, quests offered / claimed, hours played (watched) and on AUTO RETRY
const dayLog=[],logDay=()=>dayLog.push({e:effNow(),t:G.maxUnlockedTier(),s:save.tatSlots,o:owned().length,g:Object.values(GEM).reduce((a,x)=>a+x,0),
  gs:{...GEM},q:{...QN},h:+(clock/3600).toFixed(2),a:+(afkClock/3600).toFixed(2)});
const claimAch=()=>{for(const a of G.ACHS)if(!save.achClaimed.includes(a.id)&&G.achDone(a)){save.achClaimed.push(a.id);save.gems+=a.gems;GEM.ach+=a.gems;bank+=a.coins||0;CX.ach+=a.coins||0;}};
// after every run: lifetime counts (achievements read them), field gems, the LOGIC BOMB gift (Tier 1 wave 20), achievements, gems
const afterRun=(r,src)=>{if(!EC)return;const L=save.life;L.runs++;L.kills+=r.kills||0;L.dmg+=r.dealt||0;L.bosses+=r.bosses||0;L.bombs+=r.bombs||0;L.drops+=r.taps||0;
  save.gems+=r.gems||0;GEM.drop+=r.gems||0;CX[src]+=r.coins;questProg(r);
  if((tierBest[1]||0)>=20&&!G.tatOf('logic_bomb').lv)G.addTatCopy('logic_bomb');
  claimAch();spendGems();};
const shopL=b=>{const lv=()=>Object.values(save.perm).reduce((a,x)=>a+x,0),n=lv(),left=shop(BUILD,b);if(EC)save.life.levels+=lv()-n;return left;};
// the weekly op, one tier below the highest, this week's two mutators; gems at waves 10/20/30 once a week (not a tier record, not idle income).
// The game lets it be played again and again all week (its menu dot stays while a reward is left): one try a day until all three are got.
const WK={got:[]};
const weeklyOp=()=>{if(!G.MUTATORS)return;const T=Math.max(1,G.maxUnlockedTier()-1),r=run(T,1e9,{mods:G.combineMods(G.weeklyKeys(Math.floor(day/7)))});
  clock+=r.t+3;bank+=r.coins;afterRun(r,'weekly');for(const [w,g] of G.WEEKLY_REWARDS)if(r.w>=w&&!WK.got.includes(w)){WK.got.push(w);save.gems+=g;GEM.weekly+=g;}};
// The field-drop cooldowns run on the real clock (game gameNow), so they also run out while the player is away: the time between
// sessions (the day minus play and AUTO RETRY, split evenly before the SIM_SESS sessions) moves DROP.t on (AUTO RETRY runs move it themselves)
let GAP=0,sessN=0;
// a new day: last night's idle income, ads, the daily reward, 8 daily quests (one every 3 h), and on every 7th day 4 weekly quests + the weekly op
const newDay=()=>{
  if(day>0){let s=0;
    if(AFKH>0&&G.maxUnlockedTier()>=G.AUTO_RETRY.tier){   // AUTO RETRY left on: the same tier again and again, 2+5 s between runs
      while(s<AFKH*3600){const r=run(tier,1e9,{auto:true});s+=r.t+2+G.AUTO_RETRY.wait;afkClock+=r.t;bank+=r.coins;afterRun(r,'afk');tierBest[tier]=Math.max(tierBest[tier]||0,r.w);}}
    GAP=Math.max(0,(24-DAYH)*3600-s)/SESS;DROP.t+=GAP;
    const away=Math.max(0,24-DAYH-AFKH)*3600,secs=Math.min(ECO.offlineDayH*3600,away);
    if(away>=ECO.offlineMinSec&&idleCps>0){const c=idleCps*G.permVal('offline')*secs*(ADS>0?2:1);bank+=c;CX.idle+=c;}
    const g=Math.max(0,ADS-(idleCps>0?1:0))*ECO.adGems;save.gems+=g;GEM.ad+=g;
  }
  if(DAYS)logDay();   // after last night (AUTO RETRY, idle income, ads), before this day's rewards
  save.idleCps=idleCps;
  const d=G.DAILY[save.daily.n%G.DAILY.length];save.daily.n++;
  if(d.g){save.gems+=d.g;GEM.daily+=d.g;}if(d.c){const c=G.dailyCoins(d.c);bank+=c;CX.daily+=c;}
  QN.dOff+=24/G.QUEST.dailyEveryH;if(day%7===0)QN.wOff+=G.QUEST.weeklyCount;
  for(let i=0;i<24/G.QUEST.dailyEveryH;i++)if(save.quests.filter(q=>q.kind==='daily').length<G.QUEST.cap)save.quests.push(G.makeQuest('daily'));
  if(day%7===0){save.quests=save.quests.filter(q=>q.kind!=='weekly');   // last week's unfinished ones expire (finished ones were claimed)
    for(let i=0;i<G.QUEST.weeklyCount;i++)save.quests.push(G.makeQuest('weekly'));WK.got=[];}
  if(G.WEEKLY_REWARDS&&WK.got.length<G.WEEKLY_REWARDS.length)weeklyOp();
  day++;claimAch();spendGems();
};

// SIM_TRACE=1: one TRACE line per climbing run (not mastery farm), for tools/wave-map.js: tier, wave reached, best effective wave,
// coins of the run, hours played, a rough damage-per-second figure (bullet damage x rate x crit x multishot, after shopping), max HP,
// and what the next DAMAGE / FIRE RATE level costs in runs of this size
const TRACE=process.env.SIM_TRACE==='1';
const trace=r=>{setTier(tier);const st=stats(),nx=id=>upCost(PU[id],save.perm[id]||0)/Math.max(1,r.coins);
  const dps=st.hitDmg*st.pellets*st.rate*(1+st.crit*(st.critM-1))*(1+st.multiChance*ECO.multiExtra);
  console.log('TRACE '+JSON.stringify({t:r.tier||tier,w:r.w,e:effNow(),c:Math.round(r.coins),h:+(clock/3600).toFixed(2),d:day,dps:+dps.toPrecision(4),hp:Math.round(st.maxHp),
    nd:+nx('damage').toFixed(2),nf:+nx('fireRate').toFixed(2),o:owned().length,s:save.tatSlots}));};
while(clock<HOURS*3600){
  if(EC)while(clock>=day*DAYH*3600)newDay();
  if(EC)while(clock>=(sessN+1)*DAYH*3600/SESS){sessN++;if(sessN%SESS)DROP.t+=GAP;}   // a later session of the same day
  // every 10th run goes back to farm mastery stars in the highest tier (3+ below) that still misses one
  const farm=runs%10===9?[...Array(Math.max(0,tier-3)).keys()].map(i=>tier-3-i).find(t=>(tierBest[t]||0)<G.MASTERY[2]):0;
  if(farm){buyBoosts();const r=run(farm);ranRun(r);runs++;clock+=r.t+3;bank+=r.coins;tierBest[farm]=Math.max(tierBest[farm]||0,r.w);afterRun(r,'runs');bank=shopL(bank);continue;}
  buyBoosts();const r=run(tier);r.tier=tier;ranRun(r);runs++;clock+=r.t+3;bank+=r.coins;
  tierBest[tier]=Math.max(tierBest[tier]||0,r.w);
  if(tierBest[tier]>=TIERS.unlockWave&&tier<TIERS.max){tier++;tierBest[tier]=tierBest[tier]||0;}
  else if(r.w<6&&tier>1)tier--;
  afterRun(r,'runs');
  bank=shopL(bank);
  if(TRACE)trace(r);
  if(PACE){const e=effNow();for(const m of MILES)if(e>=m&&hit[m]===undefined)hit[m]=+(clock/3600).toFixed(1);for(const h of AT)if(clock>=h*3600&&atH[h]===undefined)atH[h]=e;if(hit[MILES[MILES.length-1]]!==undefined)break;continue;}
  while(li<LOG.length&&clock>=LOG[li]*3600){
    const mt=Object.keys(tierBest).map(Number).filter(t=>tierBest[t]>0).reduce((a,b)=>Math.max(a,b),1);
    const p=id=>save.perm[id]||0;
    console.log(`${String(LOG[li]).padStart(5)}h  runs ${String(runs).padStart(5)}  T${mt} best ${String(tierBest[mt]).padStart(2)} (eff ${(mt-1)*TIERS.offset+tierBest[mt]}) ★${G.totalStars()}  dmg L${p('damage')} hp L${p('maxHp')} rgn L${p('regen')} arm L${p('defense')} thr L${p('thorns')}  spd x${G.permVal('gameSpeed').toFixed(1)}  bank ${fmtN(bank)}`+
      (EC?`  · day ${day}  gems ${save.gems}  slots ${save.tatSlots}  ${save.equipped.map(id=>id+' '+G.tatOf(id).lv).join(', ')}`:''));
    li++;
  }
}
if(DAYS)logDay();
// a checkpoint passed during a mastery-farm run (those skip the PACE bookkeeping) still gets its value
if(PACE)for(const h of AT)if(h<=HOURS&&clock>=h*3600&&atH[h]===undefined)atH[h]=effNow();
// where the gems and coins came from (and went), and the whole collection at the end
const econ=EC?{days:day,gems:GEM,spent:SPENT,coins:Object.fromEntries(Object.entries(CX).map(([k,v])=>[k,+v.toPrecision(3)])),afkHours:+(afkClock/3600).toFixed(1),
  slots:save.tatSlots,equipped:save.equipped.map(id=>id+':'+G.tatOf(id).lv),owned:owned().length,pity:save.pity}:undefined;
if(DAYS)console.log('DAYS '+JSON.stringify({build:BUILD,type:process.env.SIM_TYPE||'',dayH:DAYH,ads:ADS,afkH:AFKH,playH:+(clock/3600).toFixed(1),maxSlots:G.MAX_SLOTS,tatTotal:G.TAT_TYPES.length,days:dayLog,econ}));
if(PACE)console.log('PACE '+JSON.stringify({build:BUILD,hours:HOURS,hit,at:atH,econ}));
else if(EC){const tg=Object.values(GEM).reduce((a,x)=>a+x,0),tc=Object.values(CX).reduce((a,x)=>a+x,0);
  console.log(`after ${day} days (${DAYH} h play a day): gems earned ${tg} = `+Object.entries(GEM).map(([k,v])=>`${k} ${v} (${Math.round(v/tg*100)}%)`).join(' · '));
  console.log(`gems spent: slots ${SPENT.slot} · inks ${SPENT.ink} (${SPENT.ink/ECO.pullCost|0}+ inks) · left ${save.gems}`);
  console.log('coins earned '+fmtN(tc)+' = '+Object.entries(CX).map(([k,v])=>`${k} ${fmtN(v)} (${(v/tc*100).toFixed(1)}%)`).join(' · '));
  console.log('tattoos: '+owned().map(id=>id+' '+G.tatOf(id).lv).join(', '));}
