// RAC Inventory - Demand Management JavaScript
// This file handles all demand order functionality

// Global variables
let demandOrders = [];
let demandProductsData = [];
let demandCustomersData = [];
let demandLocationsData = [];
let currentEditingOrder = null;

// ============================================
// MAIN DEMAND MANAGEMENT MODAL
// ============================================

async function openDemandManagement() {
  document.getElementById("demandManagementModal").style.display = "flex";
  await loadDemandData();
  await loadDemandOrders();
}

function closeDemandManagement() {
  document.getElementById("demandManagementModal").style.display = "none";
}

// Load dropdown data for demand forms
async function loadDemandData() {
  try {
    // Load products
    const productsRes = await fetch("/api/products");
    demandProductsData = await productsRes.json();

    // Load customers
    const customersRes = await fetch("/api/customers");
    demandCustomersData = await customersRes.json();

    // Load locations
    const locationsRes = await fetch("/api/locations?is_active=true");
    demandLocationsData = await locationsRes.json();
  } catch (error) {
    console.error("Error loading demand data:", error);
  }
}

// ============================================
// LOAD AND DISPLAY DEMAND ORDERS
// ============================================

async function loadDemandOrders(statusFilter = "") {
  try {
    let url = "/api/demand-orders";
    if (statusFilter) {
      url += `?status=${statusFilter}`;
    }

    const response = await fetch(url);
    demandOrders = await response.json();

    displayDemandOrders(demandOrders);
  } catch (error) {
    console.error("Error loading demand orders:", error);
    alert("Error loading demand orders");
  }
}

function displayDemandOrders(orders) {
  const tbody = document.getElementById("demandOrdersTableBody");

  if (!tbody) {
    console.error("Demand orders table body not found");
    return;
  }

  tbody.innerHTML = "";

  if (orders.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="9" style="text-align: center; padding: 20px; color: #999;">No demand orders found</td></tr>';
    return;
  }

  orders.forEach((order) => {
    const row = document.createElement("tr");

    // Format dates
    const orderDate = new Date(order.order_date).toLocaleDateString("en-AU", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const requiredDate = new Date(order.required_date).toLocaleDateString(
      "en-AU",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );

    // Status badge
    let statusBadge = "";
    switch (order.status) {
      case "PENDING":
        statusBadge = '<span class="badge badge-warning">PENDING</span>';
        break;
      case "CONFIRMED":
        statusBadge = '<span class="badge badge-info">CONFIRMED</span>';
        break;
      case "FULFILLED":
        statusBadge = '<span class="badge badge-success">FULFILLED</span>';
        break;
      case "CANCELLED":
        statusBadge = '<span class="badge badge-danger">CANCELLED</span>';
        break;
    }

    // Action buttons based on status
    let actionButtons = "";
    if (order.status === "PENDING" || order.status === "CONFIRMED") {
      actionButtons = `
        <button class="btn btn-sm btn-primary" onclick="editDemandOrder(${order.demand_order_id})" title="Edit">
          ✏️
        </button>
        <button class="btn btn-sm btn-danger" onclick="cancelDemandOrder(${order.demand_order_id})" title="Cancel">
          ❌
        </button>
      `;
    } else if (order.status === "CANCELLED") {
      actionButtons = `
        <button class="btn btn-sm btn-secondary" onclick="reopenDemandOrder(${order.demand_order_id})" title="Reopen">
          🔄
        </button>
      `;
    }

    row.innerHTML = `
      <td>${order.order_number}</td>
      <td>${orderDate}</td>
      <td>${requiredDate}</td>
      <td>${order.product_name || "-"}</td>
      <td>${order.customer_name || "-"}</td>
      <td class="text-right">${parseFloat(order.quantity).toFixed(1)}t</td>
      <td>${statusBadge}</td>
      <td class="text-muted" style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;">${
        order.notes || "-"
      }</td>
      <td>
        <div style="display: flex; gap: 5px; justify-content: center;">
          ${actionButtons}
        </div>
      </td>
    `;

    tbody.appendChild(row);
  });
}

// ============================================
// FILTER DEMAND ORDERS
// ============================================

function filterDemandOrders() {
  const statusFilter =
    document.getElementById("demandStatusFilter")?.value || "";
  loadDemandOrders(statusFilter);
}

// ============================================
// NEW DEMAND ORDER FORM
// ============================================

async function openDemandOrderForm() {
  currentEditingOrder = null;

  // Ensure data is loaded first
  if (demandProductsData.length === 0) {
    await loadDemandData();
  }

  document.getElementById("demandOrderFormModal").style.display = "flex";
  document.getElementById("demandOrderForm").reset();
  document.getElementById("demandFormTitle").textContent =
    "➕ New Demand Order";

  // Set default dates
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  document.getElementById("demandRequiredDate").value = tomorrowStr;

  // Load dropdowns
  populateDemandFormDropdowns();
}

function closeDemandOrderForm() {
  document.getElementById("demandOrderFormModal").style.display = "none";
  currentEditingOrder = null;
}

function populateDemandFormDropdowns() {
  console.log("🔍 Checking elements...");
  console.log("Product element:", document.getElementById("demandFormProduct"));
  console.log(
    "Customer element:",
    document.getElementById("demandFormCustomer")
  );
  console.log(
    "Location element:",
    document.getElementById("demandFormLocation")
  );
  console.log("Data loaded:", {
    products: demandProductsData.length,
    customers: demandCustomersData.length,
    locations: demandLocationsData.length,
  });

  // Products
  const productSelect = document.getElementById("demandFormProduct");
  if (!productSelect) {
    console.error("❌ Product select not found!");
    return;
  }
  productSelect.innerHTML = '<option value="">Select Product</option>';
  demandProductsData.forEach((product) => {
    const option = new Option(product.product_name, product.product_id);
    productSelect.add(option);
  });

  // Customers
  const customerSelect = document.getElementById("demandFormCustomer");
  if (!customerSelect) {
    console.error("❌ Customer select not found!");
    return;
  }
  customerSelect.innerHTML = '<option value="">Select Customer</option>';
  demandCustomersData.forEach((customer) => {
    const option = new Option(customer.customer_name, customer.customer_id);
    customerSelect.add(option);
  });

  // Locations (optional)
  const locationSelect = document.getElementById("demandFormLocation");
  if (!locationSelect) {
    console.error("❌ Location select not found!");
    return;
  }
  locationSelect.innerHTML = '<option value="">Any Location</option>';
  demandLocationsData.forEach((location) => {
    const option = new Option(location.location_name, location.location_id);
    locationSelect.add(option);
  });
}

// ============================================
// SAVE DEMAND ORDER (CREATE OR UPDATE)
// ============================================

async function saveDemandOrder() {
  const formData = {
    order_date: document.getElementById("demandOrderDate").value,
    required_date: document.getElementById("demandRequiredDate").value,
    product_id: parseInt(document.getElementById("demandProductId").value),
    customer_id: parseInt(document.getElementById("demandCustomerId").value),
    quantity: parseFloat(document.getElementById("demandQuantity").value),
    preferred_location_id: document.getElementById("demandPreferredLocation")
      .value
      ? parseInt(document.getElementById("demandPreferredLocation").value)
      : null,
    notes: document.getElementById("demandNotes").value,
    status: document.getElementById("demandStatus")?.value || "PENDING",
  };

  // Validate
  if (
    !formData.order_date ||
    !formData.required_date ||
    !formData.product_id ||
    !formData.customer_id ||
    !formData.quantity
  ) {
    alert("Please fill in all required fields");
    return;
  }

  if (formData.quantity <= 0) {
    alert("Quantity must be positive");
    return;
  }

  // Check if required date is in the future or today
  const requiredDate = new Date(formData.required_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (requiredDate < today) {
    alert("Required date must be today or in the future");
    return;
  }

  try {
    let response;

    if (currentEditingOrder) {
      // UPDATE existing order
      response = await fetch(
        `/api/demand-orders/${currentEditingOrder.demand_order_id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...formData,
            last_modified_by: "SYSTEM", // Replace with actual user when auth is implemented
          }),
        }
      );
    } else {
      // CREATE new order
      response = await fetch("/api/demand-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          created_by: "SYSTEM", // Replace with actual user when auth is implemented
        }),
      });
    }

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to save demand order");
      return;
    }

    const result = await response.json();

    if (currentEditingOrder) {
      alert(`✅ Demand order ${result.order_number} updated successfully!`);
    } else {
      alert(`✅ Demand order ${result.order_number} created successfully!`);
    }

    closeDemandOrderForm();
    await loadDemandOrders();
  } catch (error) {
    console.error("Error saving demand order:", error);
    alert("Error saving demand order");
  }
}

// ============================================
// EDIT DEMAND ORDER
// ============================================

async function editDemandOrder(demandOrderId) {
  try {
    const response = await fetch(`/api/demand-orders/${demandOrderId}`);
    if (!response.ok) {
      throw new Error("Failed to load demand order");
    }

    currentEditingOrder = await response.json();

    // Open form and populate with existing data
    document.getElementById("demandOrderFormModal").style.display = "flex";
    document.getElementById("demandOrderFormTitle").textContent =
      "✏️ Edit Demand Order";

    // Load dropdowns first
    populateDemandFormDropdowns();

    // Populate form fields
    document.getElementById("demandOrderDate").value =
      currentEditingOrder.order_date.split("T")[0];
    document.getElementById("demandRequiredDate").value =
      currentEditingOrder.required_date.split("T")[0];
    document.getElementById("demandProductId").value =
      currentEditingOrder.product_id;
    document.getElementById("demandCustomerId").value =
      currentEditingOrder.customer_id;
    document.getElementById("demandQuantity").value =
      currentEditingOrder.quantity;
    document.getElementById("demandPreferredLocation").value =
      currentEditingOrder.preferred_location_id || "";
    document.getElementById("demandNotes").value =
      currentEditingOrder.notes || "";

    // Show status dropdown for editing (hidden for new orders)
    const statusField = document.getElementById("demandStatusField");
    if (statusField) {
      statusField.style.display = "block";
      document.getElementById("demandStatus").value =
        currentEditingOrder.status;
    }
  } catch (error) {
    console.error("Error loading demand order for edit:", error);
    alert("Error loading demand order");
  }
}

// ============================================
// CANCEL DEMAND ORDER
// ============================================

async function cancelDemandOrder(demandOrderId) {
  const reason = prompt("Please enter cancellation reason:");

  if (!reason) {
    return; // User cancelled the cancellation
  }

  if (!confirm("Are you sure you want to cancel this demand order?")) {
    return;
  }

  try {
    const response = await fetch(`/api/demand-orders/${demandOrderId}/cancel`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cancelled_by: "SYSTEM", // Replace with actual user
        cancelled_reason: reason,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to cancel demand order");
      return;
    }

    alert("✅ Demand order cancelled successfully!");
    await loadDemandOrders();
  } catch (error) {
    console.error("Error cancelling demand order:", error);
    alert("Error cancelling demand order");
  }
}

// ============================================
// REOPEN DEMAND ORDER
// ============================================

async function reopenDemandOrder(demandOrderId) {
  if (!confirm("Reopen this cancelled demand order?")) {
    return;
  }

  try {
    const response = await fetch(`/api/demand-orders/${demandOrderId}/reopen`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        last_modified_by: "SYSTEM", // Replace with actual user
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to reopen demand order");
      return;
    }

    alert("✅ Demand order reopened successfully!");
    await loadDemandOrders();
  } catch (error) {
    console.error("Error reopening demand order:", error);
    alert("Error reopening demand order");
  }
}

// ============================================
// FULFILL DEMAND ORDER (Convert to Sale)
// ============================================

async function fulfillDemandOrder(demandOrderId) {
  if (
    !confirm(
      "Mark this demand order as fulfilled?\n\nNote: You should create a corresponding sales entry first."
    )
  ) {
    return;
  }

  try {
    const response = await fetch(
      `/api/demand-orders/${demandOrderId}/fulfill`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          last_modified_by: "SYSTEM", // Replace with actual user
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      alert(error.error || "Failed to fulfill demand order");
      return;
    }

    alert("✅ Demand order marked as fulfilled!");
    await loadDemandOrders();
  } catch (error) {
    console.error("Error fulfilling demand order:", error);
    alert("Error fulfilling demand order");
  }
}

// ============================================
// EXPORT DEMAND ORDERS
// ============================================

function exportDemandOrders() {
  if (demandOrders.length === 0) {
    alert("No demand orders to export");
    return;
  }

  // Convert to CSV
  const headers = [
    "Order Number",
    "Order Date",
    "Required Date",
    "Product",
    "Customer",
    "Quantity",
    "Status",
    "Notes",
  ];
  const rows = demandOrders.map((order) => [
    order.order_number,
    new Date(order.order_date).toLocaleDateString("en-AU"),
    new Date(order.required_date).toLocaleDateString("en-AU"),
    order.product_name || "",
    order.customer_name || "",
    order.quantity,
    order.status,
    (order.notes || "").replace(/"/g, '""'), // Escape quotes
  ]);

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  // Download
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `demand-orders-${new Date().toISOString().split("T")[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}

// ============================================
// DASHBOARD INTEGRATION
// ============================================

// Function to get pending/confirmed demand totals by product
async function getDemandSummary() {
  try {
    const response = await fetch("/api/demand-orders?status=PENDING,CONFIRMED");
    const orders = await response.json();

    // Group by product
    const summary = {};
    orders.forEach((order) => {
      if (!summary[order.product_id]) {
        summary[order.product_id] = {
          product_name: order.product_name,
          total_quantity: 0,
        };
      }
      summary[order.product_id].total_quantity += parseFloat(order.quantity);
    });

    return summary;
  } catch (error) {
    console.error("Error loading demand summary:", error);
    return {};
  }
}
