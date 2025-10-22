// Operations Page JavaScript

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
  document.getElementById("prod_date").value = today;
  document.getElementById("sale_date").value = today;
}

// Load dropdown data
async function loadDropdowns() {
  try {
    // Load products
    const productsRes = await fetch("/api/products?is_active=true");
    const products = await productsRes.json();

    const prodProductSelect = document.getElementById("prod_product");
    const saleProductSelect = document.getElementById("sale_product");

    products.forEach((product) => {
      const option1 = new Option(
        `${product.product_name} (${product.product_code})`,
        product.product_id
      );
      option1.dataset.cost = product.standard_cost;
      option1.dataset.price = product.current_price;
      prodProductSelect.add(option1);

      const option2 = new Option(
        `${product.product_name} (${product.product_code})`,
        product.product_id
      );
      option2.dataset.cost = product.standard_cost;
      option2.dataset.price = product.current_price;
      saleProductSelect.add(option2);
    });

    // Load locations
    const locationsRes = await fetch("/api/locations?is_active=true");
    const locations = await locationsRes.json();

    const prodFromSelect = document.getElementById("prod_from");
    const prodToSelect = document.getElementById("prod_to");
    const saleFromSelect = document.getElementById("sale_from");

    locations.forEach((location) => {
      if (location.location_type === "PRODUCTION") {
        prodFromSelect.add(
          new Option(location.location_name, location.location_id)
        );
      } else if (location.location_type === "STOCKPILE") {
        prodToSelect.add(
          new Option(location.location_name, location.location_id)
        );
        saleFromSelect.add(
          new Option(location.location_name, location.location_id)
        );
      }
    });

    // Load customers
    const customersRes = await fetch("/api/customers?is_active=true");
    const customers = await customersRes.json();

    const saleCustomerSelect = document.getElementById("sale_customer");
    customers.forEach((customer) => {
      saleCustomerSelect.add(
        new Option(customer.customer_name, customer.customer_id)
      );
    });

    // Load vehicles
    const vehiclesRes = await fetch("/api/vehicles?is_active=true");
    const vehicles = await vehiclesRes.json();

    const prodVehicleSelect = document.getElementById("prod_vehicle");
    const saleVehicleSelect = document.getElementById("sale_vehicle");

    vehicles.forEach((vehicle) => {
      prodVehicleSelect.add(
        new Option(vehicle.registration, vehicle.vehicle_id)
      );
      saleVehicleSelect.add(
        new Option(vehicle.registration, vehicle.vehicle_id)
      );
    });

    // Load drivers
    const driversRes = await fetch("/api/drivers?is_active=true");
    const drivers = await driversRes.json();

    const prodOperatorSelect = document.getElementById("prod_operator");
    const saleDriverSelect = document.getElementById("sale_driver");

    drivers.forEach((driver) => {
      prodOperatorSelect.add(new Option(driver.driver_name, driver.driver_id));
      saleDriverSelect.add(new Option(driver.driver_name, driver.driver_id));
    });

    // Set active counts
    document.getElementById("activeVehicles").textContent = vehicles.length;
    document.getElementById("activeOperators").textContent = drivers.length;
  } catch (error) {
    console.error("Error loading dropdowns:", error);
  }
}

// ============================================
// UPDATED: Auto-fill cost and suggest stockpile when product selected (Production)
// ============================================
document.addEventListener("DOMContentLoaded", () => {
  const prodProductSelect = document.getElementById("prod_product");
  const prodCostInput = document.getElementById("prod_cost");
  const prodToSelect = document.getElementById("prod_to");

  prodProductSelect.addEventListener("change", async (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];

    // Auto-fill cost
    if (selectedOption.dataset.cost) {
      prodCostInput.value = selectedOption.dataset.cost;
    }

    // Auto-suggest stockpile for this product (NEW FEATURE)
    const productId = e.target.value;
    if (productId) {
      try {
        const response = await fetch(`/api/locations/suggest/${productId}`);
        const data = await response.json();

        if (data.suggested && data.location) {
          // Set the suggested location
          prodToSelect.value = data.location.location_id;

          // Show helpful message in console
          console.log(`✓ ${data.message}`);

          // Optional: You could add a visual indicator here
          // For example, add a label next to the dropdown showing "(Suggested)"
        } else {
          // No suggestion - clear selection so user must choose
          prodToSelect.value = "";
          console.log("No stockpile assigned yet for this product");
        }
      } catch (error) {
        console.error("Error getting suggested location:", error);
        // Don't block the form if suggestion fails
        prodToSelect.value = "";
      }
    } else {
      // No product selected - clear stockpile
      prodToSelect.value = "";
    }
  });

  // Auto-fill price when product selected (Sales)
  const saleProductSelect = document.getElementById("sale_product");
  const salePriceInput = document.getElementById("sale_price");

  saleProductSelect.addEventListener("change", (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    if (selectedOption.dataset.price) {
      salePriceInput.value = selectedOption.dataset.price;
    }
  });
});

// Modal functions
function openProductionModal() {
  document.getElementById("productionModal").classList.add("active");
}

function closeProductionModal() {
  document.getElementById("productionModal").classList.remove("active");
  document.getElementById("productionForm").reset();
  setTodayDate();
}

function openSalesModal() {
  document.getElementById("salesModal").classList.add("active");
}

function closeSalesModal() {
  document.getElementById("salesModal").classList.remove("active");
  document.getElementById("salesForm").reset();
  setTodayDate();
}

// Submit production entry
async function submitProduction() {
  try {
    const data = {
      movement_date: document.getElementById("prod_date").value,
      product_id: parseInt(document.getElementById("prod_product").value),
      from_location_id: document.getElementById("prod_from").value
        ? parseInt(document.getElementById("prod_from").value)
        : null,
      to_location_id: parseInt(document.getElementById("prod_to").value),
      quantity: parseFloat(document.getElementById("prod_quantity").value),
      unit_cost: parseFloat(document.getElementById("prod_cost").value),
      vehicle_id: document.getElementById("prod_vehicle").value
        ? parseInt(document.getElementById("prod_vehicle").value)
        : null,
      driver_id: document.getElementById("prod_operator").value
        ? parseInt(document.getElementById("prod_operator").value)
        : null,
      reference_number: document.getElementById("prod_reference").value,
      notes: document.getElementById("prod_notes").value,
      created_by: "Admin User",
    };

    // Validation
    if (
      !data.product_id ||
      !data.to_location_id ||
      !data.quantity ||
      !data.unit_cost
    ) {
      alert("Please fill in all required fields");
      return;
    }

    const response = await fetch("/api/movements/production", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      alert("✅ Production entry recorded successfully!");
      closeProductionModal();
      loadRecentMovements();
      loadTodayStats();
    } else {
      const error = await response.json();
      alert("❌ Error: " + (error.error || "Failed to record production"));
    }
  } catch (error) {
    console.error("Error submitting production:", error);
    alert("❌ Error recording production");
  }
}

// Submit sales entry
async function submitSales() {
  try {
    const data = {
      movement_date: document.getElementById("sale_date").value,
      product_id: parseInt(document.getElementById("sale_product").value),
      from_location_id: parseInt(document.getElementById("sale_from").value),
      quantity: parseFloat(document.getElementById("sale_quantity").value),
      unit_price: parseFloat(document.getElementById("sale_price").value),
      customer_id: parseInt(document.getElementById("sale_customer").value),
      vehicle_id: document.getElementById("sale_vehicle").value
        ? parseInt(document.getElementById("sale_vehicle").value)
        : null,
      driver_id: document.getElementById("sale_driver").value
        ? parseInt(document.getElementById("sale_driver").value)
        : null,
      docket_number: document.getElementById("sale_docket").value,
      reference_number: document.getElementById("sale_reference").value,
      notes: document.getElementById("sale_notes").value,
      created_by: "Admin User",
    };

    // Validation
    if (
      !data.product_id ||
      !data.from_location_id ||
      !data.quantity ||
      !data.unit_price ||
      !data.customer_id
    ) {
      alert("Please fill in all required fields");
      return;
    }

    const response = await fetch("/api/movements/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      alert("✅ Sale recorded successfully!");
      closeSalesModal();
      loadRecentMovements();
      loadTodayStats();
    } else {
      const error = await response.json();
      alert("❌ Error: " + (error.error || "Failed to record sale"));
    }
  } catch (error) {
    console.error("Error submitting sale:", error);
    alert("❌ Error recording sale");
  }
}

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
  } catch (error) {
    console.error("Error loading today stats:", error);
  }
}

// Load recent movements
async function loadRecentMovements() {
  try {
    const response = await fetch("/api/movements?limit=50");
    const movements = await response.json();

    const container = document.getElementById("movementsTableContainer");

    if (movements.length === 0) {
      container.innerHTML =
        '<div class="loading"><p>No movements recorded yet</p></div>';
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
          : "badge-info";
      const location =
        movement.movement_type === "PRODUCTION"
          ? movement.to_location_name
          : movement.from_location_name;
      const person = movement.customer_name || movement.driver_name || "-";

      html += `
                <tr>
                    <td>${new Date(
                      movement.movement_date
                    ).toLocaleDateString()}</td>
                    <td><span class="badge ${typeClass}">${
        movement.movement_type
      }</span></td>
                    <td>
                        <strong>${movement.product_name}</strong><br>
                        <small style="color: var(--gray-500);">${
                          movement.product_code
                        }</small>
                    </td>
                    <td><strong>${
                      movement.movement_type === "SALES" ? "-" : "+"
                    }${formatNumber(Math.abs(movement.quantity))}</strong></td>
                    <td>${location || "-"}</td>
                    <td>${person}</td>
                    <td><small>${
                      movement.reference_number || movement.docket_number || "-"
                    }</small></td>
                    <td><span class="badge badge-success">Completed</span></td>
                </tr>
            `;
    });

    html += "</tbody></table>";
    container.innerHTML = html;

    // Add search functionality
    const searchBox = document.getElementById("searchMovements");
    searchBox.addEventListener("input", filterMovements);
  } catch (error) {
    console.error("Error loading movements:", error);
    document.getElementById("movementsTableContainer").innerHTML =
      '<div class="loading"><p>Error loading movements</p></div>';
  }
}

// Filter movements table
function filterMovements() {
  const searchTerm = document
    .getElementById("searchMovements")
    .value.toLowerCase();
  const rows = document.querySelectorAll("#movementsTableContainer tbody tr");

  rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(searchTerm) ? "" : "none";
  });
}

// Load inventory value for header
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

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
  setTodayDate();
  loadDropdowns();
  loadTodayStats();
  loadRecentMovements();
  loadInventoryValue();
});
