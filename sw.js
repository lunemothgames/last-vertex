// Network-first for the game page so updates arrive; everything is cached for offline play.
const CACHE='last-vertex-93b8401f';
const ASSETS=['./','./delete-account.html','./index.html','./manifest.webmanifest','./privacy.html','./icons/apple-touch-icon.png','./icons/favicon-32.png','./icons/icon-192-maskable.png','./icons/icon-192.png','./icons/icon-512-maskable.png','./icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{
    if(r.ok&&new URL(e.request.url).origin===location.origin){const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
