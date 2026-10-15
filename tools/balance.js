// Builds a balance reference page straight from the game's own data blocks.
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','src','index.src.html'),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+1);if(i<0||j<0)throw new Error('marker '+a);return src.slice(i,j);};
const code=["const T=(s,...a)=>a.length?s.replace(/\{(\d)\}/g,(m,i)=>a[i]):s;",
  cut('const SUFFIX=','// ── AUDIO'),
  cut('const THEMES=[','const C={};'),
  cut('// ── ECONOMY','// ── STATS'),
  cut('const TEMP_UPGRADES=[','const tempCost='),
  cut('const QUEST=','const rint='),
  'return{upCost,fmtN,THEMES,ECO,PERM_UPGRADES,TAT_TYPES,RAR_NAMES,TAT_MAX,tatReq,tatFx,uVal,PITY,TAT_SLOT_PRICES,TEMP_UPGRADES,TIERS,ENEMY_TYPES,QUEST,QUEST_DEFS};',
].join('\n');
const save={perm:{},tatCol:{},equipped:[],tatSlots:1,temp:{},tierBest:{1:0},tier:1,bestWave:0};
const G=new Function('save','GH',code)(save,1);
const {upCost,fmtN,THEMES,ECO,PERM_UPGRADES,TAT_TYPES,RAR_NAMES,TAT_MAX,tatReq,tatFx,uVal,PITY,TAT_SLOT_PRICES,TEMP_UPGRADES,TIERS,ENEMY_TYPES,QUEST,QUEST_DEFS}=G;

const val=(u,l)=>u.fx(uVal(u,l));
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');
const N=n=>fmtN(n).replace('∞','>1e308');

// ── shop ──
const SHOW_INF=100;
let shopSummary='',shopDetails='';
PERM_UPGRADES.forEach(u=>{
  const fin=isFinite(u.max),top=fin?u.max:SHOW_INF;
  let total=0;const rows=[];
  // every level up to 100, then every 50th to 1000, then every 250th
  const show=L=>L<=100||(L<=1000?L%50===0:L<=10000?L%250===0:L%10000===0)||L===top;
  for(let i=0;i<top;i++){const c=upCost(u,i);total+=c;if(show(i+1))rows.push([i+1,val(u,i+1),c,total]);}
  const extra=fin?[]:[150,200,300,500].map(L=>{let t=0;for(let i=0;i<L;i++)t+=upCost(u,i);return[L,val(u,L),upCost(u,L-1),t];});
  shopSummary+=`<tr><td class="nm">${u.name}</td><td>${val(u,0)}</td><td>+${esc(u.id==='multishot'?'1 bullet':u.fx(u.step).replace(/^\+|^x/,''))}</td>
    <td>${fin?u.max:'∞'}</td><td>${fin?val(u,u.max):'—'}</td><td>${N(u.base)}</td><td>${u.p?`lv^${u.p}`:`×${u.g}`}</td>
    <td>${fin?N(upCost(u,u.max-1)):'—'}</td><td>${fin?N(total):`${N(total)} <small>(Lv${SHOW_INF})</small>`}</td></tr>`;
  shopDetails+=`<details><summary><b>${u.name}</b> <span>${esc(u.info)}</span></summary>
    <table class="lv"><tr><th>LV</th><th>VALUE</th><th>PRICE</th><th>TOTAL SPENT</th></tr>
    ${rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${N(r[2])}</td><td>${N(r[3])}</td></tr>`).join('')}
    ${extra.map(r=>`<tr class="ck"><td>${r[0]}</td><td>${r[1]}</td><td>${N(r[2])}</td><td>${N(r[3])}</td></tr>`).join('')}
    </table></details>`;
});

// ── next-run boosts ──
const waves=[0,10,20,30,50,75,100];
const tempRows=TEMP_UPGRADES.map(u=>`<tr><td class="nm">${u.name}</td><td>${u.desc}</td>${waves.map(w=>`<td>${N(Math.ceil(u.base*Math.pow(ECO.tempCostGrowth,w)))}</td>`).join('')}</tr>`).join('');

// ── tattoos ──
const totW=TAT_TYPES.reduce((s,t)=>s+t.w,0);
const copiesTo=L=>{let c=1;for(let l=1;l<L;l++)c+=tatReq(l);return c;};
const tatSummary=TAT_TYPES.map(t=>{
  const p=t.w/totW;
  return `<tr><td class="nm">${t.name}</td><td class="r${t.rar}">${RAR_NAMES[t.rar]}</td><td>${(p*100).toFixed(2)}%</td>
    <td>${t.act?'ACTIVE · ':''}${esc(t.desc(tatFx(t,1)))}</td><td>${esc(t.desc(tatFx(t,TAT_MAX)))}</td>
    <td>${N(Math.ceil(copiesTo(TAT_MAX)/p))}</td><td>${N(Math.ceil(copiesTo(TAT_MAX)/p)*ECO.pullCost)}</td></tr>`;
}).join('');
let lvRows='';
for(let L=1;L<=TAT_MAX;L++)lvRows+=`<tr><td>${L}</td><td>${((L-1)/(TAT_MAX-1)*100).toFixed(0)}% of the way Lv1→Lv${TAT_MAX}</td><td>${L<TAT_MAX?tatReq(L):'MAX'}</td><td>${copiesTo(L)}</td></tr>`;
const tatDetails=TAT_TYPES.map(t=>{
  const p=t.w/totW;
  let r='';for(let L=1;L<=TAT_MAX;L++){const pulls=Math.ceil(copiesTo(L)/p);r+=`<tr><td>${L}</td><td>${esc(t.desc(tatFx(t,L)))}</td><td>${copiesTo(L)}</td><td>${N(pulls)}</td><td>${N(pulls*ECO.pullCost)}</td></tr>`;}
  return `<details><summary><b>${t.name}</b> <span class="r${t.rar}">${RAR_NAMES[t.rar]} · ${(p*100).toFixed(2)}% per pull</span></summary>
    <table class="lv"><tr><th>LV</th><th>EFFECT</th><th>COPIES OWNED</th><th>≈ PULLS</th><th>≈ GEMS</th></tr>${r}</table></details>`;
}).join('');

// ── slots / themes / waves ──
let cum=0;
const slotRows=TAT_SLOT_PRICES.map((c,i)=>{cum+=c;return`<tr><td>SLOT ${i+2}</td><td>${N(c)}</td><td>${N(cum)}</td></tr>`;}).join('');
const themeRows=THEMES.map(t=>`<tr><td class="nm"><i class="sw" style="background:${t.c[0]}"></i>${t.name}</td><td>${t.note}</td><td>${t.price?N(t.price):'FREE (default)'}</td></tr>`).join('');
const waveRows=[1,5,10,15,20,25,30,40,50,60,75,100,150,200].map(w=>{
  const hp=ECO.enemyHp*Math.pow(ECO.enemyHpGrowth,w-1),atk=ECO.enemyAtk*Math.pow(ECO.enemyAtkGrowth,w-1),cv=ECO.coinBase*Math.pow(ECO.coinGrowth,w-1);
  const n=w%ECO.bossEvery===0?1:Math.min(3+Math.floor(w/4),16);
  return`<tr><td>${w}${w%ECO.bossEvery===0?' ★':''}</td><td>${n}</td><td>${N(hp)}</td><td>${N(atk)}</td><td>${N(hp*ECO.bossHpMul)}</td><td>${N(atk*ECO.bossAtkMul)}</td><td>${N(cv)}</td><td>${N(cv*ECO.bossCoins)}</td><td>${N(cv*ECO.coinDropMinKills)}+</td></tr>`;
}).join('');

const html=`<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Last Vertex Balance</title>
<link href="https://fonts.googleapis.com/css2?family=VT323&family=IBM+Plex+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--a:#9fd8ff;--a2:#f0f9ff;--dim:#28506e;--mute:#6f9cc0;--bg:#02050b;--bg2:#0a1729;--hot:#ff7aa2;--r0:#7f9cb8;--r1:#bfe8ff;--r2:#7affd9;--r3:#ff7aa2}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(ellipse at 50% 0,var(--bg2),var(--bg) 70%) fixed;color:var(--a);font:13px/1.5 'IBM Plex Mono',monospace;padding:28px 16px 80px}
.wrap{max-width:1080px;margin:0 auto}
h1,h2{font-family:VT323,monospace;font-weight:400;letter-spacing:.08em;text-shadow:0 0 10px rgba(159,216,255,.5)}
h1{font-size:46px;margin:0}h1 small{font-size:20px;color:var(--mute)}
h2{font-size:30px;margin:40px 0 6px;border-bottom:1px solid var(--dim);padding-bottom:4px}
h2::before{content:'C:\\\\';color:var(--mute)}
p.n{color:var(--mute);margin:4px 0 12px;max-width:820px}
nav{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0}
nav a{color:var(--a);text-decoration:none;border:1px solid var(--dim);padding:3px 10px;font-family:VT323;font-size:20px}
nav a:hover{background:var(--a);color:var(--bg)}
.tw{overflow-x:auto}
table{border-collapse:collapse;width:100%;margin:6px 0 10px}
th{font-family:VT323;font-weight:400;font-size:18px;color:var(--mute);text-align:left;border-bottom:1px solid var(--dim);padding:4px 8px;white-space:nowrap}
td{padding:4px 8px;border-bottom:1px dashed rgba(40,80,110,.6);white-space:nowrap}
td.nm{font-family:VT323;font-size:20px;color:var(--a2)}
tr:hover td{background:rgba(159,216,255,.05)}
details{border:1px dashed var(--dim);margin:6px 0;padding:6px 10px}
details[open]{border-style:solid}
summary{cursor:pointer;font-family:VT323;font-size:21px}
summary span{font-family:'IBM Plex Mono';font-size:11px;color:var(--mute);margin-left:8px}
table.lv{width:auto;min-width:420px}
table.lv td{font-size:12px}
tr.ck td{color:var(--a2);border-top:1px solid var(--dim)}
.r0{color:var(--r0)}.r1{color:var(--r1)}.r2{color:var(--r2)}.r3{color:var(--r3)}
.sw{display:inline-block;width:10px;height:10px;margin-right:8px;vertical-align:middle}
.kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:6px 18px;margin-top:8px}
.kv div{border-bottom:1px dashed var(--dim);display:flex;justify-content:space-between;padding:2px 0}
.kv b{font-weight:400;color:var(--a2)}
small{color:var(--mute)}
</style></head><body><div class="wrap">
<h1>LAST VERTEX <small>// BALANCE SHEET</small></h1>
<p class="n">Generated straight from the game's data (ECO, PERM_UPGRADES, TAT_TYPES…). If the code changes, regenerate this page.</p>
<nav><a href="#core">CORE</a><a href="#tiers">TIERS</a><a href="#enemies">ENEMIES</a><a href="#quests">QUESTS</a><a href="#shop">SHOP</a><a href="#levels">SHOP LEVELS</a><a href="#temp">NEXT RUN</a><a href="#tat">TATTOOS</a><a href="#tatlv">TATTOO LEVELS</a><a href="#slots">SLOTS</a><a href="#themes">THEMES</a><a href="#waves">WAVES</a></nav>

<h2 id="core">CORE NUMBERS</h2>
<div class="kv">
<div>Enemy HP (wave 1)<b>${ECO.enemyHp}</b></div><div>Enemy HP growth / wave<b>×${ECO.enemyHpGrowth}</b></div>
<div>Enemy attack (wave 1)<b>${ECO.enemyAtk}</b></div><div>Enemy attack growth / wave<b>×${ECO.enemyAtkGrowth}</b></div>
<div>Boss every<b>${ECO.bossEvery} waves</b></div><div>Boss HP / attack<b>×${ECO.bossHpMul} / ×${ECO.bossAtkMul}</b></div>
<div>Coin drop chance per kill<b>${ECO.coinChance*100}%</b></div><div>Coin value growth / wave<b>×${ECO.coinGrowth}</b></div>
<div>Boss coins<b>×${ECO.bossCoins} kill value</b></div><div>Epic pity<b>${PITY} summons</b></div><div>Boss gem<b>none</b></div>
<div>Coin drop on field<b>${ECO.coinDropSecs}s of run income (min ${ECO.coinDropMinKills} kills)</b></div><div>Gem drop on field<b>+1</b></div>
<div>Drop cooldown after pickup<b>${ECO.pickupCooldown/60} min</b></div><div>Ad reward / cooldown<b>${ECO.adGems} gems / ${ECO.adCooldown/60} min</b></div>
<div>Summon x1 / x10<b>${ECO.pullCost} / ${ECO.pull10Cost} gems</b></div><div>Range line start<b>${(ECO.rangeBase*100)}% from top</b></div>
</div>

<h2 id="tiers">TIERS</h2>
<p class="n">Tier t starts at wave 1, but enemies are as strong as wave 1+(t-1)×${TIERS.offset}. Reach wave ${TIERS.unlockWave} in a tier to unlock the next. Coin bonus stacks with COIN BONUS.</p>
<div class="tw"><table style="width:auto"><tr><th>TIER</th><th>WAVE 1 EQUALS</th><th>COIN MULT</th><th>UNLOCK</th></tr>
${Array.from({length:TIERS.max},(_,i)=>i+1).map(t=>`<tr><td class="nm">TIER ${t}</td><td>T1 wave ${1+(t-1)*TIERS.offset}</td><td>x${(1+TIERS.coinBonus*(t-1)).toFixed(1)}</td><td>${t===1?'start':`wave ${TIERS.unlockWave} in tier ${t-1}`}</td></tr>`).join('')}</table></div>

<h2 id="enemies">ENEMY TYPES</h2>
<p class="n">Multipliers on the wave's base stats. Types join the mix from their effective wave. Boss waves bring ~60% of a normal wave as escort.</p>
<div class="tw"><table><tr><th>TYPE</th><th>HP</th><th>SPEED</th><th>ATTACK</th><th>SIZE</th><th>COINS</th><th>FROM WAVE</th><th>SPAWN WEIGHT</th></tr>
${Object.entries(ENEMY_TYPES).map(([k,t])=>`<tr><td class="nm">${t.name}</td><td>×${t.hp}</td><td>×${t.spd}</td><td>×${t.atk}</td><td>${(t.sz*100).toFixed(1)}%</td><td>×${t.coin}</td><td>${isFinite(t.from)?t.from:'split only'}</td><td>${t.w||'—'}</td></tr>`).join('')}
<tr><td class="nm">BOSS</td><td>×${ECO.bossHpMul}</td><td>×0.56</td><td>×${ECO.bossAtkMul}</td><td>10%</td><td>×${ECO.bossCoins} (always)</td><td>every ${ECO.bossEvery}th</td><td>—</td></tr></table></div>

<h2 id="quests">QUESTS</h2>
<p class="n">A new DAILY quest every ${QUEST.dailyEveryH}h, a WEEKLY quest every ${QUEST.weeklyEveryH}h. The board holds ${QUEST.cap}; when it is full new ones wait until you claim. Coin rewards scale with your best wave. Daily: 1–2 gems + ~12–20 kills of coins. Weekly: 5–7 gems + ~100–160 kills of coins. Quests that need a stat (crit, slow, …) only appear once you own it.</p>
<div class="tw"><table style="width:auto"><tr><th>QUEST</th><th>DAILY TARGET</th><th>WEEKLY TARGET</th></tr>
${QUEST_DEFS.map(d=>`<tr><td>${esc(d.txt(0).replace(/\b0\b/,'N'))}</td><td>${d.wave?'60% of best wave':d.coins?'25–45 kills of coins':`${d.d[0]}–${d.d[1]}`}</td><td>${d.wave?'best wave +1…3':d.coins?'250–400 kills of coins':`${d.w[0]}–${d.w[1]}`}</td></tr>`).join('')}</table></div>

<h2 id="shop">SHOP · PERMANENT</h2>
<p class="n">Each level adds a fixed step. Price of level n = base × n^p for unlimited stats (slow, no hard wall), base × growth^(n-1) for capped ones. Infinite upgrades are summed to Lv${SHOW_INF}.</p>
<div class="tw"><table><tr><th>UPGRADE</th><th>START</th><th>PER LV</th><th>MAX LV</th><th>AT MAX</th><th>LV1 PRICE</th><th>GROWTH</th><th>LAST LV PRICE</th><th>TOTAL TO MAX</th></tr>${shopSummary}</table></div>

<h2 id="levels">SHOP · EVERY LEVEL</h2>
<p class="n">Tap a row to open its full price list.</p>
${shopDetails}

<h2 id="temp">NEXT RUN BOOSTS</h2>
<p class="n">One-run boosts. Price = base × ${ECO.tempCostGrowth}^(best wave).</p>
<div class="tw"><table><tr><th>BOOST</th><th>EFFECT</th>${waves.map(w=>`<th>BEST ${w}</th>`).join('')}</tr>${tempRows}</table></div>

<h2 id="tat">TATTOOS</h2>
<p class="n">Drops have no level. The first copy unlocks Lv1, every duplicate fills the bar and levels up automatically. "≈ pulls/gems to MAX" is the average for that one tattoo.</p>
<div class="tw"><table><tr><th>TATTOO</th><th>RARITY</th><th>CHANCE / PULL</th><th>LV1</th><th>LV${TAT_MAX}</th><th>≈ PULLS TO MAX</th><th>≈ GEMS TO MAX</th></tr>${tatSummary}</table></div>
<h2 id="tatlv">TATTOO LEVELS</h2>
<div class="tw"><table style="width:auto"><tr><th>LV</th><th>POWER</th><th>COPIES TO NEXT</th><th>TOTAL COPIES OWNED</th></tr>${lvRows}</table></div>
${tatDetails}

<h2 id="slots">TATTOO SLOTS</h2>
<div class="tw"><table style="width:auto"><tr><th>SLOT</th><th>PRICE (GEMS)</th><th>TOTAL SPENT</th></tr><tr><td>SLOT 1</td><td>FREE</td><td>0</td></tr>${slotRows}</table></div>

<h2 id="themes">THEMES</h2>
<div class="tw"><table><tr><th>THEME</th><th>NOTE</th><th>PRICE (GEMS)</th></tr>${themeRows}</table></div>

<h2 id="waves">WAVES & REWARDS</h2>
<div class="tw"><table><tr><th>WAVE</th><th>ENEMIES</th><th>ENEMY HP</th><th>ENEMY ATK</th><th>BOSS HP</th><th>BOSS ATK</th><th>COIN / DROP</th><th>BOSS COINS</th><th>FIELD COIN</th></tr>${waveRows}</table></div>
</div></body></html>`;
const out=process.argv[2]||path.join(__dirname,'balance.html');
fs.mkdirSync(path.dirname(out),{recursive:true});
fs.writeFileSync(out,html);
console.log('written',out,(html.length/1024).toFixed(0)+'KB');
