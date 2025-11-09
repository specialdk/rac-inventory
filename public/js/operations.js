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
  await loadRecentMovementsWithFilter();
  setupSaleProductListener(); // Setup sale product listener
  setupSalesVehicleListener(); // ADD THIS LINE

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

    // Production Operator - hardcoded codes (RIA, RM, RE)
    const productionOperators = [
      { code: "RIA", name: "RIA" },
      { code: "RM", name: "RM" },
      { code: "RE", name: "RE" },
    ];

    productionOperators.forEach((operator) => {
      prodOperatorSelect.add(new Option(operator.name, operator.code));
    });

    // Sales Driver - load all drivers from database
    driversData.forEach((driver) => {
      saleDriverSelect.add(new Option(driver.driver_name, driver.driver_id));
    });

    // Load carriers
    const carriersResponse = await fetch("/api/carriers");
    const carriers = await carriersResponse.json();
    const carrierSelect = document.getElementById("saleCarrier");
    carriers.forEach((carrier) => {
      const option = document.createElement("option");
      option.value = carrier.carrier_id;
      option.textContent = carrier.carrier_name;
      carrierSelect.appendChild(option);
    });

    // Load deliveries (NEW)
    const deliveriesRes = await fetch("/api/deliveries/active");
    const deliveriesData = await deliveriesRes.json();
    const saleDeliverySelect = document.getElementById("saleDelivery");

    deliveriesData
      .filter((d) => d.is_active)
      .forEach((delivery) => {
        saleDeliverySelect.add(
          new Option(delivery.delivery_name, delivery.delivery_id)
        );
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
// FIXED: Use correct API parameters
async function loadStats() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Production stats - FIXED PARAMETERS
    const prodRes = await fetch(
      `/api/movements?movement_type=PRODUCTION&date_from=${today}&date_to=${today}`
    );
    const prodData = await prodRes.json();
    const prodTotal = prodData.reduce(
      (sum, item) => sum + parseFloat(item.quantity),
      0
    );

    // Sales stats - FIXED PARAMETERS
    const salesRes = await fetch(
      `/api/movements?movement_type=SALES&date_from=${today}&date_to=${today}`
    );
    const salesData = await salesRes.json();
    const salesTotal = salesData.reduce(
      (sum, item) => sum + Math.abs(parseFloat(item.quantity)),
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

    console.log("✅ Stats loaded:", {
      production: prodTotal.toFixed(1),
      sales: salesTotal.toFixed(1),
    });
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
              <th>Customer</th>
              <th>Docket #</th>
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

      // Format date (use movement_date for the DATE)
      const date = new Date(movement.movement_date);
      const dateStr = date.toLocaleDateString("en-AU", {
        day: "2-digit",
        month: "short",
      });

      // Format time (use created_at for the actual TIME)
      const createdDate = new Date(movement.created_at);
      const timeStr = createdDate.toLocaleTimeString("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Movement type badge
      // Movement type badge
      let badgeClass = "badge-primary";
      if (movement.movement_type === "PRODUCTION") badgeClass = "badge-success";
      if (movement.movement_type === "SALES") badgeClass = "badge-info";
      if (movement.movement_type === "ADJUSTMENT") badgeClass = "badge-warning";
      if (movement.movement_type === "DEMAND") badgeClass = "badge-secondary";
      if (movement.movement_type === "EDIT") badgeClass = "badge-purple"; // Changed to purple
      if (movement.movement_type === "CANCEL") badgeClass = "badge-danger"; // Red for cancel
      if (movement.movement_type === "TRANSFER") badgeClass = "badge-info-dark";

      row.innerHTML = `
  <td>${dateStr} <small class="text-muted">${timeStr}</small></td>
  <td><span class="badge ${badgeClass}">${movement.movement_type}</span></td>
  <td>${movement.product_name || "-"}</td>
  <td>${movement.customer_name || "-"}</td>
  <td>${
    movement.docket_number
      ? `<a href="/weighbridge-delivery-docket.html?docket=${movement.docket_number}" target="_blank" style="color: #007bff; text-decoration: none;">${movement.docket_number}</a>`
      : "-"
  }</td>
  <td>${movement.to_location_name || movement.from_location_name || "-"}</td>
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
    reference_number: document.getElementById("productionReference").value,
    notes: document.getElementById("productionNotes").value,
    created_by: document.getElementById("productionOperator").value || "system",
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

    if (!response.ok) {
      const data = await response.json();
      alert(data.error || "Failed to save production");
      return;
    }

    const data = await response.json();

    alert("Production saved successfully!");
    closeProductionModal();
    await loadRecentMovementsWithFilter();
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
  const futureSaleDate = document.getElementById("demandDate").value;
  const userNotes = document.getElementById("demandNotes").value;

  // Use TODAY for movement_date (when demand was recorded)
  const today = new Date().toISOString().split("T")[0];

  // Add future date to notes
  const combinedNotes = `Requested delivery: ${futureSaleDate}${
    userNotes ? "\n" + userNotes : ""
  }`;

  const formData = {
    movement_date: today, // TODAY (when demand was entered)
    product_id: document.getElementById("demandProduct").value,
    quantity: parseFloat(document.getElementById("demandQuantity").value),
    customer_id: document.getElementById("demandCustomer").value,
    po_number: document.getElementById("demandPO").value,
    reference_number: document.getElementById("demandReference").value,
    notes: combinedNotes, // Include the requested delivery date
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
    await loadRecentMovementsWithFilter();
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

// ============================================
// AUTO-CALCULATE NET WEIGHT FOR SALES
// ============================================
function calculateNetWeight() {
  const grossWeight =
    parseFloat(document.getElementById("saleGrossWeight").value) || 0;
  const tareWeight =
    parseFloat(document.getElementById("saleTareWeight").value) || 0;
  const netWeight = grossWeight - tareWeight;

  const netWeightInput = document.getElementById("saleNetWeight");

  if (netWeight > 0) {
    netWeightInput.value = netWeight.toFixed(2);
    netWeightInput.style.color = "#28a745"; // Green for valid
  } else if (grossWeight > 0 || tareWeight > 0) {
    netWeightInput.value = netWeight.toFixed(2);
    netWeightInput.style.color = "#dc3545"; // Red for negative
  } else {
    netWeightInput.value = "";
    netWeightInput.style.color = "#000";
  }
}

async function saveSales() {
  const grossWeight =
    parseFloat(document.getElementById("saleGrossWeight").value) || 0;
  const tareWeight =
    parseFloat(document.getElementById("saleTareWeight").value) || 0;
  const netWeight = grossWeight - tareWeight;

  const formData = {
    movement_date: document.getElementById("saleDate").value,
    product_id: document.getElementById("saleProduct").value,
    from_location_id: document.getElementById("saleLocation").value,
    gross_weight: grossWeight,
    tare_weight: tareWeight,
    quantity: netWeight, // NET weight goes into quantity field
    unit_price: parseFloat(document.getElementById("salePrice").value),
    customer_id: document.getElementById("saleCustomer").value,
    vehicle_id: document.getElementById("saleVehicle").value || null,
    driver_id: document.getElementById("saleDriver").value || null,
    delivery_id: document.getElementById("saleDelivery").value || null,
    carrier_id: document.getElementById("saleCarrier").value || null,
    reference_number: document.getElementById("saleReference").value,
    notes: document.getElementById("saleNotes").value,
  };

  // Validate net weight is positive
  if (netWeight <= 0) {
    alert("Net Weight must be positive. Check Gross and Tare weights.");
    return;
  }

  // Validate required fields
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

  // Note: Docket number is now AUTO-ASSIGNED by backend

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

    const result = await response.json();
    const docketNumber = result.movement.docket_number;

    // NEW: Mark tare as used if it was auto-populated
    const tareWeightInput = document.getElementById("saleTareWeight");
    if (tareWeightInput.dataset.tareId) {
      await markTareAsUsed(tareWeightInput.dataset.tareId, docketNumber);
    }

    // Close the sales modal first
    closeSalesModal();

    // Show docket action modal with auto-assigned docket number
    showDocketModal(docketNumber);

    // Refresh data
    await loadRecentMovementsWithFilter();
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

// ============================================
// DOCKET ACTION MODAL
// ============================================
function showDocketModal(docketNumber) {
  // Create modal HTML
  const modalHTML = `
    <div id="docketActionModal" class="modal" style="display: flex;">
      <div class="modal-content" style="max-width: 500px;">
        <h2 style="margin-bottom: 20px;">✅ Sale Saved Successfully!</h2>
        
        <p style="font-size: 16px; margin-bottom: 30px;">
          Docket <strong>${docketNumber}</strong> has been created.
        </p>
        
        <div style="display: flex; gap: 15px; justify-content: center;">
          <button class="btn-primary" onclick="printDocket('${docketNumber}')">
            🖨️ Print Now
          </button>
          <button class="btn-secondary" onclick="viewDocket('${docketNumber}')">
            📄 View Docket
          </button>
          <button class="btn-secondary" onclick="closeDocketModal()">
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  `;

  // Add to body
  document.body.insertAdjacentHTML("beforeend", modalHTML);
}

function printDocket(docketNumber) {
  // Open docket in new window and trigger print
  const printWindow = window.open(
    `/weighbridge-delivery-docket.html?docket=${docketNumber}&autoprint=true`,
    "_blank",
    "width=900,height=800"
  );
  closeDocketModal();
}

function viewDocket(docketNumber) {
  // Open docket in new tab
  window.open(
    `/weighbridge-delivery-docket.html?docket=${docketNumber}`,
    "_blank"
  );
  closeDocketModal();
}

function closeDocketModal() {
  const modal = document.getElementById("docketActionModal");
  if (modal) {
    modal.remove();
  }
}

// ============================================
// FILTER MOVEMENTS
// ============================================

// Store all movements for filtering
let allMovements = [];

// Modified loadRecentMovements to store data
async function loadRecentMovementsWithFilter() {
  try {
    const response = await fetch("/api/movements?limit=50"); // Get more for filtering
    allMovements = await response.json();

    // Populate customer filter dropdown
    populateCustomerFilter();

    // Display filtered movements
    filterMovements();
  } catch (error) {
    console.error("Error loading recent movements:", error);
  }
}

// Populate customer filter dropdown
function populateCustomerFilter() {
  const customerFilter = document.getElementById("customerFilter");

  if (!customerFilter) return;

  // Get unique customers from movements
  const customers = [
    ...new Set(
      allMovements.filter((m) => m.customer_name).map((m) => m.customer_name)
    ),
  ].sort();

  // Clear existing options (except "All Customers")
  customerFilter.innerHTML = '<option value="">All Customers</option>';

  // Add customer options
  customers.forEach((customer) => {
    const option = document.createElement("option");
    option.value = customer;
    option.textContent = customer;
    customerFilter.appendChild(option);
  });
}

// Filter movements based on selected filters
function filterMovements() {
  const customerFilter = document
    .getElementById("customerFilter")
    ?.value.toLowerCase();
  const typeFilter = document.getElementById("typeFilter")?.value.toUpperCase();
  const searchText = document
    .getElementById("searchMovements")
    ?.value.toLowerCase();

  // Filter movements
  let filtered = allMovements.filter((movement) => {
    // Customer filter
    if (
      customerFilter &&
      (!movement.customer_name ||
        !movement.customer_name.toLowerCase().includes(customerFilter))
    ) {
      return false;
    }

    // Type filter
    if (typeFilter && movement.movement_type !== typeFilter) {
      return false;
    }

    // Search filter (searches across multiple fields)
    if (searchText) {
      const searchableText = [
        movement.product_name,
        movement.customer_name,
        movement.docket_number,
        movement.reference_number,
        movement.to_location_name,
        movement.from_location_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      if (!searchableText.includes(searchText)) {
        return false;
      }
    }

    return true;
  });

  // Display filtered movements
  displayMovements(filtered);
}

// Display movements in table
function displayMovements(movements) {
  const container = document.getElementById("movementsTableContainer");

  if (!container) return;

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
            <th>Customer</th>
            <th>Docket #</th>
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

  if (movements.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="8" style="text-align: center; padding: 20px; color: #999;">No movements found</td></tr>';
    return;
  }

  movements.forEach((movement) => {
    const row = document.createElement("tr");

    // Format date (use movement_date for the DATE)
    const date = new Date(movement.movement_date);
    const dateStr = date.toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
    });

    // Format time (use created_at for the actual TIME)
    const createdDate = new Date(movement.created_at);
    const timeStr = createdDate.toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
    });

    // Movement type badge
    let badgeClass = "badge-primary";
    if (movement.movement_type === "PRODUCTION") badgeClass = "badge-success";
    if (movement.movement_type === "SALES") badgeClass = "badge-info";
    if (movement.movement_type === "ADJUSTMENT") badgeClass = "badge-warning";
    if (movement.movement_type === "DEMAND") badgeClass = "badge-secondary";
    if (movement.movement_type === "EDIT") badgeClass = "badge-purple"; // Changed to purple
    if (movement.movement_type === "CANCEL") badgeClass = "badge-danger"; // Red for cancel
    if (movement.movement_type === "TRANSFER") badgeClass = "badge-info-dark";
    row.innerHTML = `
      <td>${dateStr} <small class="text-muted">${timeStr}</small></td>
      <td><span class="badge ${badgeClass}">${
      movement.movement_type
    }</span></td>
      <td>${movement.product_name || "-"}</td>
      <td>${movement.customer_name || "-"}</td>
      <td>${
        movement.docket_number
          ? `<a href="/weighbridge-delivery-docket.html?docket=${movement.docket_number}" target="_blank" style="color: #007bff; text-decoration: none;">${movement.docket_number}</a>`
          : "-"
      }</td>
      <td>${
        movement.to_location_name || movement.from_location_name || "-"
      }</td>
      <td class="text-right">${parseFloat(movement.quantity).toFixed(1)}t</td>
      <td class="text-muted">${movement.reference_number || "-"}</td>
    `;

    tbody.appendChild(row);
  });
}

// Refresh movements (reload from API)
async function refreshMovements() {
  await loadRecentMovementsWithFilter();
}

// ============================================
// STOCK ADJUSTMENT / TRANSFER MODAL
// ============================================
function openAdjustmentModal() {
  document.getElementById("adjustmentModal").style.display = "flex";
  document.getElementById("adjustmentForm").reset();

  // Set today's date
  const today = new Date().toISOString().split("T")[0];
  document.getElementById("adjustmentDate").value = today;

  // Load products
  loadAdjustmentProducts();
  loadAdjustmentLocations();
}

function closeAdjustmentModal() {
  document.getElementById("adjustmentModal").style.display = "none";
}

function toggleAdjustmentType() {
  const type = document.getElementById("adjustmentType").value;
  const adjustmentFields = document.getElementById("adjustmentFields");
  const transferFields = document.getElementById("transferFields");

  if (type === "ADJUSTMENT") {
    adjustmentFields.style.display = "block";
    transferFields.style.display = "none";
  } else if (type === "TRANSFER") {
    adjustmentFields.style.display = "none";
    transferFields.style.display = "block";
  } else {
    adjustmentFields.style.display = "none";
    transferFields.style.display = "none";
  }
}

async function loadAdjustmentProducts() {
  try {
    const response = await fetch("/api/products");
    const products = await response.json();

    const adjustmentProductSelect =
      document.getElementById("adjustmentProduct");
    const transferProductSelect = document.getElementById("transferProduct");

    products.forEach((product) => {
      adjustmentProductSelect.add(
        new Option(product.product_name, product.product_id)
      );
      transferProductSelect.add(
        new Option(product.product_name, product.product_id)
      );
    });
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

async function loadAdjustmentLocations() {
  try {
    const response = await fetch("/api/locations?is_active=true");
    const locations = await response.json();

    const adjustmentLocationSelect =
      document.getElementById("adjustmentLocation");

    locations.forEach((location) => {
      adjustmentLocationSelect.add(
        new Option(location.location_name, location.location_id)
      );
    });
  } catch (error) {
    console.error("Error loading locations:", error);
  }
}

async function loadTransferLocations() {
  const productId = document.getElementById("transferProduct").value;

  if (!productId) return;

  try {
    // Load locations with stock for this product
    const stockRes = await fetch(`/api/stock/by-product/${productId}`);
    const stockData = await stockRes.json();

    const fromSelect = document.getElementById("transferFromLocation");
    const toSelect = document.getElementById("transferToLocation");

    // Clear existing
    fromSelect.innerHTML = '<option value="">Select From Location</option>';
    toSelect.innerHTML = '<option value="">Select To Location</option>';

    // Get all locations
    const locationsRes = await fetch("/api/locations?is_active=true");
    const allLocations = await locationsRes.json();

    const locationsWithStock = stockData.stock_locations || [];

    // FROM: ALL active locations (not just those with stock)
    // This allows transferring from Production even if stock was added temporarily
    allLocations.forEach((location) => {
      // Find stock quantity for this location if it exists
      const stock = locationsWithStock.find(
        (s) => s.location_id === location.location_id
      );
      const qty = stock ? parseFloat(stock.quantity) || 0 : 0;

      if (qty > 0) {
        // Show with quantity
        fromSelect.add(
          new Option(
            `${location.location_name} (${qty.toFixed(1)}t available)`,
            location.location_id
          )
        );
      } else {
        // Show without quantity (for locations like Production with no stock)
        fromSelect.add(
          new Option(location.location_name, location.location_id)
        );
      }
    });

    // TO: All active locations
    allLocations.forEach((location) => {
      toSelect.add(new Option(location.location_name, location.location_id));
    });
  } catch (error) {
    console.error("Error loading transfer locations:", error);
  }
}

async function saveAdjustment() {
  const type = document.getElementById("adjustmentType").value;

  if (!type) {
    alert("Please select Adjustment or Transfer");
    return;
  }

  if (type === "ADJUSTMENT") {
    await saveStockAdjustment();
  } else if (type === "TRANSFER") {
    await saveStockTransfer();
  }
}

async function saveStockAdjustment() {
  const formData = {
    movement_date: document.getElementById("adjustmentDate").value,
    product_id: document.getElementById("adjustmentProduct").value,
    location_id: document.getElementById("adjustmentLocation").value,
    quantity: parseFloat(document.getElementById("adjustmentQuantity").value),
    reason: document.getElementById("adjustmentReason").value,
    reference_number: document.getElementById("adjustmentReference").value,
    notes: document.getElementById("adjustmentNotes").value,
  };

  // Validate
  if (
    !formData.movement_date ||
    !formData.product_id ||
    !formData.location_id ||
    !formData.quantity ||
    !formData.reason
  ) {
    alert("Please fill in all required fields");
    return;
  }

  if (formData.quantity === 0) {
    alert("Adjustment quantity cannot be zero");
    return;
  }

  try {
    const response = await fetch("/api/movements/adjustment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to save adjustment");
      return;
    }

    alert("Stock adjustment saved successfully!");
    closeAdjustmentModal();
    await loadRecentMovementsWithFilter();
  } catch (error) {
    console.error("Error saving adjustment:", error);
    alert("Error saving adjustment");
  }
}

async function saveStockTransfer() {
  const formData = {
    movement_date: document.getElementById("adjustmentDate").value,
    product_id: document.getElementById("transferProduct").value,
    from_location_id: document.getElementById("transferFromLocation").value,
    to_location_id: document.getElementById("transferToLocation").value,
    quantity: parseFloat(document.getElementById("transferQuantity").value),
    reference_number: document.getElementById("adjustmentReference").value,
    notes: document.getElementById("adjustmentNotes").value,
  };

  // Validate
  if (
    !formData.movement_date ||
    !formData.product_id ||
    !formData.from_location_id ||
    !formData.to_location_id ||
    !formData.quantity
  ) {
    alert("Please fill in all required fields");
    return;
  }

  if (formData.from_location_id === formData.to_location_id) {
    alert("Cannot transfer to the same location");
    return;
  }

  if (formData.quantity <= 0) {
    alert("Transfer quantity must be positive");
    return;
  }

  try {
    const response = await fetch("/api/movements/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to save transfer");
      return;
    }

    alert("Stock transfer saved successfully!");
    closeAdjustmentModal();
    await loadRecentMovementsWithFilter();
  } catch (error) {
    console.error("Error saving transfer:", error);
    alert("Error saving transfer");
  }
}

// ============================================
// TARE WEIGHT FUNCTIONS
// ============================================

function openTareWeightModal() {
  document.getElementById("tareWeightModal").style.display = "flex";
  document.getElementById("tareWeightForm").reset();
  loadTareWeightDropdowns();
}

function closeTareWeightModal() {
  document.getElementById("tareWeightModal").style.display = "none";
}

async function loadTareWeightDropdowns() {
  try {
    const vehiclesRes = await fetch("/api/vehicles");
    const vehicles = await vehiclesRes.json();
    const tareVehicleSelect = document.getElementById("tareVehicle");

    tareVehicleSelect.innerHTML = '<option value="">Select Vehicle</option>';
    vehicles.forEach((vehicle) => {
      const option = new Option(
        `${vehicle.registration} - ${vehicle.vehicle_type}`,
        vehicle.vehicle_id
      );
      tareVehicleSelect.add(option);
    });

    const carriersRes = await fetch("/api/carriers");
    const carriers = await carriersRes.json();
    const tareCarrierSelect = document.getElementById("tareCarrier");

    tareCarrierSelect.innerHTML = '<option value="">Select Carrier</option>';
    carriers.forEach((carrier) => {
      const option = new Option(carrier.carrier_name, carrier.carrier_id);
      tareCarrierSelect.add(option);
    });
  } catch (error) {
    console.error("Error loading tare weight dropdowns:", error);
  }
}

async function saveTareWeight() {
  const formData = {
    vehicle_id: parseInt(document.getElementById("tareVehicle").value),
    tare_weight: parseFloat(document.getElementById("tareWeight").value),
    carrier_id: document.getElementById("tareCarrier").value
      ? parseInt(document.getElementById("tareCarrier").value)
      : null,
    recorded_by: document.getElementById("tareOperator").value || "OPERATOR",
    notes: document.getElementById("tareNotes").value,
  };

  if (!formData.vehicle_id || !formData.tare_weight) {
    alert("Please fill in all required fields");
    return;
  }

  if (formData.tare_weight <= 0) {
    alert("Tare weight must be positive");
    return;
  }

  try {
    const response = await fetch("/api/tare-weights", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      alert(
        `✅ Tare weight recorded successfully!\n\nVehicle: ${
          document.getElementById("tareVehicle").selectedOptions[0].textContent
        }\nTare Weight: ${formData.tare_weight.toFixed(
          2
        )} tonnes\n\nThis will be auto-suggested for sales within the next 12 hours.`
      );
      closeTareWeightModal();
    } else {
      alert("❌ Error: " + (result.error || "Failed to record tare weight"));
    }
  } catch (error) {
    console.error("Error saving tare weight:", error);
    alert("Error recording tare weight");
  }
}

function setupSalesVehicleListener() {
  const saleVehicleSelect = document.getElementById("saleVehicle");

  if (saleVehicleSelect) {
    saleVehicleSelect.addEventListener("change", async (e) => {
      const vehicleId = e.target.value;
      if (vehicleId) {
        await loadRecentTareWeight(vehicleId);
      }
    });
  }
}

async function loadRecentTareWeight(vehicleId) {
  try {
    const response = await fetch(
      `/api/tare-weights/recent/${vehicleId}?hours=12`
    );
    const data = await response.json();

    const tareWeightInput = document.getElementById("saleTareWeight");
    const carrierSelect = document.getElementById("saleCarrier");

    if (data.success && data.tare) {
      // Auto-populate tare weight
      tareWeightInput.value = parseFloat(data.tare.tare_weight).toFixed(2);

      // Auto-populate carrier if available
      if (data.tare.carrier_id && carrierSelect) {
        carrierSelect.value = data.tare.carrier_id;
      }

      const existingIndicator = document.getElementById("tareIndicator");
      if (existingIndicator) {
        existingIndicator.remove();
      }

      const indicator = document.createElement("small");
      indicator.id = "tareIndicator";
      indicator.style.color = "#28a745";
      indicator.style.display = "block";
      indicator.style.marginTop = "4px";
      indicator.textContent = `✓ Auto-loaded from registry (${parseFloat(
        data.tare.hours_ago
      ).toFixed(1)} hours ago)`;

      tareWeightInput.parentElement.appendChild(indicator);
      tareWeightInput.dataset.tareId = data.tare.tare_id;
      calculateNetWeight();
    } else {
      const existingIndicator = document.getElementById("tareIndicator");
      if (existingIndicator) {
        existingIndicator.remove();
      }
      delete tareWeightInput.dataset.tareId;
    }
  } catch (error) {
    console.error("Error loading recent tare weight:", error);
  }
}

async function markTareAsUsed(tareId, docketNumber) {
  if (!tareId) return;

  try {
    await fetch(`/api/tare-weights/${tareId}/mark-used`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ docket_number: docketNumber }),
    });
    console.log("✓ Tare weight marked as used");
  } catch (error) {
    console.error("Error marking tare as used:", error);
  }
}
