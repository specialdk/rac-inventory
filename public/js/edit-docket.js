// RAC Inventory - Edit Docket JavaScript

const API_BASE_URL = "/api";

let originalDocket = null;
let productsData = [];
let locationsData = [];
let customersData = [];
let vehiclesData = [];
let driversData = [];
let carriersData = [];
let deliveriesData = [];

// Initialize on page load
document.addEventListener("DOMContentLoaded", async function () {
  const urlParams = new URLSearchParams(window.location.search);
  const docketNumber = urlParams.get("docket");

  if (!docketNumber) {
    showError("No docket number provided");
    return;
  }

  await loadDocket(docketNumber);
});

// Load docket data
async function loadDocket(docketNumber) {
  showLoading();

  try {
    // Load docket data
    const docketResponse = await fetch(
      `${API_BASE_URL}/dockets/${docketNumber}`
    );
    const docketData = await docketResponse.json();

    if (!docketData.success || !docketData.docket) {
      showError("Docket not found");
      return;
    }

    originalDocket = docketData.docket;

    // Load all dropdown data
    await Promise.all([
      loadProducts(),
      loadLocations(),
      loadCustomers(),
      loadVehicles(),
      loadDrivers(),
      loadCarriers(),
      loadDeliveries(),
    ]);

    // Populate form with original data
    populateForm();

    // Setup product change listener
    setupProductListener();

    showForm();
  } catch (error) {
    console.error("Error loading docket:", error);
    showError("Error loading docket data: " + error.message);
  }
}

// Load Products
async function loadProducts() {
  const response = await fetch(`${API_BASE_URL}/products`);
  productsData = await response.json();

  const select = document.getElementById("productId");
  productsData.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.product_id;
    option.textContent = product.product_name;
    option.dataset.price = product.standard_price_per_unit;
    select.appendChild(option);
  });
}

// Load Locations
async function loadLocations() {
  const response = await fetch(`${API_BASE_URL}/locations?is_active=true`);
  locationsData = await response.json();

  const select = document.getElementById("locationId");
  locationsData.forEach((location) => {
    const option = document.createElement("option");
    option.value = location.location_id;
    option.textContent = location.location_name;
    select.appendChild(option);
  });
}

// Load Customers
async function loadCustomers() {
  const response = await fetch(`${API_BASE_URL}/customers`);
  customersData = await response.json();

  const select = document.getElementById("customerId");
  customersData.forEach((customer) => {
    const option = document.createElement("option");
    option.value = customer.customer_id;
    option.textContent = customer.customer_name;
    select.appendChild(option);
  });
}

// Load Vehicles
async function loadVehicles() {
  const response = await fetch(`${API_BASE_URL}/vehicles`);
  vehiclesData = await response.json();

  const select = document.getElementById("vehicleId");
  vehiclesData.forEach((vehicle) => {
    const option = document.createElement("option");
    option.value = vehicle.vehicle_id;
    option.textContent = `${vehicle.registration} - ${vehicle.vehicle_type}`;
    select.appendChild(option);
  });
}

// Load Drivers
async function loadDrivers() {
  const response = await fetch(`${API_BASE_URL}/drivers`);
  driversData = await response.json();

  const select = document.getElementById("driverId");
  driversData.forEach((driver) => {
    const option = document.createElement("option");
    option.value = driver.driver_id;
    option.textContent = driver.driver_name;
    select.appendChild(option);
  });
}

// Load Carriers
async function loadCarriers() {
  const response = await fetch(`${API_BASE_URL}/carriers`);
  carriersData = await response.json();

  const select = document.getElementById("carrierId");
  carriersData.forEach((carrier) => {
    const option = document.createElement("option");
    option.value = carrier.carrier_id;
    option.textContent = carrier.carrier_name;
    select.appendChild(option);
  });
}

// Load Deliveries
async function loadDeliveries() {
  const response = await fetch(`${API_BASE_URL}/deliveries`);
  deliveriesData = await response.json();

  const select = document.getElementById("deliveryId");
  deliveriesData
    .filter((d) => d.is_active)
    .forEach((delivery) => {
      const option = document.createElement("option");
      option.value = delivery.delivery_id;
      option.textContent = delivery.delivery_name;
      select.appendChild(option);
    });
}

// Populate form with original docket data
function populateForm() {
  // Read-only fields
  document.getElementById("docketNumber").value =
    originalDocket.docket_number || "";
  document.getElementById("movementDate").value = formatDate(
    originalDocket.movement_date
  );
  document.getElementById("grossWeight").value = (
    parseFloat(originalDocket.gross_weight) || 0
  ).toFixed(2);
  document.getElementById("tareWeight").value = (
    parseFloat(originalDocket.tare_weight) || 0
  ).toFixed(2);
  document.getElementById("netWeight").value = (
    parseFloat(originalDocket.net_weight) || 0
  ).toFixed(2);

  // Editable fields - Find the correct ID from the original data
  // Product - match by name
  const productSelect = document.getElementById("productId");
  for (let option of productSelect.options) {
    if (option.textContent === originalDocket.product_name) {
      productSelect.value = option.value;
      break;
    }
  }

  // Location - match by location code
  const locationSelect = document.getElementById("locationId");
  for (let option of locationSelect.options) {
    if (option.textContent.includes(originalDocket.stockpile_lot)) {
      locationSelect.value = option.value;
      break;
    }
  }

  // Customer - match by name
  const customerSelect = document.getElementById("customerId");
  for (let option of customerSelect.options) {
    if (option.textContent === originalDocket.customer_name) {
      customerSelect.value = option.value;
      break;
    }
  }

  // Price - calculate from docket fee / net weight
  const unitPrice =
    parseFloat(originalDocket.net_weight) > 0
      ? parseFloat(originalDocket.docket_fee) /
        parseFloat(originalDocket.net_weight)
      : 0;
  document.getElementById("unitPrice").value = unitPrice.toFixed(2);

  // Vehicle - match by rego
  const vehicleSelect = document.getElementById("vehicleId");
  for (let option of vehicleSelect.options) {
    if (
      originalDocket.vehicle_rego &&
      option.textContent.includes(originalDocket.vehicle_rego)
    ) {
      vehicleSelect.value = option.value;
      break;
    }
  }

  // Driver - match by name
  const driverSelect = document.getElementById("driverId");
  for (let option of driverSelect.options) {
    if (option.textContent === originalDocket.driver_name) {
      driverSelect.value = option.value;
      break;
    }
  }

  // Carrier - match by name
  const carrierSelect = document.getElementById("carrierId");
  for (let option of carrierSelect.options) {
    if (option.textContent === originalDocket.carrier_name) {
      carrierSelect.value = option.value;
      break;
    }
  }

  // Delivery - match by name
  const deliverySelect = document.getElementById("deliveryId");
  for (let option of deliverySelect.options) {
    if (option.textContent === originalDocket.destination) {
      deliverySelect.value = option.value;
      break;
    }
  }

  // PO Number
  document.getElementById("poNumber").value = originalDocket.po_number || "";

  // Notes
  document.getElementById("notes").value = originalDocket.notes || "";
}

// Setup product change listener (filter locations by stock)
function setupProductListener() {
  const productSelect = document.getElementById("productId");

  productSelect.addEventListener("change", async (e) => {
    const productId = e.target.value;

    if (productId) {
      await loadStockpileDropdown(productId);
    }
  });
}

// Load stockpile dropdown filtered by product stock
async function loadStockpileDropdown(productId) {
  const locationSelect = document.getElementById("locationId");
  const currentValue = locationSelect.value; // Remember current selection

  locationSelect.innerHTML = '<option value="">Select Location</option>';

  try {
    // Get stock for this product
    const stockRes = await fetch(
      `${API_BASE_URL}/stock/by-product/${productId}`
    );
    const stockData = await stockRes.json();

    const locationsWithStock = stockData.stock_locations || [];

    if (locationsWithStock.length > 0) {
      locationsWithStock.forEach((stock) => {
        const qty = parseFloat(stock.quantity) || 0;
        if (qty > 0) {
          const option = document.createElement("option");
          option.value = stock.location_id;
          option.textContent = `${stock.location_name} (${qty.toFixed(
            1
          )}t available)`;
          locationSelect.appendChild(option);
        }
      });

      // Try to restore previous selection
      locationSelect.value = currentValue;

      // Auto-select if only one option
      if (
        locationsWithStock.length === 1 &&
        locationsWithStock[0].quantity > 0
      ) {
        locationSelect.value = locationsWithStock[0].location_id;
      }
    } else {
      // No stock - show all locations as fallback
      locationsData.forEach((location) => {
        const option = document.createElement("option");
        option.value = location.location_id;
        option.textContent = location.location_name + " (No stock)";
        locationSelect.appendChild(option);
      });
    }
  } catch (error) {
    console.error("Error loading stockpile dropdown:", error);
  }
}

// Show confirmation modal
function showConfirmation() {
  // Get current form values
  const form = document.getElementById("docketForm");

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const correctedData = {
    productId: document.getElementById("productId").value,
    productName:
      document.getElementById("productId").selectedOptions[0].textContent,
    locationId: document.getElementById("locationId").value,
    locationName:
      document.getElementById("locationId").selectedOptions[0].textContent,
    customerId: document.getElementById("customerId").value,
    customerName:
      document.getElementById("customerId").selectedOptions[0].textContent,
    unitPrice: document.getElementById("unitPrice").value,
    vehicleId: document.getElementById("vehicleId").value,
    vehicleName:
      document.getElementById("vehicleId").selectedOptions[0].textContent,
    driverId: document.getElementById("driverId").value,
    driverName:
      document.getElementById("driverId").selectedOptions[0].textContent,
    carrierId: document.getElementById("carrierId").value,
    carrierName:
      document.getElementById("carrierId").selectedOptions[0].textContent,
    deliveryId: document.getElementById("deliveryId").value,
    deliveryName:
      document.getElementById("deliveryId").selectedOptions[0].textContent,
    poNumber: document.getElementById("poNumber").value,
    notes: document.getElementById("notes").value,
    editReason: document.getElementById("editReason").value,
  };

  // Build comparison table
  const tbody = document.getElementById("comparisonTableBody");
  tbody.innerHTML = "";

  // Calculate original unit price
  const originalUnitPrice =
    parseFloat(originalDocket.net_weight) > 0
      ? (
          parseFloat(originalDocket.docket_fee) /
          parseFloat(originalDocket.net_weight)
        ).toFixed(2)
      : "0.00";

  const comparisons = [
    {
      field: "Product",
      original: originalDocket.product_name,
      corrected: correctedData.productName,
    },
    {
      field: "Location",
      original: originalDocket.stockpile_lot || "-",
      corrected: correctedData.locationName,
    },
    {
      field: "Customer",
      original: originalDocket.customer_name,
      corrected: correctedData.customerName,
    },
    {
      field: "Price/tonne",
      original: `$${originalUnitPrice}`,
      corrected: `$${parseFloat(correctedData.unitPrice).toFixed(2)}`,
    },
    {
      field: "Vehicle",
      original: originalDocket.vehicle_rego || "-",
      corrected: correctedData.vehicleName,
    },
    {
      field: "Driver",
      original: originalDocket.driver_name || "-",
      corrected: correctedData.driverName,
    },
    {
      field: "Carrier",
      original: originalDocket.carrier_name || "-",
      corrected: correctedData.carrierName,
    },
    {
      field: "Delivery",
      original: originalDocket.destination || "-",
      corrected: correctedData.deliveryName,
    },
    {
      field: "PO Number",
      original: originalDocket.po_number || "-",
      corrected: correctedData.poNumber || "-",
    },
  ];

  comparisons.forEach((comp) => {
    const row = document.createElement("tr");
    const isChanged = comp.original !== comp.corrected;

    row.innerHTML = `
      <td><strong>${comp.field}</strong></td>
      <td${isChanged ? ' class="changed"' : ""}>${comp.original}</td>
      <td${isChanged ? ' class="changed"' : ""}>${comp.corrected}</td>
    `;
    tbody.appendChild(row);
  });

  document.getElementById("confirmDocketNumber").textContent =
    originalDocket.docket_number;
  document.getElementById("confirmModal").style.display = "flex";
}

function closeConfirmation() {
  document.getElementById("confirmModal").style.display = "none";
}

// Submit the edit
async function submitEdit() {
  const submitButton = event.target;
  submitButton.disabled = true;
  submitButton.textContent = "⏳ Processing...";

  try {
    const correctedData = {
      original_docket_number: originalDocket.docket_number,
      product_id: parseInt(document.getElementById("productId").value),
      from_location_id: parseInt(document.getElementById("locationId").value),
      customer_id: parseInt(document.getElementById("customerId").value),
      unit_price: parseFloat(document.getElementById("unitPrice").value),
      vehicle_id: document.getElementById("vehicleId").value
        ? parseInt(document.getElementById("vehicleId").value)
        : null,
      driver_id: document.getElementById("driverId").value
        ? parseInt(document.getElementById("driverId").value)
        : null,
      carrier_id: document.getElementById("carrierId").value
        ? parseInt(document.getElementById("carrierId").value)
        : null,
      delivery_id: document.getElementById("deliveryId").value
        ? parseInt(document.getElementById("deliveryId").value)
        : null,
      reference_number: document.getElementById("poNumber").value,
      notes: document.getElementById("notes").value,
      edit_reason: document.getElementById("editReason").value,
    };

    const response = await fetch(`${API_BASE_URL}/dockets/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(correctedData),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      alert(
        "✅ Docket edited successfully!\n\nTwo audit records have been created:\n- REVERSAL movement\n- CORRECTION movement"
      );
      // Auto-reload the docket to show corrected data
      window.location.href = `/weighbridge-delivery-docket.html?docket=${originalDocket.docket_number}`;
    } else {
      alert("❌ Error: " + (result.error || "Failed to edit docket"));
      submitButton.disabled = false;
      submitButton.textContent = "✓ Confirm Edit";
    }
  } catch (error) {
    console.error("Error submitting edit:", error);
    alert("❌ Error submitting edit: " + error.message);
    submitButton.disabled = false;
    submitButton.textContent = "✓ Confirm Edit";
  }
}

// Helper: Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// UI State Management
function showLoading() {
  document.getElementById("loadingState").style.display = "block";
  document.getElementById("errorState").style.display = "none";
  document.getElementById("editForm").style.display = "none";
}

function showError(message) {
  document.getElementById("errorMessage").textContent = message;
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("errorState").style.display = "block";
  document.getElementById("editForm").style.display = "none";
}

function showForm() {
  document.getElementById("loadingState").style.display = "none";
  document.getElementById("errorState").style.display = "none";
  document.getElementById("editForm").style.display = "block";
}
