// Renders the Google Play store art into store/: phone screenshots (1080x1920), feature graphic (1024x500), hi-res icon (512).
// Usage:  npm i (once)  →  node tools/make-store-art.js      Browser: Edge by default, or set CHROME_PATH.
const fs=require('fs'),path=require('path');
const puppeteer=require('puppeteer-core');
const root=path.join(__dirname,'..'),out=path.join(root,'store');
const BROWSER=process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAME='file:///'+path.join(root,'index.html').replace(/\\/g,'/');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(path.join(out,'screenshots'),{recursive:true});
const HINTS={menu:1,start:1,breach:1,drops:1,hud:1,shop:1,tattoo:1,quests:1,tier:1,target:1,active:1};
// a mid-game player: a few tiers in, some tattoos, an active build
const SAVE={coins:4.2e7,gems:340,tier:6,tierBest:{1:78,2:62,3:51,4:44,5:36,6:21},tatSlots:4,themesOwned:['ice'],
  perm:{damage:520,fireRate:70,maxHp:480,regen:380,defense:180,thorns:90,critChance:90,critMult:60,multishot:70,bounce:40,range:35,
    pierce:20,coinMult:150,lootChance:60,bounty:40,gameSpeed:8,offline:10},
  tatCol:{attack_power:{lv:5,copies:2},twin:{lv:3,copies:1},nova:{lv:4,copies:0},arc:{lv:2,copies:3},crit_mult:{lv:4,copies:1},
    max_hp:{lv:5,copies:0},regen:{lv:3,copies:2},coin_mult:{lv:4,copies:1},frost:{lv:2,copies:0},aegis:{lv:1,copies:0},thorns:{lv:3,copies:0}},
  equipped:['attack_power','twin','nova','arc'],settings:{fx:'high',target:0,lang:'en'},coach:Object.fromEntries(['play','shop','buy','again','help','tattoo','summon','equip','quests','tier','weekly'].map(k=>[k,1])),hints:HINTS,qNextDaily:Date.now()+3e6,qNextWeekly:Date.now()+8e7};

(async()=>{
  const b=await puppeteer.launch({executablePath:BROWSER,headless:true});
  const p=await b.newPage();
  await p.setViewport({width:360,height:640,deviceScaleFactor:3,isMobile:true});
  const shot=async n=>{await sleep(400);await p.evaluate(()=>{const t=$('toast');t.className='';clearTimeout(_toastTO);$('hint').classList.remove('show');});await p.screenshot({path:path.join(out,'screenshots',n+'.png')});console.log('wrote store/screenshots/'+n+'.png');};
  const load=async s=>{await p.goto(GAME);await sleep(200);await p.evaluate(s=>{saveLocked=true;localStorage.setItem('tt3',JSON.stringify(s));},s);await p.reload();await sleep(2600);
    await p.evaluate(()=>{toast=()=>{};});};   // no achievement / quest toasts in the shots
  // seeded randomness so the shots look the same every time
  const seed=()=>p.evaluate(()=>{let r=12345;Math.random=()=>{r=(r*16807)%2147483647;return r/2147483647;};});

  await load(SAVE);await shot('1-menu');
  // in-run shots: no field drops, no floating numbers, a busy field
  const clean=()=>p.evaluate(()=>{pickups=[];save.lastGemPickup=save.lastCoinPickup=Date.now();textParticles=[];});
  const waitField=(n,ms)=>p.evaluate((n,ms)=>new Promise(r=>{const t0=Date.now(),f=()=>{pickups=[];
    if(enemies.filter(e=>e.y>GH*.14&&e.y<GH*.78).length>=n||Date.now()-t0>ms)r();else setTimeout(f,100);};f();}),n,ms);
  await seed();await p.click('#mPlay');await clean();await p.evaluate(()=>{waveNum=21;waveTimer=.01;});
  await sleep(6000);await waitField(12,15000);await clean();await sleep(120);await shot('2-run');
  await p.evaluate(()=>{waveNum=29;waveTimer=.01;});
  await p.evaluate(()=>new Promise(r=>{const t0=Date.now(),f=()=>{pickups=[];const bo=enemies.find(e=>e.boss);if((bo&&bo.y>GH*.3)||Date.now()-t0>20000)r();else setTimeout(f,100);};f();}));
  await p.evaluate(()=>{const bo=enemies.find(e=>e.boss);if(bo){bo.hp=bo.maxHp*.45;}});await sleep(900);await clean();await sleep(120);await shot('3-boss');
  await p.evaluate(()=>{state=ST.MENU;});await sleep(500);
  await p.evaluate(()=>{openTattoos();});await sleep(400);await p.evaluate(()=>{tatInfo(TT.twin);});await shot('4-tattoos');
  await p.evaluate(()=>{$('tipWrap').classList.remove('show');closeTattoos();openShop('perm');});await shot('5-shop');
  await p.evaluate(()=>{closeShop();openWeekly();});await shot('6-weekly');
  // same menu in another theme, to show the colour options
  await load({...SAVE,theme:'amber',themesOwned:['ice','amber']});await shot('7-theme-amber');

  // hi-res icon (Play wants 512x512 PNG)
  fs.copyFileSync(path.join(root,'icon-512.png'),path.join(out,'icon-512.png'));console.log('wrote store/icon-512.png');

  // feature graphic 1024x500: the logo and emblem on the game background
  const font=f=>'data:font/woff2;base64,'+fs.readFileSync(path.join(root,'src','fonts',f)).toString('base64');
  await p.setViewport({width:1024,height:500,deviceScaleFactor:1});
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
    <div class="t"><div class="l1">LAST</div><div class="l2">VERTEX</div><div class="s">IDLE DEFENSE</div></div>
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
})();
