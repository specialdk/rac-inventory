// ============================================================
// RAC Inventory — smoke test for the Production ↔ Sandpit backend
//
// Run from the repo root AFTER:
//   1) migration 006 has been applied to the database, and
//   2) the server is running (locally or on Railway).
//
//   node test-production-costings.js                 (defaults to http://localhost:3000)
//   node test-production-costings.js https://your-app.up.railway.app
//
// SAFE: this only exercises the shared engine and the new
// production_costings table (a costing is a saved calculation —
// it does NOT move stock or post a production run). It never
// calls POST /api/production-runs, so no live stock is touched.
// ============================================================

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let pass = 0, fail = 0;
const ok  = (name, extra = '') => { pass++; console.log(`  ✅ ${name}${extra ? '  — ' + extra : ''}`); };
const bad = (name, extra = '') => { fail++; console.log(`  ❌ ${name}${extra ? '  — ' + extra : ''}`); };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

async function main() {
  console.log(`\nRAC production-costing backend test → ${BASE}\n`);

  // ---- TEST 1: shared engine (no server needed) ----------------------------
  console.log('1) Shared costing engine (local)');
  try {
    const E = require('./public/js/production-costing-engine');
    const r = E.compute({
      rates: { wip: 45, labour: 116, fuel: 2.10 }, manHours: 27,
      materials: [
        { name: '100 minus', tonnes: 292, costPerT: 26.80 },
        { name: 'Fine Sand', tonnes: 57, costPerT: 20.00 }
      ],
      products: [{ product: 'Concrete Premix', tonnes: 350 }],
      machines: [
        { name: 'Cone',    hours: 3, rate: 145.00, maint: 0, fuelLhr: 0 },
        { name: '883',     hours: 3, rate: 70.74,  maint: 0, fuelLhr: 0 },
        { name: 'Genset 1', hours: 3, rate: 11.15, maint: 0, fuelLhr: 15.60 },
        { name: 'Genset 2', hours: 3, rate: 11.15, maint: 0, fuelLhr: 15.60 },
        { name: 'Excavator', hours: 5, rate: 120.00, maint: 0, fuelLhr: 22.00 },
        { name: 'Loader',  hours: 7, rate: 98.00,  maint: 0, fuelLhr: 30.00 }
      ]
    });
    near(r.totalCost, 14966.28) ? ok('total run cost', '$' + r.totalCost.toFixed(2))
                                : bad('total run cost', 'got $' + r.totalCost.toFixed(2) + ', expected $14966.28');
    near(r.costPerTonne, 42.7608, 0.001) ? ok('cost per tonne', '$' + r.costPerTonne.toFixed(4) + '/t')
                                          : bad('cost per tonne', 'got ' + r.costPerTonne);
  } catch (e) {
    bad('engine require/compute', e.message);
  }

  // ---- TEST 2: save a costing ----------------------------------------------
  console.log('\n2) POST /api/production-costings  (save a costing)');
  let costingId = null, costingRef = null;
  try {
    const res = await fetch(`${BASE}/api/production-costings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operator: 'DK-TEST', entry_mode: 'Blend', notes: 'smoke test — safe to delete',
        rates: { wip: 45, labour: 116, fuel: 2.10 }, manHours: 27,
        materials: [
          { name: '100 minus', tonnes: 292, costPerT: 26.80 },
          { name: 'Fine Sand', tonnes: 57, costPerT: 20.00 }
        ],
        products: [{ product: 'Concrete Premix 20mm Agg/Sand/Dust', tonnes: 350 }],
        machines: [
          { name: 'Terex C-1540P Cone Crusher', hours: 3, rate: 145.00, maint: 0, fuelLhr: 0 },
          { name: 'Terex 883 Screen', hours: 3, rate: 70.74, maint: 0, fuelLhr: 0 },
          { name: 'Genset 1', hours: 3, rate: 11.15, maint: 0, fuelLhr: 15.60 },
          { name: 'Genset 2', hours: 3, rate: 11.15, maint: 0, fuelLhr: 15.60 },
          { name: 'CAT 336 Excavator', hours: 5, rate: 120.00, maint: 0, fuelLhr: 22.00 },
          { name: 'CAT 982M Loader', hours: 7, rate: 98.00, maint: 0, fuelLhr: 30.00 }
        ]
      })
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.success) {
      costingId = body.costing_id; costingRef = body.costing_ref;
      ok('saved', `${costingRef} · $${Number(body.cost_per_tonne).toFixed(2)}/t · $${Number(body.total_run_cost).toFixed(2)} total`);
      near(Number(body.cost_per_tonne), 42.7608, 0.001) ? ok('server cost matches engine')
                                                         : bad('server cost', 'got ' + body.cost_per_tonne);
    } else {
      bad('save costing', `HTTP ${res.status} ${JSON.stringify(body)}`);
      if (res.status === 500) console.log('     (500 usually means migration 006 has not been run yet)');
    }
  } catch (e) {
    bad('save costing', e.message + '  (is the server running at ' + BASE + '?)');
  }

  // ---- TEST 3: search / list ------------------------------------------------
  console.log('\n3) GET /api/production-costings  (search)');
  try {
    const res = await fetch(`${BASE}/api/production-costings?q=smoke%20test`);
    const list = await res.json().catch(() => []);
    Array.isArray(list) && list.some(c => c.costing_id === costingId)
      ? ok('found our costing in search', `${list.length} row(s)`)
      : bad('search', `did not find id ${costingId} (got ${Array.isArray(list) ? list.length : '?'} rows)`);
  } catch (e) {
    bad('search', e.message);
  }

  // ---- TEST 4: fetch one ----------------------------------------------------
  console.log('\n4) GET /api/production-costings/:id  (fetch for import)');
  if (costingId) {
    try {
      const res = await fetch(`${BASE}/api/production-costings/${costingId}`);
      const c = await res.json().catch(() => ({}));
      c && c.payload && c.payload.materials
        ? ok('payload round-trips', `status=${c.status}, ${c.payload.materials.length} material(s)`)
        : bad('fetch one', 'payload missing materials');
    } catch (e) {
      bad('fetch one', e.message);
    }
  } else {
    bad('fetch one', 'skipped — no costing id from step 2');
  }

  // ---- summary --------------------------------------------------------------
  console.log(`\n${'─'.repeat(48)}\n  ${pass} passed · ${fail} failed`);
  if (costingRef) console.log(`  Test costing ${costingRef} left in DRAFT — delete it when done:`);
  if (costingId)  console.log(`    DELETE FROM production_costings WHERE costing_id = ${costingId};`);
  console.log('');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error('Test runner crashed:', e); process.exit(1); });
