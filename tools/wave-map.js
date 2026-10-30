// Wave map (B6, 2026-10-31): the game's own rules wave by wave, with every sudden step flagged, so a wall can be traced to its cause
// before guessing (the Tier 1 wall at wave 25-29 was missed for days: spawns double at wave 20 and coin per kill stops growing).
//   node tools/wave-map.js [tiers=1-4] [waves=40] [player=normal] [builds=offense,active,tank] [days=60]   (npm run map)
//   player=none skips part 2 (rules only, instant).
// Part 1 RULES (formulas read from src/index.src.html, nothing re-typed): per tier and wave of that tier
//   eff = effective wave · hp / atk = a normal enemy's base health / attack (type mix of that wave, elites, SPLITTER shards included)
//   en/s = enemies arriving per second (continuous spawns + the opening group spread over the wave) · press = enemy health arriving
//   per second (the damage per second needed to keep up; boss waves add the boss) · coin/k = coins per kill (coin chance 50%, no shop)
//   coin/s = coins per second at that rate · c/hp = coins per 1000 health killed (falls when coins lag behind enemy health)
//   Flags: STEP (pressure +15% or more over the wave before, beyond the normal growth), NEW (enemy type), BOSS, EV (wave event),
//   COIN- (coin per kill lower than the wave before), SPAWN (more enemies per spawn), FLOOR (spawn interval at its minimum)
// Part 2 PLAYER (tools/sim.js SIM_TRACE): one player type plays N days; for each best effective wave reached: when (day), how long
//   it stayed the best (days, runs), coins per run, rough damage per second, runs of coins for the next DAMAGE level, and
//   dps/press = player damage per second / pressure of the next wave (it falls where the enemy outgrows the player). WALL = 4+ days.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const ROOT=path.join(__dirname,'..');
const A=Object.fromEntries(process.argv.slice(2).map(s=>{const i=s.indexOf('=');if(i<0)throw new Error('use name=value: '+s);return [s.slice(0,i),s.slice(i+1)];}));
const src=fs.readFileSync(process.env.SIM_SRC||path.join(ROOT,'src','index.src.html'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);if(i<0||j<0)throw new Error('marker '+a);return src.slice(i,j);};
const save={settings:{},perm:{},tatCol:{},equipped:[],tatSlots:1,temp:{},tierBest:{1:0},tier:1};
const G=new Function('save','GH','runTier',[cut('const SUFFIX=','// ── AUDIO'),cut('// ── ECONOMY','// ── STATE'),
  'return{ECO,TIERS,ENEMY_TYPES,coinValueAt,tierCoinMult,eventFor,bossKindFor};'].join('\n'))(save,1,1);
const {ECO,TIERS,ENEMY_TYPES,coinValueAt,tierCoinMult}=G;
// the spawn rules live in spawnWave / updatePlay / spawnEnemy: take each expression from the game text, so a change there shows here
const grab=(re,name)=>{const m=src.match(re);if(!m)throw new Error('wave-map: cannot find '+name+' in the game (update the pattern)');return m[1];};
const F=(expr,args)=>new Function(...args,'const runMods=null;return '+expr+';');
const interval=F(grab(/const interval=([^;]+);/,'spawn interval'),['waveNum']);
const perSpawn=F(grab(/const perSpawn=([^;]+);/,'enemies per spawn'),['waveNum']);
const waveDur=F(grab(/waveDuration=(Math\.min\([^;]+);/,'wave duration'),['waveNum']);
const initCount=F(grab(/initCount=([^;]+);/,'opening group'),['ew']);
const eliteChance=F(grab(/const eliteChance=([^;]+);/,'elite chance'),['ew']);
const SHARD=ENEMY_TYPES.mini?ENEMY_TYPES.mini.hp:0;

// one wave of one tier
function wave(t,w){
  const ew=w+(t-1)*TIERS.offset,pool=Object.entries(ENEMY_TYPES).filter(([,T])=>T.w>0&&ew>=T.from),W=pool.reduce((s,[,T])=>s+T.w,0);
  const mix=f=>pool.reduce((s,[k,T])=>s+T.w/W*f(k,T),0),el=eliteChance(ew);
  const hpB=ECO.enemyHp*Math.pow(ECO.enemyHpGrowth,ew-1),atkB=ECO.enemyAtk*Math.pow(ECO.enemyAtkGrowth,ew-1);
  // health to chew through per enemy: its own (x3 for elites), a shield on top, SPLITTER's two shards
  const hp=hpB*mix((k,T)=>T.hp*(1+(T.shield||0)*(k==='warden'?.5+.5*Math.min(1,Math.max(0,(ew-T.from)/90)):1))*(1+2*el)+(k==='splitter'?2*SHARD:0));
  const atk=atkB*mix((k,T)=>T.atk)*(1+.5*el);
  const dur=waveDur(w),eps=perSpawn(w)/interval(w)+initCount(ew)/dur;
  const boss=w%ECO.bossEvery===0;
  const press=hp*eps+(boss?hpB*ECO.bossHpMul/dur:0);
  const ck=coinValueAt(ew)*ECO.coinChance*mix((k,T)=>T.coin)*(1+el)*tierCoinMult(t);
  const cs=ck*eps+(boss?coinValueAt(ew)*ECO.bossCoins*tierCoinMult(t)/dur:0);
  return{t,w,ew,hp,atk,eps,press,ck,cs,boss,dur,ps:perSpawn(w),iv:interval(w),
    newT:Object.entries(ENEMY_TYPES).filter(([,T])=>T.w>0&&T.from===ew).map(([,T])=>T.name),
    ev:G.eventFor?G.eventFor(w,t,0):null,bk:boss&&G.bossKindFor?G.bossKindFor(w,ECO.bossEvery):''};
}
const fmt=v=>v>=1e6?(v/1e6).toFixed(1)+'M':v>=1e4?(v/1e3).toFixed(0)+'K':v>=100?v.toFixed(0):v>=10?v.toFixed(1):v.toFixed(2);
const [t0,t1]=(A.tiers||'1-4').split('-').map(Number),WAVES=+A.waves||40;
const NORMAL=(ECO.enemyHpGrowth-1)*100;   // % pressure growth a wave from health alone
console.log(`== PART 1  RULES  (tiers ${t0}-${t1||t0}, waves 1-${WAVES} of each tier; enemy health alone grows ${NORMAL.toFixed(1)}% a wave)`);
const allFlags=[];
for(let t=t0;t<=(t1||t0);t++){
  console.log(`\n-- Tier ${t}`);
  console.log('wave  eff      hp     atk  en/s   press  coin/k  coin/s  c/hp  flags');
  let prev=null;
  for(let w=1;w<=WAVES;w++){
    const x=wave(t,w),fl=[];
    if(prev){const g=(x.press/prev.press-1)*100;
      // compare without the boss on either side, a boss wave is flagged as BOSS on its own
      const pa=prev.boss?wave(t,w-1).hp*prev.eps:prev.press,pb=x.boss?x.hp*x.eps:x.press,g2=(pb/pa-1)*100;
      if(g2>=15)fl.push(`STEP +${g2.toFixed(0)}%`);
      if(x.ck<prev.ck*.995)fl.push(`COIN- ${((x.ck/prev.ck-1)*100).toFixed(1)}%`);
      if(x.ps>prev.ps)fl.push(`SPAWN x${x.ps}`);
      if(x.iv===.5&&prev.iv>.5)fl.push('FLOOR');}
    if(x.newT.length)fl.push('NEW '+x.newT.join('+'));
    if(x.boss)fl.push('BOSS '+x.bk);
    if(x.ev)fl.push('EV '+x.ev);
    const cph=x.cs/x.press*1000;
    console.log(String(w).padStart(4)+String(x.ew).padStart(5)+fmt(x.hp).padStart(8)+fmt(x.atk).padStart(8)+x.eps.toFixed(2).padStart(6)+
      fmt(x.press).padStart(8)+fmt(x.ck).padStart(8)+fmt(x.cs).padStart(8)+cph.toFixed(0).padStart(6)+'  '+fl.join(' · '));
    for(const f of fl)if(/^(STEP|COIN-|SPAWN|FLOOR)/.test(f))allFlags.push(`T${t} w${w} (eff ${x.ew}): ${f}`);
    prev=x;
  }
}
// pressure and coins along the climb (the path a player takes: each tier up to wave 30, then the next tier from wave 1)
console.log('\n-- the climb (each tier to wave '+TIERS.unlockWave+', then the next): pressure vs coins, every 5 waves');
console.log('tier wave  eff    press   coin/s   c/hp   press x since T1w1   coin x since T1w1');
const base=wave(1,1);
for(let t=t0;t<=(t1||t0);t++)for(let w=5;w<=TIERS.unlockWave;w+=5){const x=wave(t,w);
  console.log(String(t).padStart(4)+String(w).padStart(5)+String(x.ew).padStart(5)+fmt(x.press).padStart(9)+fmt(x.cs).padStart(9)+(x.cs/x.press*1000).toFixed(0).padStart(7)+
    ('x'+fmt(x.press/base.press)).padStart(20)+('x'+fmt(x.cs/base.cs)).padStart(20));}
console.log('\nflags: '+(allFlags.length?'\n  '+allFlags.join('\n  '):'none'));

// ── part 2: a player climbing it (sim) ──
const PLAYER=A.player||'normal';
if(PLAYER==='none')process.exit(0);
const builds=(A.builds||'offense,active,tank').split(','),DAYS=+A.days||60,REPS=+process.env.SIM_REPS||2;
const jobs=[];for(const b of builds)for(let s=1;s<=REPS;s++)jobs.push([b,s]);
const res={};let running=0,idx=0;const T0=Date.now();
console.log(`\n== PART 2  PLAYER  (${PLAYER}, ${DAYS} days, builds ${builds.join(',')}, ${REPS} seeds; running…)`);
function next(){
  while(running<6&&idx<jobs.length){const [b,seed]=jobs[idx++];running++;
    const p=spawn('node',['tools/sim.js','0',b],{cwd:ROOT,env:{...process.env,SIM_TYPE:PLAYER,SIM_DAYS:String(DAYS),SIM_SEED:String(seed),SIM_TRACE:'1'}});
    let out='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
    p.on('close',()=>{running--;const tr=out.split('\n').filter(l=>l.startsWith('TRACE ')).map(l=>JSON.parse(l.slice(6)));
      if(!tr.length)console.log(b,'seed'+seed,'FAILED',out.slice(-300));(res[b]=res[b]||[]).push(tr);next();
      if(running===0&&idx>=jobs.length)finish();});}
}
// pressure of an effective wave as a player meets it: the tier he plays and the wave of that tier
const pressAt=(t,w)=>wave(t,Math.max(1,w)).press;
function finish(){
  const walls=[];
  for(const b of builds){
    // stretches: from the run that set a new best effective wave to the next one
    const rows={};
    for(const tr of res[b]){let cur=null;
      for(const r of tr){
        if(!cur||r.e>cur.e){if(cur)cur.end=r.d;cur={e:r.e,d0:r.d,end:null,runs:0,c:0,dps:0,nd:0,t:r.t,w:r.w};(rows[r.e]=rows[r.e]||[]).push(cur);}
        cur.runs++;cur.c+=r.c;cur.dps=r.dps;cur.nd=r.nd;cur.t=r.t;cur.w=Math.max(cur.w,r.w);
      }
      if(cur)cur.end=DAYS;}
    console.log(`\n-- ${b}: every new best effective wave (mean of ${REPS} seeds where reached)`);
    console.log(' eff  tier  day   days  runs  coins/run      dps  dps/press  runs/DMG lv');
    const effs=Object.keys(rows).map(Number).sort((a,b)=>a-b);
    for(const e of effs){const R=rows[e],m=f=>R.reduce((s,x)=>s+f(x),0)/R.length;
      const days=m(x=>x.end-x.d0),t=R[0].t,w=e-(t-1)*TIERS.offset;
      const dp=m(x=>x.dps)/pressAt(t,w+1);
      const flag=days>=4?'  WALL':'';
      if(e<5&&!flag)continue;
      console.log(String(e).padStart(4)+String(t).padStart(6)+m(x=>x.d0).toFixed(0).padStart(5)+days.toFixed(1).padStart(7)+m(x=>x.runs).toFixed(0).padStart(6)+
        fmt(m(x=>x.c/x.runs)).padStart(11)+fmt(m(x=>x.dps)).padStart(9)+dp.toFixed(2).padStart(11)+m(x=>x.nd).toFixed(1).padStart(13)+flag);
      if(flag)walls.push(`${b}: ${days.toFixed(1)} days at eff ${e} (tier ${t} wave ${w}) from day ${m(x=>x.d0).toFixed(0)}`);
    }
  }
  console.log('\nwalls (4+ days without a new best): '+(walls.length?'\n  '+walls.join('\n  '):'none'));
  console.log(`(${((Date.now()-T0)/1000).toFixed(0)} s)`);
}
next();
