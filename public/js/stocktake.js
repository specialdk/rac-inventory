// Stocktake Page JavaScript - Simplified Single Table
// Uses existing /api/movements/adjustment endpoint

let currentStock = [];
let products = [];

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
  // Set default date to today
  document.getElementById("stocktakeDate").valueAsDate = new Date();

  // Load data
  loadStocktakeData();

  // Add event listener for avg cost changes
  document.getElementById("avgCost").addEventListener("input", calculateTotals);
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

    // Render single table sorted by family group
    renderStocktakeTable();
    calculateTotals();
  } catch (error) {
    console.error("Error loading stocktake data:", error);
    alert("Error loading stocktake data");
  }
}

// Render unified stocktake table (sorted by family, no family labels)
function renderStocktakeTable() {
  const tbody = document.getElementById("stocktakeTableBody");
  tbody.innerHTML = "";

  // Define family sort order
  const familyOrder = {
    AGGREGATES: 1,
    DUST: 2,
    ROAD_BASE: 3,
    ROCK_ARMOR: 4,
    SAND: 5,
  };

  // Sort products by family group then by name
  const sortedProducts = [...products].sort((a, b) => {
    const familyA = familyOrder[a.family_group] || 99;
    const familyB = familyOrder[b.family_group] || 99;
    if (familyA !== familyB) return familyA - familyB;
    return a.product_name.localeCompare(b.product_name);
  });

  sortedProducts.forEach((product) => {
    // Find current stock for this product
    const stock = currentStock.find((s) => s.product_id === product.product_id);
    const currentQty = stock ? parseFloat(stock.quantity) : 0;
    const locationName = stock ? stock.location_name : "-";
    const locationId = stock ? stock.location_id : null;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${product.product_name}</strong></td>
      <td>${locationName}</td>
      <td style="text-align: right;">${formatNumber(currentQty)}</td>
      <td style="text-align: center;">
        <input 
          type="number" 
          class="form-control" 
          id="count_${product.product_id}" 
          data-product-id="${product.product_id}"
          data-product-name="${product.product_name}"
          data-current-qty="${currentQty}"
          data-location-id="${locationId || ""}"
          step="0.1" 
          placeholder="0.0"
          style="width: 120px; text-align: center; margin: 0 auto;"
          onchange="calculateTotals()"
        />
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Calculate all totals
function calculateTotals() {
  let totalAdjustment = 0;
  let totalValue = 0;

  const avgCost = parseFloat(document.getElementById("avgCost").value) || 0;

  products.forEach((product) => {
    const input = document.getElementById(`count_${product.product_id}`);
    if (input && input.value) {
      const currentQty = parseFloat(input.dataset.currentQty);
      const newQty = parseFloat(input.value) || 0;
      const adjustment = newQty - currentQty;

      totalAdjustment += adjustment;
      totalValue += adjustment * avgCost;
    }
  });

  document.getElementById("totalAdjustment").textContent =
    formatNumber(totalAdjustment) + " t";
  document.getElementById("totalValue").textContent =
    formatCurrency(totalValue);

  // Color code total value
  const totalValueElement = document.getElementById("totalValue");
  totalValueElement.className = "";
  if (totalValue > 0) {
    totalValueElement.style.color = "var(--success-color, green)";
  } else if (totalValue < 0) {
    totalValueElement.style.color = "var(--danger-color, red)";
  }
}

// Collect all adjustments
function collectAdjustments() {
  const adjustments = [];
  const avgCost = parseFloat(document.getElementById("avgCost").value);

  products.forEach((product) => {
    const input = document.getElementById(`count_${product.product_id}`);
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
          unit_cost: avgCost,
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
  const avgCost = parseFloat(document.getElementById("avgCost").value);
  const notes = document.getElementById("stocktakeNotes").value;

  if (!stocktakeDate || !reference) {
    alert("Please fill in Stocktake Date and Reference");
    return;
  }

  if (!avgCost || avgCost <= 0) {
    alert("Please enter a valid Average Cost");
    return;
  }

  // Collect adjustments
  const adjustments = collectAdjustments();

  if (adjustments.length === 0) {
    alert("No adjustments to apply. Please enter count quantities.");
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
