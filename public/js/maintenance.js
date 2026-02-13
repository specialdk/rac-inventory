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
    case "carriers":
      loadCarriers();
      break;
    case "deliveries":
      loadDeliveries();
      break;
    case "delivery-rates":
      loadDeliveryRates();
      break;
    case "price-lists":
      loadPriceLists();
      loadPricingMatrix();
      break;
  }
}

// ============================================
// PRODUCTS SECTION
// ============================================

async function loadProducts() {
  try {
    // Check toggle state
    const showActive = document.getElementById("toggleActiveProducts").checked;
    const label = document.getElementById("productsToggleLabel");
    label.textContent = showActive ? "Active" : "Inactive";

    const response = await fetch(`/api/products?is_active=${showActive}`);
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
                    <td>tonnes</td>
                    <td><span class="badge ${
                      product.is_active ? "badge-success" : "badge-danger"
                    }">${product.is_active ? "Active" : "Inactive"}</span></td>
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

  // Load stockpiles for preferred location dropdown
  loadProductStockpiles();

  if (productId) {
    title.textContent = "Edit Product";
    loadProductData(productId);
  } else {
    title.textContent = "Add Product";
    form.reset();
    document.getElementById("productId").value = "";
    document.getElementById("unit").value = "TONNES"; // Default to tonnes
  }

  modal.style.display = "flex";
}

async function loadProductStockpiles() {
  try {
    const response = await fetch(
      "/api/locations?location_type=STOCKPILE&is_active=true"
    );
    const locations = await response.json();

    const select = document.getElementById("productPreferredLocation");
    select.innerHTML = '<option value="">No Preference</option>';

    locations.forEach((location) => {
      select.add(new Option(location.location_name, location.location_id));
    });
  } catch (error) {
    console.error("Error loading stockpiles:", error);
  }
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
    document.getElementById("avgCostPerUnit").value = product.standard_cost;
    document.getElementById("sellingPricePerUnit").value =
      product.current_price;
    document.getElementById("minStockLevel").value = product.min_stock_level;
    document.getElementById("maxStockLevel").value = product.max_stock_level;
    document.getElementById("productPreferredLocation").value =
      product.preferred_location_id || "";
    document.getElementById("productDescription").value =
      product.description || "";
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
    preferred_location_id:
      document.getElementById("productPreferredLocation").value || null,
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
  openProductModal(productId);
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
    const showActive = document.getElementById("toggleActiveCustomers").checked;
    const label = document.getElementById("customersToggleLabel");
    label.textContent = showActive ? "Active" : "Inactive";

    const response = await fetch(`/api/customers?is_active=${showActive}`);
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
                    <td><span class="badge ${
                      customer.is_active ? "badge-success" : "badge-danger"
                    }">${customer.is_active ? "Active" : "Inactive"}</span></td>
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
    document.getElementById("customerActive").checked = true;
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
    document.getElementById("customerEmailCC").value = customer.email_cc || "";
    document.getElementById("customerAddress").value = customer.address || "";
    document.getElementById("customerType").value =
      customer.customer_type || "";
    document.getElementById("customerActive").checked =
      customer.is_active !== false;
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
    email_cc: document.getElementById("customerEmailCC").value,
    address: document.getElementById("customerAddress").value,
    customer_type: document.getElementById("customerType").value,
    is_active: document.getElementById("customerActive").checked,
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
    const showActive = document.getElementById("toggleActiveLocations").checked;
    const label = document.getElementById("locationsToggleLabel");
    label.textContent = showActive ? "Active" : "Inactive";

    const response = await fetch(`/api/locations?is_active=${showActive}`);
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
                        ? new Intl.NumberFormat("en-US", {
                            maximumFractionDigits: 0,
                          }).format(location.capacity_tonnes) + "t"
                        : "-"
                    }</td>
                    <td>${location.product_name || "-"}</td>
                    <td><span class="badge ${
                      location.is_active ? "badge-success" : "badge-danger"
                    }">${location.is_active ? "Active" : "Inactive"}</span></td>
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
    const showActive = document.getElementById("toggleActiveVehicles").checked;
    const label = document.getElementById("vehiclesToggleLabel");
    label.textContent = showActive ? "Active" : "Inactive";

    const response = await fetch(`/api/vehicles?is_active=${showActive}`);
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
    const showActive = document.getElementById("toggleActiveDrivers").checked;
    const label = document.getElementById("driversToggleLabel");
    label.textContent = showActive ? "Active" : "Inactive";

    const response = await fetch(`/api/drivers?is_active=${showActive}`);
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
// CARRIERS SECTION
// ============================================

async function loadCarriers() {
  try {
    const showActive = document.getElementById("toggleActiveCarriers").checked;
    const label = document.getElementById("carriersToggleLabel");
    label.textContent = showActive ? "Active" : "Inactive";

    const response = await fetch(`/api/carriers?is_active=${showActive}`);
    const carriers = await response.json();

    const tbody = document.getElementById("carriersTableBody");
    tbody.innerHTML = "";

    carriers.forEach((carrier) => {
      const row = `
        <tr>
          <td>${carrier.carrier_name}</td>
          <td>
            <button class="btn-icon" onclick="editCarrier(${carrier.carrier_id})" title="Edit">✏️</button>
            <button class="btn-icon" onclick="deleteCarrier(${carrier.carrier_id})" title="Delete">🗑️</button>
          </td>
        </tr>
      `;
      tbody.innerHTML += row;
    });
  } catch (error) {
    console.error("Error loading carriers:", error);
    alert("Failed to load carriers");
  }
}

function openCarrierModal(carrierId = null) {
  const modal = document.getElementById("carrierModal");
  const form = document.getElementById("carrierForm");
  const title = document.getElementById("carrierModalTitle");

  if (carrierId) {
    title.textContent = "Edit Carrier";
    loadCarrierData(carrierId);
  } else {
    title.textContent = "Add Carrier";
    form.reset();
    document.getElementById("carrierId").value = "";
  }
  modal.style.display = "flex";
}

async function loadCarrierData(carrierId) {
  try {
    const response = await fetch(`/api/carriers/${carrierId}`);
    const carrier = await response.json();
    document.getElementById("carrierId").value = carrier.carrier_id;
    document.getElementById("carrierName").value = carrier.carrier_name;
  } catch (error) {
    console.error("Error loading carrier:", error);
    alert("Failed to load carrier data");
  }
}

async function saveCarrier() {
  const carrierId = document.getElementById("carrierId").value;
  const carrierData = {
    carrier_name: document.getElementById("carrierName").value,
  };

  try {
    const url = carrierId ? `/api/carriers/${carrierId}` : "/api/carriers";
    const method = carrierId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(carrierData),
    });

    if (response.ok) {
      closeCarrierModal();
      loadCarriers();
      alert(
        carrierId
          ? "Carrier updated successfully!"
          : "Carrier created successfully!"
      );
    } else {
      alert("Failed to save carrier");
    }
  } catch (error) {
    console.error("Error saving carrier:", error);
    alert("Failed to save carrier");
  }
}

function editCarrier(carrierId) {
  openCarrierModal(carrierId);
}

async function deleteCarrier(carrierId) {
  if (!confirm("Are you sure you want to delete this carrier?")) return;

  try {
    const response = await fetch(`/api/carriers/${carrierId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      loadCarriers();
      alert("Carrier deleted successfully!");
    } else {
      alert("Failed to delete carrier");
    }
  } catch (error) {
    console.error("Error deleting carrier:", error);
    alert("Failed to delete carrier");
  }
}

function closeCarrierModal() {
  document.getElementById("carrierModal").style.display = "none";
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

// ============================================
// DELIVERIES MANAGEMENT
// ============================================

async function loadDeliveries() {
  try {
    const showActive = document.getElementById(
      "toggleActiveDeliveries"
    ).checked;
    const label = document.getElementById("deliveriesToggleLabel");
    label.textContent = showActive ? "Active" : "Inactive";

    const response = await fetch(`/api/deliveries?is_active=${showActive}`);
    const deliveries = await response.json();

    const tbody = document.getElementById("deliveriesTableBody");

    if (deliveries.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 20px; color: #999">
            No deliveries found. Click "Add Delivery" to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = deliveries
      .map(
        (delivery) => `
      <tr>
        <td><strong>${delivery.delivery_name}</strong></td>
        <td>${delivery.description || "-"}</td>
        <td>$${parseFloat(
          delivery.delivery_charge_per_tonne || 0
        ).toFixed(2)}</td>
        <td>
          <span class="badge ${
            delivery.is_active ? "badge-success" : "badge-danger"
          }">
            ${delivery.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td>
          <button class="btn-icon" onclick="editDelivery(${
            delivery.delivery_id
          })" title="Edit">
            ✏️
          </button>
          <button class="btn-icon" onclick="deleteDelivery(${
            delivery.delivery_id
          })" title="Delete">
            🗑️
          </button>
        </td>
      </tr>
    `
      )
      .join("");
  } catch (error) {
    console.error("Error loading deliveries:", error);
  }
}

function openDeliveryModal() {
  document.getElementById("deliveryModalTitle").textContent = "Add Delivery";
  document.getElementById("deliveryForm").reset();
  document.getElementById("deliveryId").value = "";
  document.getElementById("deliveryActive").checked = true;
  document.getElementById("deliveryModal").style.display = "flex";
}

function closeDeliveryModal() {
  document.getElementById("deliveryModal").style.display = "none";
}

async function saveDelivery() {
  const deliveryId = document.getElementById("deliveryId").value;
  const formData = {
    delivery_name: document.getElementById("deliveryName").value,
    description: document.getElementById("deliveryDescription").value,
    delivery_charge_per_tonne: parseFloat(
      document.getElementById("deliveryCharge").value
    ),
    is_active: document.getElementById("deliveryActive").checked,
  };

  try {
    const url = deliveryId
      ? `/api/deliveries/${deliveryId}`
      : "/api/deliveries";
    const method = deliveryId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      alert(deliveryId ? "✅ Delivery updated!" : "✅ Delivery added!");
      closeDeliveryModal();
      loadDeliveries();
    } else {
      alert("❌ Error saving delivery");
    }
  } catch (error) {
    console.error("Error saving delivery:", error);
    alert("Error saving delivery");
  }
}

async function editDelivery(deliveryId) {
  try {
    const response = await fetch(`/api/deliveries/${deliveryId}`);
    const delivery = await response.json();

    document.getElementById("deliveryModalTitle").textContent = "Edit Delivery";
    document.getElementById("deliveryId").value = delivery.delivery_id;
    document.getElementById("deliveryName").value = delivery.delivery_name;
    document.getElementById("deliveryDescription").value =
      delivery.description || "";
    document.getElementById("deliveryCharge").value =
      delivery.delivery_charge_per_tonne || 0;
    document.getElementById("deliveryActive").checked = delivery.is_active;

    document.getElementById("deliveryModal").style.display = "flex";
  } catch (error) {
    console.error("Error loading delivery:", error);
  }
}

async function deleteDelivery(deliveryId) {
  if (!confirm("Are you sure you want to delete this delivery option?")) return;

  try {
    const response = await fetch(`/api/deliveries/${deliveryId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      alert("✅ Delivery deleted!");
      loadDeliveries();
    } else {
      alert("❌ Error deleting delivery");
    }
  } catch (error) {
    console.error("Error deleting delivery:", error);
  }
}

// ============================================
// DELIVERY HOURLY RATES MANAGEMENT
// ============================================

async function loadDeliveryRates() {
  try {
    const response = await fetch("/api/delivery-hourly-rates?is_active=true");
    const rates = await response.json();

    const tbody = document.getElementById("deliveryRatesTableBody");

    if (rates.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 20px; color: #999">
            No delivery rates found. Click "Add Rate" to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = rates
      .map(
        (rate) => `
      <tr>
        <td><strong>${rate.trailer_count}</strong></td>
       <td>$${parseFloat(rate.hourly_rate).toFixed(2)}</td>
        <td>${rate.description || "-"}</td>
        <td>
          <span class="badge ${rate.is_active ? "badge-success" : "badge-danger"}">
            ${rate.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td>
          <button class="btn-icon" onclick="editDeliveryRate(${rate.rate_id})" title="Edit">✏️</button>
          <button class="btn-icon" onclick="deleteDeliveryRate(${rate.rate_id})" title="Delete">🗑️</button>
        </td>
      </tr>
    `
      )
      .join("");
  } catch (error) {
    console.error("Error loading delivery rates:", error);
  }
}

function openDeliveryRateModal() {
  document.getElementById("deliveryRateModalTitle").textContent = "Add Delivery Rate";
  document.getElementById("deliveryRateForm").reset();
  document.getElementById("deliveryRateId").value = "";
  document.getElementById("rateActive").checked = true;
  document.getElementById("deliveryRateModal").style.display = "flex";
}

function closeDeliveryRateModal() {
  document.getElementById("deliveryRateModal").style.display = "none";
}

async function saveDeliveryRate() {
  const rateId = document.getElementById("deliveryRateId").value;
  const formData = {
    trailer_count: document.getElementById("rateTrailerCount").value,
    hourly_rate: parseFloat(document.getElementById("rateHourlyRate").value),
    description: document.getElementById("rateDescription").value,
    is_active: document.getElementById("rateActive").checked,
  };

  try {
    const url = rateId
      ? `/api/delivery-hourly-rates/${rateId}`
      : "/api/delivery-hourly-rates";
    const method = rateId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      alert(rateId ? "✅ Rate updated!" : "✅ Rate added!");
      closeDeliveryRateModal();
      loadDeliveryRates();
    } else {
      const err = await response.json();
      alert("❌ Error: " + (err.error || "Failed to save rate"));
    }
  } catch (error) {
    console.error("Error saving rate:", error);
    alert("Error saving rate");
  }
}

async function editDeliveryRate(rateId) {
  try {
    const response = await fetch(`/api/delivery-hourly-rates/${rateId}`);
    const rate = await response.json();

    document.getElementById("deliveryRateModalTitle").textContent = "Edit Delivery Rate";
    document.getElementById("deliveryRateId").value = rate.rate_id;
    document.getElementById("rateTrailerCount").value = rate.trailer_count;
    document.getElementById("rateHourlyRate").value = rate.hourly_rate;
    document.getElementById("rateDescription").value = rate.description || "";
    document.getElementById("rateActive").checked = rate.is_active;

    document.getElementById("deliveryRateModal").style.display = "flex";
  } catch (error) {
    console.error("Error loading rate:", error);
  }
}

async function deleteDeliveryRate(rateId) {
  if (!confirm("Are you sure you want to delete this rate?")) return;

  try {
    const response = await fetch(`/api/delivery-hourly-rates/${rateId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      alert("✅ Rate deleted!");
      loadDeliveryRates();
    } else {
      alert("❌ Error deleting rate");
    }
  } catch (error) {
    console.error("Error deleting rate:", error);
  }
}

// ============================================
// PRICE LISTS MANAGEMENT
// ============================================

async function loadPriceLists() {
  try {
    const response = await fetch("/api/price-lists");
    const priceLists = await response.json();

    const tbody = document.getElementById("priceListsTableBody");

    if (priceLists.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 20px; color: #999">
            No price lists found. Click "Add Price List" to create one.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = priceLists
      .map(
        (pl) => `
      <tr>
        <td><strong>${pl.price_list_name}</strong></td>
        <td>${pl.description || "-"}</td>
        <td>${
          pl.is_default
            ? '<span class="badge badge-success">✓ Default</span>'
            : "-"
        }</td>
        <td>${pl.sort_order || "-"}</td>
        <td>
          <span class="badge ${pl.is_active ? "badge-success" : "badge-danger"}">
            ${pl.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td>
          <button class="btn-icon" onclick="editPriceList(${pl.price_list_id})" title="Edit">✏️</button>
          <button class="btn-icon" onclick="setDefaultPriceList(${pl.price_list_id})" title="Set as Default">⭐</button>
          <button class="btn-icon" onclick="deletePriceList(${pl.price_list_id})" title="Delete">🗑️</button>
        </td>
      </tr>
    `
      )
      .join("");
  } catch (error) {
    console.error("Error loading price lists:", error);
  }
}

function openPriceListModal(priceListId = null) {
  const modal = document.getElementById("priceListModal");
  const form = document.getElementById("priceListForm");
  const title = document.getElementById("priceListModalTitle");

  if (priceListId) {
    title.textContent = "Edit Price List";
    loadPriceListData(priceListId);
  } else {
    title.textContent = "Add Price List";
    form.reset();
    document.getElementById("priceListId").value = "";
    document.getElementById("priceListActive").checked = true;
    document.getElementById("priceListSortOrder").value = "10";
  }
  modal.style.display = "flex";
}

function closePriceListModal() {
  document.getElementById("priceListModal").style.display = "none";
}

async function loadPriceListData(priceListId) {
  try {
    const response = await fetch(`/api/price-lists/${priceListId}`);
    const pl = await response.json();

    document.getElementById("priceListId").value = pl.price_list_id;
    document.getElementById("priceListName").value = pl.price_list_name;
    document.getElementById("priceListDescription").value = pl.description || "";
    document.getElementById("priceListSortOrder").value = pl.sort_order || 10;
    document.getElementById("priceListDefault").checked = pl.is_default;
    document.getElementById("priceListActive").checked = pl.is_active;
  } catch (error) {
    console.error("Error loading price list:", error);
    alert("Failed to load price list data");
  }
}

async function savePriceList() {
  const priceListId = document.getElementById("priceListId").value;
  const formData = {
    price_list_name: document.getElementById("priceListName").value,
    description: document.getElementById("priceListDescription").value,
    sort_order: parseInt(document.getElementById("priceListSortOrder").value) || 10,
    is_default: document.getElementById("priceListDefault").checked,
    is_active: document.getElementById("priceListActive").checked,
  };

  try {
    const url = priceListId
      ? `/api/price-lists/${priceListId}`
      : "/api/price-lists";
    const method = priceListId ? "PUT" : "POST";

    const response = await fetch(url, {
      method: method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });

    if (response.ok) {
      alert(priceListId ? "✅ Price list updated!" : "✅ Price list created!");
      closePriceListModal();
      loadPriceLists();
    } else {
      const err = await response.json();
      alert("❌ Error: " + (err.error || "Failed to save price list"));
    }
  } catch (error) {
    console.error("Error saving price list:", error);
    alert("Error saving price list");
  }
}

async function editPriceList(priceListId) {
  openPriceListModal(priceListId);
}

async function setDefaultPriceList(priceListId) {
  if (!confirm("Set this price list as the default for Sales Entry?")) return;

  try {
    const response = await fetch(`/api/price-lists/${priceListId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_default: true }),
    });

    if (response.ok) {
      alert("✅ Default price list updated!");
      loadPriceLists();
    } else {
      alert("❌ Failed to set default");
    }
  } catch (error) {
    console.error("Error setting default:", error);
  }
}

async function deletePriceList(priceListId) {
  if (!confirm("Are you sure you want to deactivate this price list?")) return;

  try {
    const response = await fetch(`/api/price-lists/${priceListId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      alert("✅ Price list deactivated!");
      loadPriceLists();
    } else {
      alert("❌ Error deactivating price list");
    }
  } catch (error) {
    console.error("Error deleting price list:", error);
  }
}

// ============================================
// PRODUCT PRICES PER PRICE LIST
// ============================================

// ============================================
// PRICING MATRIX
// ============================================

let matrixPriceLists = [];
let matrixOriginalPrices = {};

async function loadPricingMatrix() {
  try {
    // Get active price lists for column headers
    const plRes = await fetch("/api/price-lists?is_active=true");
    matrixPriceLists = await plRes.json();
    matrixPriceLists.sort((a, b) => (a.sort_order || 10) - (b.sort_order || 10));

    // Get full pricing matrix
    const matrixRes = await fetch("/api/price-lists/matrix/all");
    const matrixData = await matrixRes.json();

    // Build product lookup: { product_id: { name, family, prices: { pl_id: price } } }
    const products = {};
    matrixData.forEach((row) => {
      if (!products[row.product_id]) {
        products[row.product_id] = {
          product_id: row.product_id,
          product_name: row.product_name,
          product_code: row.product_code,
          family_group: row.family_group,
          prices: {},
        };
      }
      if (row.price_per_tonne !== null && row.price_per_tonne !== undefined) {
        products[row.product_id].prices[row.price_list_id] = parseFloat(row.price_per_tonne);
      }
    });

    // Store originals for change detection
    matrixOriginalPrices = {};
    Object.values(products).forEach((p) => {
      matrixPriceLists.forEach((pl) => {
        const key = `${p.product_id}_${pl.price_list_id}`;
        matrixOriginalPrices[key] = p.prices[pl.price_list_id] ?? null;
      });
    });

    // Build header
    const thead = document.getElementById("pricingMatrixHead");
    thead.innerHTML = `
      <tr>
        <th>Family</th>
        <th>Product</th>
        ${matrixPriceLists
          .map(
            (pl) =>
              `<th style="text-align: center">
                ${pl.price_list_name}
                ${pl.is_default ? '<br><small style="color: #28a745">★ Default</small>' : ""}
              </th>`
          )
          .join("")}
      </tr>
    `;

    // Build rows grouped by family
    const sortedProducts = Object.values(products).sort((a, b) => {
      if (a.family_group !== b.family_group)
        return a.family_group.localeCompare(b.family_group);
      return a.product_name.localeCompare(b.product_name);
    });

    const tbody = document.getElementById("pricingMatrixBody");
    let lastFamily = "";

    tbody.innerHTML = sortedProducts
      .map((product) => {
        let familyCell = "";
        if (product.family_group !== lastFamily) {
          // Count products in this family for rowspan
          const familyCount = sortedProducts.filter(
            (p) => p.family_group === product.family_group
          ).length;
          familyCell = `<td rowspan="${familyCount}" style="vertical-align: top; font-weight: bold; background: #f8f9fa; border-right: 2px solid #dee2e6">
            <span class="badge badge-${product.family_group.toLowerCase()}">${product.family_group}</span>
          </td>`;
          lastFamily = product.family_group;
        }

        const priceCells = matrixPriceLists
          .map((pl) => {
            const price = product.prices[pl.price_list_id];
            const key = `${product.product_id}_${pl.price_list_id}`;
            return `<td style="text-align: center; padding: 4px">
              <input type="number" step="0.01" min="0"
                class="matrix-price-input"
                data-key="${key}"
                data-product-id="${product.product_id}"
                data-price-list-id="${pl.price_list_id}"
                value="${price !== undefined ? price.toFixed(2) : ""}"
                placeholder="—"
                style="width: 110px; padding: 4px 8px; text-align: right; border: 1px solid #ddd; border-radius: 4px"
                onchange="markMatrixChanged(this)"
              />
            </td>`;
          })
          .join("");

        return `<tr>${familyCell}<td>${product.product_name}</td>${priceCells}</tr>`;
      })
      .join("");
  } catch (error) {
    console.error("Error loading pricing matrix:", error);
  }
}

function markMatrixChanged(input) {
  const key = input.dataset.key;
  const original = matrixOriginalPrices[key];
  const current = input.value ? parseFloat(input.value) : null;

  if (original !== current) {
    input.style.backgroundColor = "#fff9c4";
    input.style.borderColor = "#ffc107";
  } else {
    input.style.backgroundColor = "";
    input.style.borderColor = "#ddd";
  }
}

async function saveAllMatrixPrices() {
  const inputs = document.querySelectorAll(".matrix-price-input");
  const changesByPriceList = {};
  let changeCount = 0;

  inputs.forEach((input) => {
    const key = input.dataset.key;
    const original = matrixOriginalPrices[key];
    const current = input.value ? parseFloat(input.value) : null;

    if (original !== current && current !== null) {
      const plId = input.dataset.priceListId;
      if (!changesByPriceList[plId]) {
        changesByPriceList[plId] = [];
      }
      changesByPriceList[plId].push({
        product_id: parseInt(input.dataset.productId),
        price_per_tonne: current,
      });
      changeCount++;
    }
  });

  if (changeCount === 0) {
    alert("No changes to save");
    return;
  }

  if (!confirm(`Save ${changeCount} price change${changeCount > 1 ? "s" : ""} across ${Object.keys(changesByPriceList).length} price list${Object.keys(changesByPriceList).length > 1 ? "s" : ""}?`)) {
    return;
  }

  try {
    let saved = 0;
    for (const [plId, prices] of Object.entries(changesByPriceList)) {
      const response = await fetch(`/api/price-lists/${plId}/prices`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prices }),
      });

      if (response.ok) {
        const result = await response.json();
        saved += result.count;
      }
    }

    alert(`✅ Saved ${saved} prices successfully!`);

    // Reset change indicators
    inputs.forEach((input) => {
      input.style.backgroundColor = "#e8f5e9";
      input.style.borderColor = "#4caf50";
    });
    setTimeout(() => {
      inputs.forEach((input) => {
        input.style.backgroundColor = "";
        input.style.borderColor = "#ddd";
      });
    }, 1500);

    // Update originals
    inputs.forEach((input) => {
      const key = input.dataset.key;
      matrixOriginalPrices[key] = input.value ? parseFloat(input.value) : null;
    });
  } catch (error) {
    console.error("Error saving matrix prices:", error);
    alert("Error saving prices");
  }
}