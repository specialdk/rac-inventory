// RAC Inventory - Operations Page JavaScript
// This file handles Production, Demand, and Sales entry modals

let productsData = [];
let locationsData = [];
let customersData = [];
let vehiclesData = [];
let driversData = [];

// Initialize on page load
document.addEventListener("DOMContentLoaded", async function () {
  setDefaultDate();
  await loadDropdowns();
  await loadStats();
  await loadRecentMovements();
  setupSaleProductListener(); // Setup sale product listener

  // ============================================
  // BUSINESS RULE 1: Auto-suggest stockpile when product selected
  // ============================================
  const productionProductSelect = document.getElementById("productionProduct");
  const productionCostInput = document.getElementById("productionCost");
  const productionLocationSelect =
    document.getElementById("productionLocation");

  productionProductSelect.addEventListener("change", async (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];

    // Auto-fill cost (existing functionality)
    if (selectedOption.dataset.cost) {
      productionCostInput.value = selectedOption.dataset.cost;
    }

    // NEW: Auto-suggest stockpile for this product
    const productId = e.target.value;
    if (productId) {
      try {
        const response = await fetch(`/api/locations/suggest/${productId}`);
        const data = await response.json();

        if (data.suggested && data.location) {
          // Set the suggested location
          productionLocationSelect.value = String(data.location.location_id);
          console.log(`✓ ${data.message}`);
        } else {
          // No suggestion - let user choose
          console.log(`No stockpile assigned yet for this product`);
        }
      } catch (error) {
        console.error("Error getting suggested location:", error);
      }
    }
  });
});

// Set default dates to today
function setDefaultDate() {
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("productionDate").value = today;
  document.getElementById("saleDate").value = today;
  if (document.getElementById("demandDate")) {
    document.getElementById("demandDate").value = today;
  }
}

// Load all dropdowns
async function loadDropdowns() {
  try {
    // Load products
    const productsRes = await fetch("/api/products");
    productsData = await productsRes.json();
    const productSelects = [
      document.getElementById("productionProduct"),
      document.getElementById("saleProduct"),
    ];
    if (document.getElementById("demandProduct")) {
      productSelects.push(document.getElementById("demandProduct"));
    }

    productsData.forEach((product) => {
      productSelects.forEach((select) => {
        if (select) {
          const option = new Option(product.product_name, product.product_id);
          option.dataset.cost = product.production_cost_per_unit;
          option.dataset.price = product.standard_price_per_unit;
          select.add(option);
        }
      });
    });

    // Load locations
    const locationsRes = await fetch("/api/locations");
    locationsData = await locationsRes.json();

    // Load production locations
    const productionLocationSelect =
      document.getElementById("productionLocation");
    locationsData.forEach((location) => {
      if (productionLocationSelect) {
        productionLocationSelect.add(
          new Option(location.location_name, location.location_id)
        );
      }
    });

    // Load sale locations using the smart function (will filter by product when selected)
    await loadStockpileDropdown(null, "saleLocation");

    // Load customers
    const customersRes = await fetch("/api/customers");
    customersData = await customersRes.json();
    const customerSelects = [document.getElementById("saleCustomer")];
    if (document.getElementById("demandCustomer")) {
      customerSelects.push(document.getElementById("demandCustomer"));
    }

    customersData.forEach((customer) => {
      customerSelects.forEach((select) => {
        if (select) {
          select.add(new Option(customer.customer_name, customer.customer_id));
        }
      });
    });

    // Load vehicles
    const vehiclesRes = await fetch("/api/vehicles");
    vehiclesData = await vehiclesRes.json();
    const saleVehicleSelect = document.getElementById("saleVehicle");

    vehiclesData.forEach((vehicle) => {
      saleVehicleSelect.add(
        new Option(
          `${vehicle.registration} - ${vehicle.vehicle_type}`,
          vehicle.vehicle_id
        )
      );
    });

    // Load drivers
    const driversRes = await fetch("/api/drivers");
    driversData = await driversRes.json();
    const prodOperatorSelect = document.getElementById("productionOperator");
    const saleDriverSelect = document.getElementById("saleDriver");

    driversData.forEach((driver) => {
      prodOperatorSelect.add(new Option(driver.driver_name, driver.driver_id));
      saleDriverSelect.add(new Option(driver.driver_name, driver.driver_id));
    });

    // Set active counts
    document.getElementById("activeVehicles").textContent = vehiclesData.length;
    document.getElementById("activeOperators").textContent = driversData.length;
  } catch (error) {
    console.error("Error loading dropdowns:", error);
  }
}

// Reusable function to load stockpile dropdown with optional product filter
async function loadStockpileDropdown(
  productId = null,
  targetSelectId = "saleLocation"
) {
  console.log("🎯 loadStockpileDropdown called with:", {
    productId,
    targetSelectId,
  });

  const saleFromSelect = document.getElementById(targetSelectId);

  if (!saleFromSelect) {
    console.error("❌ Could not find element:", targetSelectId);
    return;
  }

  console.log("✅ Found dropdown element");
  saleFromSelect.innerHTML = '<option value="">Select From Stockpile</option>';

  try {
    if (productId) {
      // Filter by product stock - using correct endpoint
      const stockRes = await fetch(`/api/stock/by-product/${productId}`);
      const stockData = await stockRes.json();

      const locationsWithStock = stockData.stock_locations || [];

      if (locationsWithStock.length > 0) {
        locationsWithStock.forEach((stock) => {
          const qty = parseFloat(stock.quantity) || 0;
          saleFromSelect.add(
            new Option(
              `${stock.location_name} (${qty.toFixed(1)}t available)`,
              stock.location_id
            )
          );
        });

        // Auto-select if only one option
        if (locationsWithStock.length === 1) {
          saleFromSelect.value = locationsWithStock[0].location_id;
        }
        return;
      }
    }

    // Default: load all stockpiles
    const locationsRes = await fetch(
      "/api/locations?location_type=STOCKPILE&is_active=true"
    );
    const locations = await locationsRes.json();

    locations.forEach((location) => {
      saleFromSelect.add(
        new Option(location.location_name, location.location_id)
      );
    });
  } catch (error) {
    console.error("Error loading stockpile dropdown:", error);
  }
}

// When sale product changes, filter stockpile locations
function setupSaleProductListener() {
  const saleProductSelect = document.getElementById("saleProduct");

  if (saleProductSelect) {
    console.log("✅ Found saleProduct element, adding listener");

    saleProductSelect.addEventListener("change", async (e) => {
      const productId = e.target.value;
      console.log("🔍 Product changed to:", productId);

      if (productId) {
        console.log("📞 Calling loadStockpileDropdown...");
        await loadStockpileDropdown(productId, "saleLocation");
        console.log("✅ loadStockpileDropdown completed");
      }
    });
  } else {
    console.error("❌ saleProduct element not found!");
  }
}

// Load today's stats
async function loadStats() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Production stats
    const prodRes = await fetch(`/api/movements?type=Production&date=${today}`);
    const prodData = await prodRes.json();
    const prodTotal = prodData.reduce(
      (sum, item) => sum + parseFloat(item.quantity),
      0
    );

    // Sales stats
    const salesRes = await fetch(`/api/movements?type=Sales&date=${today}`);
    const salesData = await salesRes.json();
    const salesTotal = salesData.reduce(
      (sum, item) => sum + parseFloat(item.quantity),
      0
    );

    // Update UI
    const todayProdElement = document.getElementById("todayProduction");
    const todaySalesElement = document.getElementById("todaySales");

    if (todayProdElement) {
      todayProdElement.textContent = prodTotal.toFixed(1);
    }
    if (todaySalesElement) {
      todaySalesElement.textContent = salesTotal.toFixed(1);
    }
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

// Load recent movements
async function loadRecentMovements() {
  try {
    const response = await fetch("/api/movements?limit=10");
    const movements = await response.json();

    const container = document.getElementById("movementsTableContainer");

    // Some pages don't have movements table container - skip silently
    if (!container) {
      return;
    }

    // Create table structure if it doesn't exist
    let table = container.querySelector("table");
    if (!table) {
      container.innerHTML = `
        <table class="movements-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Product</th>
              <th>Location</th>
              <th class="text-right">Quantity</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      `;
      table = container.querySelector("table");
    }

    const tbody = table.querySelector("tbody");
    tbody.innerHTML = "";

    movements.forEach((movement) => {
      const row = document.createElement("tr");

      // Format date
      const date = new Date(movement.movement_date);
      const dateStr = date.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
      });
      const timeStr = date.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Movement type badge
      let badgeClass = "badge-primary";
      if (movement.movement_type === "Production") badgeClass = "badge-success";
      if (movement.movement_type === "Sales") badgeClass = "badge-info";
      if (movement.movement_type === "Adjustment") badgeClass = "badge-warning";

      row.innerHTML = `
        <td>${dateStr}<br><small class="text-muted">${timeStr}</small></td>
        <td><span class="badge ${badgeClass}">${
        movement.movement_type
      }</span></td>
        <td>${movement.product_name || "-"}</td>
        <td>${
          movement.to_location_name || movement.from_location_name || "-"
        }</td>
        <td class="text-right">${parseFloat(movement.quantity).toFixed(1)}t</td>
        <td class="text-muted">${movement.reference_number || "-"}</td>
      `;

      tbody.appendChild(row);
    });
  } catch (error) {
    console.error("Error loading recent movements:", error);
  }
}

// ============================================
// PRODUCTION MODAL
// ============================================
function openProductionModal() {
  document.getElementById("productionModal").style.display = "flex";
  document.getElementById("productionForm").reset();
  setDefaultDate();
}

function closeProductionModal() {
  document.getElementById("productionModal").style.display = "none";
}

// ============================================
// BUSINESS RULE 2: Prevent mixing products in same location
// ============================================
async function saveProduction() {
  const formData = {
    movement_date: document.getElementById("productionDate").value,
    product_id: document.getElementById("productionProduct").value,
    to_location_id: document.getElementById("productionLocation").value,
    quantity: parseFloat(document.getElementById("productionQuantity").value),
    unit_cost: parseFloat(document.getElementById("productionCost").value),
    driver_id: document.getElementById("productionOperator").value || null,
    reference_number: document.getElementById("productionReference").value,
    notes: document.getElementById("productionNotes").value,
  };

  // Validate
  if (
    !formData.movement_date ||
    !formData.product_id ||
    !formData.to_location_id ||
    !formData.quantity ||
    !formData.unit_cost
  ) {
    alert("Please fill in all required fields");
    return;
  }

  try {
    const response = await fetch("/api/movements/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const data = await response.json();

    if (!response.ok) {
      // NEW: Handle mixed product error from backend
      alert(data.error || "Failed to save production");
      return;
    }

    alert("Production saved successfully!");
    closeProductionModal();
    await loadRecentMovements();
    await loadStats();
  } catch (error) {
    console.error("Error saving production:", error);
    alert("Error saving production");
  }
}

// ============================================
// DEMAND MODAL
// ============================================
function openDemandModal() {
  if (!document.getElementById("demandModal")) {
    alert("Demand entry feature not yet implemented");
    return;
  }
  document.getElementById("demandModal").style.display = "flex";
  document.getElementById("demandForm").reset();
  setDefaultDate();
}

function closeDemandModal() {
  if (document.getElementById("demandModal")) {
    document.getElementById("demandModal").style.display = "none";
  }
}

async function saveDemand() {
  const formData = {
    movement_date: document.getElementById("demandDate").value,
    product_id: document.getElementById("demandProduct").value,
    quantity: parseFloat(document.getElementById("demandQuantity").value),
    customer_id: document.getElementById("demandCustomer").value,
    po_number: document.getElementById("demandPO").value,
    reference_number: document.getElementById("demandReference").value,
    notes: document.getElementById("demandNotes").value,
  };

  // Validate
  if (
    !formData.movement_date ||
    !formData.product_id ||
    !formData.quantity ||
    !formData.customer_id ||
    !formData.po_number
  ) {
    alert("Please fill in all required fields");
    return;
  }

  try {
    const response = await fetch("/api/movements/demand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to save demand");
      return;
    }

    alert("Demand saved successfully!");
    closeDemandModal();
    await loadRecentMovements();
    await loadStats();
  } catch (error) {
    console.error("Error saving demand:", error);
    alert("Error saving demand");
  }
}

// ============================================
// SALES MODAL
// ============================================
function openSalesModal() {
  document.getElementById("salesModal").style.display = "flex";
  document.getElementById("salesForm").reset();
  setDefaultDate();
}

function closeSalesModal() {
  document.getElementById("salesModal").style.display = "none";
}

function updateSalePrice() {
  const selectedOption =
    document.getElementById("saleProduct").selectedOptions[0];
  const priceInput = document.getElementById("salePrice");

  if (selectedOption && selectedOption.dataset.price) {
    priceInput.value = selectedOption.dataset.price;
  } else {
    priceInput.value = "";
  }
}

async function saveSales() {
  const formData = {
    movement_date: document.getElementById("saleDate").value,
    product_id: document.getElementById("saleProduct").value,
    from_location_id: document.getElementById("saleLocation").value,
    quantity: parseFloat(document.getElementById("saleQuantity").value),
    unit_price: parseFloat(document.getElementById("salePrice").value),
    customer_id: document.getElementById("saleCustomer").value,
    vehicle_id: document.getElementById("saleVehicle").value || null,
    driver_id: document.getElementById("saleDriver").value || null,
    docket_number: document.getElementById("saleDocket").value,
    reference_number: document.getElementById("saleReference").value,
    notes: document.getElementById("saleNotes").value,
  };

  // Validate
  if (
    !formData.movement_date ||
    !formData.product_id ||
    !formData.from_location_id ||
    !formData.quantity ||
    !formData.unit_price ||
    !formData.customer_id
  ) {
    alert("Please fill in all required fields");
    return;
  }

  try {
    const response = await fetch("/api/movements/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to save sale");
      return;
    }

    alert("Sale saved successfully!");
    closeSalesModal();
    await loadRecentMovements();
    await loadStats();
  } catch (error) {
    console.error("Error saving sale:", error);
    alert("Error saving sale");
  }
}

// Close modals when clicking outside
window.onclick = function (event) {
  if (event.target.classList.contains("modal")) {
    event.target.style.display = "none";
  }
};

// ============================================================
// OPERATIONS PAGE - ADD MOVEMENT TYPE FILTER FUNCTION
// Add this to the END of your operations.js file
// ============================================================

// Filter movements by type
function filterMovementsByType() {
  const filterValue = document
    .getElementById("movementTypeFilter")
    .value.toUpperCase();
  const tbody = document.querySelector("#movementsTableContainer tbody");

  if (!tbody) return;

  const rows = tbody.querySelectorAll("tr");

  rows.forEach((row) => {
    if (filterValue === "" || filterValue === "ALL") {
      // Show all rows
      row.style.display = "";
    } else {
      // Get the movement type badge from the second column
      const badge = row.querySelector("td:nth-child(2) .badge");

      if (badge) {
        const movementType = badge.textContent.trim().toUpperCase();

        // Show row if it matches the filter
        if (movementType === filterValue) {
          row.style.display = "";
        } else {
          row.style.display = "none";
        }
      }
    }
  });
}
