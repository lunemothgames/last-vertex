// Makes a gift code that players redeem in Settings → REDEEM CODE.
// Codes are signed with keys/gift-private.pem (kept only on this computer, never committed);
// the game holds just the public key, so nobody can make their own codes from the game's source.
//
//   node tools/make-code.js --gems 100
//   node tools/make-code.js --coins 50000 --tattoo nova:3 --tattoo twin --days 7 --note "for Ali"
//
// --gems N  --coins N  --tattoo id[:copies]  (repeatable)  --days N (expires after N days, optional)
// --note text (only for you, shown nowhere in the game)
// A code works once per player save; the same code can be given to several people.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const keyFile=path.join(root,'keys','gift-private.pem');
if(!fs.existsSync(keyFile)){console.error('Missing '+keyFile+' — gift codes can only be made on the computer that has the key.');process.exit(1);}

const src=fs.readFileSync(path.join(root,'src','index.src.html'),'utf8');
const tatIds=[...src.matchAll(/\{id:'([a-z_]+)',\s+name:'[^']+',\s*icon:'[a-z0-9]+',\s*rar:/g)].map(m=>m[1]);

const a=process.argv.slice(2),r={};let note='';
for(let i=0;i<a.length;i++){
  const k=a[i],v=a[i+1];
  if(k==='--gems'){r.g=+v;i++;}
  else if(k==='--coins'){r.c=+v;i++;}
  else if(k==='--tattoo'){const [id,n]=v.split(':');if(!tatIds.includes(id)){console.error('Unknown tattoo "'+id+'". Known: '+tatIds.join(', '));process.exit(1);}(r.t=r.t||{})[id]=(+n||1);i++;}
  else if(k==='--days'){r.x=Math.floor(Date.now()/864e5)+(+v);i++;}
  else if(k==='--note'){note=v;i++;}
  else{console.error('Unknown option '+k);process.exit(1);}
}
if(!r.g&&!r.c&&!r.t){console.error('Give at least one of --gems, --coins, --tattoo');process.exit(1);}
r.i=crypto.randomBytes(4).toString('hex');          // id: each code can be redeemed once per save

const b64u=buf=>Buffer.from(buf).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const payload=b64u(JSON.stringify(r));
const sig=crypto.sign('sha256',Buffer.from(payload),{key:fs.readFileSync(keyFile),dsaEncoding:'ieee-p1363'});
const code=`LVG-${payload}.${b64u(sig)}`;

console.log('\n'+code+'\n');
console.log('Contains:',[r.g&&r.g+' gems',r.c&&r.c+' coins',...Object.entries(r.t||{}).map(([t,n])=>`${n}x ${t}`)].filter(Boolean).join(', '),
  r.x?`· expires ${new Date(r.x*864e5).toISOString().slice(0,10)}`:'· never expires');
fs.appendFileSync(path.join(root,'keys','codes-log.txt'),`${new Date().toISOString()}  ${note||'-'}  ${JSON.stringify(r)}\n${code}\n`);
console.log('Logged in keys/codes-log.txt');
