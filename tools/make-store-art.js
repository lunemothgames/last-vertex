// Renders the Google Play store art into store/: captioned phone screenshots (1080x1920) per language,
// feature graphic (1024x500), hi-res icon (512).
// Usage:  npm i (once)  →  npm run build  →  node tools/make-store-art.js [en|tr|es|pt …]   (no language = all four)
// Browser: Edge by default, or set CHROME_PATH. Captions: tools/store-text.js.
const fs=require('fs'),path=require('path'),os=require('os');
const puppeteer=require('puppeteer-core');
const TEXT=require('./store-text');
const root=path.join(__dirname,'..'),out=path.join(root,'store');
const BROWSER=process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAME='file:///'+path.join(root,'index.html').replace(/\\/g,'/');
const RAW=fs.mkdtempSync(path.join(os.tmpdir(),'lv-store-'));   // uncaptioned game shots
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const LANGS=process.argv.slice(2).length?process.argv.slice(2):Object.keys(TEXT);
// the game's own @font-face rules (fonts are inlined by the build), reused for the captions
const FONT_CSS=(fs.readFileSync(path.join(root,'index.html'),'utf8').match(/@font-face\{[^}]+\}/g)||[]).join('\n');
const HINTS={menu:1,start:1,breach:1,drops:1,hud:1,shop:1,tattoo:1,quests:1,tier:1,target:1,active:1};
// a mid-game player: a few tiers in, some tattoos, an active build
const SAVE={coins:4.2e7,gems:340,tier:6,tierBest:{1:78,2:62,3:51,4:44,5:36,6:21},tatSlots:4,themesOwned:['ice'],
  perm:{damage:520,fireRate:70,maxHp:480,regen:380,defense:180,thorns:90,critChance:90,critMult:60,multishot:70,bounce:40,range:35,
    pierce:20,coinMult:150,lootChance:60,bounty:40,gameSpeed:8,offline:10},
  tatCol:{attack_power:{lv:5,copies:2},twin:{lv:3,copies:1},nova:{lv:4,copies:0},arc:{lv:2,copies:3},crit_mult:{lv:4,copies:1},
    max_hp:{lv:5,copies:0},regen:{lv:3,copies:2},coin_mult:{lv:4,copies:1},frost:{lv:2,copies:0},aegis:{lv:1,copies:0},thorns:{lv:3,copies:0}},
  equipped:['attack_power','twin','nova','arc'],settings:{fx:'high',target:0,lang:'en'},coach:Object.fromEntries(['play','shop','buy','again','help','tattoo','summon','equip','quests','tier','weekly'].map(k=>[k,1])),hints:HINTS,qNextDaily:Date.now()+3e6,qNextWeekly:Date.now()+8e7};
// a 10x summon to show off: two new tattoos, a few level-ups
const GACHA=[['ricochet',{isNew:1,lv:1}],['attack_speed',{lv:3}],['nova',{leveled:1,lv:5}],['luck',{lv:2}],['crit_mult',{lv:4}],
  ['max_hp',{leveled:1,lv:6}],['frost',{lv:2}],['twin',{leveled:1,lv:4}],['regen',{lv:3}],['shatter',{isNew:1,lv:1}]];
const THEME_FAN=['amber','green','pink'];   // left, centre, right on the themes shot

(async()=>{
  const b=await puppeteer.launch({executablePath:BROWSER,headless:true});
  const p=await b.newPage();
  const raw=n=>path.join(RAW,n+'.png');
  const shot=async n=>{await sleep(400);await p.evaluate(()=>{const t=$('toast');t.className='';clearTimeout(_toastTO);$('hint').classList.remove('show');});await p.screenshot({path:raw(n)});};
  const load=async s=>{await p.goto(GAME);await sleep(200);await p.evaluate(s=>{saveLocked=true;localStorage.setItem('tt3',JSON.stringify(s));},s);await p.reload();await sleep(2600);
    await p.evaluate(()=>{toast=()=>{};});};   // no achievement / quest toasts in the shots
  // seeded randomness so the shots look the same every time
  const seed=()=>p.evaluate(()=>{let r=12345;Math.random=()=>{r=(r*16807)%2147483647;return r/2147483647;};});
  // in-run shots: no field drops, few floating numbers, a busy field
  const clean=()=>p.evaluate(()=>{pickups=[];save.lastGemPickup=save.lastCoinPickup=Date.now();textParticles=[];});
  const waitField=(n,ms)=>p.evaluate((n,ms)=>new Promise(r=>{const t0=Date.now(),f=()=>{pickups=[];
    if(enemies.filter(e=>e.y>GH*.14&&e.y<GH*.78).length>=n||Date.now()-t0>ms)r();else setTimeout(f,100);};f();}),n,ms);

  // ── the uncaptioned game shots, one set per language ──
  async function gameShots(lang){
    const S={...SAVE,settings:{...SAVE.settings,lang,langV2:1}};   // langV2: without it the game resets old saves to English
    await p.setViewport({width:360,height:640,deviceScaleFactor:3,isMobile:true});
    await load(S);
    await seed();await p.click('#mPlay');await clean();await p.evaluate(()=>{waveNum=24;waveTimer=.01;});
    await sleep(6000);await waitField(14,15000);await clean();await sleep(350);await shot('run');
    await p.evaluate(()=>{waveNum=29;waveTimer=.01;});
    await p.evaluate(()=>new Promise(r=>{const t0=Date.now(),f=()=>{pickups=[];const bo=enemies.find(e=>e.boss);if((bo&&bo.y>GH*.3)||Date.now()-t0>20000)r();else setTimeout(f,100);};f();}));
    // the boss at half health, caught in a NOVA blast
    await p.evaluate(()=>{const bo=enemies.find(e=>e.boss);if(bo){bo.hp=bo.maxHp*.45;}actCD={};});await sleep(700);await clean();
    // the blast must not kill the boss: put its health back right after
    await p.evaluate(()=>{const bo=enemies.find(e=>e.boss);if(bo)bo.hp=bo.maxHp*100;useActive('nova');if(bo)bo.hp=bo.maxHp*.45;textParticles=textParticles.slice(-1);});
    await p.evaluate(()=>{const t=$('toast');t.className='';$('hint').classList.remove('show');});
    await sleep(90);await p.screenshot({path:raw('boss')});
    await p.evaluate(()=>{state=ST.MENU;});await sleep(500);
    await p.evaluate(()=>{openTattoos();});await sleep(300);
    await p.evaluate(g=>showGachaResults(g.map(([id,r])=>({t:TT[id],isNew:false,leveled:false,...r}))),GACHA);await sleep(1500);await shot('gacha');
    await p.evaluate(()=>{$('gachaOverlay').classList.remove('show');renderTattoos();});await shot('tattoo');
    await p.evaluate(()=>{closeTattoos();openShop('perm');});await shot('shop');
    await p.evaluate(()=>{closeShop();openWeekly();});await shot('weekly');
    // the menu in a few other themes, to show the colour options
    for(const th of THEME_FAN){await load({...S,theme:th,themesOwned:['ice',th]});await shot('menu-'+th);}
  }

  // ── captioned store screenshot: title on top, the game shot framed underneath ──
  const img=f=>'data:image/png;base64,'+fs.readFileSync(f).toString('base64');
  async function compose(file,[title,sub],body){
    await p.setViewport({width:1080,height:1920,deviceScaleFactor:1,isMobile:false});
    await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}
      html,body{margin:0;width:1080px;height:1920px;overflow:hidden;background:radial-gradient(ellipse at 50% 30%,#0a1729,#02050b 75%);color:#9fd8ff}
      .cap{position:absolute;left:0;right:0;top:70px;text-align:center;padding:0 50px}
      .t{font-family:'VT323';font-size:124px;line-height:1;white-space:nowrap;color:#f0f9ff;letter-spacing:.03em;
        text-shadow:0 0 26px rgba(159,216,255,.85),0 0 3px #f0f9ff}
      .s{font-family:'IBM Plex Mono';font-size:36px;line-height:1.35;white-space:nowrap;color:#8ab8da;margin-top:18px}
      .f{position:absolute;left:50%;transform:translateX(-50%);top:390px;height:1440px;border:3px solid #9fd8ff;
        box-shadow:0 0 50px rgba(159,216,255,.45),0 0 0 10px #02050b,0 0 0 12px #28506e}
      .fan{position:absolute;top:400px;height:1180px;border:3px solid #9fd8ff;box-shadow:0 0 40px rgba(159,216,255,.4)}
      .fan.l{left:40px;transform:rotate(-7deg);transform-origin:bottom left;filter:brightness(.8)}
      .fan.r{right:40px;transform:rotate(7deg);transform-origin:bottom right;filter:brightness(.8)}
      .fan.c{left:50%;transform:translateX(-50%);top:430px;height:1400px;z-index:2}
      .scan{position:absolute;inset:0;z-index:5;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px);pointer-events:none}
    </style></head><body><div class="cap"><div class="t" id="t"></div><div class="s" id="s"></div></div>${body}<div class="scan"></div></body></html>`,{waitUntil:'load'});
    await p.evaluate((title,sub)=>{
      const t=document.getElementById('t');t.textContent=title;document.getElementById('s').textContent=sub;
      for(let fs=124;t.scrollWidth>980&&fs>64;fs-=4)t.style.fontSize=fs+'px';   // long lines shrink to fit
      const s=document.getElementById('s');for(let fs=36;s.scrollWidth>980&&fs>22;fs-=1)s.style.fontSize=fs+'px';
    },title,sub);
    await p.evaluate(()=>document.fonts.ready);
    await p.screenshot({path:file});console.log('wrote '+path.relative(root,file).replace(/\\/g,'/'));
  }
  // store order: the strongest gameplay first
  const ORDER=['run','boss','gacha','tattoo','shop','weekly','themes'];
  for(const lang of LANGS){
    if(!TEXT[lang]){console.log('no captions for '+lang+' in tools/store-text.js, skipped');continue;}
    await gameShots(lang);
    const dir=path.join(out,'screenshots',lang);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
    for(const [i,k] of ORDER.entries()){
      const body=k==='themes'
        ?`<img class="fan l" src="${img(raw('menu-'+THEME_FAN[0]))}"><img class="fan r" src="${img(raw('menu-'+THEME_FAN[2]))}"><img class="fan c" src="${img(raw('menu-'+THEME_FAN[1]))}">`
        :`<img class="f" src="${img(raw(k))}">`;
      await compose(path.join(dir,`${i+1}-${k}.png`),TEXT[lang][k],body);
    }
  }

  // hi-res icon (Play wants 512x512 PNG)
  fs.copyFileSync(path.join(root,'icon-512.png'),path.join(out,'icon-512.png'));console.log('wrote store/icon-512.png');

  // feature graphic 1024x500: the logo and emblem on the game background
  const font=f=>'data:font/woff2;base64,'+fs.readFileSync(path.join(root,'src','fonts',f)).toString('base64');
  await p.setViewport({width:1024,height:500,deviceScaleFactor:1,isMobile:false});
  await p.setContent(`<!doctype html><html><head><style>
    @font-face{font-family:VT323;src:url(${font('VT323-400-latin.woff2')}) format('woff2')}
    @font-face{font-family:Plex;src:url(${font('IBMPlexMono-400-latin.woff2')}) format('woff2')}
    html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:radial-gradient(ellipse at 70% 50%,#0a1729,#02050b 70%);font-family:VT323;color:#9fd8ff}
    .scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 1px,transparent 1px 3px)}
    .t{position:absolute;left:80px;top:110px;line-height:.9}
    .l1{font-size:64px;letter-spacing:.96em;margin-right:-.96em;color:#f0f9ff}
    .l2{font-size:108px;letter-spacing:.04em;text-shadow:0 0 22px rgba(159,216,255,.8),0 0 3px #f0f9ff}
    .s{font-family:Plex;font-size:22px;letter-spacing:.3em;color:#5f8fb3;margin-top:22px}
    svg{position:absolute;right:90px;top:70px;width:360px;height:360px}
  </style></head><body>
    <div class="t"><div class="l1">LAST</div><div class="l2">VERTEX</div><div class="s">IDLE TOWER DEFENSE</div></div>
    <svg viewBox="0 0 512 512"><defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
      <g transform="translate(256 262) scale(.92)">
        <g stroke="#28506e" stroke-width="5"><line x1="-238" y1="0" x2="-170" y2="0"/><line x1="170" y1="0" x2="238" y2="0"/><line x1="0" y1="-244" x2="0" y2="-176"/><line x1="0" y1="164" x2="0" y2="232"/></g>
        <circle r="196" fill="none" stroke="#9fd8ff" stroke-opacity=".5" stroke-width="6" stroke-dasharray="4 16"/>
        <g filter="url(#g)"><polygon points="0,-128 116,76 -116,76" fill="none" stroke="#9fd8ff" stroke-width="26"/><polygon points="0,-36 40,36 -40,36" fill="#9fd8ff"/></g>
      </g></svg>
    <div class="scan"></div></body></html>`,{waitUntil:'load'});
  await p.evaluate(()=>document.fonts.ready);
  await p.screenshot({path:path.join(out,'feature-graphic.png')});console.log('wrote store/feature-graphic.png');
  await b.close();
  fs.rmSync(RAW,{recursive:true,force:true});
})();
