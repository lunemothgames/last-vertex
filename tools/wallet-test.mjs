// Tests supabase/migrations/0003_wallet.sql on a local in-memory Postgres (no live project touched): npm run wallet-test
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const MIG = new URL('../supabase/migrations/', import.meta.url);
const db = new PGlite();
// minimal Supabase stand-in: roles, auth.users, auth.uid() from a session setting
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth; grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated, service_role;
`);
for (const f of ['0001_saves.sql', '0002_delete_account.sql', '0003_wallet.sql']) await db.exec(fs.readFileSync(new URL(f, MIG), 'utf8'));
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`);

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'OK   ' : 'FAIL ') + m); };
const as = async (role, uid, sql) => {
  await db.exec(`reset role; select set_config('test.uid', '${uid || ''}', false); set role ${role};`);
  try { return { rows: (await db.query(sql)).rows }; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role'); }
};
const bal = async u => (await db.query(`select paid_gems from public.wallet where user_id='${u}'`)).rows[0]?.paid_gems;

// grants
ok((await as('service_role', '', `select public.grant_purchase('tx1','${A}','gems_550') g`)).rows[0].g === true, 'grant 550 to A');
ok((await as('service_role', '', `select public.grant_purchase('tx1','${A}','gems_550') g`)).rows[0].g === false, 'same tx again: no second grant');
ok(Number(await bal(A)) === 550, 'A has 550');
ok(/unknown product/.test((await as('service_role', '', `select public.grant_purchase('tx2','${A}','gems_999')`)).err || ''), 'unknown product refused');
ok((await as('authenticated', A, `select public.grant_purchase('tx3','${A}','gems_1200')`)).err, 'player cannot grant himself');
ok((await as('anon', '', `select public.grant_purchase('tx3','${A}','gems_1200')`)).err, 'anon cannot grant');
ok((await as('authenticated', A, `update public.wallet set paid_gems=999999`)).err, 'player cannot write wallet');
ok((await as('authenticated', A, `insert into public.purchases values ('x','${A}','gems_100',100)`)).err, 'player cannot write purchases');

// reading
ok((await as('authenticated', A, `select paid_gems from public.wallet`)).rows.length === 1, 'A reads own wallet');
ok((await as('authenticated', B, `select * from public.wallet`)).rows.length === 0, 'B cannot see A wallet');
ok((await as('authenticated', B, `select * from public.purchases`)).rows.length === 0, 'B cannot see A purchases');

// spending
ok(Number((await as('authenticated', A, `select public.spend_paid(50) s`)).rows[0].s) === 500, 'A spends 50 -> 500');
ok(/not enough/.test((await as('authenticated', A, `select public.spend_paid(501)`)).err || ''), 'cannot spend more than balance');
ok(/bad amount/.test((await as('authenticated', A, `select public.spend_paid(-100)`)).err || ''), 'negative spend refused');
ok(/not enough/.test((await as('authenticated', B, `select public.spend_paid(1)`)).err || ''), 'B with no wallet cannot spend');
ok(/not signed in/.test((await as('anon', '', `select public.spend_paid(1)`)).err || '') || (await as('anon', '', `select public.spend_paid(1)`)).err, 'anon cannot spend');

// refund after spending -> negative, blocked
ok((await as('service_role', '', `select public.refund_purchase('tx1') r`)).rows[0].r === true, 'refund tx1');
ok((await as('service_role', '', `select public.refund_purchase('tx1') r`)).rows[0].r === false, 'refund again: nothing');
ok(Number(await bal(A)) === -50, 'A balance -50 after refund');
ok(/not enough/.test((await as('authenticated', A, `select public.spend_paid(1)`)).err || ''), 'negative balance blocks spending');
ok((await as('authenticated', A, `select public.refund_purchase('tx1')`)).err, 'player cannot call refund');

// entitlements
await as('service_role', '', `select public.grant_purchase('tx4','${B}','ad_pass')`);
await as('service_role', '', `select public.grant_purchase('tx5','${B}','starter_pack')`);
let e = (await db.query(`select * from public.entitlements where user_id='${B}'`)).rows[0];
ok(e.ad_pass && e.starter_bought && Number(await bal(B)) === 300, 'B: ad pass + starter (300 gems)');
await as('service_role', '', `select public.refund_purchase('tx4')`);
e = (await db.query(`select * from public.entitlements where user_id='${B}'`)).rows[0];
ok(!e.ad_pass && e.starter_bought, 'ad pass refund removes ad pass, starter stays');

// account deletion
await as('authenticated', B, `select public.delete_my_account()`);
const left = (await db.query(`select (select count(*) from public.wallet where user_id='${B}') w, (select count(*) from public.purchases where user_id='${B}') p, (select count(*) from public.entitlements where user_id='${B}') e`)).rows[0];
ok(Number(left.w) + Number(left.p) + Number(left.e) === 0, 'delete_my_account removes wallet, purchases, entitlements');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
