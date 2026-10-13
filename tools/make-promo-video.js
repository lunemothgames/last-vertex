// Renders a 30 s portrait promo video (1080x1920, 30 fps, no sound) into store/video/promo-<lang>.mp4.
// Usage:  npm i (once)  →  npm run build  →  node tools/make-promo-video.js [en|tr|es|pt|all]   (default: en)
// For the Play listing upload it to YouTube (public or unlisted, ads off) and paste the link; it also works as a Short / TikTok.
// The game runs on a virtual clock: every video frame advances it exactly 1/30 s, however long the screenshot takes,
// so the result is smooth even though rendering is far slower than real time.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const puppeteer=require('puppeteer-core');
const FFMPEG=require('ffmpeg-static');
const TEXT=require('./store-text');
const root=path.join(__dirname,'..'),outDir=path.join(root,'store','video');
const BROWSER=process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const GAME='file:///'+path.join(root,'index.html').replace(/\\/g,'/');
const FPS=30;
const arg=process.argv[2]||'en',LANGS=arg==='all'?Object.keys(TEXT):[arg];
const HINTS={menu:1,start:1,breach:1,drops:1,hud:1,shop:1,tattoo:1,quests:1,tier:1,target:1,active:1};
// same mid-game player as the screenshots, with OVERDRIVE equipped too (two actives to fire)
const SAVE={coins:4.2e7,gems:340,tier:6,tierBest:{1:78,2:62,3:51,4:44,5:36,6:21},tatSlots:4,themesOwned:['ice'],
  perm:{damage:520,fireRate:70,maxHp:480,regen:380,defense:180,thorns:90,critChance:90,critMult:60,multishot:70,bounce:40,range:35,
    pierce:20,coinMult:150,lootChance:60,bounty:40,gameSpeed:8,offline:10},
  tatCol:{attack_power:{lv:5,copies:2},twin:{lv:3,copies:1},nova:{lv:4,copies:0},arc:{lv:2,copies:3},crit_mult:{lv:4,copies:1},overdrive:{lv:3,copies:0},
    max_hp:{lv:5,copies:0},regen:{lv:3,copies:2},coin_mult:{lv:4,copies:1},frost:{lv:2,copies:0},aegis:{lv:1,copies:0},thorns:{lv:3,copies:0}},
  equipped:['twin','nova','overdrive','arc'],
  // fxAsked: frames come at a steady 30 fps, which would otherwise pop the "SLOW DEVICE?" question mid-video
  fxAsked:1,settings:{fx:'high',target:0},coach:Object.fromEntries(['play','shop','buy','again','help','tattoo','summon','equip','quests','tier','weekly'].map(k=>[k,1])),hints:HINTS,qNextDaily:Date.now()+3e6,qNextWeekly:Date.now()+8e7};
const GACHA=[['ricochet',{isNew:1,lv:1}],['attack_speed',{lv:3}],['nova',{leveled:1,lv:5}],['luck',{lv:2}],['crit_mult',{lv:4}],
  ['max_hp',{leveled:1,lv:6}],['frost',{lv:2}],['twin',{leveled:1,lv:4}],['regen',{lv:3}],['shatter',{isNew:1,lv:1}]];

// injected before the game's own scripts: a clock that only moves when we say so
const VIRTUAL_CLOCK=`(()=>{
  const t0=Date.now();let vt=t0;const raf=[];
  Date.now=()=>vt;performance.now=()=>vt-t0;
  window.requestAnimationFrame=cb=>{raf.push(cb);return raf.length;};window.cancelAnimationFrame=()=>{};
  window.__step=(n=1)=>{for(let i=0;i<n;i++){vt+=1000/${FPS};raf.splice(0).forEach(cb=>{try{cb(vt-t0);}catch(e){console.error(e);}});}};
})();`;

async function render(b,lang){
  const p=await b.newPage();
  await p.setViewport({width:360,height:640,deviceScaleFactor:3,isMobile:true});
  await p.evaluateOnNewDocument(VIRTUAL_CLOCK);
  const cdp=await p.createCDPSession();await cdp.send('Animation.enable');
  const S={...SAVE,settings:{...SAVE.settings,lang,langV2:1}};
  await p.goto(GAME);await p.evaluate(s=>{saveLocked=true;localStorage.setItem('tt3',JSON.stringify(s));},S);
  await p.reload();await p.evaluate(()=>{__step(60);toast=()=>{};});
  await new Promise(r=>setTimeout(r,1500));   // the boot screen is on real timers
  await p.evaluate(()=>{let r=12345;Math.random=()=>{r=(r*16807)%2147483647;return r/2147483647;};});
  // caption band drawn over the game
  await p.evaluate(()=>{
    const d=document.createElement('div');d.id='pcap';
    d.style.cssText="position:fixed;left:0;right:0;z-index:100;display:none;text-align:center;white-space:nowrap;padding:9px 8px 6px;"+
      "font-family:'VT323',monospace;font-size:40px;line-height:1;letter-spacing:.06em;color:#f0f9ff;background:rgba(2,5,11,.78);"+
      "text-shadow:0 0 12px rgba(159,216,255,.9);border-top:1px solid #4a7aa0;border-bottom:1px solid #4a7aa0;pointer-events:none";
    document.body.appendChild(d);
  });
  const cap=(text,top='44%')=>p.evaluate((text,top)=>{const d=document.getElementById('pcap');
    if(!text){d.style.display='none';return;}
    d.textContent=text;d.style.top=top;d.style.display='block';d.style.fontSize='40px';
    for(let fs=40;d.scrollWidth>356&&fs>20;fs-=2)d.style.fontSize=fs+'px';},text,top);

  const file=path.join(outDir,`promo-${lang}.mp4`);
  const ff=spawn(FFMPEG,['-y','-loglevel','error','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-',
    '-c:v','libx264','-pix_fmt','yuv420p','-preset','medium','-crf','18','-movflags','+faststart',file],{stdio:['pipe','inherit','inherit']});
  const done=new Promise((res,rej)=>ff.on('close',c=>c?rej(new Error('ffmpeg exit '+c)):res()));
  let n=0,tSpan=Date.now();
  // one video frame: advance the game 1/30 s (keeping the triangle alive), grab the screen
  async function frame(each){
    await p.evaluate(()=>{__step(1);if(state===ST.PLAY){const m=stats().maxHp;if(hp<m*.6)hp=m*.6;}});
    if(each)await p.evaluate(each);
    const buf=await p.screenshot({type:'jpeg',quality:90,optimizeForSpeed:true});
    if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
    // CSS animations (panels, summon cards) run on real time: slow them to match the virtual clock
    if(++n%15===0){const ms=(Date.now()-tSpan)/15;tSpan=Date.now();await cdp.send('Animation.setPlaybackRate',{playbackRate:Math.min(1,(1000/FPS)/ms)});}
  }
  const frames=async(k,at={})=>{for(let i=0;i<k;i++)await frame(at[i]);};
  // fast-forward the game (not recorded) until `cond` holds or `max` frames have passed
  const until=(cond,max)=>p.evaluate((cond,max)=>{const f=new Function('return ('+cond+')');for(let i=0;i<max&&!f();i++)__step(1);},cond,max);
  const T=TEXT[lang];

  // 1 · a busy field, OVERDRIVE then NOVA                                           (6 s)
  await p.evaluate(()=>{startRun(false);waveNum=24;waveTimer=.01;});
  await until('enemies.filter(e=>e.y>GH*.14&&e.y<GH*.78).length>=14',1200);
  await p.evaluate(()=>{textParticles=[];pickups=[];});
  await cap(T.run[0]);
  await frames(180,{80:()=>{document.getElementById('pcap').style.display='none';},
    70:()=>useActive('overdrive'),130:()=>useActive('nova')});
  // 2 · the wave-30 boss walks in and eats a NOVA                                    (6 s)
  await p.evaluate(()=>{waveNum=29;waveTimer=.01;});
  await until('enemies.some(e=>e.boss&&e.y>GH*.22)',1500);
  await p.evaluate(()=>{const bo=enemies.find(e=>e.boss);if(bo)bo.hp=bo.maxHp*.8;actCD={};textParticles=[];});
  await cap(T.boss[0]);
  const keepBoss=()=>{const bo=enemies.find(e=>e.boss);if(bo&&bo.hp<bo.maxHp*.3)bo.hp=bo.maxHp*.3;};
  const at2={};for(let i=0;i<180;i++)at2[i]=keepBoss;
  at2[80]=()=>{document.getElementById('pcap').style.display='none';};
  at2[95]=()=>{const bo=enemies.find(e=>e.boss),h=bo&&bo.hp;if(bo)bo.hp=bo.maxHp*100;useActive('nova');if(bo)bo.hp=h*.75;};
  await frames(180,at2);
  // 3 · a 10x summon                                                                 (5.5 s)
  await p.evaluate(()=>{state=ST.MENU;openTattoos();});
  await cap(T.gacha[0],'62%');
  await frames(30);await cap(null);
  await p.evaluate(g=>showGachaResults(g.map(([id,r])=>({t:TT[id],isNew:false,leveled:false,...r}))),GACHA);
  await frames(135);
  // 4 · the shop, scrolling                                                          (4 s)
  await p.evaluate(()=>{$('gachaOverlay').classList.remove('show');closeTattoos();openShop('perm');});
  await cap(T.shop[0],'62%');
  // (these run in the page, so no closures over Node variables)
  const scroll=()=>{const s=document.querySelector('#shopPanel .scroll');if(s)s.scrollTop+=5;};
  const at4={70:()=>{document.getElementById('pcap').style.display='none';}};
  for(let i=40;i<120;i++)if(!at4[i])at4[i]=scroll;
  await frames(120,at4);
  // 5 · theme parade on the menu                                                     (4.5 s)
  await p.evaluate(()=>{closeShop();renderMenu();});
  await cap(T.themes[0]);
  const at5={};let k=0;for(let i=0;i<135;i+=11)at5[i]=new Function(`applyTheme(THEMES[${k++}%THEMES.length].id)`);
  at5[90]=()=>{document.getElementById('pcap').style.display='none';};
  await frames(135,at5);
  // 6 · end card                                                                     (4 s)
  await p.evaluate(()=>applyTheme('ice'));
  await cap(T.end,'31%');   // just under the logo
  await frames(120);

  ff.stdin.end();await done;await p.close();
  console.log(`wrote ${path.relative(root,file).replace(/\\/g,'/')} (${n} frames, ${(n/FPS).toFixed(1)} s)`);
}

(async()=>{
  fs.mkdirSync(outDir,{recursive:true});
  const b=await puppeteer.launch({executablePath:BROWSER,headless:true});
  for(const lang of LANGS){if(TEXT[lang])await render(b,lang);else console.log('no captions for '+lang+' in tools/store-text.js, skipped');}
  await b.close();
})();
