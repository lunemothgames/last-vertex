// Balance sim using the game's own data AND its own stats() function.
// Models continuous spawning, every tattoo mechanic and the active tattoos (cast on cooldown).
//
//   node tools/sim.js [hours=600] [build=offense]   long-term progression of one build
//   node tools/sim.js compare [lv=5] [build,build…] same coin budget for every build → how deep each one gets
//
// Builds = a shop shopping list (weights) + 5 equipped tattoos (see BUILDS below).
// What-ifs without editing the game: SIM_ECO='{"bossHpMul":6}' SIM_PU='{"damage":{"ms":[100,1.15]}}'
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','src','index.src.html'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);if(i<0||j<0)throw new Error('marker '+a);return src.slice(i,j);};
const save={perm:{},tatCol:{},equipped:[],tatSlots:5,temp:{},tierBest:{1:0},tier:1,bestWave:0,coins:0,gems:0,tatV6:1,permV6:1};
const G=new Function('save','GH','runTier',[cut('const SUFFIX=','// ── AUDIO'),cut('// ── ECONOMY','// ── STATE'),
  'return{fmtN,ECO,TIERS,ENEMY_TYPES,PERM_UPGRADES,PU,TT,permVal,coinValueAt,upCost,stats,tb,totalStars,MASTERY,setTier:t=>{runTier=t;}};'].join('\n'))(save,1,1);
const {fmtN,ECO,TIERS,ENEMY_TYPES,PERM_UPGRADES,PU,TT,coinValueAt,upCost,stats,tb,setTier}=G;
Object.assign(ECO,JSON.parse(process.env.SIM_ECO||'{}'));
for(const [id,o] of Object.entries(JSON.parse(process.env.SIM_PU||'{}')))Object.assign(PU[id],o);

// ── builds: shop weights (higher = buy more of it) + tattoos ──
const ECON={coinMult:1,lootChance:1,bounty:1,gameSpeed:1};
const CORE={damage:3,fireRate:2,maxHp:1,regen:1};      // every build still has to kill and survive
const BUILDS={
  offense:{shop:{...CORE,critChance:2,critMult:2,range:1,bossDmg:1,...ECON},
           tat:['attack_power','attack_speed','crit_chance','crit_mult','boss_slayer']},
  swarm:  {shop:{...CORE,multishot:2,bounce:2,pierce:2,range:1,...ECON},
           tat:['twin','arc','ricochet','piercer','attack_power']},
  tank:   {shop:{damage:1,fireRate:1,maxHp:3,regen:3,defense:2,thorns:2,dodge:1,lifesteal:1,waveHeal:1,...ECON},
           tat:['thorns','aegis','defense','regen','max_hp']},
  active: {shop:{...CORE,critChance:1,critMult:1,range:1,bossDmg:1,...ECON},
           tat:['nova','overdrive','stasis','mend','attack_power']},
  control:{shop:{...CORE,knockback:2,slowChance:2,slowAmt:2,range:2,...ECON},
           tat:['frost','reach','stasis','attack_power','attack_speed']},
  reaper: {shop:{...CORE,execute:2,bossDmg:2,critChance:1,critMult:1,lifesteal:1,...ECON},
           tat:['reaper','boss_slayer','lifesteal','attack_power','crit_mult']},
  farm:   {shop:{...CORE,critChance:1,critMult:1,coinMult:3,lootChance:2,bounty:2,gameSpeed:2},
           tat:['coin_mult','luck','midas','attack_power','attack_speed']},
  bruiser:{shop:{damage:2,fireRate:1,maxHp:2,regen:2,defense:2,thorns:2,lifesteal:1,dodge:1,...ECON},
           tat:['thorns','mend','shockwave','attack_power','dodge']},
  chillNoKb:{shop:{...CORE,slowChance:2,slowAmt:2,range:2,...ECON},tat:['frost','reach','stasis','attack_power','attack_speed']},
  kbOnly:{shop:{...CORE,knockback:2,range:2,...ECON},tat:['attack_power','attack_speed','crit_chance','crit_mult','boss_slayer']},
  // swarm that gives up two power slots for coin tattoos
  greedy: {shop:{...CORE,multishot:2,bounce:2,pierce:2,range:1,...ECON},
           tat:['twin','arc','ricochet','coin_mult','midas']},
};
function equip(b,lv){
  save.tatCol={};save.equipped=[];
  for(const id of BUILDS[b].tat){save.tatCol[id]={lv,copies:0};save.equipped.push(id);}
}
// spend `bank` on the build's list: always the level with the lowest price/weight
function shop(b,bank,skip){
  const W=BUILDS[b].shop;
  for(;;){let best=null;
    for(const id in W){if(skip&&skip[id])continue;const u=PU[id],l=save.perm[id]||0;if(l>=u.max)continue;
      const c=upCost(u,l);if(c<=bank&&(!best||c/W[id]<best[1]/W[best[0]]))best=[id,c];}
    if(!best)return bank;bank-=best[1];save.perm[best[0]]=(save.perm[best[0]]||0)+1;}
}

// ── one run; positions are fractions of screen height, time in game seconds ──
function run(tier,maxW=1e9){
  setTier(tier);const st=stats();
  const LINE=.83,avgCrit=1+st.crit*(st.critM-1);
  const A={};for(const id of save.equipped)if(TT[id].act)A[id]={...tb(id),cd:0,left:0};
  let hp=st.maxHp,coins=0,t=0,w=0,aegis=0,shock=0,shots=0;const dt=.1;
  for(;;){
    w++;if(w>maxW)return{w:w-1,coins,t:t/st.speed};
    const ew=w+(tier-1)*TIERS.offset,boss=w%ECO.bossEvery===0;
    const hpB=ECO.enemyHp*Math.pow(ECO.enemyHpGrowth,ew-1),atkB=ECO.enemyAtk*Math.pow(ECO.enemyAtkGrowth,ew-1),spB=.032*(1+Math.min(ew,150)*.005);
    const pool=Object.values(ENEMY_TYPES).filter(x=>x.w>0&&ew>=x.from),tw=pool.reduce((s,x)=>s+x.w,0);
    const pick=()=>{let r=Math.random()*tw;for(const x of pool){r-=x.w;if(r<0)return x;}return pool[0];};
    const mk=(T,y)=>({y,hp:hpB*T.hp,max:hpB*T.hp,atk:atkB*T.atk,sp:spB*T.spd,coin:T.coin,kb:0,slow:0,frz:0,boss:false,
      sh:T.shield?hpB*T.hp*T.shield:0,heal:T.heal||0,ht:1,blink:T.blink||0,bt:(T.blink||0)*(.5+Math.random()*.5)});
    const E=[],dur=Math.min(45,18+w*.5),iv=Math.max(.5,2.2-w*.04),per=Math.max(1,Math.floor(1+w/20));
    for(let i=0,n=Math.min(3+Math.floor(ew/8),8);i<n;i++)E.push(mk(pick(),.1-i*.09));
    if(boss)E.push({y:.04,hp:hpB*ECO.bossHpMul,max:hpB*ECO.bossHpMul,atk:atkB*ECO.bossAtkMul,sp:spB*.5,coin:ECO.bossCoins,kb:0,slow:0,frz:0,boss:true,summon:ECO.bossSummonEvery});
    let left=dur,spawnT=0,cd=0;const cv=coinValueAt(ew)*st.mult;
    const midas=()=>A.midas&&A.midas.left>0?A.midas.m:1;
    const kill=e=>{coins+=e.boss?cv*e.coin*midas():(e.coin&&Math.random()<st.coinChance?cv*e.coin*midas()*(Math.random()<st.jackpot?3:1):0);};
    const hit=(e,d)=>{e.hp-=d;hp=Math.min(st.maxHp,hp+d*st.ls);};
    while(left>0||E.length){
      t+=dt;left-=dt;aegis=Math.max(0,aegis-dt);shock=Math.max(0,shock-dt);
      if(left>0){spawnT-=dt;if(spawnT<=0){spawnT=iv;for(let i=0;i<per;i++)E.push(mk(pick(),.1));}}
      hp=Math.min(st.maxHp,hp+st.regen*dt);cd-=dt;
      // active tattoos, cast as soon as they are useful
      for(const id in A){const a=A[id];a.cd=Math.max(0,a.cd-dt);a.left=Math.max(0,a.left-dt);if(a.cd>0)continue;
        if(id==='nova'&&E.filter(e=>e.y>.1).length>=3){for(const e of E)if(e.y>.1){hit(e,st.dmg*a.m*(e.boss?st.bossDmg:1));if(!e.boss)e.kb=Math.min(e.kb,-e.sp*ECO.kbPush*1.5);}}
        else if(id==='overdrive'&&E.some(e=>e.y>st.rangeY)){a.left=a.dur;}
        else if(id==='midas'&&E.length>=3){a.left=a.dur;}
        else if(id==='stasis'&&E.some(e=>e.y>.7)){for(const e of E)e.frz=e.boss?a.dur/2:a.dur;}
        else if(id==='mend'&&hp<st.maxHp*.5){hp=Math.min(st.maxHp,hp+st.maxHp*a.heal);}
        else continue;
        a.cd=tb(id).cd;
      }
      if(st.shockM&&hp<st.maxHp*.3&&shock<=0){for(const e of E)if(e.y>.45){hit(e,st.dmg*st.shockM*(e.boss?st.bossDmg:1));if(!e.boss)e.kb=Math.min(e.kb,-e.sp*ECO.kbPush*2);}shock=st.shockCD;}
      for(const e of E){
        e.kb*=Math.pow(.03,dt);if(Math.abs(e.kb)<e.sp*.05)e.kb=0;
        if(e.frz>0){e.frz-=dt;continue;}
        if(e.heal){e.ht-=dt;if(e.ht<=0){e.ht=1;for(const o of E)if(o.hp>0&&Math.abs(o.y-e.y)<.13)o.hp=Math.min(o.max,o.hp+o.max*e.heal);}}
        if(e.blink){e.bt-=dt;if(e.bt<=0&&e.y>.1){e.bt=e.blink;e.y=Math.min(LINE-.02,e.y+.1);}}
        if(e.slow>0)e.slow-=dt;
        const sp=e.sp*(e.slow>0?1-st.slowAmt:1);e.y+=(sp+e.kb)*dt;
        if(e.boss){e.summon-=dt;if(e.summon<=0){e.summon=ECO.bossSummonEvery;for(let k=0;k<2;k++)E.push({...mk(ENEMY_TYPES.mini,e.y),coin:0});}}
        if(e.y>LINE&&sp+e.kb>0){
          let taken=0;
          if(Math.random()<st.dodge){}
          else if(st.aegisCD&&aegis<=0)aegis=st.aegisCD;
          else{taken=e.atk*st.dmgTaken;hp-=taken;}
          const th=Math.min(e.hp,e.max*st.thornPct*(e.boss?ECO.bossThorns:1));e.hp-=th;
          if(taken>0)hp=Math.min(st.maxHp,hp+Math.min(th*st.ls,taken*ECO.thornHealCap));
          e.kb=-e.sp*3.5;e.y=LINE-.01;
        }
      }
      const rate=st.rate*(A.overdrive&&A.overdrive.left>0?A.overdrive.m:1);
      while(cd<=0){
        const vis=E.filter(e=>e.y>st.rangeY&&e.hp>0).sort((a,b)=>b.y-a.y);if(!vis.length){cd=0;break;}
        // main bullet, multishot extras and twin go to the next enemies in line
        const B=[[0,1]];
        if(Math.random()<st.multiChance)for(let k=1;k<=ECO.multiExtra;k++)if(vis[k])B.push([k,1]);
        if(st.twin)B.push([vis[1]?1:0,st.twin]);
        for(const [i0,m] of B){
          let i=i0,bounces=0;
          for(;;){
            const e=vis[i];if(!e||e.hp<=0)break;
            const d=st.dmg*m*avgCrit*(e.boss?st.bossDmg:1)*(e.hp<e.max*ECO.executeAt?st.execute:1)*(e.slow>0||e.frz>0?st.frostVuln:1);
            if(e.sh>0){e.sh-=d*.5;hp=Math.min(st.maxHp,hp+d*st.ls);}else hit(e,d);
            if(!e.boss&&e.hp>0&&e.hp<e.max*st.reap)e.hp=0;
            if(!e.boss&&Math.random()<st.kbChance)e.kb=Math.min(e.kb,-e.sp*ECO.kbPush);
            if(st.slowAmt>0&&Math.random()<st.slowChance)e.slow=ECO.slowTime;
            // a pierced bullet flies on in a straight line: it only meets another enemy if the field is crowded
            if(Math.random()<st.pierce&&Math.random()<Math.min(.7,vis.length*.06)){i++;continue;}
            if(bounces<st.chain&&Math.random()<st.bounce){bounces++;i=vis.findIndex((x,j)=>j!==i&&x.hp>0);if(i<0)break;continue;}
            break;
          }
        }
        if(st.arcEvery&&++shots%st.arcEvery===0)for(const e of vis.slice(0,st.arcN))hit(e,st.dmg*st.arcM*(e.boss?st.bossDmg:1));
        cd+=1/rate;
      }
      for(let i=E.length-1;i>=0;i--)if(E[i].hp<=0){kill(E[i]);E.splice(i,1);}
      if(hp<=0||t>5400)return{w,coins,t:t/st.speed};
    }
    coins+=cv*st.bounty*dur;hp=Math.min(st.maxHp,hp+st.maxHp*st.waveHeal);t+=2.3;
  }
}

// how deep a build gets: climb tiers while it clears the unlock wave, report effective wave + coins/hour
function depth(maxTier=40){
  let best=0,cph=0,t=1;
  for(;t<=maxTier;t++){
    const r=[run(t,TIERS.unlockWave+10),run(t,TIERS.unlockWave+10)];
    const w=Math.max(...r.map(x=>x.w));best=(t-1)*TIERS.offset+w;
    cph=Math.max(cph,r.reduce((s,x)=>s+x.coins,0)/r.reduce((s,x)=>s+x.t,0)*3600);
    if(w<TIERS.unlockWave)break;
  }
  return{eff:best,tier:Math.min(t,maxTier),cph};
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
  console.log(`tattoos at Lv${LV} · effective wave reached (tier) · coins per hour at best tier`);
  console.log('build    '+BUDGETS.map(b=>fmtN(b).padStart(20)).join(''));
  for(const b of names){
    let line=b.padEnd(9);
    for(const B of BUDGETS){save.perm={};shop(b,B,{gameSpeed:1});equip(b,LV);const d=depth();line+=`${String(d.eff).padStart(5)} (T${String(d.tier).padStart(2)}) ${fmtN(d.cph).padStart(7)}/h`;}
    console.log(line);
  }
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
const HOURS=+process.argv[2]||600,BUILD=process.argv[3]||'offense',TLV=+process.env.SIM_TLV||0;
if(!BUILDS[BUILD])throw new Error('unknown build '+BUILD);
if(TLV)equip(BUILD,TLV);
const LOG=[1,2,5,10,20,42,84,168,336,600,1000,1500,2000,3000].filter(h=>h<=HOURS);
let bank=0,clock=0,li=0,runs=0,tier=1;const tierBest={1:0};save.tierBest=tierBest;   // mastery stars count
while(clock<HOURS*3600){
  // every 10th run goes back to farm mastery stars in the highest tier (3+ below) that still misses one
  const farm=runs%10===9?[...Array(Math.max(0,tier-3)).keys()].map(i=>tier-3-i).find(t=>(tierBest[t]||0)<G.MASTERY[2]):0;
  if(farm){const r=run(farm);runs++;clock+=r.t+3;bank+=r.coins;tierBest[farm]=Math.max(tierBest[farm]||0,r.w);bank=shop(BUILD,bank);continue;}
  const r=run(tier);runs++;clock+=r.t+3;bank+=r.coins;
  tierBest[tier]=Math.max(tierBest[tier]||0,r.w);
  if(tierBest[tier]>=TIERS.unlockWave&&tier<TIERS.max){tier++;tierBest[tier]=tierBest[tier]||0;}
  else if(r.w<6&&tier>1)tier--;
  bank=shop(BUILD,bank);
  while(li<LOG.length&&clock>=LOG[li]*3600){
    const mt=Object.keys(tierBest).map(Number).filter(t=>tierBest[t]>0).reduce((a,b)=>Math.max(a,b),1);
    const p=id=>save.perm[id]||0;
    console.log(`${String(LOG[li]).padStart(5)}h  runs ${String(runs).padStart(5)}  T${mt} best ${String(tierBest[mt]).padStart(2)} (eff ${(mt-1)*TIERS.offset+tierBest[mt]}) ★${G.totalStars()}  dmg L${p('damage')} hp L${p('maxHp')} rgn L${p('regen')} arm L${p('defense')} thr L${p('thorns')}  spd x${G.permVal('gameSpeed').toFixed(1)}  bank ${fmtN(bank)}`);
    li++;
  }
}
