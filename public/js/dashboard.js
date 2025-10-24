// RAC Inventory - Dashboard Page JavaScript
// Handles real-time stock overview with compact layout

let stockData = [];

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
  };
  return names[group] || group;
}

// Load dashboard statistics
async function loadDashboardStats() {
  try {
    const response = await fetch("/api/dashboard/stats");
    const stats = await response.json();

    // Update header stats
    document.getElementById("headerTotalValue").textContent = formatCurrency(
      stats.totalInventoryValue || 0
    );

    // Update dashboard cards
    document.getElementById("productsWithStock").textContent =
      stats.productsWithStock || 0;
    document.getElementById("totalInventoryValue").textContent = formatCurrency(
      stats.totalInventoryValue || 0
    );
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
    renderStockTable(stockData);
  } catch (error) {
    console.error("Error loading stock data:", error);
    alert("Error loading stock data");
  }
}

// Render stock table with compact layout (GROUP column first)
function renderStockTable(data) {
  const tbody = document.querySelector("#stockTableContainer tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: #999;">
          No stock data available
        </td>
      </tr>
    `;
    return;
  }

  // Sort by family group, then by product name
  const familyOrder = {
    AGGREGATES: 1,
    DUST: 2,
    ROAD_BASE: 3,
    ROCK_ARMOR: 4,
    SAND: 5,
  };

  const sortedData = [...data].sort((a, b) => {
    const familyA = familyOrder[a.family_group] || 99;
    const familyB = familyOrder[b.family_group] || 99;
    if (familyA !== familyB) return familyA - familyB;
    return a.product_name.localeCompare(b.product_name);
  });

  sortedData.forEach((item) => {
    // Determine status badge class
    let statusClass = "badge-success";
    if (item.status === "LOW") {
      statusClass = "badge-danger";
    } else if (item.status === "HIGH") {
      statusClass = "badge-warning";
    }

    // Color code demand if high
    const demandColor =
      item.demand > item.quantity ? "color: red; font-weight: bold;" : "";

    const row = `
      <tr style="height: 40px;">
        <td style="padding: 0.4rem 0.5rem;"><small><strong>${formatFamilyGroup(
          item.family_group
        )}</strong></small></td>
        <td style="padding: 0.4rem 0.5rem;"><strong>${
          item.product_name
        }</strong></td>
        <td style="padding: 0.4rem 0.5rem;">${item.location_name}</td>
        <td style="text-align: right; padding: 0.4rem 0.5rem; ${
          item.quantity < item.min_stock_level ? "color: red;" : ""
        }">${formatNumber(item.quantity)} ${item.unit || "t"}</td>
        <td style="text-align: right; padding: 0.4rem 0.5rem; ${demandColor}">${formatNumber(
      item.demand || 0
    )}</td>
        <td style="text-align: right; padding: 0.4rem 0.5rem;">${formatCurrency(
          item.average_cost
        )}</td>
        <td style="text-align: right; padding: 0.4rem 0.5rem;">${formatCurrency(
          item.total_value
        )}</td>
        <td style="text-align: center; padding: 0.4rem 0.5rem;">
          <span class="badge ${statusClass}">${item.status}</span>
        </td>
      </tr>
    `;
    tbody.insertAdjacentHTML("beforeend", row);
  });
}

// Filter stock table based on search input
function filterStock() {
  const searchTerm = document.getElementById("searchStock").value.toLowerCase();

  if (searchTerm === "") {
    renderStockTable(stockData);
    return;
  }

  const filtered = stockData.filter((item) => {
    return (
      item.product_name.toLowerCase().includes(searchTerm) ||
      item.family_group.toLowerCase().includes(searchTerm) ||
      item.location_name.toLowerCase().includes(searchTerm) ||
      item.status.toLowerCase().includes(searchTerm)
    );
  });

  renderStockTable(filtered);
}
