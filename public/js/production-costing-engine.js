// ============================================================
// RAC Inventory — Shared Production Costing Engine
//
// ONE source of truth for production/blend costing maths.
// Used by BOTH:
//   * the Sandpit + live Production screen (browser, window.RACCosting)
//   * the posting API (Node, require('...production-costing-engine'))
//
// Pure calculation only — no DOM, no database, no posting.
// Given a run's inputs it returns every total the UI shows and the
// API needs, so the number the operator sees in the Sandpit is the
// exact number that posts.
//
// Model:
//   total run cost = materials (incl. any Blast WIP line)
//                  + labour
//                  + machines (operating + maintenance + fuel)
//   cost/tonne     = net cost (after by-product credits) / primary tonnes
//
// By-products are optional. With no by-products this reduces to the
// Sandpit's "same cost/t on every product, split by weight".
// ============================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RACCosting = factory();
})(typeof self !== 'undefined' ? self : this, function () {

  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const round = (n, dp) => { const f = Math.pow(10, dp); return Math.round(num(n) * f) / f; };

  // Accept either nested rates {wip,labour,fuel} or the flat
  // wipRate/labRate/fuelRate the Sandpit's gather() produces.
  function rateOf(d, key) {
    if (d.rates && d.rates[key] != null) return num(d.rates[key]);
    const flat = { wip: 'wipRate', labour: 'labRate', fuel: 'fuelRate' }[key];
    return num(d[flat]);
  }

  // ----------------------------------------------------------
  // compute(d) -> full costing result
  //
  // d = {
  //   rates:{wip,labour,fuel}  (or wipRate/labRate/fuelRate),
  //   manHours,
  //   materials:[{ name, code, isWip, location, tonnes, costPerT }],
  //   products :[{ product, code, stdCost, location, tonnes,
  //                isByProduct?, creditRate? }],
  //   machines :[{ name, hours, rate, maint, fuelLhr }]
  // }
  // ----------------------------------------------------------
  function compute(d) {
    d = d || {};
    const fuelRate = rateOf(d, 'fuel');
    const labRate  = rateOf(d, 'labour');

    // ── Materials (a Blast WIP line is just a material with isWip=true) ──
    const matDetail = (d.materials || []).map(m => {
      const tonnes = num(m.tonnes), costPerT = num(m.costPerT);
      return { ...m, tonnes, costPerT, lineCost: round(tonnes * costPerT, 2) };
    });
    const matTotal    = round(matDetail.reduce((s, m) => s + m.lineCost, 0), 2);
    const inputTonnes = round(matDetail.reduce((s, m) => s + m.tonnes, 0), 3);

    // ── Labour ──
    const manHours = num(d.manHours);
    const labCost  = round(manHours * labRate, 2);

    // ── Machines ──
    let machOp = 0, maint = 0, fuel = 0;
    const machDetail = (d.machines || []).map(m => {
      const hours = num(m.hours), rate = num(m.rate), mt = num(m.maint), fl = num(m.fuelLhr);
      const op = round(hours * rate, 2);
      const mn = round(hours * mt, 2);
      const litres = round(hours * fl, 2);
      const fu = round(litres * fuelRate, 2);
      machOp += op; maint += mn; fuel += fu;
      return { ...m, hours, rate, maint: mt, fuelLhr: fl,
        litres, machineCost: op, maintCost: mn, fuelCost: fu,
        total: round(op + mn + fu, 2) };
    });
    machOp = round(machOp, 2); maint = round(maint, 2); fuel = round(fuel, 2);
    const machTotal = round(machOp + maint + fuel, 2);

    const totalCost = round(matTotal + labCost + machTotal, 2);

    // ── Output split (by-product aware; reduces to equal split with none) ──
    const products = (d.products || []).map(p => ({ ...p, tonnes: num(p.tonnes) }));
    const outputTonnes = round(products.reduce((s, p) => s + p.tonnes, 0), 3);

    const byProductCreditTotal = round(
      products.filter(p => p.isByProduct)
              .reduce((s, p) => s + p.tonnes * num(p.creditRate), 0), 2);
    const netCostAfterCredits = round(totalCost - byProductCreditTotal, 2);
    const primaryTonnes = round(
      products.filter(p => !p.isByProduct).reduce((s, p) => s + p.tonnes, 0), 3);

    const costPerTonne = primaryTonnes > 0 ? round(netCostAfterCredits / primaryTonnes, 4) : 0;

    const split = products.map(p => {
      if (p.isByProduct) {
        const cr = num(p.creditRate);
        return { ...p, share: 0, costPerTonne: cr, productCost: round(p.tonnes * cr, 2), isByProduct: true };
      }
      const share = primaryTonnes > 0 ? round(p.tonnes / primaryTonnes, 6) : 0;
      const productCost = round(netCostAfterCredits * share, 2);
      return { ...p, share, costPerTonne,
        productCost: p.tonnes > 0 ? productCost : 0, isByProduct: false };
    });

    const yieldPct = inputTonnes > 0 ? round(outputTonnes / inputTonnes, 4) : 0;

    return {
      matDetail, matTotal, inputTonnes,
      labCost,
      machDetail, machOp, maint, fuel, machTotal,
      totalCost,
      byProductCreditTotal, netCostAfterCredits,
      outputTonnes, primaryTonnes, costPerTonne,
      split,
      yield: yieldPct,
      variance: round(outputTonnes - inputTonnes, 3)
    };
  }

  return { compute, num, round, VERSION: '1.0.0' };
});

// ── Self-test: `node production-costing-engine.js` ──
if (typeof require !== 'undefined' && require.main === module) {
  const E = module.exports;
  const premix = {
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
  };
  const r = E.compute(premix);
  console.log('materials  $', r.matTotal.toFixed(2));
  console.log('labour     $', r.labCost.toFixed(2));
  console.log('machines   $', r.machTotal.toFixed(2), '(op', r.machOp, 'fuel', r.fuel + ')');
  console.log('TOTAL      $', r.totalCost.toFixed(2));
  console.log('output      ', r.outputTonnes, 't');
  console.log('COST/TONNE $', r.costPerTonne.toFixed(2));

  // by-product sanity: same run, split 300 primary + 50 by-product @ $20 credit
  const bp = E.compute({ ...premix, products: [
    { product: 'Primary', tonnes: 300 },
    { product: 'Dust (by-product)', tonnes: 50, isByProduct: true, creditRate: 20 }
  ]});
  console.log('\nby-product check: credit $', bp.byProductCreditTotal.toFixed(2),
    '· net $', bp.netCostAfterCredits.toFixed(2),
    '· primary cost/t $', bp.costPerTonne.toFixed(2));
}
