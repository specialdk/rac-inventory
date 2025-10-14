// Maintenance Page JavaScript

let currentSection = "products";

// Show/Hide sections
function showSection(section) {
  currentSection = section;

  // Hide all sections
  document
    .querySelectorAll(".maintenance-section")
    .forEach((s) => s.classList.remove("active"));
  document
    .querySelectorAll(".sub-nav-item")
    .forEach((btn) => btn.classList.remove("active"));

  // Show selected section
  document.getElementById(`${section}-section`).classList.add("active");
  event.target.classList.add("active");

  // Load data for the section
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

// Format currency
function formatCurrency(value) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(value);
}

// ==================== PRODUCTS ====================

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    const products = await response.json();

    const container = document.getElementById("productsTableContainer");

    if (products.length === 0) {
      container.innerHTML =
        '<div class="loading"><p>No products found</p></div>';
      return;
    }

    let html = `
            <table>
                <thead>
                    <tr>
                        <th>Product Code</th>
                        <th>Product Name</th>
                        <th>Family</th>
                        <th>Standard Cost</th>
                        <th>Current Price</th>
                        <th>Min/Max Stock</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

    products.forEach((product) => {
      const statusBadge = product.is_active
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-danger">Inactive</span>';

      html += `
                <tr>
                    <td><strong>${product.product_code}</strong></td>
                    <td>${product.product_name}</td>
                    <td>${product.family_group}</td>
                    <td>${formatCurrency(product.standard_cost)}</td>
                    <td>${formatCurrency(product.current_price || 0)}</td>
                    <td>${product.min_stock_level || 0} / ${
        product.max_stock_level || 0
      }</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" onclick='editProduct(${JSON.stringify(
                              product
                            )})'>✏️ Edit</button>
                            <button class="btn-delete" onclick="deleteProduct(${
                              product.product_id
                            })">🗑️ Delete</button>
                        </div>
                    </td>
                </tr>
            `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    // Add search
    document.getElementById("searchProducts").addEventListener("input", (e) => {
      filterTable(e.target.value, "productsTableContainer");
    });
  } catch (error) {
    console.error("Error loading products:", error);
    document.getElementById("productsTableContainer").innerHTML =
      '<div class="loading"><p>Error loading products</p></div>';
  }
}

function openAddProductModal() {
  document.getElementById("productModalTitle").textContent = "Add Product";
  document.getElementById("productForm").reset();
  document.getElementById("product_id").value = "";
  document.getElementById("productModal").classList.add("active");
}

function closeProductModal() {
  document.getElementById("productModal").classList.remove("active");
  document.getElementById("productForm").reset();
}

function editProduct(product) {
  document.getElementById("productModalTitle").textContent = "Edit Product";
  document.getElementById("product_id").value = product.product_id;
  document.getElementById("product_code").value = product.product_code;
  document.getElementById("product_name").value = product.product_name;
  document.getElementById("family_group").value = product.family_group;
  document.getElementById("unit").value = product.unit || "tonnes";
  document.getElementById("standard_cost").value = product.standard_cost;
  document.getElementById("current_price").value = product.current_price || "";
  document.getElementById("min_stock_level").value =
    product.min_stock_level || "";
  document.getElementById("max_stock_level").value =
    product.max_stock_level || "";
  document.getElementById("productModal").classList.add("active");
}

async function saveProduct() {
  try {
    const productId = document.getElementById("product_id").value;
    const data = {
      product_code: document.getElementById("product_code").value,
      product_name: document.getElementById("product_name").value,
      family_group: document.getElementById("family_group").value,
      unit: document.getElementById("unit").value || "tonnes",
      standard_cost: parseFloat(document.getElementById("standard_cost").value),
      current_price:
        parseFloat(document.getElementById("current_price").value) || null,
      min_stock_level:
        parseFloat(document.getElementById("min_stock_level").value) || null,
      max_stock_level:
        parseFloat(document.getElementById("max_stock_level").value) || null,
    };

    const url = productId ? `/api/products/${productId}` : "/api/products";
    const method = productId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      alert(
        productId
          ? "✅ Product updated successfully!"
          : "✅ Product created successfully!"
      );
      closeProductModal();
      loadProducts();
    } else {
      const error = await response.json();
      alert("❌ Error: " + (error.error || "Failed to save product"));
    }
  } catch (error) {
    console.error("Error saving product:", error);
    alert("❌ Error saving product");
  }
}

async function deleteProduct(productId) {
  if (!confirm("Are you sure you want to deactivate this product?")) return;

  try {
    const response = await fetch(`/api/products/${productId}`, {
      method: "DELETE",
    });

    if (response.ok) {
      alert("✅ Product deactivated successfully!");
      loadProducts();
    } else {
      alert("❌ Failed to deactivate product");
    }
  } catch (error) {
    console.error("Error deleting product:", error);
    alert("❌ Error deleting product");
  }
}

// ==================== CUSTOMERS ====================

async function loadCustomers() {
  try {
    const response = await fetch("/api/customers");
    const customers = await response.json();

    const container = document.getElementById("customersTableContainer");

    if (customers.length === 0) {
      container.innerHTML =
        '<div class="loading"><p>No customers found</p></div>';
      return;
    }

    let html = `
            <table>
                <thead>
                    <tr>
                        <th>Customer Code</th>
                        <th>Customer Name</th>
                        <th>Type</th>
                        <th>Contact</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

    customers.forEach((customer) => {
      const statusBadge = customer.is_active
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-danger">Inactive</span>';

      html += `
                <tr>
                    <td><strong>${customer.customer_code}</strong></td>
                    <td>${customer.customer_name}</td>
                    <td>${customer.customer_type || "-"}</td>
                    <td>${customer.contact_person || "-"}</td>
                    <td>${customer.phone || "-"}</td>
                    <td>${customer.email || "-"}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" onclick='editCustomer(${JSON.stringify(
                              customer
                            ).replace(/'/g, "&apos;")})'>✏️ Edit</button>
                            <button class="btn-delete" onclick="deleteCustomer(${
                              customer.customer_id
                            })">🗑️ Delete</button>
                        </div>
                    </td>
                </tr>
            `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    document
      .getElementById("searchCustomers")
      .addEventListener("input", (e) => {
        filterTable(e.target.value, "customersTableContainer");
      });
  } catch (error) {
    console.error("Error loading customers:", error);
  }
}

function openAddCustomerModal() {
  document.getElementById("customerModalTitle").textContent = "Add Customer";
  document.getElementById("customerForm").reset();
  document.getElementById("customer_id").value = "";
  document.getElementById("customerModal").classList.add("active");
}

function closeCustomerModal() {
  document.getElementById("customerModal").classList.remove("active");
}

function editCustomer(customer) {
  document.getElementById("customerModalTitle").textContent = "Edit Customer";
  document.getElementById("customer_id").value = customer.customer_id;
  document.getElementById("customer_code").value = customer.customer_code;
  document.getElementById("customer_name").value = customer.customer_name;
  document.getElementById("contact_person").value =
    customer.contact_person || "";
  document.getElementById("phone").value = customer.phone || "";
  document.getElementById("email").value = customer.email || "";
  document.getElementById("address").value = customer.address || "";
  document.getElementById("customer_type").value = customer.customer_type || "";
  document.getElementById("customerModal").classList.add("active");
}

async function saveCustomer() {
  try {
    const customerId = document.getElementById("customer_id").value;
    const data = {
      customer_code: document.getElementById("customer_code").value,
      customer_name: document.getElementById("customer_name").value,
      contact_person: document.getElementById("contact_person").value || null,
      phone: document.getElementById("phone").value || null,
      email: document.getElementById("email").value || null,
      address: document.getElementById("address").value || null,
      customer_type: document.getElementById("customer_type").value || null,
    };

    const url = customerId ? `/api/customers/${customerId}` : "/api/customers";
    const method = customerId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      alert(customerId ? "✅ Customer updated!" : "✅ Customer created!");
      closeCustomerModal();
      loadCustomers();
    } else {
      const error = await response.json();
      alert("❌ Error: " + (error.error || "Failed to save"));
    }
  } catch (error) {
    console.error("Error:", error);
    alert("❌ Error saving customer");
  }
}

async function deleteCustomer(customerId) {
  if (!confirm("Deactivate this customer?")) return;

  try {
    const response = await fetch(`/api/customers/${customerId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      alert("✅ Customer deactivated!");
      loadCustomers();
    }
  } catch (error) {
    alert("❌ Error");
  }
}

// ==================== LOCATIONS ====================

async function loadLocations() {
  try {
    const response = await fetch("/api/locations");
    const locations = await response.json();

    const container = document.getElementById("locationsTableContainer");

    let html = `
            <table>
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Location Name</th>
                        <th>Type</th>
                        <th>Capacity (tonnes)</th>
                        <th>Assigned Product</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

    locations.forEach((location) => {
      const statusBadge = location.is_active
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-danger">Inactive</span>';

      html += `
                <tr>
                    <td><strong>${location.location_code}</strong></td>
                    <td>${location.location_name}</td>
                    <td><span class="badge badge-info">${
                      location.location_type
                    }</span></td>
                    <td>${location.capacity_tonnes || "-"}</td>
                    <td>${location.product_name || "-"}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" onclick='alert("Edit location coming soon")'>✏️ Edit</button>
                        </div>
                    </td>
                </tr>
            `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    document
      .getElementById("searchLocations")
      .addEventListener("input", (e) => {
        filterTable(e.target.value, "locationsTableContainer");
      });
  } catch (error) {
    console.error("Error loading locations:", error);
  }
}

function openAddLocationModal() {
  alert("Add Location feature coming soon!");
}

// ==================== VEHICLES ====================

async function loadVehicles() {
  try {
    const response = await fetch("/api/vehicles");
    const vehicles = await response.json();

    const container = document.getElementById("vehiclesTableContainer");

    let html = `
            <table>
                <thead>
                    <tr>
                        <th>Registration</th>
                        <th>Vehicle Type</th>
                        <th>Capacity (tonnes)</th>
                        <th>Last Service</th>
                        <th>Next Service</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

    vehicles.forEach((vehicle) => {
      const statusBadge = vehicle.is_active
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-danger">Inactive</span>';

      html += `
                <tr>
                    <td><strong>${vehicle.registration}</strong></td>
                    <td>${vehicle.vehicle_type || "-"}</td>
                    <td>${vehicle.capacity_tonnes || "-"}</td>
                    <td>${
                      vehicle.last_service_date
                        ? new Date(
                            vehicle.last_service_date
                          ).toLocaleDateString()
                        : "-"
                    }</td>
                    <td>${
                      vehicle.next_service_date
                        ? new Date(
                            vehicle.next_service_date
                          ).toLocaleDateString()
                        : "-"
                    }</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" onclick='alert("Edit vehicle coming soon")'>✏️ Edit</button>
                        </div>
                    </td>
                </tr>
            `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    document.getElementById("searchVehicles").addEventListener("input", (e) => {
      filterTable(e.target.value, "vehiclesTableContainer");
    });
  } catch (error) {
    console.error("Error loading vehicles:", error);
  }
}

function openAddVehicleModal() {
  alert("Add Vehicle feature coming soon!");
}

// ==================== DRIVERS ====================

async function loadDrivers() {
  try {
    const response = await fetch("/api/drivers");
    const drivers = await response.json();

    const container = document.getElementById("driversTableContainer");

    let html = `
            <table>
                <thead>
                    <tr>
                        <th>Code</th>
                        <th>Driver Name</th>
                        <th>License Number</th>
                        <th>License Class</th>
                        <th>License Expiry</th>
                        <th>Status</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

    drivers.forEach((driver) => {
      const statusBadge = driver.is_active
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-danger">Inactive</span>';

      html += `
                <tr>
                    <td><strong>${driver.driver_code}</strong></td>
                    <td>${driver.driver_name}</td>
                    <td>${driver.license_number || "-"}</td>
                    <td>${driver.license_class || "-"}</td>
                    <td>${
                      driver.license_expiry
                        ? new Date(driver.license_expiry).toLocaleDateString()
                        : "-"
                    }</td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn-edit" onclick='alert("Edit driver coming soon")'>✏️ Edit</button>
                        </div>
                    </td>
                </tr>
            `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    document.getElementById("searchDrivers").addEventListener("input", (e) => {
      filterTable(e.target.value, "driversTableContainer");
    });
  } catch (error) {
    console.error("Error loading drivers:", error);
  }
}

function openAddDriverModal() {
  alert("Add Driver feature coming soon!");
}

// ==================== UTILITY FUNCTIONS ====================

function filterTable(searchTerm, containerId) {
  const term = searchTerm.toLowerCase();
  const rows = document.querySelectorAll(`#${containerId} tbody tr`);

  rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(term) ? "" : "none";
  });
}

async function loadInventoryValue() {
  try {
    const response = await fetch("/api/stock/summary");
    const data = await response.json();
    document.getElementById("totalValue").textContent = formatCurrency(
      data.total_inventory_value || 0
    );
  } catch (error) {
    console.error("Error loading inventory value:", error);
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
  loadInventoryValue();
});
