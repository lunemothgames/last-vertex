// Checks the Play character limits of every language in store/listing.md: name 30, short 80, full 4000.
// Each language section (## …) holds three ``` blocks in that order.
const fs=require('fs'),path=require('path');
const md=fs.readFileSync(path.join(__dirname,'..','store','listing.md'),'utf8');
const LIMITS=[['name',30],['short',80],['full',4000]];
let bad=0;
for(const sec of md.split(/^## /m).slice(1)){
  const blocks=[...sec.matchAll(/```\n([\s\S]*?)\n```/g)].map(m=>m[1]);
  if(blocks.length<3)continue;   // not a language section
  const name=sec.split('\n')[0].trim();
  const row=LIMITS.map(([k,max],i)=>{const n=[...blocks[i]].length;if(n>max)bad++;return `${k} ${n}/${max}${n>max?' TOO LONG':''}`;});
  console.log(name.padEnd(28)+row.join('  '));
}
if(bad){console.log(bad+' field(s) over the limit');process.exit(1);}
