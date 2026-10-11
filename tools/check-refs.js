// Verifies that every $('id') used in the script exists in the HTML, and every icon used has a <symbol>.
const h=require('fs').readFileSync(process.argv[2],'utf8');
const si=h.indexOf('<script>');
const js=h.slice(si),html=h.slice(0,si);
const ids=new Set([...js.matchAll(/\$\('([A-Za-z0-9_-]+)'\)/g)].map(m=>m[1]));
const miss=[...ids].filter(i=>!html.includes(`id="${i}"`));
console.log('ids checked:',ids.size,'missing:',miss.join(',')||'none');
const uses=new Set([
  ...[...h.matchAll(/href="#i-([a-z0-9]+)"/g)].map(m=>m[1]),
  ...[...js.matchAll(/I\('([a-z0-9]+)'\)/g)].map(m=>m[1]),
  ...[...js.matchAll(/icon:'([a-z0-9]+)'/g)].map(m=>m[1]),
]);
const sy=new Set([...h.matchAll(/<symbol id="i-([a-z0-9]+)"/g)].map(m=>m[1]));
console.log('icons checked:',uses.size,'missing:',[...uses].filter(u=>!sy.has(u)).join(',')||'none');
const broken=[...h.matchAll(/<\/symbol>\s*viewBox=/g)].length;
console.log('broken symbols:',broken);
