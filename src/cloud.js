// ── CLOUD (Supabase over plain fetch, no SDK) ───────────────────────────────
// Inlined into the game at /*@@CLOUD@@*/ by tools/build.js. Disabled while the config below is empty.
// Same code runs in the browser, the Android app (CapacitorHttp) and later iOS.
const CLOUD=(()=>{
  const CFG=/*@@CLOUD_CONFIG@@*/{url:'',key:''};
  const KEY='lvcloud';
  const enabled=!!(CFG.url&&CFG.key);
  let sess=null;
  try{sess=JSON.parse(localStorage.getItem(KEY)||'null');}catch(e){}
  const store=()=>{try{localStorage.setItem(KEY,JSON.stringify(sess));}catch(e){}};
  const hdr=(tok,extra)=>Object.assign({apikey:CFG.key,'Content-Type':'application/json',Authorization:'Bearer '+(tok||CFG.key)},extra);
  const setSess=j=>{sess={access:j.access_token,refresh:j.refresh_token,exp:Date.now()+(j.expires_in-60)*1000,uid:j.user.id,email:j.user.email||''};store();};

  async function auth(path,body,method){
    const r=await fetch(CFG.url+'/auth/v1/'+path,{method:method||'POST',headers:hdr(sess&&sess.access),body:JSON.stringify(body||{})});
    if(!r.ok){
      let j={};try{j=await r.json();}catch(e){}
      throw Object.assign(new Error('auth '+r.status),{status:r.status,code:j.error_code||j.code||''});
    }
    return r.json();
  }
  // a valid access token: reuse, refresh, or create an anonymous player (no sign-up friction)
  async function token(){
    if(!enabled)throw new Error('cloud off');
    if(sess&&sess.exp>Date.now())return sess.access;
    if(sess&&sess.refresh){
      try{setSess(await auth('token?grant_type=refresh_token',{refresh_token:sess.refresh}));return sess.access;}
      catch(e){if(!(e.status>=400&&e.status<500))throw e;sess=null;}   // network error: keep the session; 4xx: it's dead
    }
    setSess(await auth('signup',{}));return sess.access;
  }
  async function rest(method,query,body,extra){
    const t=await token();
    const r=await fetch(CFG.url+'/rest/v1/saves'+query,{method,headers:hdr(t,extra),body:body?JSON.stringify(body):undefined});
    if(!r.ok)throw new Error('rest '+r.status);
    return r.status===204?null:r.json();
  }

  // → null (nothing in the cloud yet) or {data, updatedAt}
  async function pull(){
    const rows=await rest('GET','?select=data,updated_at');
    return rows&&rows[0]?{data:rows[0].data,updatedAt:rows[0].updated_at}:null;
  }
  // known: updatedAt of the cloud copy this device last saw (null = first upload).
  // → {ok:true, updatedAt} or {ok:false, conflict:true} when another device wrote in between
  async function push(data,known){
    const body={data,last_seen:data.lastSeen||0};
    const pref={Prefer:'return=representation'};
    let rows;
    if(known){
      rows=await rest('PATCH','?updated_at=eq.'+encodeURIComponent(known),body,pref);
      if(!rows.length)return{ok:false,conflict:true};
    }else{
      const t=await token();
      const r=await fetch(CFG.url+'/rest/v1/saves',{method:'POST',headers:hdr(t,pref),body:JSON.stringify({...body,user_id:sess.uid})});
      if(r.status===409)return{ok:false,conflict:true};   // a row already exists for this player
      if(!r.ok)throw new Error('rest '+r.status);
      rows=await r.json();
    }
    return{ok:true,updatedAt:rows[0].updated_at};
  }

  // ── email accounts: a one-time code by mail, no password and no redirect page (works the same in an app) ──
  // link=true: attach the email to this device's anonymous player (keeps the cloud save)
  // link=false: sign in to an account that already exists (new device)
  // throws {code:'email_exists'} when linking an email that already has an account
  async function sendCode(email,link){
    if(link){await token();await auth('user',{email},'PUT');}
    else await auth('otp',{email,create_user:false});
  }
  async function verifyCode(email,code,link){
    setSess(await auth('verify',{type:link?'email_change':'email',email,token:code}));
  }
  // deletes the player's account and cloud save on the server, then forgets the session
  async function deleteAccount(){
    const t=await token();
    const r=await fetch(CFG.url+'/rest/v1/rpc/delete_my_account',{method:'POST',headers:hdr(t),body:'{}'});
    if(!r.ok)throw new Error('rest '+r.status);
    sess=null;try{localStorage.removeItem(KEY);}catch(e){}
  }
  function signOut(){sess=null;try{localStorage.removeItem(KEY);}catch(e){}}
  // makes sure an anonymous player exists (first sign-up needs the network)
  const ensure=()=>token().then(()=>true);

  return{enabled,pull,push,sendCode,verifyCode,signOut,ensure,deleteAccount,
    get email(){return sess?sess.email:'';},get signedIn(){return !!sess;}};
})();
