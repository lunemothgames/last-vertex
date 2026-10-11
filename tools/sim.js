// Long-term progression sim using the game's own data (ECO, TIERS, ENEMY_TYPES, PERM_UPGRADES).
// Models a player who plays the best tier they can, then buys the cheapest useful upgrade greedily.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','src','index.src.html'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);if(i<0||j<0)throw new Error('marker '+a);return src.slice(i,j);};
const save={perm:{},tatCol:{},equipped:[],tatSlots:1,temp:{},tierBest:{1:0},tier:1,bestWave:0,coins:0};
const G=new Function('save','GH',[cut('const SUFFIX=','// ── AUDIO'),cut('// ── ECONOMY','// ── STATS'),
  'return{fmtN,ECO,TIERS,ENEMY_TYPES,PERM_UPGRADES,PU,permVal,coinValueAt,upCost};'].join('\n'))(save,1);
const {fmtN,ECO,TIERS,ENEMY_TYPES,PERM_UPGRADES,PU,permVal,coinValueAt,upCost}=G;
const HOURS=+process.argv[2]||600, LOG=[2,5,10,20,42,84,168,336,600,1000,1500,2000].filter(h=>h<=HOURS);
const capped=PERM_UPGRADES.filter(u=>isFinite(u.max)&&u.max<=500);
const cappedTotal=capped.reduce((s,u)=>{let t=0;for(let i=0;i<u.max;i++)t+=upCost(u,i);return s+t;},0);
let cappedSpent=0;
const v=id=>PU[id]?permVal(id):0;

function run(tier){
  const dmg=v('damage'),rate=v('fireRate'),maxHp=v('maxHp'),regen=v('regen'),armor=v('defense');
  const mult=v('coinMult')*(1+TIERS.coinBonus*(tier-1));const cch=Math.min(1,ECO.coinChance+(v('lootChance')||0));
  const crit=Math.min(.8,v('critChance')),critM=v('critMult'),multi=Math.min(.9,v('multishot')),ls=v('lifesteal');
  const kb=Math.min(.8,v('knockback')),rangeY=Math.max(ECO.rangeMin,ECO.rangeBase-v('range'));
  const speed=v('gameSpeed'),bossD=1+(v('bossDmg')||0),bounty=v('bounty')||0,waveHeal=v('waveHeal')||0;
  const avgDmg=dmg*(1+crit*(critM-1))*(1+multi*ECO.multiExtra*.5);
  let hp=maxHp,coins=0,t=0,w=0,dt=.1;
  for(;;){
    w++;const ew=w+(tier-1)*TIERS.offset,boss=w%ECO.bossEvery===0;
    const n=Math.min(3+Math.floor(ew/4),16),mobs=boss?Math.max(2,Math.floor(n*.6)):n;
    const hpB=ECO.enemyHp*Math.pow(ECO.enemyHpGrowth,ew-1),atkB=ECO.enemyAtk*Math.pow(ECO.enemyAtkGrowth,ew-1),spB=.032*(1+Math.min(ew,150)*.005);
    const pool=Object.values(ENEMY_TYPES).filter(x=>x.w>0&&ew>=x.from),tw=pool.reduce((s,x)=>s+x.w,0);
    const E=[];
    for(let i=0;i<mobs;i++){let r=Math.random()*tw,T=pool[0];for(const x of pool){r-=x.w;if(r<0){T=x;break;}}
      E.push({y:-.03-i*(.08+Math.random()*.04),hp:hpB*T.hp,atk:atkB*T.atk,sp:spB*T.spd,coin:T.coin,kb:0,boss:false});}
    if(boss)E.push({y:-.12-Math.floor(mobs/2)*.1,hp:hpB*ECO.bossHpMul,atk:atkB*ECO.bossAtkMul,sp:spB*.56,coin:ECO.bossCoins,kb:0,boss:true});
    let cd=0;const cv=coinValueAt(ew)*mult;
    while(E.length){
      t+=dt;hp=Math.min(maxHp,hp+regen*dt);cd-=dt;
      for(const e of E){e.kb*=Math.pow(.03,dt);if(Math.abs(e.kb)<e.sp*.05)e.kb=0;e.y+=(e.sp+e.kb)*dt;
        if(e.y>.83&&e.sp+e.kb>0){hp-=Math.max(e.atk*.1,e.atk-armor);e.kb=-e.sp*3.5;e.y=.82;}}
      while(cd<=0){
        const vis=E.filter(e=>e.y>rangeY);if(!vis.length){cd=0;break;}
        const tg=vis.reduce((a,b)=>b.y>a.y?b:a),d=avgDmg*(tg.boss?bossD:1);
        tg.hp-=d;hp=Math.min(maxHp,hp+d*ls);cd+=1/rate;
        if(!tg.boss&&Math.random()<kb)tg.kb=Math.min(tg.kb,-tg.sp*ECO.kbPush);
        if(tg.hp<=0){E.splice(E.indexOf(tg),1);coins+=tg.boss?Math.round(cv*tg.coin):(Math.random()<cch?Math.max(1,Math.round(cv*tg.coin)):0);}
      }
      if(hp<=0||t>5400)return{w,coins,t:t/speed};
    }
    coins+=Math.round(cv*bounty);hp=Math.min(maxHp,hp+maxHp*waveHeal);t+=2.3;
  }
}

let bank=0,clock=0,li=0,runs=0;const tierBest={1:0};let tier=1;
const buyable=PERM_UPGRADES.map(u=>u.id);
while(clock<HOURS*3600){
  const r=run(tier);runs++;clock+=r.t+3;bank+=r.coins;
  tierBest[tier]=Math.max(tierBest[tier]||0,r.w);
  if(tierBest[tier]>=TIERS.unlockWave&&tier<TIERS.max){tier++;tierBest[tier]=tierBest[tier]||0;}
  else if(r.w<6&&tier>1)tier--;
  for(;;){let best=null;
    for(const id of buyable){const u=PU[id],l=save.perm[id]||0;if(l>=u.max)continue;const c=upCost(u,l);if(c<=bank&&(!best||c<best[1]))best=[id,c];}
    if(!best)break;bank-=best[1];save.perm[best[0]]=(save.perm[best[0]]||0)+1;if(capped.includes(PU[best[0]]))cappedSpent+=best[1];}
  while(li<LOG.length&&clock>=LOG[li]*3600){
    const mt=Object.keys(tierBest).map(Number).filter(t=>tierBest[t]>0).reduce((a,b)=>Math.max(a,b),1);
    const maxed=capped.filter(u=>(save.perm[u.id]||0)>=u.max).length;
    console.log(`${String(LOG[li]).padStart(5)}h  runs ${String(runs).padStart(4)}  tier ${mt} best ${tierBest[mt]}  capped avg ${(capped.reduce((s,u)=>s+Math.min(1,(save.perm[u.id]||0)/u.max),0)/capped.length*100).toFixed(0)}%  maxed ${maxed}/${capped.length}  dmg L${save.perm.damage||0} hp L${save.perm.maxHp||0} spd x${v('gameSpeed').toFixed(1)} bank ${fmtN(bank)}`);
    li++;
  }
}
