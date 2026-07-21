// Stocktake Page JavaScript - Shows ALL product+location combinations
// Uses existing /api/movements/adjustment endpoint to POST,
// and /api/stocktakes to SAVE / RESUME drafts (nothing posted until Post).

let currentStock = [];
let products = [];
let locations = [];
let stocktakeRows = []; // Track all rendered rows
let manualRowCounter = 0;
let currentDraftId = null; // set when we save a draft or resume one

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
  // Default to today - operator will change to as-at date
  document.getElementById("stocktakeDate").valueAsDate = new Date();

  // Load data for today by default
  loadStocktakeData();

  // Populate the "Resume saved draft" picker
  loadDraftsList();
});

// Format currency
function formatCurrency(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(value);
}

// Format number with 1 decimal
function formatNumber(value) {
  return parseFloat(value || 0).toFixed(1);
}

// Format family group name for display
function formatFamilyGroup(group) {
  const names = {
    AGGREGATES: "AGGREGATES",
    DIRT: "DIRT",
    DUST: "DUST",
    ROAD_BASE: "ROAD BASE",
    ROCK_ARMOR: "ROCK ARMOR",
    SAND: "SAND",
  };
  return names[group] || group;
}

// Load current stock and products
async function loadStocktakeData() {
  try {
    const productsResponse = await fetch("/api/products");
    products = await productsResponse.json();

    const locationsResponse = await fetch("/api/locations");
    locations = await locationsResponse.json();

    // Default to today's stock on page load
    const today = new Date().toISOString().split("T")[0];
    const stockResponse = await fetch(`/api/stock/as-at?date=${today}`);
    currentStock = await stockResponse.json();

    renderStocktakeTable();
  } catch (error) {
    console.error("Error loading stocktake data:", error);
    alert("Error loading stocktake data");
  }
}

// Reload stock when As-At Date changes
async function loadStockAsAt() {
  const date = document.getElementById("stocktakeDate").value;
  if (!date) return;

  const label = document.getElementById("asAtLabel");
  label.textContent = "⏳ Loading stock as at " + date + "...";

  try {
    const stockResponse = await fetch(`/api/stock/as-at?date=${date}`);
    currentStock = await stockResponse.json();

    // Format date nicely for display
    const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-AU", {
      day: "2-digit", month: "short", year: "numeric"
    });
    label.textContent = "✅ Showing stock as at " + displayDate;
    label.style.color = "#28a745";

    renderStocktakeTable();
  } catch (error) {
    console.error("Error loading as-at stock:", error);
    label.textContent = "❌ Error loading stock for this date";
    label.style.color = "#dc3545";
  }
}

// Render unified stocktake table - ONE ROW PER PRODUCT+LOCATION
function renderStocktakeTable() {
  const tbody = document.getElementById("stocktakeTableBody");
  tbody.innerHTML = "";
  stocktakeRows = [];

  // Define family sort order
  const familyOrder = {
    AGGREGATES: 1,
    DIRT: 2,
    DUST: 3,
    ROAD_BASE: 4,
    ROCK_ARMOR: 5,
    SAND: 6,
  };

  // Only ACTIVE products that hold stock (SOH > 0) belong on the stocktake.
  // The server's /api/stock/as-at endpoint already limits results to active
  // products, and here we keep only product+location combos that actually hold
  // stock. Everything else — zero-balance piles, inactive/test items, and
  // products created after the count date — is intentionally left off. Use the
  // "Add Product at Different Location" button to bring one in if you genuinely
  // need to count it.
  currentStock.forEach((stock) => {
    // Skip locations with zero or near-zero stock (SOH > 0 test)
    const qty = parseFloat(stock.quantity) || 0;
    if (qty < 0.1) return;

    stocktakeRows.push({
      product_id: stock.product_id,
      product_name: stock.product_name,
      family_group: stock.family_group,
      location_id: stock.location_id,
      location_name: stock.location_name,
      current_qty: parseFloat(stock.quantity) || 0,
      average_cost: parseFloat(stock.average_cost) || 0,
      is_existing: true,
    });
  });

  // (Products with no stock are intentionally NOT auto-listed — see note above.
  // Add one manually with "Add Product at Different Location" if needed.)

  // Sort by family group, then product name, then location name
  stocktakeRows.sort((a, b) => {
    const familyA = familyOrder[a.family_group] || 99;
    const familyB = familyOrder[b.family_group] || 99;
    if (familyA !== familyB) return familyA - familyB;

    const nameCompare = a.product_name.localeCompare(b.product_name);
    if (nameCompare !== 0) return nameCompare;

    // Same product, sort by location name
    const locA = a.location_name || "ZZZ";
    const locB = b.location_name || "ZZZ";
    return locA.localeCompare(locB);
  });

  // Step 4: Render each row
  stocktakeRows.forEach((row, index) => {
    const rowId = `row_${index}`;
    row.rowId = rowId; // Store for later reference

    // Build location dropdown options
    let locationOptions = '<option value="">-- Select Location --</option>';
    locations.forEach((l) => {
      const selected = row.location_id === l.location_id ? "selected" : "";
      locationOptions += `<option value="${l.location_id}" ${selected}>${l.location_name}</option>`;
    });

    const tr = document.createElement("tr");
    tr.id = rowId;
    tr.style.height = "40px";

    // Subtle background for zero-stock products
    if (!row.is_existing) {
      tr.style.backgroundColor = "#f9f9f9";
    }

    tr.innerHTML = `
      <td style="padding: 0.3rem 0.5rem;"><small><strong>${formatFamilyGroup(
        row.family_group
      )}</strong></small></td>
      <td style="padding: 0.3rem 0.5rem;">${row.product_name}</td>
      <td style="padding: 0.3rem 0.5rem;">
        <select
          class="form-control"
          id="location_${rowId}"
          data-row-index="${index}"
          onchange="updateRowSOH(${index})"
          style="padding: 0.25rem; font-size: 0.9rem;"
        >
          ${locationOptions}
        </select>
      </td>
      <td style="text-align: right; padding: 0.3rem 0.5rem;">
        <span id="soh_${rowId}">${formatNumber(row.current_qty)}</span>
      </td>
      <td style="text-align: center; padding: 0.3rem 0.5rem;">
        <input
          type="number"
          class="form-control"
          id="count_${rowId}"
          step="0.1"
          placeholder="0.0"
          style="width: 90px; text-align: center; padding: 0.25rem; font-size: 0.9rem;"
          onchange="calculateTotals()"
        />
      </td>
      <td style="text-align: center; padding: 0.3rem 0.5rem;">
        <input
          type="number"
          class="form-control"
          id="cost_${rowId}"
          value="${row.average_cost}"
          step="0.01"
          placeholder="0.00"
          style="width: 80px; text-align: center; padding: 0.25rem; font-size: 0.9rem;"
          onchange="calculateTotals()"
        />
      </td>
      <td style="text-align: right; padding: 0.3rem 0.5rem;">
        <span id="qvar_${rowId}" style="font-weight: 600; color: #666">—</span>
      </td>
      <td id="valcell_${rowId}" style="text-align: right; padding: 0.3rem 0.5rem;">
        <span id="var_${rowId}" style="font-weight: 600; color: #999">—</span>
      </td>
      <td style="padding: 0.3rem 0.5rem;">
        <input
          type="text"
          class="form-control"
          id="notes_${rowId}"
          placeholder="Optional notes..."
          style="width: 100%; padding: 0.25rem; font-size: 0.85rem;"
        />
      </td>
      <td></td>
    `;
    tbody.appendChild(tr);
  });

  // Initial totals calculation
  calculateTotals();
}

// Update SOH when location is changed for a row
function updateRowSOH(index) {
  const row = stocktakeRows[index];
  const rowId = row.rowId;
  const locationSelect = document.getElementById(`location_${rowId}`);
  const sohElement = document.getElementById(`soh_${rowId}`);

  if (locationSelect.value) {
    const locationId = parseInt(locationSelect.value);

    // Find existing stock at this product+location combo
    const stock = currentStock.find(
      (s) => s.product_id === row.product_id && s.location_id === locationId
    );

    const soh = stock ? parseFloat(stock.quantity) : 0;
    sohElement.textContent = formatNumber(soh);
  } else {
    sohElement.textContent = "0.0";
  }

  calculateTotals();
}

// $ with 2 decimals, e.g. -$83,348.00 (matches the Excel look)
function formatMoney2(value) {
  const n = parseFloat(value) || 0;
  return (
    (n < 0 ? "-$" : "$") +
    Math.abs(n).toLocaleString("en-AU", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

// Blend two [r,g,b] colours by t (0..1)
function lerpColor(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)}, ${Math.round(
    a[1] + (b[1] - a[1]) * t
  )}, ${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

// Excel-style 3-colour scale: green (gain) -> yellow (nil) -> red (loss)
const HEAT_GREEN = [99, 190, 123]; // #63BE7B
const HEAT_YELLOW = [255, 235, 132]; // #FFEB84
const HEAT_RED = [248, 105, 107]; // #F8696B
function heatColor(value, maxPos, maxNegMag) {
  if (value > 0)
    return lerpColor(HEAT_YELLOW, HEAT_GREEN, maxPos > 0 ? value / maxPos : 0);
  if (value < 0)
    return lerpColor(
      HEAT_YELLOW,
      HEAT_RED,
      maxNegMag > 0 ? Math.abs(value) / maxNegMag : 0
    );
  return "rgb(255, 235, 132)"; // exactly nil -> yellow
}

// Calculate every column's totals AND each row's qty + $ variance,
// then heat-map the VALUE cells. A typed 0 counts (only blank is skipped).
function calculateTotals() {
  let totalHub = 0,
    totalCount = 0,
    totalAdjustment = 0,
    totalValue = 0;
  const computed = []; // { rowId, lineValue, counted }
  let maxPos = 0,
    maxNegMag = 0;

  const processRow = (rowId) => {
    const countInput = document.getElementById(`count_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);
    const sohElement = document.getElementById(`soh_${rowId}`);
    const locationSelect = document.getElementById(`location_${rowId}`);
    const qSpan = document.getElementById(`qvar_${rowId}`);

    const counted =
      countInput &&
      countInput.value !== "" &&
      locationSelect &&
      locationSelect.value &&
      sohElement;

    if (counted) {
      const soh = parseFloat(sohElement.textContent) || 0;
      const cnt = parseFloat(countInput.value) || 0;
      const qtyVar = cnt - soh;
      const cost = parseFloat(costInput.value) || 0;
      const lineValue = qtyVar * cost;

      totalHub += soh;
      totalCount += cnt;
      totalAdjustment += qtyVar;
      totalValue += lineValue;
      if (lineValue > maxPos) maxPos = lineValue;
      if (-lineValue > maxNegMag) maxNegMag = -lineValue;

      if (qSpan) {
        qSpan.textContent = qtyVar.toFixed(2);
        qSpan.style.color =
          qtyVar < 0 ? "#c0392b" : qtyVar > 0 ? "#1e7e34" : "#666";
      }
      computed.push({ rowId, lineValue, counted: true });
    } else {
      if (qSpan) {
        qSpan.textContent = "—";
        qSpan.style.color = "#999";
      }
      computed.push({ rowId, lineValue: 0, counted: false });
    }
  };

  // Pass 1: figures + qty variance
  stocktakeRows.forEach((row) => processRow(row.rowId));
  for (let i = 1; i <= manualRowCounter; i++) {
    if (document.getElementById(`count_manual_${i}`)) processRow(`manual_${i}`);
  }

  // Pass 2: colour the VALUE cells now the range is known
  computed.forEach(({ rowId, lineValue, counted }) => {
    const cell = document.getElementById(`valcell_${rowId}`);
    const span = document.getElementById(`var_${rowId}`);
    if (!cell || !span) return;
    if (!counted) {
      span.textContent = "—";
      span.style.color = "#999";
      cell.style.backgroundColor = "";
    } else {
      span.textContent = formatMoney2(lineValue);
      span.style.color = "#333";
      cell.style.backgroundColor = heatColor(lineValue, maxPos, maxNegMag);
    }
  });

  document.getElementById("totalHub").textContent =
    formatNumber(totalHub) + " t";
  document.getElementById("totalCount").textContent =
    formatNumber(totalCount) + " t";
  document.getElementById("totalAdjustment").textContent =
    formatNumber(totalAdjustment) + " t";
  document.getElementById("totalValue").textContent = formatMoney2(totalValue);

  const totalValueElement = document.getElementById("totalValue");
  totalValueElement.style.color =
    totalValue < 0 ? "red" : totalValue > 0 ? "green" : "inherit";
}

// Collect all adjustments
function collectAdjustments() {
  const adjustments = [];

  // Collect from stocktake rows
  stocktakeRows.forEach((row) => {
    const rowId = row.rowId;
    const countInput = document.getElementById(`count_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);
    const notesInput = document.getElementById(`notes_${rowId}`);
    const locationSelect = document.getElementById(`location_${rowId}`);
    const sohElement = document.getElementById(`soh_${rowId}`);

    if (
      countInput &&
      countInput.value &&
      locationSelect &&
      locationSelect.value
    ) {
      const currentQty = parseFloat(sohElement.textContent);
      const newQty = parseFloat(countInput.value);
      const adjustment = newQty - currentQty;
      const locationId = locationSelect.value;
      const cost = parseFloat(costInput.value) || 0;
      const notes = notesInput.value || "";

      if (adjustment !== 0) {
        adjustments.push({
          product_id: row.product_id,
          product_name: row.product_name,
          location_id: parseInt(locationId),
          quantity_adjustment: adjustment,
          unit_cost: cost,
          notes: notes,
        });
      }
    }
  });

  // Collect from manual rows
  for (let i = 1; i <= manualRowCounter; i++) {
    const rowId = `manual_${i}`;
    const productSelect = document.getElementById(`product_${rowId}`);
    const locationSelect = document.getElementById(`location_${rowId}`);
    const countInput = document.getElementById(`count_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);
    const notesInput = document.getElementById(`notes_${rowId}`);
    const sohElement = document.getElementById(`soh_${rowId}`);

    if (
      productSelect &&
      productSelect.value &&
      locationSelect &&
      locationSelect.value &&
      countInput &&
      countInput.value
    ) {
      const currentQty = parseFloat(sohElement.textContent) || 0;
      const newQty = parseFloat(countInput.value);
      const adjustment = newQty - currentQty;
      const cost = parseFloat(costInput.value) || 0;
      const notes = notesInput.value || "";

      const productName =
        productSelect.options[productSelect.selectedIndex].text;

      if (adjustment !== 0) {
        adjustments.push({
          product_id: parseInt(productSelect.value),
          product_name: productName,
          location_id: parseInt(locationSelect.value),
          quantity_adjustment: adjustment,
          unit_cost: cost,
          notes: notes,
        });
      }
    }
  }

  return adjustments;
}

// ============================================================
// SAVE DRAFT  — capture everything typed without touching stock
// ============================================================

// Collect every row that has been touched (count and/or notes),
// including rows whose count equals SOH (still worth keeping).
function collectDraftLines() {
  const lines = [];
  let totalQty = 0;
  let totalValue = 0;

  // Existing product+location rows
  stocktakeRows.forEach((row) => {
    const rowId = row.rowId;
    const countInput = document.getElementById(`count_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);
    const notesInput = document.getElementById(`notes_${rowId}`);
    const locationSelect = document.getElementById(`location_${rowId}`);
    const sohElement = document.getElementById(`soh_${rowId}`);
    if (!countInput) return;

    const countVal = countInput.value;
    const notesVal = notesInput ? notesInput.value : "";
    if (countVal === "" && notesVal.trim() === "") return; // nothing entered

    const soh = sohElement ? parseFloat(sohElement.textContent) || 0 : 0;
    const locationId =
      locationSelect && locationSelect.value
        ? parseInt(locationSelect.value)
        : null;
    const counted = countVal === "" ? null : parseFloat(countVal);
    const cost = costInput && costInput.value ? parseFloat(costInput.value) : null;

    lines.push({
      product_id: row.product_id,
      location_id: locationId,
      soh_snapshot: soh,
      counted_qty: counted,
      unit_cost: cost,
      notes: notesVal,
      is_manual: false,
    });

    if (locationId && counted != null) {
      const adj = counted - soh;
      totalQty += adj;
      totalValue += adj * (cost || 0);
    }
  });

  // Manual rows ("product at new location")
  for (let i = 1; i <= manualRowCounter; i++) {
    const rowId = `manual_${i}`;
    const productSelect = document.getElementById(`product_${rowId}`);
    if (!productSelect || !productSelect.value) continue; // removed or empty

    const locationSelect = document.getElementById(`location_${rowId}`);
    const countInput = document.getElementById(`count_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);
    const notesInput = document.getElementById(`notes_${rowId}`);
    const sohElement = document.getElementById(`soh_${rowId}`);

    const soh = sohElement ? parseFloat(sohElement.textContent) || 0 : 0;
    const locationId =
      locationSelect && locationSelect.value
        ? parseInt(locationSelect.value)
        : null;
    const counted =
      countInput && countInput.value !== "" ? parseFloat(countInput.value) : null;
    const cost = costInput && costInput.value ? parseFloat(costInput.value) : null;
    const notesVal = notesInput ? notesInput.value : "";

    lines.push({
      product_id: parseInt(productSelect.value),
      location_id: locationId,
      soh_snapshot: soh,
      counted_qty: counted,
      unit_cost: cost,
      notes: notesVal,
      is_manual: true,
    });

    if (locationId && counted != null) {
      const adj = counted - soh;
      totalQty += adj;
      totalValue += adj * (cost || 0);
    }
  }

  return { lines, totalQty, totalValue };
}

async function saveDraft() {
  const stocktakeDate = document.getElementById("stocktakeDate").value;
  const reference = document.getElementById("stocktakeReference").value;
  const operator = document.getElementById("stocktakeOperator").value;
  const generalNotes = document.getElementById("stocktakeNotes").value;

  if (!stocktakeDate || !reference) {
    alert("Please fill in As-At Date and Reference before saving.");
    return;
  }

  const { lines, totalQty, totalValue } = collectDraftLines();

  if (lines.length === 0) {
    alert("Nothing to save yet — enter some counts first.");
    return;
  }

  try {
    const response = await fetch("/api/stocktakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stocktake_id: currentDraftId || undefined,
        reference,
        as_at_date: stocktakeDate,
        operator,
        general_notes: generalNotes,
        created_by: "Admin User",
        total_qty_adjustment: totalQty,
        total_value_adjustment: totalValue,
        lines,
      }),
    });

    const data = await response.json();

    if (response.ok && data.success) {
      currentDraftId = data.stocktake_id;
      document.getElementById("draftStatusLabel").textContent =
        `✓ Draft saved (#${currentDraftId}) — safe to leave and resume later`;
      await loadDraftsList();
      document.getElementById("resumeDraftSelect").value = String(currentDraftId);
      alert(
        `✅ Draft saved.\n\n` +
          `Reference: ${reference}\n` +
          `Lines saved: ${lines.length}\n\n` +
          `You can safely leave this page and Resume it later. ` +
          `Nothing has been posted to stock yet.`
      );
    } else {
      alert("❌ Failed to save draft: " + (data.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error saving draft:", error);
    alert("❌ Error saving draft: " + error.message);
  }
}

// ============================================================
// RESUME DRAFT  — reload a saved stocktake and re-populate the screen
// ============================================================

async function loadDraftsList() {
  try {
    const response = await fetch("/api/stocktakes/drafts");
    const drafts = await response.json();
    const select = document.getElementById("resumeDraftSelect");
    if (!select) return;

    const current = select.value;
    select.innerHTML = '<option value="">-- Resume a saved draft --</option>';

    drafts.forEach((d) => {
      const saved = d.updated_at
        ? new Date(d.updated_at).toLocaleString("en-AU", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const label = `${d.reference} — ${d.line_count} lines (saved ${saved})`;
      select.add(new Option(label, d.stocktake_id));
    });

    if (current) select.value = current;
  } catch (error) {
    console.error("Error loading drafts list:", error);
  }
}

async function resumeDraft(id) {
  if (!id) return;

  try {
    const response = await fetch(`/api/stocktakes/${id}`);
    if (!response.ok) {
      alert("Could not load that draft.");
      return;
    }
    const st = await response.json();

    // Restore the header fields
    document.getElementById("stocktakeReference").value = st.reference || "";
    document.getElementById("stocktakeNotes").value = st.general_notes || "";
    document.getElementById("stocktakeOperator").value =
      st.operator || "Admin User";

    const dateStr = (st.as_at_date || "").split("T")[0];
    if (dateStr) document.getElementById("stocktakeDate").value = dateStr;

    currentDraftId = st.stocktake_id;

    // Rebuild the base table for that as-at date, then overlay the saved counts
    await loadStockAsAt();
    overlaySavedLines(st.lines || []);

    document.getElementById("draftStatusLabel").textContent =
      `✎ Editing saved draft: ${st.reference}`;
  } catch (error) {
    console.error("Error resuming draft:", error);
    alert("❌ Error resuming draft: " + error.message);
  }
}

// Drop each saved line back onto the rebuilt table
function overlaySavedLines(lines) {
  lines.forEach((line) => {
    if (line.is_manual) {
      // Recreate a manual "product at new location" row
      addProductRow();
      const rowId = `manual_${manualRowCounter}`;
      const productSelect = document.getElementById(`product_${rowId}`);
      if (productSelect) {
        productSelect.value = String(line.product_id || "");
        updateManualRow(rowId);
      }
      const locationSelect = document.getElementById(`location_${rowId}`);
      if (locationSelect && line.location_id) {
        locationSelect.value = String(line.location_id);
        updateManualRowSOH(rowId);
      }
      setRowValues(rowId, line);
    } else {
      // Find the matching existing product+location row
      let idx = stocktakeRows.findIndex(
        (r) =>
          r.product_id === line.product_id && r.location_id === line.location_id
      );

      // If the product only had a blank (no-location) row, set its location first
      if (idx === -1 && line.location_id != null) {
        idx = stocktakeRows.findIndex(
          (r) => r.product_id === line.product_id && r.location_id == null
        );
        if (idx !== -1) {
          const locSel = document.getElementById(
            `location_${stocktakeRows[idx].rowId}`
          );
          if (locSel) {
            locSel.value = String(line.location_id);
            updateRowSOH(idx);
          }
        }
      }

      if (idx === -1) return; // couldn't match — skip
      setRowValues(stocktakeRows[idx].rowId, line);
    }
  });

  calculateTotals();
}

// Helper: put a saved line's count / cost / notes onto a rendered row
function setRowValues(rowId, line) {
  const countInput = document.getElementById(`count_${rowId}`);
  const costInput = document.getElementById(`cost_${rowId}`);
  const notesInput = document.getElementById(`notes_${rowId}`);
  if (countInput && line.counted_qty != null) countInput.value = line.counted_qty;
  if (costInput && line.unit_cost != null) costInput.value = line.unit_cost;
  if (notesInput && line.notes) notesInput.value = line.notes;
}

// ============================================================
// POST (Apply) — writes the adjustments to live stock
// ============================================================

// Apply stocktake - uses existing /api/movements/adjustment endpoint
async function applyStocktake() {
  // Validation
  const stocktakeDate = document.getElementById("stocktakeDate").value;
  const reference = document.getElementById("stocktakeReference").value;
  const generalNotes = document.getElementById("stocktakeNotes").value;

  if (!stocktakeDate || !reference) {
    alert("Please fill in Stocktake Date and Reference");
    return;
  }

  // Collect adjustments
  const adjustments = collectAdjustments();

  if (adjustments.length === 0) {
    alert(
      "No adjustments to apply. Please enter count quantities and select locations."
    );
    return;
  }

  // Confirm before applying
  const grandQtyAdj = adjustments.reduce(
    (sum, adj) => sum + adj.quantity_adjustment,
    0
  );
  const grandValueAdj = adjustments.reduce(
    (sum, adj) => sum + adj.quantity_adjustment * adj.unit_cost,
    0
  );

  const confirmed = confirm(
    `Post Stocktake Adjustment?\n\n` +
      `Total Quantity Change: ${formatNumber(grandQtyAdj)} tonnes\n` +
      `Total Value Change: ${formatCurrency(grandValueAdj)}\n\n` +
      `This will create ${adjustments.length} adjustment transactions and update live stock.`
  );

  if (!confirmed) return;

  // Apply each adjustment using existing endpoint
  try {
    let successCount = 0;
    let failCount = 0;
    let failedItems = [];

    for (const adj of adjustments) {
      try {
        const fullNotes = generalNotes
          ? `${generalNotes} - ${
              adj.notes || "Stocktake adjustment for " + adj.product_name
            }`
          : adj.notes || "Stocktake adjustment for " + adj.product_name;

        const response = await fetch("/api/movements/adjustment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            movement_date: stocktakeDate,
            product_id: adj.product_id,
            location_id: adj.location_id,
            quantity: adj.quantity_adjustment,
            unit_cost: adj.unit_cost,
            reason: reference,
            notes: fullNotes,
            created_by: "Admin User",
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          const error = await response.json();
          failedItems.push(`${adj.product_name}: ${error.error || "Unknown error"}`);
          console.error(`Failed to adjust ${adj.product_name}:`, error);
        }
      } catch (error) {
        failCount++;
        failedItems.push(`${adj.product_name}: ${error.message}`);
        console.error(`Error adjusting ${adj.product_name}:`, error);
      }
    }

    if (successCount > 0) {
      // If this came from a saved draft, mark it POSTED so it leaves the Resume list
      if (currentDraftId) {
        try {
          await fetch(`/api/stocktakes/${currentDraftId}/posted`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ posted_by: "Admin User" }),
          });
          currentDraftId = null;
        } catch (e) {
          console.error("Could not mark draft posted:", e);
        }
      }

      let message = `✅ Stocktake posted!\n\n` +
        `${successCount} adjustments successful\n`;

      if (failCount > 0) {
        message += `${failCount} adjustments failed:\n`;
        failedItems.forEach(item => {
          message += `  • ${item}\n`;
        });
      }

      message += `\nReference: ${reference}`;

      alert(message);
      window.location.href = "operations.html";
    } else {
      alert(
        "❌ Failed to post stocktake.\n\n" +
        failedItems.join("\n") +
        "\n\nCheck console for details."
      );
    }
  } catch (error) {
    console.error("Error applying stocktake:", error);
    alert("❌ Error posting stocktake");
  }
}

// Cancel stocktake
function cancelStocktake() {
  if (confirm("Cancel stocktake? Any unsaved data will be lost.")) {
    window.location.href = "operations.html";
  }
}

// Add a new manual product row for products at NEW locations
function addProductRow() {
  manualRowCounter++;
  const rowId = `manual_${manualRowCounter}`;
  const tbody = document.getElementById("stocktakeTableBody");

  const row = document.createElement("tr");
  row.id = `row_${rowId}`;
  row.style.height = "40px";
  row.style.backgroundColor = "#fffbea"; // Light yellow to distinguish manual rows

  // Build product dropdown
  let productOptions = '<option value="">-- Select Product --</option>';
  products.forEach((p) => {
    productOptions += `<option value="${p.product_id}" data-group="${
      p.family_group
    }" data-cost="${p.standard_cost || 40}">${p.product_name}</option>`;
  });

  // Build location dropdown
  let locationOptions = '<option value="">-- Select Location --</option>';
  locations.forEach((l) => {
    locationOptions += `<option value="${l.location_id}">${l.location_name}</option>`;
  });

  row.innerHTML = `
    <td style="padding: 0.3rem 0.5rem;">
      <small><em id="group_${rowId}">-</em></small>
    </td>
    <td style="padding: 0.3rem 0.5rem;">
      <select
        class="form-control"
        id="product_${rowId}"
        onchange="updateManualRow('${rowId}')"
        style="padding: 0.25rem; font-size: 0.9rem;"
      >
        ${productOptions}
      </select>
    </td>
    <td style="padding: 0.3rem 0.5rem;">
      <select
        class="form-control"
        id="location_${rowId}"
        onchange="updateManualRowSOH('${rowId}')"
        style="padding: 0.25rem; font-size: 0.9rem;"
      >
        ${locationOptions}
      </select>
    </td>
    <td style="text-align: right; padding: 0.3rem 0.5rem;">
      <span id="soh_${rowId}">0.0</span>
    </td>
    <td style="text-align: center; padding: 0.3rem 0.5rem;">
      <input
        type="number"
        class="form-control"
        id="count_${rowId}"
        step="0.1"
        placeholder="0.0"
        style="width: 90px; text-align: center; padding: 0.25rem; font-size: 0.9rem;"
        onchange="calculateTotals()"
      />
    </td>
    <td style="text-align: center; padding: 0.3rem 0.5rem;">
      <input
        type="number"
        class="form-control"
        id="cost_${rowId}"
        step="0.01"
        placeholder="0.00"
        style="width: 80px; text-align: center; padding: 0.25rem; font-size: 0.9rem;"
        onchange="calculateTotals()"
      />
    </td>
    <td style="text-align: right; padding: 0.3rem 0.5rem;">
      <span id="qvar_${rowId}" style="font-weight: 600; color: #666">—</span>
    </td>
    <td id="valcell_${rowId}" style="text-align: right; padding: 0.3rem 0.5rem;">
      <span id="var_${rowId}" style="font-weight: 600; color: #999">—</span>
    </td>
    <td style="padding: 0.3rem 0.5rem;">
      <input
        type="text"
        class="form-control"
        id="notes_${rowId}"
        placeholder="Optional notes..."
        style="width: 100%; padding: 0.25rem; font-size: 0.85rem;"
      />
    </td>
    <td style="text-align: center; padding: 0.3rem 0.5rem;">
      <button
        class="btn-icon"
        onclick="removeManualRow('${rowId}')"
        title="Remove"
        style="background: none; border: none; cursor: pointer; font-size: 1.2rem;"
      >🗑️</button>
    </td>
  `;

  tbody.appendChild(row);
}

// Update manual row when product is selected
function updateManualRow(rowId) {
  const productSelect = document.getElementById(`product_${rowId}`);
  const selectedOption = productSelect.options[productSelect.selectedIndex];

  if (selectedOption.value) {
    const group = selectedOption.dataset.group;
    const cost = selectedOption.dataset.cost;

    document.getElementById(`group_${rowId}`).textContent =
      formatFamilyGroup(group);
    document.getElementById(`cost_${rowId}`).value = cost;
  } else {
    document.getElementById(`group_${rowId}`).textContent = "-";
  }

  updateManualRowSOH(rowId);
}

// Update SOH when location is selected on manual row
function updateManualRowSOH(rowId) {
  const productSelect = document.getElementById(`product_${rowId}`);
  const locationSelect = document.getElementById(`location_${rowId}`);

  if (productSelect.value && locationSelect.value) {
    const productId = parseInt(productSelect.value);
    const locationId = parseInt(locationSelect.value);

    // Find existing stock at this product/location combo
    const stock = currentStock.find(
      (s) => s.product_id === productId && s.location_id === locationId
    );

    const soh = stock ? parseFloat(stock.quantity) : 0;
    document.getElementById(`soh_${rowId}`).textContent = formatNumber(soh);
  }

  calculateTotals();
}

// Remove manual row
function removeManualRow(rowId) {
  const row = document.getElementById(`row_${rowId}`);
  if (row) {
    row.remove();
    calculateTotals();
  }
}