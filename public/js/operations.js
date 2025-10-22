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
    const locationSelects = [
      document.getElementById("productionLocation"),
      document.getElementById("saleLocation"),
    ];

    locationsData.forEach((location) => {
      locationSelects.forEach((select) => {
        if (select) {
          select.add(
            new Option(
              `${location.location_name} (${location.location_code})`,
              location.location_id
            )
          );
        }
      });
    });

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

// Load today's stats
async function loadStats() {
  try {
    const today = new Date().toISOString().split("T")[0];

    // Production stats
    const prodRes = await fetch(
      `/api/movements?movement_type=PRODUCTION&date=${today}`
    );
    const prodData = await prodRes.json();
    const todayProduction = prodData.reduce(
      (sum, m) => sum + parseFloat(m.quantity || 0),
      0
    );
    document.getElementById("todayProduction").textContent =
      todayProduction.toFixed(1) + " tonnes";

    // Sales stats
    const salesRes = await fetch(
      `/api/movements?movement_type=SALES&date=${today}`
    );
    const salesData = await salesRes.json();
    const todaySales = salesData.reduce(
      (sum, m) => sum + parseFloat(m.quantity || 0),
      0
    );
    document.getElementById("todaySales").textContent =
      todaySales.toFixed(1) + " tonnes";
  } catch (error) {
    console.error("Error loading stats:", error);
  }
}

// Load recent movements
async function loadRecentMovements() {
  try {
    const container = document.getElementById("movementsTableContainer");
    container.innerHTML =
      '<div class="loading"><div class="spinner"></div><p>Loading movements...</p></div>';

    const response = await fetch("/api/movements?limit=20");
    const movements = await response.json();

    if (movements.length === 0) {
      container.innerHTML =
        '<div class="no-data">No movements recorded yet</div>';
      return;
    }

    let html = `
      <table class="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Product</th>
            <th>Location</th>
            <th>Quantity</th>
            <th>Reference</th>
          </tr>
        </thead>
        <tbody>
    `;

    movements.forEach((m) => {
      const date = new Date(m.movement_date).toLocaleDateString("en-AU");
      const type = m.movement_type;
      const typeClass =
        type === "PRODUCTION"
          ? "badge-primary"
          : type === "SALE"
          ? "badge-success"
          : type === "DEMAND"
          ? "badge-demand"
          : "badge-warning";

      html += `
        <tr>
          <td>${date}</td>
          <td><span class="badge ${typeClass}">${type}</span></td>
          <td>${m.product_name || "-"}</td>
          <td>${m.to_location_name || m.from_location_name || "-"}</td>
          <td>${parseFloat(m.quantity).toFixed(2)} ${m.unit || "tonnes"}</td>
          <td>${m.reference_number || "-"}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  } catch (error) {
    console.error("Error loading movements:", error);
    document.getElementById("movementsTableContainer").innerHTML =
      '<div class="error">Failed to load movements</div>';
  }
}

function refreshMovements() {
  loadRecentMovements();
  loadStats();
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
  if (selectedOption && selectedOption.dataset.price) {
    document.getElementById("salePrice").value = selectedOption.dataset.price;
  }
}

async function saveSales() {
  const formData = {
    movement_date: document.getElementById("saleDate").value,
    product_id: document.getElementById("saleProduct").value,
    from_location_id: document.getElementById("saleLocation").value,
    quantity: parseFloat(document.getElementById("saleQuantity").value),
    sale_price_per_unit: parseFloat(document.getElementById("salePrice").value),
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
    !formData.sale_price_per_unit ||
    !formData.customer_id
  ) {
    alert("Please fill in all required fields");
    return;
  }

  try {
    const response = await fetch("/api/movements/sale", {
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
