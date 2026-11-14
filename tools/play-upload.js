// Uploads the release bundle to a Google Play test track with the upload robot (keys/play-service-account.json).
//   node tools/play-upload.js [track]      track defaults to alpha (the closed test)
//   node tools/play-upload.js production --yes-production aab=<file> code=<versionCode> name=<versionName> notes=<file>
//       production only with the flag, an explicit .aab (the REAL ADS build) and release notes (<en-US>\ntext\n</en-US> blocks),
//       and only when Ahmet asked for it in this conversation
// Raise versionCode in android/app/build.gradle and run `node tools/build-app.js release` first.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..'),pkg='com.lunemoth.lastvertex',track=process.argv[2]||'alpha';
const arg=k=>(process.argv.find(a=>a.startsWith(k+'='))||'').slice(k.length+1);
if(track==='production'&&!process.argv.includes('--yes-production'))throw new Error('production needs --yes-production (and his go in this conversation)');
if(track==='production'&&(!arg('aab')||!arg('code')||!arg('notes')))throw new Error('production needs aab=, code= and notes=');
const key=JSON.parse(fs.readFileSync(path.join(root,'keys','play-service-account.json'),'utf8'));
const aab=fs.readFileSync(arg('aab')?path.resolve(arg('aab')):path.join(root,'android/app/build/outputs/bundle/release/app-release.aab'));
const gradle=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8');
const code=arg('code')||gradle.match(/versionCode\s+(\d+)/)[1],name=arg('name')||gradle.match(/versionName\s+"([^"]+)"/)[1];
// release notes: <lang>\ntext\n</lang> blocks, each under 500 characters
const notes=arg('notes')?[...fs.readFileSync(path.resolve(arg('notes')),'utf8').matchAll(/<([a-z]{2}-[A-Z0-9]+)>\n([\s\S]*?)\n<\/\1>/g)].map(m=>({language:m[1],text:m[2]})):[];
if(notes.some(n=>n.text.length>500))throw new Error('a release note is over 500 characters');
if(arg('notes')&&!notes.length)throw new Error('no release notes found in '+arg('notes'));
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),now=Math.floor(Date.now()/1000);
const head=b({alg:'RS256',typ:'JWT'}),claim=b({iss:key.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3000});
const sig=crypto.createSign('RSA-SHA256').update(head+'.'+claim).sign(key.private_key,'base64url');
const api='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+pkg;
(async()=>{
  const t=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+claim+'.'+sig})}).then(r=>r.json());
  if(!t.access_token)throw new Error('token: '+JSON.stringify(t));
  const H={authorization:'Bearer '+t.access_token},J={...H,'content-type':'application/json'};
  const call=async(label,p,o)=>{const r=await fetch(p,o),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(label+' '+r.status+' '+JSON.stringify(j.error||j));console.log(label,'ok');return j;};
  const edit=await call('edit',api+'/edits',{method:'POST',headers:J,body:'{}'});
  try{
    const up=await call('bundle',`https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}/edits/${edit.id}/bundles?uploadType=media`,{method:'POST',headers:{...H,'content-type':'application/octet-stream'},body:aab});
    if(String(up.versionCode)!==code)throw new Error('uploaded code '+up.versionCode+' differs from build.gradle '+code);
    await call('track',`${api}/edits/${edit.id}/tracks/${track}`,{method:'PUT',headers:J,body:JSON.stringify({track,releases:[{name:code+' ('+name+')',status:'completed',versionCodes:[code],...(notes.length?{releaseNotes:notes}:{})}]})});
    await call('commit',`${api}/edits/${edit.id}:commit`,{method:'POST',headers:H});
    console.log('uploaded',code,name,'to',track);
  }catch(e){await fetch(`${api}/edits/${edit.id}`,{method:'DELETE',headers:H});throw e;}
})().catch(e=>{console.error('FAILED',e.message);process.exit(1);});
