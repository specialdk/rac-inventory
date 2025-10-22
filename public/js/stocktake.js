// Stocktake Page JavaScript
// Uses existing /api/movements/adjustment endpoint

// Data storage
let currentStock = [];
let products = [];
let sandProducts = [];
let rockProducts = [];

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
  // Set default date to today
  document.getElementById("stocktakeDate").valueAsDate = new Date();

  // Load data
  loadStocktakeData();

  // Add event listeners for avg cost changes
  document
    .getElementById("sandAvgCost")
    .addEventListener("input", calculateTotals);
  document
    .getElementById("rockAvgCost")
    .addEventListener("input", calculateTotals);
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

// Load current stock and products
async function loadStocktakeData() {
  try {
    // Load products
    const productsResponse = await fetch("/api/products");
    products = await productsResponse.json();

    // Load current stock
    const stockResponse = await fetch("/api/stock/current");
    currentStock = await stockResponse.json();

    // Separate Sand vs Rock products
    sandProducts = products.filter((p) => p.family_group === "SAND");
    rockProducts = products.filter((p) =>
      ["AGGREGATES", "ROCK_ARMOR", "ROAD_BASE", "DUST"].includes(p.family_group)
    );

    // Render tables
    renderSandProducts();
    renderRockProducts();
    calculateTotals();
  } catch (error) {
    console.error("Error loading stocktake data:", error);
    alert("Error loading stocktake data");
  }
}

// Render sand products table
function renderSandProducts() {
  const tbody = document.getElementById("sandProductsTable");
  tbody.innerHTML = "";

  sandProducts.forEach((product) => {
    // Find current stock for this product
    const stock = currentStock.find((s) => s.product_id === product.product_id);
    const currentQty = stock ? parseFloat(stock.quantity) : 0;
    const locationId = stock ? stock.location_id : null;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${product.product_name}</strong><br>
        <small style="color: var(--gray-500);">${product.product_code}</small>
      </td>
      <td class="text-right">${formatNumber(currentQty)}</td>
      <td>
        <input 
          type="number" 
          class="form-control-table" 
          id="sand_${product.product_id}" 
          data-product-id="${product.product_id}"
          data-current-qty="${currentQty}"
          data-location-id="${locationId || ""}"
          step="0.1" 
          placeholder="0.0"
          onchange="calculateAdjustment(this, 'sand')"
        />
      </td>
      <td class="text-right adjustment-cell" id="sand_adj_${
        product.product_id
      }">0.0</td>
      <td class="text-right value-cell" id="sand_val_${
        product.product_id
      }">$0</td>
    `;
    tbody.appendChild(row);
  });
}

// Render rock products table
function renderRockProducts() {
  const tbody = document.getElementById("rockProductsTable");
  tbody.innerHTML = "";

  rockProducts.forEach((product) => {
    // Find current stock for this product
    const stock = currentStock.find((s) => s.product_id === product.product_id);
    const currentQty = stock ? parseFloat(stock.quantity) : 0;
    const locationId = stock ? stock.location_id : null;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${product.product_name}</strong><br>
        <small style="color: var(--gray-500);">${product.product_code}</small>
      </td>
      <td class="text-right">${formatNumber(currentQty)}</td>
      <td>
        <input 
          type="number" 
          class="form-control-table" 
          id="rock_${product.product_id}" 
          data-product-id="${product.product_id}"
          data-current-qty="${currentQty}"
          data-location-id="${locationId || ""}"
          step="0.1" 
          placeholder="0.0"
          onchange="calculateAdjustment(this, 'rock')"
        />
      </td>
      <td class="text-right adjustment-cell" id="rock_adj_${
        product.product_id
      }">0.0</td>
      <td class="text-right value-cell" id="rock_val_${
        product.product_id
      }">$0</td>
    `;
    tbody.appendChild(row);
  });
}

// Calculate adjustment for a single product
function calculateAdjustment(input, family) {
  const productId = input.dataset.productId;
  const currentQty = parseFloat(input.dataset.currentQty);
  const newQty = parseFloat(input.value) || 0;
  const adjustment = newQty - currentQty;

  // Get avg cost
  const avgCost =
    parseFloat(document.getElementById(family + "AvgCost").value) || 0;
  const valueImpact = adjustment * avgCost;

  // Update adjustment cell
  const adjCell = document.getElementById(`${family}_adj_${productId}`);
  adjCell.textContent = formatNumber(adjustment);
  adjCell.className = "text-right adjustment-cell";
  if (adjustment > 0) {
    adjCell.classList.add("positive");
  } else if (adjustment < 0) {
    adjCell.classList.add("negative");
  }

  // Update value cell
  const valCell = document.getElementById(`${family}_val_${productId}`);
  valCell.textContent = formatCurrency(valueImpact);
  valCell.className = "text-right value-cell";
  if (valueImpact > 0) {
    valCell.classList.add("positive");
  } else if (valueImpact < 0) {
    valCell.classList.add("negative");
  }

  // Recalculate totals
  calculateTotals();
}

// Calculate all totals
function calculateTotals() {
  // Sand totals
  let sandCurrentTotal = 0;
  let sandNewTotal = 0;
  let sandAdjTotal = 0;
  let sandValueTotal = 0;

  const sandAvgCost =
    parseFloat(document.getElementById("sandAvgCost").value) || 0;

  sandProducts.forEach((product) => {
    const input = document.getElementById(`sand_${product.product_id}`);
    if (input) {
      const currentQty = parseFloat(input.dataset.currentQty);
      const newQty = parseFloat(input.value) || 0;
      const adjustment = newQty - currentQty;

      sandCurrentTotal += currentQty;
      sandNewTotal += newQty;
      sandAdjTotal += adjustment;
      sandValueTotal += adjustment * sandAvgCost;
    }
  });

  document.getElementById("sandCurrentTotal").textContent =
    formatNumber(sandCurrentTotal);
  document.getElementById("sandNewTotal").textContent =
    formatNumber(sandNewTotal);
  document.getElementById("sandAdjustmentTotal").textContent =
    formatNumber(sandAdjTotal);
  document.getElementById("sandValueTotal").textContent =
    formatCurrency(sandValueTotal);

  // Rock totals
  let rockCurrentTotal = 0;
  let rockNewTotal = 0;
  let rockAdjTotal = 0;
  let rockValueTotal = 0;

  const rockAvgCost =
    parseFloat(document.getElementById("rockAvgCost").value) || 0;

  rockProducts.forEach((product) => {
    const input = document.getElementById(`rock_${product.product_id}`);
    if (input) {
      const currentQty = parseFloat(input.dataset.currentQty);
      const newQty = parseFloat(input.value) || 0;
      const adjustment = newQty - currentQty;

      rockCurrentTotal += currentQty;
      rockNewTotal += newQty;
      rockAdjTotal += adjustment;
      rockValueTotal += adjustment * rockAvgCost;
    }
  });

  document.getElementById("rockCurrentTotal").textContent =
    formatNumber(rockCurrentTotal);
  document.getElementById("rockNewTotal").textContent =
    formatNumber(rockNewTotal);
  document.getElementById("rockAdjustmentTotal").textContent =
    formatNumber(rockAdjTotal);
  document.getElementById("rockValueTotal").textContent =
    formatCurrency(rockValueTotal);

  // Grand totals
  const grandQtyAdj = sandAdjTotal + rockAdjTotal;
  const grandValueAdj = sandValueTotal + rockValueTotal;

  document.getElementById("grandTotalQty").textContent =
    formatNumber(grandQtyAdj) + " tonnes";
  document.getElementById("grandTotalValue").textContent =
    formatCurrency(grandValueAdj);

  // Color code grand total value
  const grandValueElement = document.getElementById("grandTotalValue");
  grandValueElement.className = "summary-value";
  if (grandValueAdj > 0) {
    grandValueElement.classList.add("success");
  } else if (grandValueAdj < 0) {
    grandValueElement.classList.add("danger");
  }
}

// Collect all adjustments
function collectAdjustments() {
  const adjustments = [];
  const sandAvgCost = parseFloat(document.getElementById("sandAvgCost").value);
  const rockAvgCost = parseFloat(document.getElementById("rockAvgCost").value);

  // Collect sand adjustments
  sandProducts.forEach((product) => {
    const input = document.getElementById(`sand_${product.product_id}`);
    if (input && input.value) {
      const currentQty = parseFloat(input.dataset.currentQty);
      const newQty = parseFloat(input.value);
      const adjustment = newQty - currentQty;
      const locationId = input.dataset.locationId;

      if (adjustment !== 0 && locationId) {
        adjustments.push({
          product_id: product.product_id,
          product_name: product.product_name,
          location_id: parseInt(locationId),
          quantity_adjustment: adjustment,
          unit_cost: sandAvgCost,
        });
      }
    }
  });

  // Collect rock adjustments
  rockProducts.forEach((product) => {
    const input = document.getElementById(`rock_${product.product_id}`);
    if (input && input.value) {
      const currentQty = parseFloat(input.dataset.currentQty);
      const newQty = parseFloat(input.value);
      const adjustment = newQty - currentQty;
      const locationId = input.dataset.locationId;

      if (adjustment !== 0 && locationId) {
        adjustments.push({
          product_id: product.product_id,
          product_name: product.product_name,
          location_id: parseInt(locationId),
          quantity_adjustment: adjustment,
          unit_cost: rockAvgCost,
        });
      }
    }
  });

  return adjustments;
}

// Apply stocktake - uses existing /api/movements/adjustment endpoint
async function applyStocktake() {
  // Validation
  const stocktakeDate = document.getElementById("stocktakeDate").value;
  const reference = document.getElementById("stocktakeReference").value;
  const sandAvgCost = parseFloat(document.getElementById("sandAvgCost").value);
  const rockAvgCost = parseFloat(document.getElementById("rockAvgCost").value);
  const notes = document.getElementById("stocktakeNotes").value;

  if (!stocktakeDate || !reference) {
    alert("Please fill in Stocktake Date and Reference");
    return;
  }

  if (!sandAvgCost || sandAvgCost <= 0) {
    alert("Please enter a valid Sand Average Cost");
    return;
  }

  if (!rockAvgCost || rockAvgCost <= 0) {
    alert("Please enter a valid Rock Average Cost");
    return;
  }

  // Collect adjustments
  const adjustments = collectAdjustments();

  if (adjustments.length === 0) {
    alert("No adjustments to apply. Please enter new quantities.");
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

    for (const adj of adjustments) {
      try {
        const response = await fetch("/api/movements/adjustment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            movement_date: stocktakeDate,
            product_id: adj.product_id,
            location_id: adj.location_id,
            quantity_adjustment: adj.quantity_adjustment,
            reason: reference,
            notes: `${notes} - Stocktake adjustment for ${adj.product_name}`,
            created_by: "Admin User",
          }),
        });

        if (response.ok) {
          successCount++;
        } else {
          failCount++;
          const error = await response.json();
          console.error(`Failed to adjust ${adj.product_name}:`, error);
        }
      } catch (error) {
        failCount++;
        console.error(`Error adjusting ${adj.product_name}:`, error);
      }
    }

    if (successCount > 0) {
      alert(
        `✅ Stocktake applied!\n\n` +
          `${successCount} adjustments successful\n` +
          `${failCount > 0 ? failCount + " adjustments failed\n" : ""}` +
          `Reference: ${reference}`
      );
      window.location.href = "operations.html";
    } else {
      alert("❌ Failed to apply stocktake. Check console for details.");
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
