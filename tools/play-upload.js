// Uploads the release bundle to a Google Play test track with the upload robot (keys/play-service-account.json).
//   node tools/play-upload.js [track]      track defaults to alpha (the closed test); production is refused here on purpose
// Raise versionCode in android/app/build.gradle and run `node tools/build-app.js release` first.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..'),pkg='com.lunemoth.lastvertex',track=process.argv[2]||'alpha';
if(track==='production')throw new Error('production uploads are done by hand in Play Console');
const key=JSON.parse(fs.readFileSync(path.join(root,'keys','play-service-account.json'),'utf8'));
const aab=fs.readFileSync(path.join(root,'android/app/build/outputs/bundle/release/app-release.aab'));
const gradle=fs.readFileSync(path.join(root,'android/app/build.gradle'),'utf8');
const code=gradle.match(/versionCode\s+(\d+)/)[1],name=gradle.match(/versionName\s+"([^"]+)"/)[1];
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
    await call('track',`${api}/edits/${edit.id}/tracks/${track}`,{method:'PUT',headers:J,body:JSON.stringify({track,releases:[{name:code+' ('+name+')',status:'completed',versionCodes:[code]}]})});
    await call('commit',`${api}/edits/${edit.id}:commit`,{method:'POST',headers:H});
    console.log('uploaded',code,name,'to',track);
  }catch(e){await fetch(`${api}/edits/${edit.id}`,{method:'DELETE',headers:H});throw e;}
})().catch(e=>{console.error('FAILED',e.message);process.exit(1);});
