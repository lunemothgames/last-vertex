// Renders the home-screen icons and the iPhone launch images from HTML/SVG with a headless browser.
// Usage:  npm i  (once, installs puppeteer-core)  →  npm run icons
// Browser: Edge on Windows by default; set CHROME_PATH to use another Chromium-based browser.
const fs=require('fs'),path=require('path');
const puppeteer=require('puppeteer-core');
const root=path.join(__dirname,'..');
const BROWSER=process.env.CHROME_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const C={a:'#9fd8ff',a2:'#f0f9ff',dim:'#28506e',mute:'#5f8fb3',bg1:'#02050b',bg2:'#0a1729'};
// fonts are inlined: a page made with setContent() can't load file:// URLs
const font=f=>'data:font/woff2;base64,'+fs.readFileSync(path.join(root,'src','fonts',f)).toString('base64');

// the triangle emblem from the menu: dotted ring, crosshair ticks, glowing outline, solid core
function emblem(scale){
  return `<g transform="translate(256 262) scale(${scale})">
    <g stroke="${C.dim}" stroke-width="5"><line x1="-238" y1="0" x2="-170" y2="0"/><line x1="170" y1="0" x2="238" y2="0"/>
      <line x1="0" y1="-244" x2="0" y2="-176"/><line x1="0" y1="164" x2="0" y2="232"/></g>
    <circle r="196" fill="none" stroke="${C.a}" stroke-opacity=".5" stroke-width="6" stroke-dasharray="4 16"/>
    <g filter="url(#glow)">
      <polygon points="0,-128 116,76 -116,76" fill="none" stroke="${C.a}" stroke-width="26" stroke-linejoin="miter"/>
      <polygon points="0,-36 40,36 -40,36" fill="${C.a}"/>
    </g></g>`;
}
function iconSvg(maskable){
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <radialGradient id="bg" cx="50%" cy="48%" r="70%"><stop offset="0" stop-color="${C.bg2}"/><stop offset="1" stop-color="${C.bg1}"/></radialGradient>
    <pattern id="scan" width="512" height="6" patternUnits="userSpaceOnUse"><rect width="512" height="2" fill="#000" fill-opacity=".35"/></pattern>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <rect width="512" height="512" fill="url(#scan)"/>
  ${emblem(maskable?.66:.92)}
</svg>`;
}
// launch image = the first frame of the in-game boot screen (same layout, so the hand-over is seamless)
function splashHtml(){
  return `<!doctype html><html><head><style>
  @font-face{font-family:VT323;src:url(${font('VT323-400-latin.woff2')}) format('woff2')}
  @font-face{font-family:Plex;src:url(${font('IBMPlexMono-400-latin.woff2')}) format('woff2')}
  html,body{margin:0;height:100%;background:radial-gradient(ellipse at 50% 45%,${C.bg2},${C.bg1} 75%);overflow:hidden}
  body{display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:VT323;color:${C.a}}
  .l1{font-size:12vw;letter-spacing:.91em;margin-right:-.91em;color:${C.a2};line-height:.9}
  .l2{font-size:20vw;letter-spacing:.04em;margin-right:-.04em;line-height:.9;text-shadow:0 0 4vw rgba(159,216,255,.8),0 0 .6vw ${C.a2}}
  .rule{font-size:5vw;color:${C.dim};margin-top:1vw}
  svg{width:40vw;height:40vw;margin-top:6vw}
  .boot{position:absolute;bottom:9vh;font-family:Plex;font-size:3.2vw;letter-spacing:.2em;color:${C.mute}}
  </style></head><body>
  <div class="l1">LAST</div><div class="l2">VERTEX</div><div class="rule">════════════════</div>
  <svg viewBox="0 0 512 512"><defs><filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>${emblem(.92)}</svg>
  <div class="boot">&gt; BOOTING_</div></body></html>`;
}
// iPhone portrait screens: [css width, css height, pixel ratio]
const IPHONES=[[440,956,3],[402,874,3],[430,932,3],[393,852,3],[428,926,3],[390,844,3],[375,812,3],[414,896,3],[414,896,2],[414,736,3],[375,667,2]];

(async()=>{
  const b=await puppeteer.launch({executablePath:BROWSER,headless:true});
  const p=await b.newPage();
  const shot=async(html,w,h,dpr,file)=>{
    await p.setViewport({width:w,height:h,deviceScaleFactor:dpr});
    await p.setContent(`<html><body style="margin:0;background:${C.bg1}">${html}</body></html>`,{waitUntil:'load'});
    await p.evaluate(()=>document.fonts.ready);
    await p.screenshot({path:path.join(root,file),omitBackground:false});
    console.log('wrote',file);
  };
  const icon=m=>`<div style="width:100vw;height:100vh">${iconSvg(m)}</div>`;
  await shot(icon(false),512,512,1,'icon-512.png');
  await shot(icon(false),192,192,1,'icon-192.png');
  await shot(icon(true),512,512,1,'icon-512-maskable.png');
  await shot(icon(true),192,192,1,'icon-192-maskable.png');
  await shot(icon(false),180,180,1,'apple-touch-icon.png');
  await shot(icon(false),32,32,1,'favicon-32.png');
  fs.mkdirSync(path.join(root,'splash'),{recursive:true});
  const links=[];
  for(const [w,h,d] of IPHONES){
    const f=`splash/launch-${w*d}x${h*d}.jpg`;
    await p.setViewport({width:w,height:h,deviceScaleFactor:d});
    await p.setContent(splashHtml(),{waitUntil:'load'});await p.evaluate(()=>document.fonts.ready);
    await p.screenshot({path:path.join(root,f),type:'jpeg',quality:88});console.log('wrote',f);
    links.push(`<link rel="apple-touch-startup-image" href="${f}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait)">`);
  }
  fs.writeFileSync(path.join(root,'splash','links.html'),links.join('\n')+'\n');
  console.log('launch image <link> tags → splash/links.html (already pasted into src/index.src.html)');
  await b.close();
})();
