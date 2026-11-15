// Builds the Android app: game build → www/ (the files packed inside the app) → Capacitor android project.
//   node tools/build-app.js            sync only (open android/ in Android Studio to run)
//   node tools/build-app.js debug      also builds android/app/build/outputs/apk/debug/app-debug.apk
//   node tools/build-app.js release    also builds the signed .aab for Google Play (needs keys/upload.jks + keys/upload.properties)
//   node tools/build-app.js release live   same, but with REAL ads (every other build shows Google's test ads; use live for Production only)
const fs=require('fs'),path=require('path'),{execSync}=require('child_process');
const root=path.join(__dirname,'..'),www=path.join(root,'www'),run=(c,cwd=root)=>execSync(c,{cwd,stdio:'inherit'});
// node tools/build-app.js pair   the two files of a new version at once, into ../LastVertex-app:
//   LIVE (real ads) gets the versionCode in build.gradle, the test build (alpha) gets one MORE. Play gives a tester the
//   highest code of any track, so testers stay on the test-ads build even after the LIVE file goes to production
//   (found 2026-11-15: production vc 18 > alpha vc 17 put real ads on his phone). Raise versionCode by 2 per version.
if(process.argv[2]==='pair'){
  const g=path.join(root,'android/app/build.gradle'),out=path.join(root,'..','LastVertex-app');
  const gs=fs.readFileSync(g,'utf8'),code=+gs.match(/versionCode\s+(\d+)/)[1],name=gs.match(/versionName\s+"([^"]+)"/)[1];
  const setCode=c=>fs.writeFileSync(g,fs.readFileSync(g,'utf8').replace(/versionCode\s+\d+/,'versionCode '+c));
  const aab=path.join(root,'android/app/build/outputs/bundle/release/app-release.aab');
  run('node tools/build-app.js release live');fs.copyFileSync(aab,path.join(out,`LastVertex-${name}-LIVE.aab`));
  setCode(code+1);
  run('node tools/build-app.js release');fs.copyFileSync(aab,path.join(out,`LastVertex-${name}-erken-erisim.aab`));
  run('node tools/build-app.js debug');fs.copyFileSync(path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk'),path.join(out,'LastVertex-test.apk'));
  console.log(`pair done: LIVE ${name} code ${code}, test ${name} code ${code+1} (build.gradle now ${code+1}, android/ on test ads)`);
  process.exit(0);
}
run('node tools/build.js');
fs.rmSync(www,{recursive:true,force:true});fs.mkdirSync(www);
// no service worker in the app: every file is already on the phone
for(const f of ['index.html','manifest.webmanifest','privacy.html'])
  fs.copyFileSync(path.join(root,f),path.join(www,f));
fs.mkdirSync(path.join(www,'icons'));
for(const f of fs.readdirSync(path.join(root,'icons')).filter(f=>/.png$/.test(f)))
  fs.copyFileSync(path.join(root,'icons',f),path.join(www,'icons',f));
// real ads only on request: the flag is flipped in the app's copy, never in the web build
if(process.argv[3]==='live'){
  const f=path.join(www,'index.html'),s=fs.readFileSync(f,'utf8');
  if(!s.includes('const ADS_TEST=true;'))throw new Error('ADS_TEST flag not found');
  fs.writeFileSync(f,s.replace('const ADS_TEST=true;','const ADS_TEST=false;'));
  console.log('REAL ADS ON in this app build');
}
run('npx cap sync android');
const mode=process.argv[2];
if(mode){
  // Gradle 8.x needs JDK 17–24 (Android Studio's own JDK 25 is too new): use a JDK 21 from ~/.jdks
  const jdks=path.join(require('os').homedir(),'.jdks');
  const jdk=fs.existsSync(jdks)&&fs.readdirSync(jdks).filter(d=>/^(jdk|jbr)-21/.test(d)).sort().pop();
  if(jdk)process.env.JAVA_HOME=path.join(jdks,jdk);
  // where the Android SDK is (android/local.properties is machine-specific and not committed)
  const sdk=process.env.ANDROID_HOME||path.join(process.env.LOCALAPPDATA||'','Android','Sdk');
  const lp=path.join(root,'android','local.properties');
  if(!fs.existsSync(lp))fs.writeFileSync(lp,'sdk.dir='+sdk.replace(/\\/g,'/')+'\n');
  const gw='"'+path.join(root,'android','gradlew.bat')+'"';
  run(gw+(mode==='release'?' bundleRelease':' assembleDebug'),path.join(root,'android'));
}
