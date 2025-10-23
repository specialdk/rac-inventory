// RAC Inventory - Complete Maintenance JavaScript

let currentTab = "products";

// Initialize on page load
document.addEventListener("DOMContentLoaded", function () {
  initializeTabs();
  showTab("products");
  setupModalHandlers();
});

// Tab Switching
function initializeTabs() {
  document.querySelectorAll(".sub-nav-item").forEach((tab) => {
    tab.addEventListener("click", function () {
      showTab(this.dataset.section);
    });
  });
}

function showTab(section) {
  currentTab = section;

  // Update active tab
  document.querySelectorAll(".sub-nav-item").forEach((tab) => {
    tab.classList.remove("active");
    if (tab.dataset.section === section) {
      tab.classList.add("active");
    }
  });

  // Hide all sections
  document.querySelectorAll(".maintenance-section").forEach((sec) => {
    sec.style.display = "none";
  });

  // Show selected section
  document.getElementById(section + "-section").style.display = "block";

  // Load data for the section
  loadSectionData(section);
}

// Load data based on section
async function loadSectionData(section) {
  switch (section) {
    case "products":
      loadProducts();
      break;
    case "customers":
      loadCustomers();
      break;
    case "locations":
      loadLocations();
      break;
    case "vehicles":
      loadVehicles();
      break;
    case "drivers":
      loadDrivers();
      break;
  }
}

// ============================================
// PRODUCTS SECTION
// ============================================

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    const products = await response.json();

    const tbody = document.getElementById("productsTableBody");
    tbody.innerHTML = "";

    products.forEach((product) => {
      const row = `
                <tr>
                    <td>${product.product_code}</td>
                    <td>${product.product_name}</td>
                    <td><span class="badge badge-${product.family_group.toLowerCase()}">${
        product.family_group
      }</span></td>
                    <td>$${parseFloat(product.standard_cost).toFixed(2)}</td>
                    <td>$${parseFloat(product.current_price).toFixed(2)}</td>
                    <td>${product.min_stock_level}t</td>
                    <td>${product.max_stock_level}t</td>
                    <td>${product.unit}</td>
                    <td>
                        <button class="btn-icon" onclick="editProduct(${
                          product.product_id
                        })" title="Edit">✏️</button>
                        <button class="btn-icon" onclick="deleteProduct(${
                          product.product_id
                        })" title="Delete">🗑️</button>
                    </td>
                </tr>
            `;
      tbody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading products:", error);
    alert("Failed to load products");
  }
}

function openProductModal(productId = null) {
  const modal = document.getElementById("productModal");
  const form = document.getElementById("productForm");
  const title = document.getElementById("productModalTitle");

  if (productId) {
    title.textContent = "Edit Product";
    loadProductData(productId);
  } else {
    title.textContent = "Add Product";
    form.reset();
    document.getElementById("productId").value = "";
  }

  modal.style.display = "flex";
}

async function loadProductData(productId) {
  try {
    const response = await fetch(`/api/products/${productId}`);
    const product = await response.json();

    document.getElementById("productId").value = product.product_id;
    document.getElementById("productCode").value = product.product_code;
    document.getElementById("productName").value = product.product_name;
    document.getElementById("familyGroup").value = product.family_group;
    document.getElementById("unit").value = product.unit;
    document.getElementById("standardCost").value = product.standard_cost;
    document.getElementById("currentPrice").value = product.current_price;
    document.getElementById("minStockLevel").value = product.min_stock_level;
    document.getElementById("maxStockLevel").value = product.max_stock_level;
  } catch (error) {
    console.error("Error loading product:", error);
    alert("Failed to load product data");
  }
}

async function saveProduct() {
  const productId = document.getElementById("productId").value;
  const productData = {
    product_code: document.getElementById("productCode").value,
    product_name: document.getElementById("productName").value,
    family_group: document.getElementById("familyGroup").value,
    unit: document.getElementById("unit").value,
    standard_cost:
      parseFloat(document.getElementById("avgCostPerUnit").value) || 0,
    current_price:
      parseFloat(document.getElementById("sellingPricePerUnit").value) || 0,
    min_stock_level:
      parseFloat(document.getElementById("minStockLevel").value) || 0,
    max_stock_level:
      parseFloat(document.getElementById("maxStockLevel").value) || 0,
    description: document.getElementById("productDescription").value,
  };

  try {
    const url = productId ? `/api/products/${productId}` : "/api/products";
    const method = productId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productData),
    });

    if (response.ok) {
      closeProductModal();
      loadProducts();
      alert(
        productId
          ? "Product updated successfully!"
          : "Product created successfully!"
      );
    } else {
      const error = await response.json();
      alert("Failed to save product: " + (error.error || "Unknown error"));
    }
  } catch (error) {
    console.error("Error saving product:", error);
    alert("Failed to save product");
  }
}

function editProduct(productId) {
  const product = productsData.find((p) => p.product_id === productId);
  if (!product) return;

  document.getElementById("productId").value = product.product_id;
  document.getElementById("productCode").value = product.product_code;
  document.getElementById("productName").value = product.product_name;
  document.getElementById("familyGroup").value = product.family_group;
  document.getElementById("unit").value = product.unit;
  document.getElementById("avgCostPerUnit").value =
    product.production_cost_per_unit || 0;
  document.getElementById("sellingPricePerUnit").value =
    product.standard_price_per_unit || 0;
  document.getElementById("minStockLevel").value = product.min_stock_level || 0;
  document.getElementById("maxStockLevel").value = product.max_stock_level || 0;
  document.getElementById("productDescription").value =
    product.description || "";

  document.getElementById("productModalTitle").textContent = "Edit Product";
  document.getElementById("productModal").style.display = "flex";
}

async function deleteProduct(productId) {
  if (!confirm("Are you sure you want to delete this product?")) return;

  try {
    const response = await fetch(`/api/products/${productId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadProducts();
      alert("Product deleted successfully!");
    } else {
      alert("Failed to delete product");
    }
  } catch (error) {
    console.error("Error deleting product:", error);
    alert("Failed to delete product");
  }
}

function closeProductModal() {
  document.getElementById("productModal").style.display = "none";
}

// ============================================
// CUSTOMERS SECTION
// ============================================

async function loadCustomers() {
  try {
    const response = await fetch("/api/customers");
    const customers = await response.json();

    const tbody = document.getElementById("customersTableBody");
    tbody.innerHTML = "";

    customers.forEach((customer) => {
      const row = `
                <tr>
                    <td>${customer.customer_code}</td>
                    <td>${customer.customer_name}</td>
                    <td>${customer.contact_person || "-"}</td>
                    <td>${customer.phone || "-"}</td>
                    <td>${customer.email || "-"}</td>
                    <td><span class="badge badge-${(
                      customer.customer_type || "other"
                    ).toLowerCase()}">${
        customer.customer_type || "-"
      }</span></td>
                    <td>
                        <button class="btn-icon" onclick="editCustomer(${
                          customer.customer_id
                        })" title="Edit">✏️</button>
                        <button class="btn-icon" onclick="deleteCustomer(${
                          customer.customer_id
                        })" title="Delete">🗑️</button>
                    </td>
                </tr>
            `;
      tbody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading customers:", error);
    alert("Failed to load customers");
  }
}

function openCustomerModal(customerId = null) {
  const modal = document.getElementById("customerModal");
  const form = document.getElementById("customerForm");
  const title = document.getElementById("customerModalTitle");

  if (customerId) {
    title.textContent = "Edit Customer";
    loadCustomerData(customerId);
  } else {
    title.textContent = "Add Customer";
    form.reset();
    document.getElementById("customerId").value = "";
  }

  modal.style.display = "flex";
}

async function loadCustomerData(customerId) {
  try {
    const response = await fetch(`/api/customers/${customerId}`);
    const customer = await response.json();

    document.getElementById("customerId").value = customer.customer_id;
    document.getElementById("customerCode").value = customer.customer_code;
    document.getElementById("customerName").value = customer.customer_name;
    document.getElementById("contactPerson").value =
      customer.contact_person || "";
    document.getElementById("customerPhone").value = customer.phone || "";
    document.getElementById("customerEmail").value = customer.email || "";
    document.getElementById("customerAddress").value = customer.address || "";
    document.getElementById("customerType").value =
      customer.customer_type || "";
  } catch (error) {
    console.error("Error loading customer:", error);
    alert("Failed to load customer data");
  }
}

async function saveCustomer() {
  const customerId = document.getElementById("customerId").value;
  const customerData = {
    customer_code: document.getElementById("customerCode").value,
    customer_name: document.getElementById("customerName").value,
    contact_person: document.getElementById("contactPerson").value,
    phone: document.getElementById("customerPhone").value,
    email: document.getElementById("customerEmail").value,
    address: document.getElementById("customerAddress").value,
    customer_type: document.getElementById("customerType").value,
  };

  try {
    const url = customerId ? `/api/customers/${customerId}` : "/api/customers";
    const method = customerId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(customerData),
    });

    if (response.ok) {
      closeCustomerModal();
      loadCustomers();
      alert(
        customerId
          ? "Customer updated successfully!"
          : "Customer created successfully!"
      );
    } else {
      alert("Failed to save customer");
    }
  } catch (error) {
    console.error("Error saving customer:", error);
    alert("Failed to save customer");
  }
}

function editCustomer(customerId) {
  openCustomerModal(customerId);
}

async function deleteCustomer(customerId) {
  if (!confirm("Are you sure you want to delete this customer?")) return;

  try {
    const response = await fetch(`/api/customers/${customerId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadCustomers();
      alert("Customer deleted successfully!");
    } else {
      alert("Failed to delete customer");
    }
  } catch (error) {
    console.error("Error deleting customer:", error);
    alert("Failed to delete customer");
  }
}

function closeCustomerModal() {
  document.getElementById("customerModal").style.display = "none";
}

// ============================================
// LOCATIONS SECTION
// ============================================

async function loadLocations() {
  try {
    const response = await fetch("/api/locations");
    const locations = await response.json();

    const tbody = document.getElementById("locationsTableBody");
    tbody.innerHTML = "";

    locations.forEach((location) => {
      const row = `
                <tr>
                    <td>${location.location_code}</td>
                    <td>${location.location_name}</td>
                    <td><span class="badge badge-${location.location_type.toLowerCase()}">${
        location.location_type
      }</span></td>
                    <td>${
                      location.capacity_tonnes
                        ? location.capacity_tonnes + "t"
                        : "-"
                    }</td>
                    <td>${location.assigned_product_name || "-"}</td>
                    <td>
                        <button class="btn-icon" onclick="editLocation(${
                          location.location_id
                        })" title="Edit">✏️</button>
                        <button class="btn-icon" onclick="deleteLocation(${
                          location.location_id
                        })" title="Delete">🗑️</button>
                    </td>
                </tr>
            `;
      tbody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading locations:", error);
    alert("Failed to load locations");
  }
}

function openLocationModal(locationId = null) {
  const modal = document.getElementById("locationModal");
  const form = document.getElementById("locationForm");
  const title = document.getElementById("locationModalTitle");

  if (locationId) {
    title.textContent = "Edit Location";
    loadLocationData(locationId);
  } else {
    title.textContent = "Add Location";
    form.reset();
    document.getElementById("locationId").value = "";
  }

  // Load products for assigned product dropdown
  loadProductsForLocation();

  modal.style.display = "flex";
}

async function loadProductsForLocation() {
  try {
    const response = await fetch("/api/products?is_active=true");
    const products = await response.json();

    const select = document.getElementById("assignedProduct");
    select.innerHTML = '<option value="">None</option>';

    products.forEach((product) => {
      select.innerHTML += `<option value="${product.product_id}">${product.product_name}</option>`;
    });
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

async function loadLocationData(locationId) {
  try {
    const response = await fetch(`/api/locations/${locationId}`);
    const location = await response.json();

    document.getElementById("locationId").value = location.location_id;
    document.getElementById("locationCode").value = location.location_code;
    document.getElementById("locationName").value = location.location_name;
    document.getElementById("locationType").value = location.location_type;
    document.getElementById("capacityTonnes").value =
      location.capacity_tonnes || "";
    document.getElementById("assignedProduct").value =
      location.assigned_product_id || "";
    document.getElementById("locationDescription").value =
      location.description || "";
  } catch (error) {
    console.error("Error loading location:", error);
    alert("Failed to load location data");
  }
}

async function saveLocation() {
  const locationId = document.getElementById("locationId").value;
  const locationData = {
    location_code: document.getElementById("locationCode").value,
    location_name: document.getElementById("locationName").value,
    location_type: document.getElementById("locationType").value,
    capacity_tonnes: document.getElementById("capacityTonnes").value || null,
    assigned_product_id:
      document.getElementById("assignedProduct").value || null,
    description: document.getElementById("locationDescription").value,
  };

  try {
    const url = locationId ? `/api/locations/${locationId}` : "/api/locations";
    const method = locationId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(locationData),
    });

    if (response.ok) {
      closeLocationModal();
      loadLocations();
      alert(
        locationId
          ? "Location updated successfully!"
          : "Location created successfully!"
      );
    } else {
      alert("Failed to save location");
    }
  } catch (error) {
    console.error("Error saving location:", error);
    alert("Failed to save location");
  }
}

function editLocation(locationId) {
  openLocationModal(locationId);
}

async function deleteLocation(locationId) {
  if (!confirm("Are you sure you want to delete this location?")) return;

  try {
    const response = await fetch(`/api/locations/${locationId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadLocations();
      alert("Location deleted successfully!");
    } else {
      alert("Failed to delete location");
    }
  } catch (error) {
    console.error("Error deleting location:", error);
    alert("Failed to delete location");
  }
}

function closeLocationModal() {
  document.getElementById("locationModal").style.display = "none";
}

// ============================================
// VEHICLES SECTION
// ============================================

async function loadVehicles() {
  try {
    const response = await fetch("/api/vehicles");
    const vehicles = await response.json();

    const tbody = document.getElementById("vehiclesTableBody");
    tbody.innerHTML = "";

    vehicles.forEach((vehicle) => {
      const row = `
                <tr>
                    <td>${vehicle.registration}</td>
                    <td><span class="badge badge-${(
                      vehicle.vehicle_type || "other"
                    ).toLowerCase()}">${vehicle.vehicle_type || "-"}</span></td>
                    <td>${
                      vehicle.capacity_tonnes
                        ? vehicle.capacity_tonnes + "t"
                        : "-"
                    }</td>
                    <td>${vehicle.last_service_date || "-"}</td>
                    <td>${vehicle.next_service_date || "-"}</td>
                    <td>
                        <button class="btn-icon" onclick="editVehicle(${
                          vehicle.vehicle_id
                        })" title="Edit">✏️</button>
                        <button class="btn-icon" onclick="deleteVehicle(${
                          vehicle.vehicle_id
                        })" title="Delete">🗑️</button>
                    </td>
                </tr>
            `;
      tbody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading vehicles:", error);
    alert("Failed to load vehicles");
  }
}

function openVehicleModal(vehicleId = null) {
  const modal = document.getElementById("vehicleModal");
  const form = document.getElementById("vehicleForm");
  const title = document.getElementById("vehicleModalTitle");

  if (vehicleId) {
    title.textContent = "Edit Vehicle";
    loadVehicleData(vehicleId);
  } else {
    title.textContent = "Add Vehicle";
    form.reset();
    document.getElementById("vehicleId").value = "";
  }

  modal.style.display = "flex";
}

async function loadVehicleData(vehicleId) {
  try {
    const response = await fetch(`/api/vehicles/${vehicleId}`);
    const vehicle = await response.json();

    document.getElementById("vehicleId").value = vehicle.vehicle_id;
    document.getElementById("registration").value = vehicle.registration;
    document.getElementById("vehicleType").value = vehicle.vehicle_type || "";
    document.getElementById("vehicleCapacity").value =
      vehicle.capacity_tonnes || "";
    document.getElementById("lastServiceDate").value =
      vehicle.last_service_date || "";
    document.getElementById("nextServiceDate").value =
      vehicle.next_service_date || "";
    document.getElementById("vehicleNotes").value = vehicle.notes || "";
  } catch (error) {
    console.error("Error loading vehicle:", error);
    alert("Failed to load vehicle data");
  }
}

async function saveVehicle() {
  const vehicleId = document.getElementById("vehicleId").value;
  const vehicleData = {
    registration: document.getElementById("registration").value,
    vehicle_type: document.getElementById("vehicleType").value,
    capacity_tonnes: document.getElementById("vehicleCapacity").value || null,
    last_service_date: document.getElementById("lastServiceDate").value || null,
    next_service_date: document.getElementById("nextServiceDate").value || null,
    notes: document.getElementById("vehicleNotes").value,
  };

  try {
    const url = vehicleId ? `/api/vehicles/${vehicleId}` : "/api/vehicles";
    const method = vehicleId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vehicleData),
    });

    if (response.ok) {
      closeVehicleModal();
      loadVehicles();
      alert(
        vehicleId
          ? "Vehicle updated successfully!"
          : "Vehicle created successfully!"
      );
    } else {
      alert("Failed to save vehicle");
    }
  } catch (error) {
    console.error("Error saving vehicle:", error);
    alert("Failed to save vehicle");
  }
}

function editVehicle(vehicleId) {
  openVehicleModal(vehicleId);
}

async function deleteVehicle(vehicleId) {
  if (!confirm("Are you sure you want to delete this vehicle?")) return;

  try {
    const response = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadVehicles();
      alert("Vehicle deleted successfully!");
    } else {
      alert("Failed to delete vehicle");
    }
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    alert("Failed to delete vehicle");
  }
}

function closeVehicleModal() {
  document.getElementById("vehicleModal").style.display = "none";
}

// ============================================
// DRIVERS SECTION
// ============================================

async function loadDrivers() {
  try {
    const response = await fetch("/api/drivers");
    const drivers = await response.json();

    const tbody = document.getElementById("driversTableBody");
    tbody.innerHTML = "";

    drivers.forEach((driver) => {
      const row = `
                <tr>
                    <td>${driver.driver_code}</td>
                    <td>${driver.driver_name}</td>
                    <td>${driver.license_number || "-"}</td>
                    <td>${driver.license_class || "-"}</td>
                    <td>${driver.license_expiry || "-"}</td>
                    <td>
                        <button class="btn-icon" onclick="editDriver(${
                          driver.driver_id
                        })" title="Edit">✏️</button>
                        <button class="btn-icon" onclick="deleteDriver(${
                          driver.driver_id
                        })" title="Delete">🗑️</button>
                    </td>
                </tr>
            `;
      tbody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading drivers:", error);
    alert("Failed to load drivers");
  }
}

function openDriverModal(driverId = null) {
  const modal = document.getElementById("driverModal");
  const form = document.getElementById("driverForm");
  const title = document.getElementById("driverModalTitle");

  if (driverId) {
    title.textContent = "Edit Driver";
    loadDriverData(driverId);
  } else {
    title.textContent = "Add Driver";
    form.reset();
    document.getElementById("driverId").value = "";
  }

  modal.style.display = "flex";
}

async function loadDriverData(driverId) {
  try {
    const response = await fetch(`/api/drivers/${driverId}`);
    const driver = await response.json();

    document.getElementById("driverId").value = driver.driver_id;
    document.getElementById("driverCode").value = driver.driver_code;
    document.getElementById("driverName").value = driver.driver_name;
    document.getElementById("licenseNumber").value =
      driver.license_number || "";
    document.getElementById("licenseClass").value = driver.license_class || "";
    document.getElementById("licenseExpiry").value =
      driver.license_expiry || "";
    document.getElementById("certifications").value =
      driver.certifications || "";
  } catch (error) {
    console.error("Error loading driver:", error);
    alert("Failed to load driver data");
  }
}

async function saveDriver() {
  const driverId = document.getElementById("driverId").value;
  const driverData = {
    driver_code: document.getElementById("driverCode").value,
    driver_name: document.getElementById("driverName").value,
    license_number: document.getElementById("licenseNumber").value,
    license_class: document.getElementById("licenseClass").value,
    license_expiry: document.getElementById("licenseExpiry").value || null,
    certifications: document.getElementById("certifications").value,
  };

  try {
    const url = driverId ? `/api/drivers/${driverId}` : "/api/drivers";
    const method = driverId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(driverData),
    });

    if (response.ok) {
      closeDriverModal();
      loadDrivers();
      alert(
        driverId
          ? "Driver updated successfully!"
          : "Driver created successfully!"
      );
    } else {
      alert("Failed to save driver");
    }
  } catch (error) {
    console.error("Error saving driver:", error);
    alert("Failed to save driver");
  }
}

function editDriver(driverId) {
  openDriverModal(driverId);
}

async function deleteDriver(driverId) {
  if (!confirm("Are you sure you want to delete this driver?")) return;

  try {
    const response = await fetch(`/api/drivers/${driverId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadDrivers();
      alert("Driver deleted successfully!");
    } else {
      alert("Failed to delete driver");
    }
  } catch (error) {
    console.error("Error deleting driver:", error);
    alert("Failed to delete driver");
  }
}

function closeDriverModal() {
  document.getElementById("driverModal").style.display = "none";
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

function searchItems(section) {
  const input = document.getElementById(section + "Search").value.toLowerCase();
  const table = document.getElementById(section + "TableBody");
  const rows = table.getElementsByTagName("tr");

  for (let row of rows) {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(input) ? "" : "none";
  }
}

// ============================================
// MODAL SETUP
// ============================================

function setupModalHandlers() {
  // Close modals on background click
  window.onclick = function (event) {
    if (event.target.classList.contains("modal")) {
      event.target.style.display = "none";
    }
  };
}
