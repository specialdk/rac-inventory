// Stocktake Page JavaScript - Shows ALL product+location combinations
// Uses existing /api/movements/adjustment endpoint

let currentStock = [];
let products = [];
let locations = [];
let stocktakeRows = []; // Track all rendered rows
let manualRowCounter = 0;

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
  // Set default date to today
  document.getElementById("stocktakeDate").valueAsDate = new Date();

  // Load data
  loadStocktakeData();
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
    // Load products
    const productsResponse = await fetch("/api/products");
    products = await productsResponse.json();

    // Load locations
    const locationsResponse = await fetch("/api/locations");
    locations = await locationsResponse.json();

    // Load current stock (returns one row per product+location)
    const stockResponse = await fetch("/api/stock/current");
    currentStock = await stockResponse.json();

    // Render table with ALL product+location rows
    renderStocktakeTable();
  } catch (error) {
    console.error("Error loading stocktake data:", error);
    alert("Error loading stocktake data");
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

  // Step 1: Build rows from currentStock (each is a product+location combo with stock > 0)
  const productsWithStock = new Set();

  currentStock.forEach((stock) => {
    // Skip locations with zero or near-zero stock
    const qty = parseFloat(stock.quantity) || 0;
    if (qty < 0.1) return;

    productsWithStock.add(stock.product_id);
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

  // Step 2: Add products that have NO stock at all (so they can be counted fresh)
  products.forEach((product) => {
    if (!productsWithStock.has(product.product_id)) {
      stocktakeRows.push({
        product_id: product.product_id,
        product_name: product.product_name,
        family_group: product.family_group,
        location_id: null,
        location_name: null,
        current_qty: 0,
        average_cost: parseFloat(product.standard_cost) || 40,
        is_existing: false,
      });
    }
  });

  // Step 3: Sort by family group, then product name, then location name
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

// Calculate all totals
function calculateTotals() {
  let totalAdjustment = 0;
  let totalValue = 0;

  // Calculate from stocktake rows
  stocktakeRows.forEach((row) => {
    const rowId = row.rowId;
    const countInput = document.getElementById(`count_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);
    const sohElement = document.getElementById(`soh_${rowId}`);
    const locationSelect = document.getElementById(`location_${rowId}`);

    if (
      countInput &&
      countInput.value &&
      locationSelect &&
      locationSelect.value
    ) {
      const currentQty = parseFloat(sohElement.textContent);
      const newQty = parseFloat(countInput.value) || 0;
      const adjustment = newQty - currentQty;
      const cost = parseFloat(costInput.value) || 0;

      totalAdjustment += adjustment;
      totalValue += adjustment * cost;
    }
  });

  // Calculate from manual rows
  for (let i = 1; i <= manualRowCounter; i++) {
    const rowId = `manual_${i}`;
    const countInput = document.getElementById(`count_${rowId}`);
    const costInput = document.getElementById(`cost_${rowId}`);
    const sohElement = document.getElementById(`soh_${rowId}`);
    const locationSelect = document.getElementById(`location_${rowId}`);

    if (
      countInput &&
      countInput.value &&
      locationSelect &&
      locationSelect.value &&
      sohElement
    ) {
      const currentQty = parseFloat(sohElement.textContent) || 0;
      const newQty = parseFloat(countInput.value) || 0;
      const adjustment = newQty - currentQty;
      const cost = parseFloat(costInput.value) || 0;

      totalAdjustment += adjustment;
      totalValue += adjustment * cost;
    }
  }

  document.getElementById("totalAdjustment").textContent =
    formatNumber(totalAdjustment) + " t";
  document.getElementById("totalValue").textContent =
    formatCurrency(totalValue);

  // Color code total value
  const totalValueElement = document.getElementById("totalValue");
  if (totalValue > 0) {
    totalValueElement.style.color = "green";
  } else if (totalValue < 0) {
    totalValueElement.style.color = "red";
  } else {
    totalValueElement.style.color = "inherit";
  }
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
    `Apply Stocktake Adjustment?\n\n` +
      `Total Quantity Change: ${formatNumber(grandQtyAdj)} tonnes\n` +
      `Total Value Change: ${formatCurrency(grandValueAdj)}\n\n` +
      `This will create ${adjustments.length} adjustment transactions.`
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
      let message = `✅ Stocktake applied!\n\n` +
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
        "❌ Failed to apply stocktake.\n\n" +
        failedItems.join("\n") +
        "\n\nCheck console for details."
      );
    }
  } catch (error) {
    console.error("Error applying stocktake:", error);
    alert("❌ Error applying stocktake");
  }
}

// Cancel stocktake
function cancelStocktake() {
  if (confirm("Cancel stocktake? Any entered data will be lost.")) {
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