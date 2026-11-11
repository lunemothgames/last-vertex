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
Math.random=rand;
// SIM_AIM=k: a bomb lands up to k x its radius away from the best spot (random direction; 0 = the perfect aim)
// SIM_SKILL=normal: a normal-skill player (placeholder until real data: taps 1.5 s late, bombs up to 0.4 x the radius off); SIM_HUMAN / SIM_AIM win
const SKILLS={perfect:{h:0,a:0},normal:{h:1.5,a:.4}},SKILL=SKILLS[process.env.SIM_SKILL||'perfect'];if(!SKILL)throw new Error('unknown SIM_SKILL '+process.env.SIM_SKILL);
let AIM=process.env.SIM_AIM!==undefined?+process.env.SIM_AIM:SKILL.a;
let HUMAN=process.env.SIM_HUMAN!==undefined?+process.env.SIM_HUMAN:SKILL.h;   // reaction time in real seconds for active tattoos and bombs (0 = the perfect player)   // the game's own copied-in code (via `new Function`) also calls Math.random(), so this seeds it too
// SIM_SRC=<file> measures another copy of the game (e.g. an older version) with the same builds
const src=fs.readFileSync(process.env.SIM_SRC||path.join(__dirname,'..','src','index.src.html'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);if(i<0||j<0)throw new Error('marker '+a);return src.slice(i,j);};
// enemies per spawn and seconds between spawns: the game's own expressions (a smoothed or older rule is measured as written), fractional values rounded by chance as in the game
const PERSPAWN=new Function('waveNum','runMods','return '+src.match(/const perSpawn=([^;]+);/)[1]);
const INTERVAL=new Function('waveNum','return '+src.match(/const interval=([^;]+);/)[1]);
const opt=(a,b)=>{try{return cut(a,b);}catch(e){return '';}};   // a part an older game (SIM_SRC) may not have
// the economy outside the runs (SIM_ECON=1): inks, quests, achievements and the daily reward, taken from the game itself
const ECON_SRC=[opt('const tatPool=','function doPull'),opt('const pityRar=','\n'),opt('// ── QUESTS','const weekStartMs'),
  opt('// ── LIFETIME STATS','function achCheck'),opt('const DAILY=','function renderDailyDot')].join('\n');
const ECON_OUT=['tatPool','rollType','pityRar','addTatCopy','tatOf','TAT_SLOT_PRICES','MAX_SLOTS','MAX_ACTIVE','makeQuest','QUEST','DAILY','dailyCoins',
  'ACHS','achDone','MUTATORS','WEEKLY_REWARDS','weeklyKeys','AUTO_RETRY','maxUnlockedTier','giftLeft','giftTier','giftOptsNow','wishOk','PITY','slotSync','slotPrice','pourPig','PIG_VAL','pourCost','tatMelted','TAT_MAX'].map(n=>n+':typeof '+n+'==="undefined"?null:'+n).join(',');
const save={settings:{},perm:{},tatCol:{},equipped:[],tatSlots:5,temp:{},tierBest:{1:0},tier:1,bestWave:0,coins:0,gems:0,tatV6:1,permV6:1};
const G=new Function('save','GH','runTier',[cut('const SUFFIX=','// ── AUDIO'),cut('// ── ECONOMY','// ── STATE'),ECON_SRC,
  "return{"+ECON_OUT+",setMods:m=>{runMods=m;},GRENADE:typeof GRENADE===\"undefined\"?null:GRENADE,fmtN,ECO,TIERS,ENEMY_TYPES,PERM_UPGRADES,PU,TT,permVal,coinValueAt,upCost,stats,tb,totalStars,MASTERY,setTier:t=>{runTier=t;},TAT_TYPES,NOMODS,combineMods,BURST:typeof BURST===\"undefined\"?null:BURST,EVENTS:typeof EVENTS===\"undefined\"?null:EVENTS,eventFor:typeof eventFor===\"undefined\"?null:eventFor,EV_TUNE:typeof EV_TUNE===\"undefined\"?null:EV_TUNE,bossKindFor:typeof bossKindFor===\"undefined\"?null:bossKindFor,boostPrice:typeof boostPrice===\"undefined\"?null:boostPrice,crowdK:typeof crowdK===\"undefined\"?null:crowdK};"].join('\n'))(save,1,1);
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
// crit is in BASE since B6 item 3 (CRIT BLAST made it worth buying): a real player buys it too, and without it the late-game
// lead of offense/tank over active/swarm/control was the shop, not the tattoos
const BASE={damage:3,fireRate:2,maxHp:1,regen:1,multishot:2,bounce:2,pierce:2,critChance:1,critMult:1,...ECON};
const plus=x=>({...BASE,...Object.fromEntries(Object.entries(x).map(([k,v])=>[k,(BASE[k]||0)+v]))});
const DEF={defense:2,thorns:3,dodge:1,lifesteal:1,regen:2,maxHp:2},CTRL={knockback:1,slowChance:2,slowAmt:2},COIN={coinMult:3,lootChance:2,bounty:2,gameSpeed:2};
// bomb builds: offense shop + COOLDOWN, the bomb in place of SLAYER
const bombB=t=>({shop:plus({critChance:1,critMult:1,bossDmg:1,cooldown:2}),tat:[t,'attack_power','attack_speed','crit_chance','crit_mult']});
const BUILDS={
  offense:   {shop:plus({critChance:1,critMult:1,bossDmg:1}),tat:['attack_power','attack_speed','crit_chance','crit_mult','boss_slayer']},
  swarm:     {shop:plus({}),tat:['twin','arc','ricochet','piercer','attack_power']},
  tank:      {shop:plus(DEF),tat:['thorns','aegis','defense','regen','max_hp']},
  thornsTank:{shop:plus(DEF),tat:['thorns','aegis','defense','regen','lifesteal']},
  bruiser:   {shop:plus(DEF),tat:['thorns','mend','shockwave','attack_power','dodge']},
  bomb:      bombB('logic_bomb'), goo:bombB('goo_bomb'), virus:bombB('virus_bomb'),
  active:    {shop:plus({cooldown:2}),tat:['nova','overdrive','stasis','mend','attack_power']},
  control:   {shop:plus(CTRL),tat:['frost','reach','stasis','attack_power','attack_speed']},
  shatter:   {shop:plus(CTRL),tat:['frost','shatter','stasis','attack_power','attack_speed']},
  chillNoKb: {shop:plus({slowChance:2,slowAmt:2}),tat:['frost','reach','stasis','attack_power','attack_speed']},
  reaper:    {shop:plus({execute:2}),tat:['reaper','attack_speed','crit_chance','attack_power','crit_mult']},
  farm:      {shop:plus(COIN),tat:['coin_mult','luck','midas','attack_power','attack_speed']},
  greedy:    {shop:plus(COIN),tat:['twin','arc','ricochet','coin_mult','midas']},
};
// SIM_BUILD='{"shatter":{"tat":["frost","attack_power"]}}'  replace parts of a build, or add a new one
for(const [n,o] of Object.entries(JSON.parse(process.env.SIM_BUILD||'{}')))BUILDS[n]=Object.assign(BUILDS[n]||{shop:BUILDS.swarm.shop,tat:[]},o);
// a real player buys the capped, cheap shop SLOW pair in any build once the game gets hard: in the calendar sim (shopL) every build
// adds it from Tier SIM_SLOWFROM (default 3) on. SIM_ALLSLOW=0 turns it off (the old sim: only the SLOW builds buy it)
const ALLSLOW=process.env.SIM_ALLSLOW!=='0',SLOWFROM=+process.env.SIM_SLOWFROM||3;let shopTier=0;
// the same for every other capped combat upgrade (BOSS HUNTER, RANGE, PARRY …) that is CHEAP: a real player buys what costs almost nothing, so
// from that tier on every build adds a missing capped upgrade (weight 1) once all its levels left cost under SIM_CAPCHEAP (default 1%) of the coins in hand. Found 2026-11-08 by tools/sim-health.js (MUST-BUY): BOSS HUNTER makes
// late runs 25% longer for almost no coins and 11 of the 15 builds never bought it. SIM_ALLCAP=0 turns it off (the sim before 2026-11-08).
const ALLCAP=process.env.SIM_ALLCAP!=='0',CAPPED=PERM_UPGRADES.filter(u=>u.cat!=='util'&&u.max>1&&u.max<=1000).map(u=>u.id),CAPCHEAP=+(process.env.SIM_CAPCHEAP||.01);   // shopTier: set by shopL, 0 = not the calendar sim
function equip(b,lv){
  save.tatCol={};save.equipped=[];
  for(const id of BUILDS[b].tat){save.tatCol[id]={lv,copies:0};save.equipped.push(id);}
}
// spend `bank` on the build's list: always the level with the lowest price/weight
function shop(b,bank,skip){
  let W=(process.env.SIM_SHOP&&BUILDS[process.env.SIM_SHOP]?BUILDS[process.env.SIM_SHOP]:BUILDS[b]).shop;
  if(ALLSLOW&&shopTier>=SLOWFROM)W={...W,slowChance:W.slowChance||2,slowAmt:W.slowAmt||2};
  if(ALLCAP&&shopTier>=SLOWFROM){W={...W};for(const id of CAPPED)if(!W[id]&&PU[id]){let c=0;for(let l=save.perm[id]||0;l<PU[id].max;l++)c+=upCost(PU[id],l);if(c<=bank*CAPCHEAP)W[id]=1;}}   // SIM_SHOP=swarm: every build spends like that one, so only the tattoos differ
  for(;;){let best=null;
    for(const id in W){if(skip&&skip[id])continue;const u=PU[id];if(!u)continue;const l=save.perm[id]||0;if(l>=u.max)continue;   // !u: an older game (SIM_SRC) without this upgrade
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
const SPLASH_OWN=src.includes('sp*bombVuln(o,st)');   // 0.7.4: CRIT BLAST splash with the neighbour's own bonuses; an older game (SIM_SRC) carried the hit's
const FROZEN_KB=src.includes('e.y+=(spd+e.kbVy)*dt');   // since 2026-11-06 knockback moves frozen (STASIS) enemies too; an older game (SIM_SRC) did not

// o.auto: an AUTO RETRY run with nobody watching (game runAuto): every coin pays AUTO_RETRY.share, no actives, no bombs, drops not tapped
// o.mods: a WEEKLY OP run with these mutators (game combineMods(weeklyKeys())): they hold for the whole run, no wave events
function run(tier,maxW=1e9,o={}){
  if(G.setMods)G.setMods(o.mods||null);
  try{return run0(tier,maxW,o);}finally{if(G.setMods)G.setMods(null);}
}
// what-ifs for the shop SLOW pair: SIM_NODMG=1 (no extra damage on slowed enemies), SIM_NOSPD=1 (slow does not slow), SIM_VULN=k (extra damage x k)
function run0(tier,maxW,o){
  setTier(tier);const st=stats();if(process.env.SIM_NODMG)st.frostVuln=1;if(process.env.SIM_VULN)st.frostVuln=1+(st.frostVuln-1)*+process.env.SIM_VULN;if(process.env.SIM_NOSPD)st.slowSpd0=1;const AUTO=!!o.auto,WM=o.mods||null;
  const pay=c=>AUTO&&c>0?Math.max(1,Math.round(c*G.AUTO_RETRY.share)):c;   // game runPay()
  // QE = the quest events of this run, counted where the game calls qEvent() / qReach() (kill_<type>, crit, knockback, slow, pierce,
  // multishot, dodge; wave = the last wave whose timer ran out)
  // TOT.by = damage by source (health and shields really taken, overkill not counted): shot / multishot / twin / bounce / pierce / lance /
  // overkill (REACH carry) / crit (the crit part of a bullet) / chill (the slowed-enemy bonus part) / overdrive (the extra fire rate's part) /
  // a tattoo id for its own hits (thorns, arc, nova, logic_bomb …) / contact (enemies that die on the line). Read by tools/sim-health.js.
  // TOT.hits[source] = [single hits that did damage, their summed share of max health] · TOT.hurt = damage TAKEN by source (enemy type id, 'boss', 'boss pulse', 'spitter', 'scorcher burn'), TOT.big = the biggest single hit
  // as a share of max health; hiT[0/1] = last time health was at 80% / 50%+ (fin: s80 / s50 = real seconds from there to death).
  // Bookkeeping only (no random numbers): results stay the same. Read by tools/sim-ask.js feel.
  const TOT={k:0,b:0,d:0,th:0,bombs:0,taps:0,by:{},hurt:{},big:0,hits:{}},QE={wave:0},qe=k=>{QE[k]=(QE[k]||0)+1;},
    book=(k,v)=>{if(v>0)TOT.by[k]=(TOT.by[k]||0)+v;},hiT=[0,0],FALL=[],
    // FALL = every hit since health was last at 80%+ (cleared there): at death it says how the end came (fin: death)
    ouch=(k,v,one)=>{if(v>0){TOT.hurt[k]=(TOT.hurt[k]||0)+v;if(one){const h=TOT.hits[k]||(TOT.hits[k]=[0,0]);h[0]++;h[1]+=v/st.maxHp;}if(one&&v/st.maxHp>TOT.big)TOT.big=v/st.maxHp;if(FALL.length<5000)FALL.push([t,v/st.maxHp,k,one?1:0]);}},
    // the end of a run that died: n = hits since 80% health (single hits, burn ticks not counted), max = the biggest one (share of max health),
    // n5 = hits in the last 5 real seconds, by = what the fall was made of (share of the damage since 80%)
    deathOf=()=>{const by={};let n=0,mx=0,n5=0,tot=0;for(const [tt,v,k,one] of FALL){by[k]=(by[k]||0)+v;tot+=v;if(one){n++;if(v>mx)mx=v;if((t-tt)/st.speed<=5)n5++;}}
      return{n,max:+mx.toFixed(3),n5,by:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,+(v/(tot||1)).toFixed(3)]))};},
    fin=()=>({kills:TOT.k+tkills,bosses:TOT.b,dealt:TOT.d+tdealt,thorns:TOT.th,bombs:TOT.bombs,taps:TOT.taps,qe:QE,by:TOT.by,hurt:TOT.hurt,big:TOT.big,hits:TOT.hits,
      ...(hp<=0?{s80:(t-hiT[0])/st.speed,s50:(t-hiT[1])/st.speed,death:deathOf()}:{})});
  const BSP=.95;   // bullet speed in screen heights a second (game fireBullets)
  const LINE=.83,TRI=.9,BY=TRI-.03,BU=G.BURST&&save.mode==='burst'?G.BURST:null;
  const A={};for(const id of save.equipped)if(TT[id].act||TT[id].auto)A[id]={...tb(id),cd:0,left:0};
  let lanceC=0,novaC=0;   // game lanceCount / novaCharge
  const FS={y:0,n:0,l:0,k:0},HN={n:0,d:0};let ky=0,kn=0,hp=st.maxHp,coins=0,ck=0,cb=0,dropC=0,gems=0,t=0,w=0,aegis=0,shock=0,shots=0,triX=GWH/2;let tdAll=0;const dt=+process.env.SIM_DT||.1,evSeed=Math.floor(Math.random()*1e6);
  const TRACE=process.env.SIM_TRACE==='1';const SALV={n:0};let tkills=0,tdmg=0,tcontacts=0,tdealt=0,tc0=0;
  // the field lives across waves, like the game's: when the wave timer runs out the next wave starts and the leftovers stay
  // (a boss that is not killed walks on into the next waves). Everything below that depends on the wave is set at its start.
  const KD=Math.pow(.03,dt),KI=(1-KD)/Math.log(1/.03);   // knockback fades to x0.03 a second; KI = distance a push of speed 1 carries an enemy in one step
  const FD=FRAME*st.speed/Math.ceil(st.speed),frames=r=>1/(Math.ceil(1/(r*FD)-1e-9)*FD);
  const E=[],Q=[],BOMBS=[],P=[];let SQ=[],SPIT=[],BURN=[];   // SPIT = SPITTER spits in flight, BURN = SCORCHER fires on the triangle (game spits / burns)
  let ew=0,M=G.NOMODS,hpB=0,atkB=0,spB=0,pool=[],tw=0,dur=0,iv=0,per=0,left=0,spawnT=0,cd=0,cv=0;
  const mid=()=>A.midas&&A.midas.left>0?A.midas.m:1;   // MIDAS running: every coin multiplier is raised
  const pick=()=>{let r=Math.random()*tw;for(const x of pool){r-=x.w;if(r<0)return x;}return pool[0];};
  // h = size (game e.sz), w = hitbox width for BURST, x defaults to a random spot that keeps the enemy on the field (game spawnEnemy)
  // ck = game crowdK(waveNum) if the game has it: fewer, tougher enemies (health and coins per enemy raised by the same factor)
  const mk=(T,y,x)=>{const h=T.sz*GWH*(M.esz||1),m=h+.05*GWH,ck=G.crowdK?G.crowdK(w):1;return{T,x:x??m+Math.random()*(GWH-2*m),y,sc:.1,wv:w,h,w:h*1.1,hp:hpB*T.hp*ck*(M.ehp||1),max:hpB*T.hp*ck*(M.ehp||1),atk:atkB*T.atk*(M.eatk||1),sp:spB*T.spd*(M.espd||1),coin:T.coin*ck*(M.ecoin||1),ar:Math.max(T.armor||0,M.armor||0),big:T.hp>=(ECO.bigHp||Infinity),kb:0,slow:0,frz:0,boss:false,
    sh:T.shield?hpB*T.hp*(M.ehp||1)*T.shield*(T===ENEMY_TYPES.warden?.5+.5*Math.min(1,Math.max(0,(ew-T.from)/90)):1):0,heal:T.heal||0,ht:1,blink:T.blink||0,bt:(T.blink||0)*(.5+Math.random()*.5),spit:T.spit||0,spT:(T.spit||0)*(.5+Math.random()*.5),gh:T.ghost||0,gt:(T.ghost||0)*(.5+Math.random()*.5),ph:false,rg:M.eregen||0,dv:M.dive||0,rs:M.rise||0,bz:M.berserk||0,cl:M.cling||0};};
  const d2=(a,x,y)=>(a.x-x)**2+(a.y-y)**2;
  const inBlast=(o,x,y,R)=>d2(o,x,y)<=(R+o.h*.5)**2;   // game inBlast(): the circle counts the enemy's own size
  {
    // game spawnEnemy(): a continuously spawned enemy can be an elite (chance grows with the wave, at most 6%); its shield is not tripled
    const elite=e=>{if(Math.random()<Math.min(.06,ew*.0008)){e.big=true;e.hp*=3;e.max=e.hp;e.w*=1.35;e.h*=1.35;e.coin*=2;e.atk*=1.5;}return e;};
    const midas=mid;
    let SRC='shot';   // what the bullet being resolved is (set by follow / the pellets)
    const hit=(e,d,k)=>{book(k||SRC,Math.min(d,Math.max(0,e.hp)));e.hp-=d;tdealt+=d;};   // blasts, ARC, NOVA, SHOCKWAVE, GOO, VIRUS: no lifesteal (game hurt())
    const push=(e,m)=>{if(!e.boss)e.kb=Math.min(e.kb,-e.sp*ECO.kbPush*m);};   // same rule as the game's knock()
    // game vsDmg(): BOSS HUNTER + SLAYER on bosses, SLAYER alone on elites and big types (e.big)
    var vsD=e=>e.boss?st.bossDmg:e.big?(st.bigDmg||1):e.T===ENEMY_TYPES.warden?(st.wardDmg||1):1;   // 0.7.4: SLAYER on WARDEN
    const HD=st.dmg*st.pellet,vul=e=>vsD(e)*(e.slow>0||e.frz>0?st.frostVuln:1);   // game: st.hitDmg, bombVuln()
    const gooBurst=e=>{const R=G.GRENADE.goo.r*GWH;e.gooT=0;for(const o of E)if(o.hp>0&&(o===e||inBlast(o,e.x,e.y,R)))hit(o,e.gooD*vul(o),'goo_bomb');};
    // game killEnemy(): GOO bursts, VIRUS jumps to the neighbours, SHATTER queues a burst, coins, SPLITTER leaves 2 shards
    // SALVAGE (game killEnemy): an enemy dying within ECO.salvZone above the perimeter heals st.salv of max health (bosses x ECO.salvBoss)
    const kill=e=>{const c0=coins;ky+=e.y;kn++;{const y=e.y+e.h/2,s=(y>LINE-ECO.salvZone?st.salv:0)+(ECO.salvZoneT&&y>LINE-ECO.salvZoneT?st.salvT||0:0);if(s>0){hp=Math.min(st.maxHp,hp+st.maxHp*s*(e.boss?ECO.salvBoss:1));SALV.n++;}}if(TRACE&&e.boss)console.log('  boss down in wave '+w+', '+(left>0?(dur-left).toFixed(1)+' s in':'in the break'));
      if(e.gooT>0)gooBurst(e);
      if(e.virT>0){const R=G.GRENADE.virus.spread*GWH;for(const o of E)if(o!==e&&o.hp>0&&inBlast(o,e.x,e.y,R)){o.virT=Math.max(o.virT||0,e.virT);o.virD=Math.max(o.virD||0,e.virD);}}
      if(st.shatter>0&&(e.slow>0||e.frz>0)&&!e.boss)SQ.push({x:e.x,y:e.y,d:e.max*st.shatter});
      if(e.T===ENEMY_TYPES.splitter&&!e.cx)for(const s of[-1,1]){const m=mk(ENEMY_TYPES.mini,e.y,e.x+s*e.h*.45);m.sc=1;m.kb=e.kb;E.push(m);}
      if(e.boss)TOT.b++;
      if(st.novaK)novaC++;   // game killEnemy: every kill charges NOVA
      qe('kill_'+(e.boss?'boss':ETYPE.get(e.T)));
      if(e.boss||e.coin&&Math.random()<st.coinChance)coins+=pay(cv*e.coin*midas()*(Math.random()<st.jackpot?3:1));
      ck+=coins-c0;};   // the x3 jackpot can hit a boss too (game killEnemy)
    // behaviour events (RISING TIDE, DIVE, BERSERK, CLINGERS): same rules as the game, see EV_TUNE
    const riseF=e=>{if(!(e.rs&&e.wv===w&&left>0))return 1;const p=Math.max(0,Math.min(1,1-left/dur));return EVT.rise[0]+(EVT.rise[1]-EVT.rise[0])*p;};
    const evMul=e=>{let m=riseF(e);if(e.dv){const p=Math.max(0,Math.min(1,(e.y-.1)/(LINE-.1)));m*=EVT.dive[0]+(EVT.dive[1]-EVT.dive[0])*p;}if(e.bzOn)m*=EVT.berserkSpd;return m;};
    // ARMOR = only its share (st.dmgTaken) since 0.7.5: no flat block, no one-hit limit (game contactHit)
    // game thornKillHeal (0.7.4): an enemy THORNS finishes off heals st.thornHeal of max health (a boss x ECO.salvBoss); an older game has none
    const thornHeal=(e,th)=>{if(th>0&&e.hp<=0&&st.thornHeal>0)hp=Math.min(st.maxHp,hp+st.maxHp*st.thornHeal*(e.boss?ECO.salvBoss:1));};
    const contact=(e,mul)=>{
      // MEND's guard: a normal enemy touching the perimeter is destroyed, nothing else happens (game contactHit)
      if(A.mend&&A.mend.left>0&&!e.boss){book('mend',e.hp);tdealt+=e.hp;e.hp=0;tcontacts++;return 3.5;}
      let taken=0,back=3.5;   // how hard it is pushed back (game contactHit)
      // PARRY: pushed back ECO.parryBack and stands still ECO.parryStun seconds (not bosses)
      if(Math.random()<st.dodge){back=ECO.parryBack||2;const ps=st.parryStun??ECO.parryStun;if(ps&&!e.boss)e.stun=ps;qe('dodge');}
      // AEGIS (game contactHit): the blocked enemy is destroyed (a boss is only pushed), the ones next to it are pushed back
      else if(st.aegisCD&&aegis<=0){aegis=st.aegisCD;if(ECO.aegisPushR){if(!e.boss){book('aegis',e.hp);tdealt+=e.hp;e.hp=0;}for(const o of E)if(o!==e&&o.hp>0&&inBlast(o,e.x,e.y,ECO.aegisPushR*GWH))push(o,1.5);}}
      else{taken=e.atk*Math.sqrt(riseF(e))*mul*st.dmgTaken*(e.slow>0?1-st.slowAmt*(ECO.slowHitCut||0):1);hp-=taken;tdmg+=taken;tdAll+=taken;ouch(e.boss?'boss':ETYPE.get(e.T)||'enemy',taken,1);
        if(!e.boss&&e.T&&e.T.burn){const b=Math.min(st.maxHp*ECO.burnCap,e.atk*ECO.burnK*mul*st.dmgTaken);if(b>0)BURN.push({l:ECO.burnT,d:b/ECO.burnT});}}   // SCORCHER (game contactHit): a fire, flat ARMOR does not cut it
      tcontacts++;
      const th=Math.min(e.hp,e.max*(e.boss?(st.thornBoss??st.thornPct*ECO.bossThorns):st.thornPct));e.hp-=th;tdealt+=th;TOT.th+=th;book('thorns',th);thornHeal(e,th);
      // B6-2 test: ECO.contactDie = share of its max health an enemy loses per perimeter hit (like free thorns, pays coins); 1 = it is spent
      // (no coins, no shards) unless ECO.contactPay
      if(ECO.contactDie>=1&&!ECO.contactPay&&!e.boss){e.coin=0;e.hp=0;e.cx=1;}else if(ECO.contactDie&&!e.boss){const d=Math.min(e.hp,e.max*ECO.contactDie);e.hp-=d;tdealt+=d;book('contact',d);}
      return back;
    };
    // one bullet / pellet hit on e (a crit roll per hit like the game: an average would hide the damage a crit wastes on overkill; armor, shield, reaper, knockback, slow)
    // bare = a BURST pellet that goes through armor and shields (game BURST.bare)
    const bulletHit=(e,m,bare)=>{
      const dn=st.dmg*m*vsD(e)*(e.hp<e.max*ECO.executeAt?st.execute:1)*(e.slow>0||e.frz>0?st.frostVuln:1);
      const cr=Math.random()<st.crit;if(cr)qe('crit');
      let d=dn*(cr?st.critM:1);const before=e.sh>0&&!bare?Infinity:e.hp;
      if(e.ar&&!bare)d*=Math.min(1,d/(e.max*e.ar));
      {const sl=e.slow>0||e.frz>0;let r=e.sh>0&&!bare?Math.min(d*.5,e.sh):Math.min(d,Math.max(0,e.hp));
        if(cr){book('crit',r*(1-1/st.critM));r/=st.critM;}
        if(sl&&st.frostVuln>1){book('chill',r*(1-1/st.frostVuln));r/=st.frostVuln;}
        if(A.overdrive&&A.overdrive.left>0&&A.overdrive.m>1){book('overdrive',r*(1-1/A.overdrive.m));r/=A.overdrive.m;}
        book(SRC,r);}
      if(e.sh>0&&!bare){if(e.sh0===undefined)e.sh0=e.sh;e.sh-=d*.5;tdealt+=d;if(ECO.execShield&&st.reap&&e.sh>0&&e.sh<e.sh0*st.reap*ECO.execShield){book('reaper',e.sh);e.sh=0;}}else{e.hp-=d;tdealt+=d;}
      HN.n++;HN.d+=d;
      // CRIT DMG tattoo (game): a crit splashes st.splash of its damage onto the enemies around (they die at the end of the step)
      if(cr&&st.splash){const R=ECO.critSplashR*GWH;for(const o of E)if(o!==e&&o.hp>0&&inBlast(o,e.x,e.y,R))hit(o,SPLASH_OWN?st.dmg*m*st.critM*st.splash*vul(o):d*st.splash*vsD(o),'crit_mult');}   // 0.7.4: the neighbour's own bonuses only (was the hit's full damage x its boss bonus again)
      // EXECUTE (game): the health it had left bursts onto the enemies close by (bosses take ECO.execBoss)
      if(!e.boss&&e.hp>0&&e.hp<e.max*st.reap){const L=e.hp;book('reaper',L);e.hp=0;if(ECO.execR){const R=ECO.execR*GWH;for(const o of E)if(o!==e&&o.hp>0&&inBlast(o,e.x,e.y,R))hit(o,L*(o.boss?ECO.execBoss:1),'reaper');}}
      if(!e.boss&&Math.random()<st.kbChance){e.kb=Math.min(e.kb,-e.sp*ECO.kbPush);qe('knockback');}
      if(st.slowAmt>0&&Math.random()<st.slowChance){if(!(e.slow>0))qe('slow');e.slow=ECO.slowTime;}
      if(!e.boss&&st.freeze>0&&Math.random()<st.freeze)e.stun=Math.max(e.stun||0,ECO.freezeT);   // game: SLOW CHANCE above its cap freezes
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
    const follow=(e,m,ox,oy,hits,bounces,pr=0,src='shot')=>{let pd=0;if(st.pierceP)pr=Math.random()<st.pierceP?st.pierceN:0;else if(pr>0)m*=st.lanceM||1;   // LANCE hits x lanceM (0.7.4)   // pr = LANCE's pierces (an older game: PIERCER's chance)
      for(;;){
        SRC=src;const c=bulletHit(e,m);hits.add(e);
        // REACH (game): a bullet that kills turns to the nearest other enemy with st.carry of the damage it had left
        if(c>0&&st.carry){let nx=null,nd=Infinity;for(const o of E){if(o.hp<=0||o.ph||hits.has(o))continue;const d=d2(o,e.x,e.y);if(d<nd){nd=d;nx=o;}}
          if(nx){m*=c*st.carry;ox=e.x;oy=e.y;e=nx;src='overkill';continue;}}
        // LANCE (game): goes straight through its first pr enemies, then shop PIERCE's chance
        if(pd<pr){pd++;qe('pierce');const n=towards(ox,oy,e.x,e.y,Math.hypot(e.x-ox,e.y-oy),hits);if(n){e=n;src='lance';continue;}return;}
        if(Math.random()<st.pierce){qe('pierce');const n=towards(ox,oy,e.x,e.y,Math.hypot(e.x-ox,e.y-oy),hits);if(n){e=n;src='pierce';continue;}return;}
        if(bounces<st.chain&&Math.random()<st.bounce){let nx=null,nd=Infinity;for(const o of E){if(o.hp<=0||hits.has(o))continue;const d=d2(o,e.x,e.y);if(d<nd){nd=d;nx=o;}}
          if(nx&&!nx.ph){bounces++;m*=st.bounceM||1;ox=e.x;oy=e.y;e=nx;src='bounce';continue;}
          // game: no other enemy → bounces back into the same one (game reuses the hit's damage, crit included: average crit here)
          if(!nx&&e.hp>0&&ECO.ricBack)hit(e,HD*m*(st.bounceM||1)*ECO.ricBack*vsD(e)*(1+st.crit*(st.critM-1))*(e.slow>0||e.frz>0?st.frostVuln:1),'bounce');}
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
      const lance=st.lanceEvery&&++lanceC%st.lanceEvery===0?n>>1:-1;   // game: every Nth salvo the middle pellet is a lance
      for(let k=0;k<n;k++){const a=base+S*(k/(n-1)-.5)+(Math.random()-.5)*S/n;
        const len=(BY-st.rangeY)*BU.reach;P.push({x:triX,y:BY,ux:Math.cos(a),uy:Math.sin(a),left:len,len,m:st.pellet*(k===lance?st.lanceM||1:1),hits:new Set(),tg,pr:k===lance?st.lanceN:0,pd:0});PEL.n++;BUL.n++;}
    };
    // game pointBlank(): a pellet hits x near at the muzzle, falling to x far at the end of its way (x1 in a game without it)
    const PB=(d,len)=>BU.near===undefined?1:BU.near+(BU.far-BU.near)*Math.min(1,Math.max(0,d/len)),BARE=!!(BU&&BU.bare);
    // game segBoxHit(): how far along the segment it first touches the square of half-size r around (cx,cy), or -1
    const segBox=(x0,y0,x1,y1,cx,cy,r)=>{let t0=0,t1=1;for(const [p,d,lo,hi] of [[x0,x1-x0,cx-r,cx+r],[y0,y1-y0,cy-r,cy+r]]){if(Math.abs(d)<1e-12){if(p<lo||p>hi)return -1;continue;}let a=(lo-p)/d,b=(hi-p)/d;if(a>b){const q=a;a=b;b=q;}if(a>t0)t0=a;if(b<t1)t1=b;if(t0>t1)return -1;}return t0;};
    const flyPellets=()=>{
      const n=Math.max(1,Math.round(dt*60)),L=BSP*dt/n;
      for(let i=P.length-1;i>=0;i--){const p=P[i];let gone=false;
        for(let k=0;k<n&&!gone;k++){const px=p.x,py=p.y;p.x+=p.ux*L;p.y+=p.uy*L;p.left-=L;
          // walk along this step's path: always the nearest enemy it crosses; a kill with damage to spare or a pierce goes on
          for(let g=0;g<12;g++){let e=null,tb=2;
            for(const o of E){if(o.hp<=0||o.ph||p.hits.has(o))continue;const r=o.h*.55;
              if(o.x+r<Math.min(px,p.x)||o.x-r>Math.max(px,p.x)||o.y+r<Math.min(py,p.y)||o.y-r>Math.max(py,p.y))continue;
              const q=segBox(px,py,p.x,p.y,o.x,o.y,r);if(q>=0&&q<tb){tb=q;e=o;}}
            if(!e)break;
            if(!p.hit){p.hit=1;PEL.h++;if(e===p.tg)PEL.f++;}
            const f=PB(p.len-p.left-(1-tb)*L,p.len),carry=(SRC=p.pd>0?'lance':'shot',bulletHit(e,p.m*f,BARE));p.hits.add(e);
            if(carry>0){p.m*=carry;continue;}
            if(p.pd<p.pr){p.pd++;qe('pierce');continue;}
            if(Math.random()<st.pierce){qe('pierce');continue;}
            if(st.chain>0&&Math.random()<st.bounce){let nx=null,nd=Infinity;for(const o of E){if(o.hp<=0||p.hits.has(o))continue;const d=d2(o,e.x,e.y);if(d<nd){nd=d;nx=o;}}
              if(nx&&!nx.ph)follow(nx,p.m*(st.bounceM||1),e.x,e.y,p.hits,1,0,'bounce');}
            gone=true;break;}
          if(!gone&&(p.left<=0||p.y<-.05||p.x<-.1||p.x>GWH+.1)){gone=true;if(!p.hit)BUL.m++;}}
        if(gone)P.splice(i,1);}
    };
    // game blastBomb(): one crit roll per bomb; VIRUS infects (refreshes, never stacks), GOO hits and sticks, LOGIC hits and pushes
    const blast=b=>{
      const a=A[b.id],kind=TT[b.id].gren,R=TT[b.id].r*GWH,base=HD*(Math.random()<st.crit?st.critM:1);
      for(const e of E){if(e.hp<=0||!inBlast(e,b.x,b.y,R))continue;
        if(kind==='virus'){e.virT=G.GRENADE.virus.t;e.virD=Math.max(e.virD||0,base*a.m);continue;}
        hit(e,base*a.m*vul(e),b.id);
        if(kind==='goo'){e.gooT=G.GRENADE.goo.t;e.gooD=base*a.m2;}else push(e,1.5);}
    };
    // one time step; `active` = the wave timer is running (enemies spawn), false = the short break before the next wave
    var tick=active=>{
      t+=dt;aegis=Math.max(0,aegis-dt);shock=Math.max(0,shock-dt);
      if(active){left-=dt;spawnT-=dt;if(spawnT<=0){spawnT=iv;for(let i=0,n=Math.floor(per)+(Math.random()<per%1?1:0);i<n;i++){const T=pick();E.push(elite(mk(T,.1-T.sz*GWH/2)));}}}
      // SPITTER spits fly to the triangle (game updatePlay): ARMOR / DEFENSE cut them, at most ECO.spitCap of max health · SCORCHER fires burn
      if(SPIT.length){const step=ECO.spitSpd*dt;for(const s of SPIT){const dx=triX-s.x,dy=TRI-s.y,d=Math.hypot(dx,dy);if(d>step){s.x+=dx/d*step;s.y+=dy/d*step;continue;}
        s.hit=1;const h=Math.min(st.maxHp*ECO.spitCap,s.atk*ECO.spitK*st.dmgTaken);hp-=h;tdmg+=h;tdAll+=h;ouch('spitter',h,1);}SPIT=SPIT.filter(s=>!s.hit);}
      if(BURN.length){let d=0;for(const b of BURN){d+=b.d*Math.min(dt,b.l);b.l-=dt;}BURN=BURN.filter(b=>b.l>0);hp-=d;tdmg+=d;tdAll+=d;ouch('scorcher burn',d);}
      hp=Math.min(st.maxHp,hp+(st.regen+(st.regenT||0)*(1+(ECO.regenLow||0)*(1-hp/st.maxHp)))*dt);cd-=dt;   // REGEN tattoo: faster when low (game updatePlay)
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
      // SIM_HUMAN=s: the player taps an active s real seconds after it is ready (s x game speed in game time), not at once
      // automatic tattoos (game autoTattoos, also in AUTO RETRY runs): NOVA blasts once kills filled it, MIDAS starts when ready with 3+ enemies
      if(st.novaK>0&&novaC>=st.novaK&&E.some(e=>e.hp>0&&e.y>=.1-e.h)){novaC=0;for(const e of E)if(e.hp>0&&e.y>=.1-e.h){hit(e,HD*st.novaM*vsD(e),'nova');push(e,1.5);}}
      for(const id in A){const a=A[id];if(AUTO&&!TT[id].auto)continue;a.cd=Math.max(0,a.cd-dt);a.left=Math.max(0,a.left-dt);if(a.cd>0||id==='nova')continue;
        if(HUMAN&&!TT[id].auto){if(a.rdy==null)a.rdy=t+HUMAN*st.speed;if(t<a.rdy)continue;}
        const live=E.filter(e=>e.hp>0&&e.y>.1);
        if(id==='nova'&&live.length>=3){for(const e of E)if(e.hp>0&&e.y>=.1-e.h){hit(e,HD*a.m*vsD(e),'nova');push(e,1.5);}}   // an older game (SIM_SRC): NOVA was an active
        else if(TT[id].gren&&!NOBOMB){   // the player puts the bomb on the enemy with the most others inside its circle, if 3+
          if(live.length<3)continue;
          const R=TT[id].r*GWH;let best=null,bn=0;
          for(const c of live){let n=0;for(const o of live)if(inBlast(o,c.x,c.y,R))n++;if(n>bn){bn=n;best=c;}}
          if(bn<3)continue;
          let bx=best.x,by=best.y;if(AIM>0){const an=Math.random()*Math.PI*2,rr=Math.random()*AIM*R;bx+=Math.cos(an)*rr;by+=Math.sin(an)*rr;}   // SIM_AIM: a human misses a little
          TOT.bombs++;BOMBS.push({id,x:Math.max(GWH*.03,Math.min(GWH*.97,bx)),y:Math.max(.1,by),at:t+.3});   // game: 0.3 s in the air
        }
        else if(id==='overdrive'&&E.some(e=>e.y>st.rangeY)){a.left=a.dur;}
        else if(id==='midas'&&E.length>=3){a.left=a.dur;}
        else if(id==='stasis'&&E.some(e=>e.y>.7)){for(const e of E)e.frz=e.boss?a.dur/2:a.dur;}
        else if(id==='mend'&&hp<st.maxHp*.5){hp=Math.min(st.maxHp,hp+st.maxHp*a.heal);a.left=a.guard||0;}   // MEND's guard (game runFx.guardT): see contact()
        else continue;
        a.cd=tb(id).cd;a.rdy=null;
      }
      if(st.shockM&&hp<st.maxHp*.3&&shock<=0){for(const e of E)if(e.hp>0&&e.y>=.45){hit(e,HD*st.shockM*vsD(e),'shockwave');push(e,2);}shock=st.shockCD;}
      for(const e of E){
        e.sc=Math.min(1,e.sc+dt*(e.boss?.8:4));
        const kb0=e.kb;e.kb*=KD;if(Math.abs(e.kb)<e.sp*.05)e.kb=0;
        if(e.slow>0)e.slow-=dt;
        // GOO and VIRUS keep ticking on a frozen enemy (game updatePlay)
        if(e.gooT>0){e.gooT-=dt;if(e.gooT<=0&&e.hp>0)gooBurst(e);}
        if(e.virT>0&&e.hp>0){e.virT-=dt;e.virA=(e.virA||0)+dt;if(e.virA>=.5-1e-9){hit(e,e.virD*e.virA,'virus_bomb');e.virA=0;}}
        if(e.frz>0){e.frz-=dt;if(FROZEN_KB)e.y+=kb0*KI;continue;}   // game: knockback moves frozen enemies too
        if(e.rg&&e.hp>0)e.hp=Math.min(e.max,e.hp+e.max*e.rg*dt);
        if(e.bz&&!e.bzOn&&e.hp>0&&e.hp<e.max*EVT.berserkAt){e.bzOn=1;e.atk*=EVT.berserkAtk;}
        if(e.heal&&e.hp>0){e.ht-=dt;if(e.ht<=0){e.ht=1;const r2=(.25*GWH)**2;for(const o of E)if(o.hp>0&&d2(o,e.x,e.y)<r2)o.hp=Math.min(o.max,o.hp+o.max*e.heal);}}
        if(e.blink&&e.hp>0){e.bt-=dt;if(e.bt<=0&&e.y>.1){e.bt=e.blink;e.y=Math.min(LINE-e.h,e.y+.1);}}
        if(e.spit&&e.hp>0&&e.y>.1){e.spT-=dt;if(e.spT<=0){e.spT=e.spit;if(e.y>=ECO.spitStop)e.spN=(e.spN||0)+1;SPIT.push({x:e.x,y:e.y+e.h*.5,atk:e.atk});}}   // game: SPITTER
        if(e.gh&&e.hp>0&&e.y>.1){e.gt-=dt;if(e.gt<=0){e.ph=!e.ph;e.gt=e.gh*(e.ph?.4:1);}}
        // boss: enrages below half health (faster, shock waves and summons more often); the timers run from the moment it appears
        if(e.boss&&e.hp>0){
          if(!e.enr&&e.hp<e.max*ECO.bossEnrageAt){e.enr=true;e.sp*=1.4;}
          if(ECO.bossPulse){e.pt-=dt;if(e.pt<=0&&e.y>.1){e.pt=ECO.bossPulseEvery*(e.enr?.65:1);
            if(Math.random()<st.dodge){}else if(st.aegisCD&&aegis<=0)aegis=st.aegisCD;else{let d=e.atk*ECO.bossPulse*st.dmgTaken;if(ECO.bossPulseCap)d=Math.min(d,st.maxHp*ECO.bossPulseCap);hp-=d;tdmg+=d;tdAll+=d;ouch('boss pulse',d,1);}
            // game 0.7.4: the shock wave sets off THORNS on the boss, parried or not (an older game has no ECO.pulseThorns)
            if(ECO.pulseThorns&&st.thornBoss>0){const th=Math.min(e.hp,e.max*st.thornBoss*ECO.pulseThorns);e.hp-=th;tdealt+=th;TOT.th+=th;book('thorns',th);thornHeal(e,th);}}}
          e.summon-=dt;if(e.summon<=0&&e.y>.1){const ev=ECO.bossSummonEvery*(e.enr?.6:1);
            if(e.kind==='swarmlord'){e.summon=ev*1.4;for(let k=-1;k<=1;k++)E.push({...mk(ENEMY_TYPES.runner,e.y+e.h*.3,e.x+k*e.h*.6),coin:0});}
            else{e.summon=ev;for(const k of[-1,1])E.push(mk(ENEMY_TYPES.mini,e.y+e.h*.3,e.x+k*e.h*.6));}}
        }
        if(e.stun>0)e.stun-=dt;
        const sp=e.clOn||e.stun>0||(e.spit&&e.y>=ECO.spitStop&&(e.spN||0)<(ECO.spitN??Infinity))?0:e.sp*(e.slow>0&&!st.slowSpd0?1-st.slowAmt:1)*evMul(e);e.y+=sp*dt+kb0*KI;
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
        if(!(e.hp>0&&!e.ph)){e=towards(b.ox,BY,e.x,e.y,Math.min(Math.hypot(e.x-b.ox,e.y-BY)-e.h*.55,BSP*((e.td??t)-b.t0)),hits);if(!e){BUL.m++;continue;}}
        follow(e,b.m,b.ox,BY,hits,0,b.pr,b.src);

      }
      // game: one volley per frame at most, and the cooldown restarts at 1/rate, so the rate is rounded up to whole frames
      const rate=frames(st.rate*(A.overdrive&&A.overdrive.left>0?A.overdrive.m:1));
      while(cd<=0){
        const vis=E.filter(e=>e.y>=st.rangeY&&e.hp>0&&!e.ph).sort((a,b)=>b.y-a.y);if(!vis.length){cd=0;break;}
        // main bullet, multishot extras and twin go to the next enemies in line
        const B=BU?[]:[[0,1,st.lanceEvery&&++lanceC%st.lanceEvery===0?st.lanceN:0,'shot']];   // [enemy index, damage x, LANCE pierces]
        if(BU)burstSalvo(vis);
        else if(Math.random()<st.multiChance){qe('multishot');for(let k=1;k<=ECO.multiExtra;k++)if(vis[k])B.push([k,1,0,'multishot']);}
        if(st.twin)B.push([vis[1]?1:0,st.twin*st.pellet,0,'twin']);
        // flight: 0.95 screen heights a second from just above the triangle, the enemy walking into it
        for(const [i0,m,pr,src] of B){const e=vis[i0];Q.push({e,m,pr:pr||0,src,ox:triX,t0:t,at:t+Math.max(0,Math.hypot(e.x-triX,BY-e.y)-e.h*.55)/(BSP+e.sp)});BUL.n++;}
        // ARC: lightning from the target to the nearest enemies, each within 0.4 screen widths of the last
        if(st.arcEvery&&++shots%st.arcEvery===0){const hs=[vis[0]];let cur=vis[0];const r2=(.4*GWH)**2;
          while(hs.length<st.arcN){let nx=null,nd=r2;for(const o of E){if(o.hp<=0||hs.includes(o))continue;const d=d2(o,cur.x,cur.y);if(d<nd){nd=d;nx=o;}}if(!nx)break;hs.push(nx);cur=nx;}
          for(const e of hs)hit(e,HD*st.arcM*vsD(e),'arc');
          if(hs.length<st.arcN&&cur.hp>0)hit(cur,HD*st.arcM*(ECO.arcBack||0)*(st.arcN-hs.length)*vsD(cur),'arc');}   // game: leftover jumps hit the last one again
        cd+=1/rate;
      }
      for(let i=E.length-1;i>=0;i--)if(E[i].hp<=0){const d=E[i];E.splice(i,1);d.td=t;kill(d);tkills++;}
      // SHATTER: each burst hurts and slows the nearest enemies around it (at most ECO.shatterMax; 12 bursts a step)
      if(SQ.length){const q=SQ;SQ=[];const r2=(SHATTER_R*GWH)**2;
        for(const b of q.slice(0,12)){const near=[];for(const o of E)if(o.hp>0){const d=d2(o,b.x,b.y);if(d<=r2)near.push([d,o]);}
          near.sort((p,q)=>p[0]-q[0]);for(const [,o] of near.slice(0,ECO.shatterMax)){hit(o,b.d*(o.boss?.25:1),'shatter');if(ECO.shatterSlow>0)o.slow=Math.max(o.slow,ECO.slowTime*ECO.shatterSlow);}}}
      separate();
      if(hp>=st.maxHp*.8){hiT[0]=t;FALL.length=0;}if(hp>=st.maxHp*.5)hiT[1]=t;
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
    dur=Math.min(45,18+w*.5)*(+process.env.SIM_WAVEK||1);iv=INTERVAL(w)*(M.ival||1);per=PERSPAWN(w,{spawn:M.spawn||1});
    // game spawnWave(): a first group queued above the entry line, then the boss in the middle
    for(let i=0,n=Math.min(3+Math.floor(ew/8),8);i<n;i++){const T=pick();E.push(mk(T,.1-T.sz*GWH/2-i*(.07+Math.random()*.04)));}
    if(boss){const bh=hpB*ECO.bossHpMul*(M.ehp||1),h=.13*GWH*(M.esz||1);E.push({x:GWH/2,y:.1-h/2,sc:.1,wv:w,h,w:h*1.1,hp:bh,max:bh,atk:atkB*ECO.bossAtkMul,sp:spB*.5*(M.espd||1),coin:ECO.bossCoins*(M.ecoin||1),kb:0,slow:0,frz:0,boss:true,summon:ECO.bossSummonEvery,pt:ECO.bossPulseFirst||0,enr:false,kind:bk,
      sh:bk==='bulwark'?bh*(ECO.bossShield||0):0,heal:bk==='regen'?(ECO.bossRegen||0):0,ht:1,ar:0});}
    left=dur;spawnT=0;let r;
    while(left>0)if(r=tick(true))return r;
    QE.wave=w;   // game qReach('wave',waveNum) when the wave timer runs out
    hp=Math.min(st.maxHp,hp+st.maxHp*st.waveHeal);
    if(TRACE)console.log('wave '+String(w).padStart(3)+' (eff '+String(ew).padStart(3)+')  hp '+String(Math.round(hp/st.maxHp*100)).padStart(3)+'%  kills '+String(tkills).padStart(4)+'  contacts '+String(tcontacts).padStart(4)+'  dmg taken '+(tdmg/st.maxHp*100).toFixed(1)+'% of maxHp  (atk/contact '+(tcontacts?(tdmg/tcontacts/st.maxHp*100).toFixed(2):'0')+'% of maxHp)  dealt '+fmtN(tdealt)+'  coins '+fmtN(coins-tc0)+'  left on field '+E.length+(E.some(e=>e.boss)?' +boss':'')+' ('+E.filter(e=>e.T===ENEMY_TYPES.mini).length+' shards)'+(st.salv?'  salvage '+SALV.n:'')+'  bullets '+BUL.n+', '+Math.round(BUL.m/Math.max(1,BUL.n)*100)+'% missed');BUL.N+=BUL.n;BUL.M+=BUL.m;BUL.n=BUL.m=0;
    TOT.k+=tkills;TOT.d+=tdealt;tkills=0;tdmg=0;tcontacts=0;tdealt=0;tc0=coins;SALV.n=0;
    // the 2-2.5 s break: nothing spawns, but the field keeps moving and the triangle keeps shooting
    for(let gap=2+Math.random()*.5;gap>0;gap-=dt)if(r=tick(false))return r;
  }
}

// how deep a build gets: climb tiers while it clears the unlock wave (one run is enough, like the game's unlock), report effective wave + coins/hour.
// eff = the MEAN wave of the runs at the last tier (since 2026-11-09; was the best run, which hid survival losses: tank without REGEN
// read -9 waves at most, the mean at a fixed tier -8..-23%). SIM_DEPTHMAX=1 = the old best-run reading; effMax is always returned.
const DEPTH_N=+process.env.SIM_DEPTH_N||4,DEPTHMAX=process.env.SIM_DEPTHMAX==='1';   // runs per tier (was 2 — raised to cut the ±5-8% noise from a single unlucky/lucky run)
function depth(maxTier=40){
  let best=0,bestMax=0,cph=0,t=1,spread=0;
  for(;t<=maxTier;t++){
    const r=[];for(let i=0;i<DEPTH_N;i++)r.push(run(t,TIERS.unlockWave+10));
    const ws=r.map(x=>x.w),w=Math.max(...ws),wm=ws.reduce((a,x)=>a+x,0)/ws.length;best=(t-1)*TIERS.offset+(DEPTHMAX?w:wm);bestMax=(t-1)*TIERS.offset+w;
    spread=Math.max(...ws)-Math.min(...ws);
    cph=Math.max(cph,r.reduce((s,x)=>s+x.coins,0)/r.reduce((s,x)=>s+x.t,0)*3600);
    if(w<TIERS.unlockWave)break;
  }
  return{eff:+best.toFixed(1),effMax:bestMax,tier:Math.min(t,maxTier),cph,spread};
}
// required by another tool (tools/referee.js): hand over the builds and the run code, skip the command line below
if(require.main!==module){module.exports={G,ENEMY_TYPES,PU,upCost,ALLCAP,CAPPED,ALLSLOW,weeklyMods:k=>G.combineMods(k),TAT_TYPES:G.TAT_TYPES,MUTATORS:G.MUTATORS,BUILDS,shop,equip,save,run,depth,TIERS,fmtN,reseed:s=>{_seed=(s>>>0)||1;},resetDrops:()=>{DROP.t=DROP.coin=DROP.gem=0;}};return;}

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

// mustbuy: is there a cheap shop upgrade that every way of spending needs late (the SLOW pair before 0.7.3)? Buy every combat upgrade
// (weight 1 each, cheapest level first: a player who buys what is cheap) with budget B, no tattoos, then take ONE upgrade back to 0 and
// play the first tier the full shop cannot clear (SIM_N runs, the same random numbers): loss = how much shorter the runs get,
// cost = the share of B that upgrade cost.   node tools/sim.js mustbuy [budgets=1e10,1e12] → MUSTBUY lines (tools/sim-health.js grades them)
if(process.argv[2]==='mustbuy'){
  const BUD=(process.argv[3]||'1e10,1e12').split(',').map(Number),N=+process.env.SIM_N||6;
  BUILDS.__all={shop:Object.fromEntries(PERM_UPGRADES.filter(u=>u.cat!=='util'&&u.max>1).map(u=>[u.id,1])),tat:[]};
  for(const B of BUD){save.perm={};save.tatCol={};save.equipped=[];shop('__all',B);const P={...save.perm};
    save.perm=P;let T=1;for(;T<40;T++){let m=0;for(let k=0;k<3;k++)m+=run(T,TIERS.unlockWave+10).w;if(m/3<TIERS.unlockWave)break;}
    const mean=perm=>{save.perm=perm;_seed=4242;let w=0;for(let i=0;i<N;i++)w+=run(T,80).w;return w/N;},base=mean(P);
    for(const id in P){if(!P[id])continue;let c=0;for(let i=0;i<P[id];i++)c+=upCost(PU[id],i);const w=mean({...P,[id]:0});
      console.log('MUSTBUY '+JSON.stringify({B,T,id,lv:P[id],max:PU[id].max,cost:+(c/B).toPrecision(3),base:+base.toFixed(1),w:+w.toFixed(1),loss:+(1-w/base).toFixed(3)}));}
  }
  process.exit(0);
}
// trap: does a new player who leans into one style's shop upgrades (the normal offense shopping + 3 weight on each of them) fall far behind
// the normal way of spending (offense)? Early tiers and budgets, no tattoos, SIM_N runs with the same random numbers.
//   node tools/sim.js trap → TRAP lines (tools/sim-health.js grades them)
if(process.argv[2]==='trap'){
  const N=+process.env.SIM_N||6;
  const STY={thorns:{defense:3,thorns:3,maxHp:2,regen:2},control:{knockback:3,slowChance:3,slowAmt:3},reaper:{execute:3},cooldown:{cooldown:3},
    crit:{critChance:3,critMult:3},swarm:{multishot:3,bounce:3,pierce:3},boss:{bossDmg:3},parry:{dodge:3,lifesteal:3}};
  const meas=(W,T,B)=>{BUILDS.__t={shop:W,tat:[]};_seed=77;let w=0;for(let i=0;i<N;i++){save.perm={};save.tatCol={};save.equipped=[];shop('__t',B);w+=run(T,80).w;}return w/N;};
  for(const [T,B] of [[1,3e3],[1,3e4],[2,3e5],[3,1e7]]){const n=meas(BUILDS.offense.shop,T,B);
    for(const [st,x] of Object.entries(STY)){const W={...BUILDS.offense.shop};for(const k in x)W[k]=(W[k]||0)+x[k];
      console.log('TRAP '+JSON.stringify({T,B,style:st,w:+meas(W,T,B).toFixed(1),normal:+n.toFixed(1)}));}}
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
  const N=+process.env.SIM_N||3,SEED=+process.env.SIM_SEED||1;
  // paired: every case (no tattoo and each level) starts from the same random numbers, so the difference is the tattoo and not luck
  const mean=()=>{_seed=SEED;DROP.t=DROP.coin=DROP.gem=0;let w=0,c=0;for(let i=0;i<N;i++){const d=depth();w+=d.eff;c+=d.cph;}return{w:w/N,c:c/N};};
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

// homecard: what each tattoo is worth IN ITS OWN BUILD (the card plays a tattoo alone; defence tattoos work together, so alone they read
// dead while the build needs them). For every budget: the build's frontier tier T (depth()), then the MEAN wave of SIM_N runs at T-1 and T
// (the same random numbers; a tier it always clears to the cap is skipped) with all five tattoos, and with each one taken out (its slot left empty). loss = 1 - without/with.
//   node tools/sim.js homecard <build> [lv=5]  → HOME lines of JSON (tools/sim-home.js runs every build and prints the table)
if(process.argv[2]==='homecard'){
  const b=process.argv[3],LV=+process.argv[4]||5,N=+process.env.SIM_N||12,BUD=(process.env.SIM_BUDGETS||'1e6,1e8,1e10,1e12').split(',').map(Number);
  for(const B of BUD){save.perm={};shop(b,B,{gameSpeed:1});equip(b,LV);_seed=99;DROP.t=DROP.coin=DROP.gem=0;const T=depth().tier;
    const mean=(tier,drop)=>{equip(b,LV);if(drop){delete save.tatCol[drop];save.equipped=save.equipped.filter(x=>x!==drop);}
      _seed=4242;DROP.t=DROP.coin=DROP.gem=0;let w=0;for(let i=0;i<N;i++)w+=run(tier,TIERS.unlockWave+10).w;return w/N;};
    for(const tier of [T-1,T]){if(tier<1)continue;const full=mean(tier);if(full>TIERS.unlockWave+9.5)continue;const loss={};   // a tier it always clears says nothing
      for(const id of BUILDS[b].tat)loss[id]=+(1-mean(tier,id)/full).toFixed(3);
      console.log('HOME '+JSON.stringify({b,B,tier,full:+full.toFixed(1),loss}));}}
  process.exit(0);
}

// ── the questions added 2026-11-09 (tools/sim-ask.js runs them and grades them) ──
// combo: is there a mix of tattoos nobody planned that beats every hand-made build? Each combo = 5 tattoos at Lv LV and the shop a sensible
// player would pick for them (BASE + the extras of each tattoo's style, TSHOP). All measured in ONE tier T at budget B: SIM_N runs (default 8),
// no wave cap, the same random numbers for every combo (paired): mean wave (w) and coins per hour (c).
//   node tools/sim.js combo <B> <T|auto> <file.json: [{name?,tat:[…]} or "build name"…]> [lv=5]
//   T=auto: the hardest tier any hand-made build reaches at B (its depth() tier), printed as a TIER line first.
const TSHOP={thorns:DEF,aegis:DEF,defense:DEF,regen:DEF,max_hp:DEF,lifesteal:DEF,mend:DEF,dodge:DEF,shockwave:DEF,
  frost:CTRL,stasis:{...CTRL,cooldown:1},shatter:CTRL,reach:CTRL,nova:{cooldown:2},overdrive:{cooldown:2},logic_bomb:{cooldown:2},goo_bomb:{cooldown:2},
  virus_bomb:{cooldown:2},reaper:{execute:2},crit_chance:{critChance:1,critMult:1},crit_mult:{critChance:1,critMult:1},boss_slayer:{bossDmg:1},
  coin_mult:COIN,luck:COIN,midas:COIN};
const comboShop=tat=>{const x={};for(const id of tat)for(const [k,v] of Object.entries(TSHOP[id]||{}))x[k]=Math.max(x[k]||0,v);return plus(x);};
if(process.argv[2]==='combo'){
  const B=+process.argv[3],LV=+process.argv[6]||5,N=+process.env.SIM_N||8,list=JSON.parse(fs.readFileSync(process.argv[5],'utf8'));
  const put=c=>{if(typeof c==='string'){BUILDS.__c=BUILDS[c];}else BUILDS.__c={shop:comboShop(c.tat),tat:c.tat};save.perm={};shop('__c',B,{gameSpeed:1});equip('__c',LV);};
  let T=+process.argv[4];
  // the shop as in the calendar (shopL): from Tier SLOWFROM every build also buys the SLOW pair and the cheap capped items (ALLSLOW / ALLCAP)
  if(process.argv[4]==='auto'){T=1;for(const b of Object.keys(BUILDS).filter(n=>!n.startsWith('__'))){put(b);_seed=99;DROP.t=DROP.coin=DROP.gem=0;T=Math.max(T,depth().tier);}console.log('TIER '+JSON.stringify({B,T}));}
  shopTier=T;
  for(const c of list){put(c);_seed=+process.env.SIM_CSEED||4242;DROP.t=DROP.coin=DROP.gem=0;let w=0,co=0,t=0;for(let i=0;i<N;i++){const r=run(T);w+=r.w;co+=r.coins;t+=r.t;}
    console.log('COMBO '+JSON.stringify({B,T,name:typeof c==='string'?c:c.name||null,tat:typeof c==='string'?BUILDS[c].tat:c.tat,w:+(w/N).toFixed(2),c:+(co/t*3600).toPrecision(4)}));}
  process.exit(0);
}
// skill: how much does a build lose when a normal-skill player plays it (SKILLS.normal: taps late, bombs a little off) instead of the perfect one
// all the other reports use? Like homecard: the build's frontier tier T (perfect player) and T-1, SIM_N runs (default 12), same random numbers.
//   node tools/sim.js skill <build> [lv=5]   → SKILL lines
if(process.argv[2]==='skill'){
  const b=process.argv[3],LV=+process.argv[4]||5,N=+process.env.SIM_N||12,BUD=(process.env.SIM_BUDGETS||'1e6,1e8,1e10,1e12').split(',').map(Number);
  const mean=(tier,sk)=>{HUMAN=sk.h;AIM=sk.a;_seed=4242;DROP.t=DROP.coin=DROP.gem=0;let w=0;for(let i=0;i<N;i++)w+=run(tier,TIERS.unlockWave+10).w;return w/N;};
  for(const B of BUD){save.perm={};shop(b,B,{gameSpeed:1});equip(b,LV);HUMAN=0;AIM=0;_seed=99;DROP.t=DROP.coin=DROP.gem=0;const T=depth().tier;
    for(const tier of [T-1,T]){if(tier<1)continue;const p=mean(tier,SKILLS.perfect);if(p>TIERS.unlockWave+9.5)continue;const n=mean(tier,SKILLS.normal);
      console.log('SKILL '+JSON.stringify({b,B,tier,perfect:+p.toFixed(1),normal:+n.toFixed(1),loss:+(1-n/p).toFixed(3)}));}}
  process.exit(0);
}
// feel: what a run is like at the tier the player is pushing (the build's frontier tier at budget B): SIM_N runs (default 12), no wave cap.
// Run length (real minutes), waves, how the player dies (s80 = real seconds from 80% health to death; sudden = under 5 s), the biggest single
// hit (share of max health), and the damage taken by source (enemy types, boss, boss pulse, spits, burns).
//   node tools/sim.js feel <build> [lv=5]   → FEEL lines
if(process.argv[2]==='feel'){
  const b=process.argv[3],LV=+process.argv[4]||5,N=+process.env.SIM_N||12,BUD=(process.env.SIM_BUDGETS||'3e3,1e5,1e7,1e9,1e11').split(',').map(Number);
  for(const B of BUD){save.perm={};shop(b,B,{gameSpeed:1});equip(b,LV);_seed=99;DROP.t=DROP.coin=DROP.gem=0;const T=depth().tier;
    _seed=4242;DROP.t=DROP.coin=DROP.gem=0;const R=[];for(let i=0;i<N;i++)R.push(run(T));
    const md=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];},hurt={};for(const r of R)for(const k in r.hurt)hurt[k]=(hurt[k]||0)+r.hurt[k];
    const ht=Object.values(hurt).reduce((a,x)=>a+x,0)||1,dead=R.filter(r=>r.s80!==undefined);
    console.log('FEEL '+JSON.stringify({b,B,T,min:+md(R.map(r=>r.t/60)).toFixed(1),w:+md(R.map(r=>r.w)).toFixed(0),s80:dead.length?+md(dead.map(r=>r.s80)).toFixed(1):null,
      sudden:+(dead.filter(r=>r.s80<5).length/Math.max(1,dead.length)).toFixed(2),big:+md(R.map(r=>r.big)).toFixed(3),
      hurt:Object.fromEntries(Object.entries(hurt).sort((x,y)=>y[1]-x[1]).map(([k,v])=>[k,+(v/ht).toFixed(3)])),
      // how the deaths came: one = a single hit took half the health or more · few = 2-5 hits from 80% · flood = 6+ hits; fall = what the falls were made of
      one:+(dead.filter(r=>r.death.max>=.5).length/Math.max(1,dead.length)).toFixed(2),flood:+(dead.filter(r=>r.death.max<.5&&r.death.n>=6).length/Math.max(1,dead.length)).toFixed(2),
      hits:dead.length?md(dead.map(r=>r.death.n)):null,n5:dead.length?md(dead.map(r=>r.death.n5)):null,
      fall:(()=>{const f={};for(const r of dead)for(const [k,v] of Object.entries(r.death.by))f[k]=(f[k]||0)+v/dead.length;return Object.fromEntries(Object.entries(f).sort((x,y)=>y[1]-x[1]).map(([k,v])=>[k,+v.toFixed(3)]));})()}));}
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
// S4 (2026-11-09) players without a plan, for tools/sim-ask.js messy: `switcher` takes a random hand-made style every 14 days (its shop list and
// its tattoos first; what was bought stays), `drifter` has no style at all: a random shop list every 7 days (weights 0-3 on every item), it
// puts on the shiniest tattoos (rarest x level), wishes for a random one, never uses PIGMENT. Their own random numbers (SIM_SEED), so the
// game's dice stay the same.
const MESSY=BUILD==='switcher'||BUILD==='drifter',MSTY=['offense','swarm','tank','bruiser','bomb','active','control','reaper','farm'];
let _ms=((+process.env.SIM_SEED||1)*7919+3)>>>0;const mr=()=>{_ms^=_ms<<13;_ms^=_ms>>>17;_ms^=_ms<<5;_ms>>>=0;return _ms/4294967296;};
const messyRoll=()=>{if(BUILD==='switcher'){const s=BUILDS[MSTY[Math.floor(mr()*MSTY.length)]];BUILDS.switcher={shop:{...s.shop},tat:s.tat};}
  else{const W={};for(const u of PERM_UPGRADES)if(u.id!=='autoRetry'&&u.id!=='offline'){const r=Math.floor(mr()*4);if(r)W[u.id]=r;}W.damage=W.damage||1;BUILDS.drifter={shop:W,tat:[]};}
  if(EC)BUILDS[BUILD].shop.offline=BUILDS[BUILD].shop.offline||1;};
if(MESSY)messyRoll();
if(!BUILDS[BUILD])throw new Error('unknown build '+BUILD);
if(TLV)equip(BUILD,TLV);
const LOG=[1,2,5,10,20,42,84,168,336,600,1000,1500,2000,3000].filter(h=>h<=HOURS);
let bank=0,clock=0,li=0,runs=0,tier=1;const tierBest={1:0};save.tierBest=tierBest;   // mastery stars count
// SIM_PACE=1: print the hours it takes to first reach these effective waves (to compare builds' real speed)
const PACE=process.env.SIM_PACE==='1',MILES=[50,75,100,125,150,175,200,250,300,400],hit={},atH={},tierH={},AT=[42,84,168,336,600];   // tierH[h] = highest tier opened by then
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
if(EC)Object.assign(save,{tatCol:{},tatMelt:{},pig:0,equipped:[],tatSlots:1,slotGem:0,slotTier:0,pity:0,gems:0,quests:[],achClaimed:[],daily:{n:0,last:''},
  life:{kills:0,dmg:0,runs:0,bosses:0,levels:0,quests:0,pulls:0,drops:0,boosts:0,bombs:0}});
const owned=()=>G.TAT_TYPES.filter(t=>G.tatOf(t.id).lv>0).map(t=>t.id);
// what goes in the slots: the build's own tattoos first (in its order), then the best of the rest (rarer and higher level first)
const equipBest=()=>{const own=owned(),want=BUILDS[BUILD].tat.filter(id=>own.includes(id));
  const sc=id=>G.tatOf(id).lv*(1+G.TT[id].rar*.5),rest=own.filter(id=>!want.includes(id)).sort((a,b)=>sc(b)-sc(a));
  // game toggleEquip: at most MAX_ACTIVE ACTIVE tattoos (buttons, bombs) at once (an older game: no limit)
  let na=0;const MA=G.MAX_ACTIVE||Infinity;
  save.equipped=[...want,...rest].filter(id=>!G.TT[id].act||++na<=MA).slice(0,save.tatSlots);};
// v0.7.4 TIER GIFT: every tier opened gives one free pick (the build's own tattoos first, else the rarest offered); WISH: the build's first
// own tattoo the game lets it wish for (epic/mythic; rare too since 0.7.4b) that it does not own yet, else the first one not maxed (the
// guaranteed ink gives it). An older game (SIM_SRC) has neither. SIM_NOGIFT=1 / SIM_NOWISH=1 turn them off.
const NOGIFT=!!process.env.SIM_NOGIFT,NOWISH=!!process.env.SIM_NOWISH;
const gifts=()=>{
  if(G.wishOk&&!NOWISH){if(BUILD==='drifter'){if(!save.wish||!G.wishOk(save.wish)){const ok=G.TAT_TYPES.map(t=>t.id).filter(id=>G.wishOk(id));save.wish=ok.length?ok[Math.floor(mr()*ok.length)]:null;}}
    else{const ok=BUILDS[BUILD].tat.filter(id=>G.wishOk(id));save.wish=ok.find(id=>!G.tatOf(id).lv)||ok[0]||null;}}
  if(!G.giftLeft||NOGIFT)return;
  while(G.giftLeft()>0){const ids=G.giftOptsNow();if(!ids.length)break;const want=BUILDS[BUILD].tat;
    const pick=want.find(id=>ids.includes(id))||ids.slice().sort((a,b)=>G.TT[b].rar-G.TT[a].rar)[0];
    G.addTatCopy(pick);save.tgDone=G.giftTier();save.tgOpts=null;}};
// gems: the next slot first as long as there is a tattoo to put in it (SIM_GEMPLAN=slot), else inks 10 at a time (cheaper each);
// one at a time only while a slot is still empty. The pity counter and the pool work as in the game's doPull().
// v0.7.4: slots 9-12 open with tiers 3-6 (game slotSync / slotPrice); an older game (SIM_SRC) sells all 11 for gems.
const slotP=()=>G.slotPrice?(G.slotSync(),G.slotPrice()):save.tatSlots<G.MAX_SLOTS?G.TAT_SLOT_PRICES[save.tatSlots-1]:null;
// S7 (2026-11-09): SIM_THEMES=n = a player who buys the n cheapest THEMES as soon as the gems are there (before slots and inks);
// SIM_PAID='day:gems,…' = gems bought with money on those days (the wallet packs: 100 / 550 / 1200, starter pack 300). Both off by default.
const THEME_P=(()=>{try{return new Function(cut('const THEMES=','const C={}')+';return THEMES;')().map(t=>t.price).filter(x=>x>0).sort((a,b)=>a-b);}catch(e){return[];}})();
const THEMES_N=Math.min(+process.env.SIM_THEMES||0,THEME_P.length);let themesGot=0;
const PAID=Object.fromEntries((process.env.SIM_PAID||'').split(',').filter(Boolean).map(x=>x.split(':').map(Number)));
const spendGems=()=>{
  while(themesGot<THEMES_N&&save.gems>=THEME_P[themesGot]){save.gems-=THEME_P[themesGot];SPENT.theme=(SPENT.theme||0)+THEME_P[themesGot];themesGot++;}
  gifts();
  for(;;){const own=owned().length,sp=slotP(),slotNext=sp!==null&&own>save.tatSlots;
    if(slotNext&&save.gems>=sp){save.gems-=sp;SPENT.slot+=sp;if(G.slotPrice){save.slotGem++;G.slotSync();}else save.tatSlots++;continue;}
    if(slotNext&&PLAN==='slot')break;
    const n=save.gems>=ECO.pull10Cost?10:save.gems>=ECO.pullCost&&own<save.tatSlots?1:0;
    if(!n||!G.tatPool().length)break;
    const c=n===10?ECO.pull10Cost:ECO.pullCost;save.gems-=c;SPENT.ink+=c;save.life.pulls+=n;
    for(let i=0;i<n;i++){const top=G.pityRar(),hit=(save.pity||0)>=G.PITY-1,t=G.rollType();if(!t)break;save.pity=hit||t.rar===top?0:(save.pity||0)+1;G.addTatCopy(t.id);}
  }
  equipBest();pigment();};
// v0.7.4 PIGMENT (game pourPig): every owned tattoo that is neither equipped nor one of the build's own is marked MELT (its later copies
// become pigment); pigment is poured into the build's own owned tattoos, first one first, while it pays for a copy. An older game: nothing.
// SIM_NOPIG=1 turns it off (a player who never uses it).
const NOPIG=!!process.env.SIM_NOPIG;
const pigment=()=>{if(!G.pourPig||NOPIG||MESSY)return;const want=BUILDS[BUILD].tat;save.tatMelt={};
  for(const id of owned())if(!save.equipped.includes(id)&&!want.includes(id))save.tatMelt[id]=1;
  // a real player spreads it: one copy at a time into the build's own owned tattoo with the lowest level (ties: list order), saving up
  // when that one costs more than the pigment in hand (else rare ones never get any). SIM_PIGFIRST=1 = the old rule (all into the first listed)
  let any=false;
  if(process.env.SIM_PIGFIRST)for(const id of want){while(G.pourPig(id))any=true;}
  else for(;;){const c=want.filter(id=>{const t=G.tatOf(id);return t.lv&&t.lv<G.TAT_MAX&&!G.tatMelted(id);})
    .sort((x,y)=>G.tatOf(x).lv-G.tatOf(y).lv||want.indexOf(x)-want.indexOf(y));if(!c.length||!G.pourPig(c[0]))break;any=true;}
  if(any)equipBest();};
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
// for tools/sim-health.js: by = damage by source of that day's runs (then reset), eq = equipped, tl = tattoo levels, st = mastery stars, pv = shop levels
const DAYBY={},dayLog=[],logDay=()=>dayLog.push({by:Object.fromEntries(Object.entries(DAYBY).map(([k,v])=>[k,+v.toPrecision(3)])),eq:save.equipped.slice(),tl:Object.fromEntries(owned().map(id=>[id,G.tatOf(id).lv])),st:G.totalStars(),pv:{...save.perm},e:effNow(),t:G.maxUnlockedTier(),s:save.tatSlots,o:owned().length,g:Object.values(GEM).reduce((a,x)=>a+x,0),
  gs:{...GEM},q:{...QN},h:+(clock/3600).toFixed(2),a:+(afkClock/3600).toFixed(2)})&&Object.keys(DAYBY).forEach(k=>delete DAYBY[k]);
const claimAch=()=>{for(const a of G.ACHS)if(!save.achClaimed.includes(a.id)&&G.achDone(a)){save.achClaimed.push(a.id);save.gems+=a.gems;GEM.ach+=a.gems;bank+=a.coins||0;CX.ach+=a.coins||0;}};
// after every run: lifetime counts (achievements read them), field gems, the LOGIC BOMB gift (Tier 1 wave 20), achievements, gems
const afterRun=(r,src)=>{if(!EC)return;for(const k in r.by||{})DAYBY[k]=(DAYBY[k]||0)+r.by[k];const L=save.life;L.runs++;L.kills+=r.kills||0;L.dmg+=r.dealt||0;L.bosses+=r.bosses||0;L.bombs+=r.bombs||0;L.drops+=r.taps||0;
  save.gems+=r.gems||0;GEM.drop+=r.gems||0;CX[src]+=r.coins;questProg(r);
  if((tierBest[1]||0)>=20&&!G.tatOf('logic_bomb').lv)G.addTatCopy('logic_bomb');
  claimAch();spendGems();};
// AUTO RETRY: a shop item from Tier 2 (game PU.autoRetry, bought first once the tier is open and the coins are there); an older game: free from AUTO_RETRY.tier
const autoOwned=()=>PU.autoRetry?(save.perm.autoRetry||0)>=1:G.maxUnlockedTier()>=G.AUTO_RETRY.tier;
const buyAuto=b=>{if(EC&&AFKH>0&&PU.autoRetry&&!save.perm.autoRetry&&G.maxUnlockedTier()>=(PU.autoRetry.from||1)){const c=upCost(PU.autoRetry,0);if(b>=c){save.perm.autoRetry=1;b-=c;}}return b;};
const shopL=b=>{shopTier=tier;b=buyAuto(b);const lv=()=>Object.values(save.perm).reduce((a,x)=>a+x,0),n=lv(),left=shop(BUILD,b);if(EC)save.life.levels+=lv()-n;return left;};
// the weekly op, one tier below the highest, this week's two mutators; gems at waves 10/20/30 once a week (not a tier record, not idle income).
// The game lets it be played again and again all week (its menu dot stays while a reward is left): one try a day until all three are got.
const WK={got:[]};
const weeklyOp=()=>{if(!G.MUTATORS)return;const T=Math.max(1,G.maxUnlockedTier()-1),r=run(T,1e9,{mods:G.combineMods(G.weeklyKeys(Math.floor(day/7)))});
  clock+=r.t+3;bank+=r.coins;afterRun(r,'weekly');for(const [w,g] of G.WEEKLY_REWARDS)if(r.w>=w&&!WK.got.includes(w)){WK.got.push(w);save.gems+=g;GEM.weekly+=g;}};
// The field-drop cooldowns run on the real clock (game gameNow), so they also run out while the player is away: the time between
// sessions (the day minus play and AUTO RETRY, split evenly before the SIM_SESS sessions) moves DROP.t on (AUTO RETRY runs move it themselves)
let GAP=0,sessN=0;
// S2 (2026-11-09) SIM_FARMCHECK=n: every n days, does an easier tier pay more? For the climbing tier and up to 3 below it: SIM_FARMN runs
// (default 3) played (a = coins per hour of play, 3 s between runs) and, once AUTO RETRY is owned, on AUTO RETRY (f = coins per hour, its
// waits included). The calendar's random numbers and drop clocks are put back afterwards, so the calendar itself is not changed. → DAYS fc
const FARMCHK=+process.env.SIM_FARMCHECK||0,FARMN=+process.env.SIM_FARMN||3;
const farmCheck=()=>{const sd=_seed,dr={...DROP},o={};
  for(let k=0;k<=3&&tier-k>=1;k++){const T=tier-k;let c=0,t=0,ca=0,ta=0;
    for(let i=0;i<FARMN;i++){const r=run(T);c+=r.coins;t+=r.t+3;}
    if(autoOwned())for(let i=0;i<FARMN;i++){const r=run(T,1e9,{auto:true});ca+=r.coins;ta+=r.t+2+G.AUTO_RETRY.wait;}
    o[T]={a:+(c/t*3600).toPrecision(3),f:ta?+(ca/ta*3600).toPrecision(3):0};}
  _seed=sd;Object.assign(DROP,dr);return o;};
// a new day: last night's idle income, ads, the daily reward, 8 daily quests (one every 3 h), and on every 7th day 4 weekly quests + the weekly op
const newDay=()=>{
  if(day>0){let s=0;
    if(AFKH>0&&autoOwned()){   // AUTO RETRY left on: the same tier again and again, 2+5 s between runs
      while(s<AFKH*3600){const r=run(tier,1e9,{auto:true});s+=r.t+2+G.AUTO_RETRY.wait;afkClock+=r.t;bank+=r.coins;afterRun(r,'afk');tierBest[tier]=Math.max(tierBest[tier]||0,r.w);}}
    GAP=Math.max(0,(24-DAYH)*3600-s)/SESS;DROP.t+=GAP;
    const away=Math.max(0,24-DAYH-AFKH)*3600,secs=Math.min(ECO.offlineDayH*3600,away);
    if(away>=ECO.offlineMinSec&&idleCps>0){const c=idleCps*G.permVal('offline')*secs*(ADS>0?2:1);bank+=c;CX.idle+=c;}
    const g=Math.max(0,ADS-(idleCps>0?1:0))*ECO.adGems;save.gems+=g;GEM.ad+=g;
  }
  if(MESSY&&day>0&&day%(BUILD==='switcher'?14:7)===0){messyRoll();equipBest();}
  if(PAID[day]){save.gems+=PAID[day];GEM.paid=(GEM.paid||0)+PAID[day];}
  if(DAYS)logDay();   // after last night (AUTO RETRY, idle income, ads), before this day's rewards
  if(DAYS&&FARMCHK&&day>0&&day%FARMCHK===0)dayLog[dayLog.length-1].fc=farmCheck();
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
  console.log('TRACE '+JSON.stringify({th:r.dealt?+(r.thorns/r.dealt).toFixed(2):0,t:r.tier||tier,w:r.w,e:effNow(),c:Math.round(r.coins),h:+(clock/3600).toFixed(2),d:day,dps:+dps.toPrecision(4),hp:Math.round(st.maxHp),
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
  if(PACE){const e=effNow();for(const m of MILES)if(e>=m&&hit[m]===undefined)hit[m]=+(clock/3600).toFixed(1);for(const h of AT)if(clock>=h*3600&&atH[h]===undefined){atH[h]=e;tierH[h]=tier;}if(hit[MILES[MILES.length-1]]!==undefined)break;continue;}
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
// a run that stopped early at the last milestone gives its later checkpoints that wave (a lower bound: it was there before them)
if(PACE)for(const h of AT)if(h<=HOURS&&(clock>=h*3600||hit[MILES[MILES.length-1]]!==undefined)&&atH[h]===undefined){atH[h]=effNow();tierH[h]=tier;}
// where the gems and coins came from (and went), and the whole collection at the end
const econ=EC?{days:day,gems:GEM,spent:SPENT,coins:Object.fromEntries(Object.entries(CX).map(([k,v])=>[k,+v.toPrecision(3)])),afkHours:+(afkClock/3600).toFixed(1),
  slots:save.tatSlots,equipped:save.equipped.map(id=>id+':'+G.tatOf(id).lv),owned:owned().length,pity:save.pity}:undefined;
if(DAYS)console.log('DAYS '+JSON.stringify({build:BUILD,type:process.env.SIM_TYPE||'',dayH:DAYH,ads:ADS,afkH:AFKH,playH:+(clock/3600).toFixed(1),maxSlots:G.MAX_SLOTS,tatTotal:G.TAT_TYPES.length,days:dayLog,econ}));
if(PACE)console.log('PACE '+JSON.stringify({build:BUILD,hours:HOURS,hit,at:atH,tier:tierH,econ}));
else if(EC){const tg=Object.values(GEM).reduce((a,x)=>a+x,0),tc=Object.values(CX).reduce((a,x)=>a+x,0);
  console.log(`after ${day} days (${DAYH} h play a day): gems earned ${tg} = `+Object.entries(GEM).map(([k,v])=>`${k} ${v} (${Math.round(v/tg*100)}%)`).join(' · '));
  console.log(`gems spent: slots ${SPENT.slot} · inks ${SPENT.ink} (${SPENT.ink/ECO.pullCost|0}+ inks) · left ${save.gems}`);
  console.log('coins earned '+fmtN(tc)+' = '+Object.entries(CX).map(([k,v])=>`${k} ${fmtN(v)} (${(v/tc*100).toFixed(1)}%)`).join(' · '));
  console.log('tattoos: '+owned().map(id=>id+' '+G.tatOf(id).lv).join(', '));}
