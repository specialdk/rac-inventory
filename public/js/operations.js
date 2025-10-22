// Operations Page JavaScript - Updated with Demand Entry

// Format currency
function formatCurrency(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(value);
}

// Format number
function formatNumber(value) {
  return new Intl.NumberFormat("en-AU", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

// Set today's date as default
function setTodayDate() {
  const today = new Date().toISOString().split("T")[0];
  if (document.getElementById("productionDate")) {
    document.getElementById("productionDate").value = today;
  }
  if (document.getElementById("saleDate")) {
    document.getElementById("saleDate").value = today;
  }
  if (document.getElementById("demandDate")) {
    // Set to tomorrow for demand
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById("demandDate").value = tomorrow
      .toISOString()
      .split("T")[0];
  }
}

// Load dropdown data
async function loadDropdowns() {
  try {
    // Load products
    const productsRes = await fetch("/api/products?is_active=true");
    const products = await productsRes.json();

    // Production dropdowns
    const prodProductSelect = document.getElementById("productionProduct");
    // Sales dropdowns
    const saleProductSelect = document.getElementById("saleProduct");
    // Demand dropdowns
    const demandProductSelect = document.getElementById("demandProduct");

    products.forEach((product) => {
      // Production product
      if (prodProductSelect) {
        const option1 = new Option(
          `${product.product_name} (${product.product_code})`,
          product.product_id
        );
        option1.dataset.cost = product.standard_cost || 0;
        prodProductSelect.add(option1);
      }

      // Sales product
      if (saleProductSelect) {
        const option2 = new Option(
          `${product.product_name} (${product.product_code})`,
          product.product_id
        );
        option2.dataset.price = product.current_price || 0;
        saleProductSelect.add(option2);
      }

      // Demand product
      if (demandProductSelect) {
        const option3 = new Option(
          `${product.product_name} (${product.product_code})`,
          product.product_id
        );
        demandProductSelect.add(option3);
      }
    });

    // Load locations
    const locationsRes = await fetch("/api/locations?is_active=true");
    const locations = await locationsRes.json();

    const prodLocationSelect = document.getElementById("productionLocation");
    const saleLocationSelect = document.getElementById("saleLocation");

    locations.forEach((location) => {
      if (prodLocationSelect) {
        prodLocationSelect.add(
          new Option(
            `${location.location_name} (${location.location_code})`,
            location.location_id
          )
        );
      }
      if (saleLocationSelect) {
        saleLocationSelect.add(
          new Option(
            `${location.location_name} (${location.location_code})`,
            location.location_id
          )
        );
      }
    });

    // Load customers
    const customersRes = await fetch("/api/customers?is_active=true");
    const customers = await customersRes.json();

    const saleCustomerSelect = document.getElementById("saleCustomer");
    const demandCustomerSelect = document.getElementById("demandCustomer");

    customers.forEach((customer) => {
      if (saleCustomerSelect) {
        saleCustomerSelect.add(
          new Option(
            `${customer.customer_name} (${customer.customer_code})`,
            customer.customer_id
          )
        );
      }
      if (demandCustomerSelect) {
        demandCustomerSelect.add(
          new Option(
            `${customer.customer_name} (${customer.customer_code})`,
            customer.customer_id
          )
        );
      }
    });

    // Load vehicles
    const vehiclesRes = await fetch("/api/vehicles?is_active=true");
    const vehicles = await vehiclesRes.json();

    const saleVehicleSelect = document.getElementById("saleVehicle");

    if (saleVehicleSelect) {
      vehicles.forEach((vehicle) => {
        saleVehicleSelect.add(
          new Option(vehicle.registration, vehicle.vehicle_id)
        );
      });
    }

    // Load drivers
    const driversRes = await fetch("/api/drivers?is_active=true");
    const drivers = await driversRes.json();

    const prodOperatorSelect = document.getElementById("productionOperator");
    const saleDriverSelect = document.getElementById("saleDriver");

    drivers.forEach((driver) => {
      if (prodOperatorSelect) {
        prodOperatorSelect.add(
          new Option(
            `${driver.driver_name} (${driver.driver_code})`,
            driver.driver_id
          )
        );
      }
      if (saleDriverSelect) {
        saleDriverSelect.add(
          new Option(
            `${driver.driver_name} (${driver.driver_code})`,
            driver.driver_id
          )
        );
      }
    });
  } catch (error) {
    console.error("Error loading dropdowns:", error);
  }
}

// Auto-fill sale price when product is selected
function updateSalePrice() {
  const select = document.getElementById("saleProduct");
  const priceInput = document.getElementById("salePrice");
  const selectedOption = select.options[select.selectedIndex];

  if (selectedOption && selectedOption.dataset.price) {
    priceInput.value = selectedOption.dataset.price;
  }
}

// ============================================
// PRODUCTION MODAL
// ============================================
function openProductionModal() {
  document.getElementById("productionModal").classList.add("active");
  setTodayDate();
}

function closeProductionModal() {
  document.getElementById("productionModal").classList.remove("active");
  document.getElementById("productionForm").reset();
}

async function saveProduction() {
  try {
    const formData = {
      movement_date: document.getElementById("productionDate").value,
      movement_type: "PRODUCTION",
      product_id: document.getElementById("productionProduct").value,
      location_id: document.getElementById("productionLocation").value,
      quantity: parseFloat(document.getElementById("productionQuantity").value),
      unit_cost: parseFloat(document.getElementById("productionCost").value),
      operator_id: document.getElementById("productionOperator").value || null,
      reference_number:
        document.getElementById("productionReference").value || null,
      notes: document.getElementById("productionNotes").value || null,
    };

    const response = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      alert("Production entry saved successfully!");
      closeProductionModal();
      refreshMovements();
      loadTodayStats();
    } else {
      const error = await response.json();
      alert("Error: " + (error.message || "Failed to save production"));
    }
  } catch (error) {
    console.error("Error saving production:", error);
    alert("Error saving production entry");
  }
}

// ============================================
// DEMAND MODAL
// ============================================
function openDemandModal() {
  document.getElementById("demandModal").classList.add("active");
  setTodayDate();
}

function closeDemandModal() {
  document.getElementById("demandModal").classList.remove("active");
  document.getElementById("demandForm").reset();
}

async function saveDemand() {
  try {
    const formData = {
      movement_date: document.getElementById("demandDate").value,
      movement_type: "DEMAND",
      product_id: document.getElementById("demandProduct").value,
      location_id: null, // No location for future demand
      quantity: parseFloat(document.getElementById("demandQuantity").value),
      unit_cost: 0, // No cost for demand
      customer_id: document.getElementById("demandCustomer").value,
      vehicle_id: null, // No vehicle for demand
      operator_id: null, // No operator for demand
      reference_number:
        document.getElementById("demandReference").value || null,
      po_number: document.getElementById("demandPO").value, // PO is required
      notes: document.getElementById("demandNotes").value || null,
    };

    const response = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      alert("Demand entry saved successfully!");
      closeDemandModal();
      refreshMovements();
      loadTodayStats();
    } else {
      const error = await response.json();
      alert("Error: " + (error.message || "Failed to save demand"));
    }
  } catch (error) {
    console.error("Error saving demand:", error);
    alert("Error saving demand entry");
  }
}

// ============================================
// SALES MODAL
// ============================================
function openSalesModal() {
  document.getElementById("salesModal").classList.add("active");
  setTodayDate();
}

function closeSalesModal() {
  document.getElementById("salesModal").classList.remove("active");
  document.getElementById("salesForm").reset();
}

async function saveSales() {
  try {
    const formData = {
      movement_date: document.getElementById("saleDate").value,
      movement_type: "SALES",
      product_id: document.getElementById("saleProduct").value,
      location_id: document.getElementById("saleLocation").value,
      quantity: -Math.abs(
        parseFloat(document.getElementById("saleQuantity").value)
      ), // Negative for sales
      unit_cost: parseFloat(document.getElementById("salePrice").value),
      customer_id: document.getElementById("saleCustomer").value,
      vehicle_id: document.getElementById("saleVehicle").value || null,
      operator_id: document.getElementById("saleDriver").value || null,
      docket_number: document.getElementById("saleDocket").value || null,
      reference_number: document.getElementById("saleReference").value || null,
      notes: document.getElementById("saleNotes").value || null,
    };

    const response = await fetch("/api/movements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      alert("Sales entry saved successfully!");
      closeSalesModal();
      refreshMovements();
      loadTodayStats();
    } else {
      const error = await response.json();
      alert("Error: " + (error.message || "Failed to save sale"));
    }
  } catch (error) {
    console.error("Error saving sale:", error);
    alert("Error saving sales entry");
  }
}

// ============================================
// LOAD DATA
// ============================================

// Load today's stats
async function loadTodayStats() {
  try {
    const response = await fetch("/api/movements/today");
    const data = await response.json();

    const production = data.find((d) => d.movement_type === "PRODUCTION");
    const sales = data.find((d) => d.movement_type === "SALES");

    document.getElementById("todayProduction").textContent = production
      ? formatNumber(production.total_quantity) + " tonnes"
      : "0.0 tonnes";
    document.getElementById("todaySales").textContent = sales
      ? formatNumber(Math.abs(sales.total_quantity)) + " tonnes"
      : "0.0 tonnes";

    // Load active counts
    const vehiclesRes = await fetch("/api/vehicles?is_active=true");
    const vehicles = await vehiclesRes.json();
    document.getElementById("activeVehicles").textContent = vehicles.length;

    const driversRes = await fetch("/api/drivers?is_active=true");
    const drivers = await driversRes.json();
    document.getElementById("activeOperators").textContent = drivers.length;
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

// Load recent movements
async function loadRecentMovements() {
  try {
    const response = await fetch("/api/movements/recent?limit=10");
    const movements = await response.json();

    const container = document.getElementById("movementsTableContainer");

    if (movements.length === 0) {
      container.innerHTML =
        '<div class="loading"><p>No recent movements</p></div>';
      return;
    }

    let html = `
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Product</th>
            <th>Quantity</th>
            <th>Location</th>
            <th>Customer/Operator</th>
            <th>Reference</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    movements.forEach((movement) => {
      const typeClass =
        movement.movement_type === "PRODUCTION"
          ? "badge-warning"
          : movement.movement_type === "SALES"
          ? "badge-info"
          : "badge-demand";

      html += `
        <tr>
          <td>${new Date(movement.movement_date).toLocaleDateString()}</td>
          <td><span class="badge ${typeClass}">${
        movement.movement_type
      }</span></td>
          <td>
            <strong>${movement.product_name}</strong><br>
            <small>${movement.product_code}</small>
          </td>
          <td><strong>${movement.quantity > 0 ? "+" : ""}${formatNumber(
        movement.quantity
      )}</strong></td>
          <td>${movement.location_name || "-"}</td>
          <td>${movement.customer_name || movement.operator_name || "-"}</td>
          <td>${
            movement.reference_number ||
            movement.docket_number ||
            movement.po_number ||
            "-"
          }</td>
          <td><span class="badge badge-success">COMPLETED</span></td>
        </tr>
      `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;
  } catch (error) {
    console.error("Error loading movements:", error);
    document.getElementById("movementsTableContainer").innerHTML =
      '<div class="loading"><p>Error loading movements</p></div>';
  }
}

// Refresh movements
function refreshMovements() {
  document.getElementById("movementsTableContainer").innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <p>Refreshing...</p>
    </div>
  `;
  loadRecentMovements();
}

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
  loadDropdowns();
  loadTodayStats();
  loadRecentMovements();
  setTodayDate();
});
