// Stock Reconciliation page — fetches /api/reconciliation and renders the result.
(function () {
  const fmt = (n) =>
    Number(n).toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  let lastData = null;
  let showingAll = false;
  let currentProduct = ""; // "" = all products; otherwise a nominated product_name

  async function loadHeaderValue() {
    try {
      const r = await fetch("/api/dashboard/stats");
      const s = await r.json();
      const el = document.getElementById("headerTotalValue");
      if (el && s.totalInventoryValue != null) {
        el.textContent =
          "$" +
          Number(s.totalInventoryValue).toLocaleString("en-AU", {
            maximumFractionDigits: 0,
          });
      }
    } catch (e) {
      /* header value is cosmetic — ignore */
    }
  }

  function setBanner(state, title, sub) {
    const b = document.getElementById("banner");
    b.className = "recon-banner " + state;
    b.querySelector(".icon").textContent =
      state === "ok" ? "✅" : state === "bad" ? "⚠️" : "⏳";
    document.getElementById("bannerTitle").textContent = title;
    document.getElementById("bannerSub").textContent = sub;
  }

  // Narrow a set of lines to the nominated product (or return all).
  function forProduct(lines) {
    return currentProduct
      ? lines.filter((r) => r.product_name === currentProduct)
      : lines;
  }

  // Populate the product dropdown from the reconciliation lines (once per load),
  // keeping the user's current selection.
  function populateProductFilter(data) {
    const sel = document.getElementById("productFilter");
    if (!sel) return;
    const previous = sel.value;
    const names = [
      ...new Set(data.lines.map((r) => r.product_name).filter(Boolean)),
    ].sort();
    sel.innerHTML = '<option value="">All products</option>';
    names.forEach((n) => {
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      sel.appendChild(o);
    });
    sel.value = previous; // keep selection across refreshes (blanks if it's gone)
    currentProduct = sel.value;
  }

  function renderExceptions(data) {
    const body = document.getElementById("exceptionsBody");
    body.innerHTML = "";
    const rows = forProduct(data.exceptions);
    if (!rows.length) {
      const msg = currentProduct
        ? "✓ " + currentProduct + " reconciles — SOH matches the ledger."
        : "✓ Every line reconciles — SOH matches the ledger.";
      body.innerHTML =
        '<tr><td colspan="6" style="text-align:center;color:#16a34a;padding:18px">' +
        msg + "</td></tr>";
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td>${r.product_name}</td>` +
        `<td>SP ${r.stockpile}</td>` +
        `<td style="text-align:right">${fmt(r.soh)}</td>` +
        `<td style="text-align:right">${fmt(r.ledger)}</td>` +
        `<td style="text-align:right" class="gap-neg">${r.gap > 0 ? "+" : ""}${fmt(r.gap)}</td>` +
        `<td style="text-align:center">${r.negative ? '<span class="flag-neg">NEGATIVE</span>' : ""}</td>`;
      body.appendChild(tr);
    });
  }

  function renderAllLines(data) {
    const body = document.getElementById("allLinesBody");
    body.innerHTML = "";
    forProduct(data.lines).forEach((r) => {
      const tr = document.createElement("tr");
      const off = Math.abs(r.gap) > data.tolerance;
      tr.innerHTML =
        `<td>${r.product_name}</td>` +
        `<td>SP ${r.stockpile}</td>` +
        `<td style="text-align:right">${fmt(r.soh)}</td>` +
        `<td style="text-align:right">${fmt(r.ledger)}</td>` +
        `<td style="text-align:right"${off ? ' class="gap-neg"' : ""}>${r.gap > 0 ? "+" : ""}${fmt(r.gap)}</td>`;
      body.appendChild(tr);
    });
  }

  function render(data) {
    lastData = data;
    const s = data.summary;
    document.getElementById("tLines").textContent = s.lines_checked;
    document.getElementById("tOut").textContent = s.out_of_sync;
    document.getElementById("tNeg").textContent = s.negatives;
    document.getElementById("tGap").textContent = fmt(s.net_gap);

    const when = new Date(data.as_at).toLocaleString("en-AU");
    document.getElementById("asAt").textContent = "Checked " + when;

    populateProductFilter(data);

    if (data.balanced) {
      setBanner("ok", "✓ Stock Balanced", `All ${s.lines_checked} lines reconcile — checked ${when}`);
    } else {
      const bits = [];
      if (s.out_of_sync) bits.push(`${s.out_of_sync} out of sync`);
      if (s.negatives) bits.push(`${s.negatives} negative`);
      setBanner("bad", "⚠ Out of Balance", `${bits.join(", ")} — tolerance ±${data.tolerance} t`);
    }

    renderExceptions(data);
    renderAllLines(data);
  }

  async function run() {
    setBanner("loading", "Running reconciliation…", "Comparing live stock against the movement ledger");
    try {
      const r = await fetch("/api/reconciliation");
      if (!r.ok) throw new Error("HTTP " + r.status);
      render(await r.json());
    } catch (e) {
      setBanner("bad", "Could not run reconciliation", String(e.message || e));
    }
  }

  document.getElementById("refreshBtn").addEventListener("click", run);
  document.getElementById("toggleAll").addEventListener("click", function () {
    showingAll = !showingAll;
    document.getElementById("allLinesWrap").style.display = showingAll ? "block" : "none";
    document.getElementById("exceptionsWrap").style.display = showingAll ? "none" : "block";
    this.textContent = showingAll ? "Show exceptions only" : "Show all lines";
  });

  // Nominated-item filter. Picking a product switches to the full-detail view
  // so the item shows even when it's balanced (and therefore not an exception).
  document.getElementById("productFilter").addEventListener("change", function () {
    currentProduct = this.value;
    if (currentProduct) {
      showingAll = true;
      document.getElementById("allLinesWrap").style.display = "block";
      document.getElementById("exceptionsWrap").style.display = "none";
      document.getElementById("toggleAll").textContent = "Show exceptions only";
    }
    if (lastData) render(lastData);
  });

  loadHeaderValue();
  run();
})();