// RAC Inventory - Dashboard Page JavaScript
// Handles real-time stock overview with compact layout and group filtering

let stockData = [];
let currentFilter = null; // Track current group filter

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
  loadDashboardStats();
  loadStockData();

  // Add event listener for search
  const searchInput = document.getElementById("searchStock");
  if (searchInput) {
    searchInput.addEventListener("input", filterStock);
  }

  // Add event listener for refresh button
  const refreshBtn = document.getElementById("refreshStock");
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadStockData();
    });
  }
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
    DUST: "DUST",
    ROAD_BASE: "ROAD BASE",
    ROCK_ARMOR: "ROCK ARMOR",
    SAND: "SAND",
    DIRT: "DIRT",
  };
  return names[group] || group;
}

// Calculate stats from filtered data
function calculateStats(data) {
  const totalTonnes = data.reduce(
    (sum, item) => sum + parseFloat(item.quantity || 0),
    0
  );
  const totalValue = data.reduce(
    (sum, item) => sum + parseFloat(item.total_value || 0),
    0
  );
  const uniqueProducts = new Set(data.map(item => item.product_id));
  const productsCount = uniqueProducts.size;

  return {
    productsWithStock: productsCount,
    totalTonnes: totalTonnes,
    totalInventoryValue: totalValue,
  };
}

// Update dashboard cards
function updateDashboardCards(data) {
  const stats = calculateStats(data);

  // Update cards
  document.getElementById("productsWithStock").textContent =
    stats.productsWithStock;
  document.getElementById("totalTonnes").textContent =
    formatNumber(stats.totalTonnes) + "t";
  document.getElementById("totalInventoryValue").textContent = formatCurrency(
    stats.totalInventoryValue
  );
  document.getElementById("headerTotalValue").textContent = formatCurrency(
    stats.totalInventoryValue
  );
}

// Load dashboard statistics
async function loadDashboardStats() {
  try {
    const response = await fetch("/api/dashboard/stats");
    const stats = await response.json();

    // Only update MTD stats (not inventory stats - those come from stock data)
    document.getElementById("mtdProduction").textContent =
      formatNumber(stats.mtdProduction || 0) + "t";
    document.getElementById("mtdSales").textContent =
      formatNumber(stats.mtdSales || 0) + "t";
  } catch (error) {
    console.error("Error loading dashboard stats:", error);
  }
}

// Load stock data
async function loadStockData() {
  try {
    const response = await fetch("/api/stock/current");
    stockData = await response.json();

    // Update cards with full data
    updateDashboardCards(stockData);

    // Render table
    renderStockTable(stockData);
  } catch (error) {
    console.error("Error loading stock data:", error);
    alert("Error loading stock data");
  }
}

// Filter by group
function filterByGroup(group) {
  if (currentFilter === group) {
    // Toggle off - show all
    currentFilter = null;
    updateDashboardCards(stockData);
    renderStockTable(stockData);
  } else {
    // Filter by group
    currentFilter = group;
    const filtered = stockData.filter((item) => item.family_group === group);
    updateDashboardCards(filtered);
    renderStockTable(filtered);
  }
}

// Render stock table with compact layout (GROUP column first)
// Render stock table with consolidated products and expandable locations
function renderStockTable(data) {
  const tbody = document.querySelector("#stockTableContainer tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 2rem; color: #999;">
          No stock data available
        </td>
      </tr>
    `;
    return;
  }

  // GROUP BY PRODUCT - Consolidate multiple locations
  const productMap = new Map();

  data.forEach((item) => {
    const key = item.product_id;

    if (!productMap.has(key)) {
      productMap.set(key, {
        product_id: item.product_id,
        product_name: item.product_name,
        family_group: item.family_group,
        unit: item.unit || "t",
        standard_sales_price: item.standard_sales_price,
        min_stock_level: item.min_stock_level,
        total_quantity: 0,
        total_value: 0,
        total_demand: 0,
        weighted_avg_cost: 0,
        locations: [],
      });
    }

    const product = productMap.get(key);
    product.total_quantity += parseFloat(item.quantity || 0);
    product.total_value += parseFloat(item.total_value || 0);
    product.total_demand += parseFloat(item.demand || 0);

    // Store location details
    product.locations.push({
      location_name: item.location_name,
      quantity: item.quantity,
      average_cost: item.average_cost,
    });
  });

  // Calculate weighted average cost
  productMap.forEach((product) => {
    if (product.total_quantity > 0) {
      product.weighted_avg_cost = product.total_value / product.total_quantity;
    }
  });

  // Convert to array and sort
  const consolidatedData = Array.from(productMap.values());

  const familyOrder = {
    AGGREGATES: 1,
    DIRT: 2,
    DUST: 3,
    ROAD_BASE: 4,
    ROCK_ARMOR: 5,
    SAND: 6,
  };

  const sortedData = consolidatedData.sort((a, b) => {
    const familyA = familyOrder[a.family_group] || 99;
    const familyB = familyOrder[b.family_group] || 99;
    if (familyA !== familyB) return familyA - familyB;
    return a.product_name.localeCompare(b.product_name);
  });

  sortedData.forEach((item) => {
    // Determine status
    let statusClass = "badge-success";
    let status = "NORMAL";
    if (item.total_quantity < item.min_stock_level) {
      statusClass = "badge-danger";
      status = "LOW";
    } else if (item.total_quantity > item.max_stock_level) {
      statusClass = "badge-warning";
      status = "HIGH";
    }

    // Color code demand if high
    const demandColor =
      item.total_demand > item.total_quantity
        ? "color: red; font-weight: bold;"
        : "";

    // Make group badge clickable
    const groupClass = `badge-${item.family_group.toLowerCase()}`;
    const activeClass =
      currentFilter === item.family_group
        ? "font-weight: bold; box-shadow: 0 0 0 2px #333;"
        : "";

    // Product row ID for expand/collapse
    const rowId = `product-${item.product_id}`;
    const hasMultipleLocations = item.locations.length > 1;

    // Main product row (consolidated totals)
    const row = `
      <tr style="height: 40px;" class="product-row" data-product-id="${
        item.product_id
      }">
        <td style="padding: 0.4rem 0.5rem;">
          <span class="badge ${groupClass}" 
                style="cursor: pointer; ${activeClass}" 
                onclick="filterByGroup('${item.family_group}')">
            <small><strong>${formatFamilyGroup(
              item.family_group
            )}</strong></small>
          </span>
        </td>
        <td style="padding: 0.4rem 0.5rem;">
          <strong>${item.product_name}</strong>
          ${
            hasMultipleLocations
              ? `<span style="cursor: pointer; color: #007bff; margin-left: 8px;" onclick="toggleLocations('${item.product_id}')">
              <strong id="toggle-${item.product_id}">+</strong>
            </span>`
              : ""
          }
        </td>
        <td style="padding: 0.4rem 0.5rem; color: #666;">
          ${
            hasMultipleLocations
              ? `${item.locations.length} locations`
              : item.locations[0].location_name
          }
        </td>
        <td style="text-align: right; padding: 0.4rem 0.5rem; ${
          item.total_quantity < item.min_stock_level ? "color: red;" : ""
        }">${formatNumber(item.total_quantity)} ${item.unit}</td>
        <td style="text-align: right; padding: 0.4rem 0.5rem; ${demandColor}">${formatNumber(
      item.total_demand
    )}</td>
        <td style="text-align: right">$${item.weighted_avg_cost.toFixed(2)}</td>
        <td style="text-align: right">$${parseFloat(
          item.standard_sales_price || 0
        ).toFixed(2)}</td>
        <td style="text-align: right; padding: 0.4rem 0.5rem;">${formatCurrency(
          item.total_value
        )}</td>
        <td style="text-align: center; padding: 0.4rem 0.5rem;">
          <span class="badge ${statusClass}">${status}</span>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML("beforeend", row);

    // Add location breakdown rows (hidden by default, sorted by quantity desc)
    if (hasMultipleLocations) {
      // Sort locations by quantity descending
      const sortedLocations = [...item.locations].sort(
        (a, b) => parseFloat(b.quantity) - parseFloat(a.quantity)
      );

      sortedLocations.forEach((loc) => {
        const locRow = `
          <tr class="location-row" id="loc-${
            item.product_id
          }" style="display: none; background-color: #f8f9fa;">
            <td></td>
            <td style="padding: 0.4rem 0.5rem 0.4rem 2rem; color: #666;">
              <em>└─ ${loc.location_name}</em>
            </td>
            <td></td>
            <td style="text-align: right; padding: 0.4rem 0.5rem; color: #666;">
              ${formatNumber(loc.quantity)} ${item.unit}
            </td>
            <td colspan="5"></td>
          </tr>
        `;
        tbody.insertAdjacentHTML("beforeend", locRow);
      });
    }
  });
}

// Toggle location breakdown visibility
function toggleLocations(productId) {
  const locationRows = document.querySelectorAll(`#loc-${productId}`);
  const toggle = document.getElementById(`toggle-${productId}`);

  locationRows.forEach((row) => {
    if (row.style.display === "none") {
      row.style.display = "table-row";
      toggle.textContent = "−";
    } else {
      row.style.display = "none";
      toggle.textContent = "+";
    }
  });
}

// Filter stock table based on search input
function filterStock() {
  const searchTerm = document.getElementById("searchStock").value.toLowerCase();

  if (searchTerm === "") {
    const baseData = currentFilter
      ? stockData.filter((item) => item.family_group === currentFilter)
      : stockData;
    updateDashboardCards(baseData);
    renderStockTable(baseData);
    return;
  }

  const baseData = currentFilter
    ? stockData.filter((item) => item.family_group === currentFilter)
    : stockData;

  const filtered = baseData.filter((item) => {
    return (
      item.product_name.toLowerCase().includes(searchTerm) ||
      item.family_group.toLowerCase().includes(searchTerm) ||
      item.location_name.toLowerCase().includes(searchTerm) ||
      item.status.toLowerCase().includes(searchTerm)
    );
  });

  updateDashboardCards(filtered); // ← ADD THIS LINE
  renderStockTable(filtered);
}
