// Uploads the store listing text (store/listing.md) and the graphics to Google Play with the upload robot.
//   node tools/play-listing.js          only shows what is on Play now
//   node tools/play-listing.js push     replaces text, phone screenshots and feature graphic, only in languages that already exist on Play
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..'),pkg='com.lunemoth.lastvertex',push=process.argv[2]==='push';
// listing.md section → [Play language codes, screenshot folder]
const LANGS={'English':[['en-US'],'en'],'Türkçe':[['tr-TR'],'tr'],'Español':[['es-419','es-ES'],'es'],'Português':[['pt-BR','pt-PT'],'pt']};
const key=JSON.parse(fs.readFileSync(path.join(root,'keys','play-service-account.json'),'utf8'));
const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url'),now=Math.floor(Date.now()/1000);
const head=b({alg:'RS256',typ:'JWT'}),claim=b({iss:key.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3000});
const sig=crypto.createSign('RSA-SHA256').update(head+'.'+claim).sign(key.private_key,'base64url');
const api='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+pkg;
const md=fs.readFileSync(path.join(root,'store','listing.md'),'utf8'),texts={};
for(const sec of md.split(/^## /m).slice(1)){
  const blocks=[...sec.matchAll(/```\n([\s\S]*?)\n```/g)].map(m=>m[1]);
  if(blocks.length<3)continue;
  const lang=Object.keys(LANGS).find(l=>sec.startsWith(l));
  if(lang)texts[lang]={title:blocks[0],shortDescription:blocks[1],fullDescription:blocks[2]};
}
(async()=>{
  const t=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:head+'.'+claim+'.'+sig})}).then(r=>r.json());
  if(!t.access_token)throw new Error('token: '+JSON.stringify(t));
  const H={authorization:'Bearer '+t.access_token},J={...H,'content-type':'application/json'};
  const call=async(label,p,o)=>{const r=await fetch(p,o),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(label+' '+r.status+' '+JSON.stringify(j.error||j));return j;};
  const edit=await call('edit',api+'/edits',{method:'POST',headers:J,body:'{}'}),E=`${api}/edits/${edit.id}`;
  try{
    const now=await call('list',E+'/listings',{headers:H});
    for(const l of now.listings||[]){
      const shots=await call('images',`${E}/listings/${l.language}/phoneScreenshots`,{headers:H});
      console.log('on Play:',l.language,'|',l.title,'|',(shots.images||[]).length,'phone screenshots');
    }
    const have=new Set((now.listings||[]).map(l=>l.language));
    if(!push){await fetch(E,{method:'DELETE',headers:H});return;}
    for(const [name,[codes,dir]] of Object.entries(LANGS)){
      const files=fs.readdirSync(path.join(root,'store','screenshots',dir)).filter(f=>/\.png$/.test(f)).sort();
      for(const code of codes.filter(c=>have.has(c))){
        await call('text '+code,`${E}/listings/${code}`,{method:'PUT',headers:J,body:JSON.stringify({language:code,...texts[name]})});
        await call('clear shots '+code,`${E}/listings/${code}/phoneScreenshots`,{method:'DELETE',headers:H});
        for(const f of files)await call('shot '+f,`https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}/edits/${edit.id}/listings/${code}/phoneScreenshots?uploadType=media`,{method:'POST',headers:{...H,'content-type':'image/png'},body:fs.readFileSync(path.join(root,'store','screenshots',dir,f))});
        await call('clear graphic '+code,`${E}/listings/${code}/featureGraphic`,{method:'DELETE',headers:H});
        await call('graphic '+code,`https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${pkg}/edits/${edit.id}/listings/${code}/featureGraphic?uploadType=media`,{method:'POST',headers:{...H,'content-type':'image/png'},body:fs.readFileSync(path.join(root,'store','feature-graphic.png'))});
        console.log('done',code,files.length,'screenshots');
      }
    }
    await call('commit',E+':commit',{method:'POST',headers:H});console.log('committed');
  }catch(e){await fetch(E,{method:'DELETE',headers:H});throw e;}
})().catch(e=>{console.error('FAILED',e.message);process.exit(1);});
