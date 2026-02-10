// Quick Add - Create master data on-the-fly from within entry forms
// Self-contained: injects '+' buttons and modal dynamically

(function () {
  // Configuration: which selects get '+' buttons and what entity type they create
  const QUICK_ADD_CONFIG = [
    // Sales Modal
    { selectId: "saleProduct", type: "product", label: "Product" },
    { selectId: "saleLocation", type: "location", label: "Stockpile" },
    { selectId: "saleVehicle", type: "vehicle", label: "Vehicle" },
    { selectId: "saleCarrier", type: "carrier", label: "Carrier" },
    { selectId: "saleCustomer", type: "customer", label: "Customer" },
    { selectId: "saleDriver", type: "driver", label: "Driver" },
    { selectId: "saleDelivery", type: "delivery", label: "Delivery" },
    // Production Modal
    { selectId: "productionProduct", type: "product", label: "Product" },
    { selectId: "productionLocation", type: "location", label: "Stockpile" },
    // Demand Modal
    { selectId: "demandFormProduct", type: "product", label: "Product" },
    { selectId: "demandFormCustomer", type: "customer", label: "Customer" },
    { selectId: "demandFormLocation", type: "location", label: "Location" },
    // Tare Weight Modal
    { selectId: "tareVehicle", type: "vehicle", label: "Vehicle" },
    { selectId: "tareCarrier", type: "carrier", label: "Carrier" },
  ];

  // Entity form definitions - what fields each quick-add type needs
  const ENTITY_FORMS = {
    product: {
      title: "Quick Add Product",
      endpoint: "/api/products",
      fields: [
        {
          id: "qa_product_code",
          label: "Product Code",
          type: "text",
          required: true,
          placeholder: "e.g., AGG-25MM",
        },
        {
          id: "qa_product_name",
          label: "Product Name",
          type: "text",
          required: true,
          placeholder: "e.g., 25mm Aggregate",
        },
        {
          id: "qa_family_group",
          label: "Family Group",
          type: "select",
          required: true,
          options: [
            { value: "", label: "Select Group" },
            { value: "AGGREGATES", label: "Aggregates" },
            { value: "DIRT", label: "Dirt" },
            { value: "DUST", label: "Dust" },
            { value: "ROAD_BASE", label: "Road Base" },
            { value: "ROCK_ARMOR", label: "Rock Armor" },
            { value: "SAND", label: "Sand" },
          ],
        },
        {
          id: "qa_standard_cost",
          label: "Cost per Tonne ($)",
          type: "number",
          required: true,
          placeholder: "e.g., 50.00",
        },
        {
          id: "qa_current_price",
          label: "Sales Price per Tonne ($)",
          type: "number",
          required: true,
          placeholder: "e.g., 99.00",
        },
      ],
      buildPayload: () => ({
        product_code: document.getElementById("qa_product_code").value,
        product_name: document.getElementById("qa_product_name").value,
        family_group: document.getElementById("qa_family_group").value,
        standard_cost:
          parseFloat(document.getElementById("qa_standard_cost").value) || 0,
        current_price:
          parseFloat(document.getElementById("qa_current_price").value) || 0,
        min_stock_level: 0,
        max_stock_level: 99999,
      }),
      getNewOption: (result) => ({
        value: result.product_id,
        label: result.product_name,
        data: {
          cost: result.standard_cost,
          price: result.current_price,
        },
      }),
      refreshSelects: [
        "saleProduct",
        "productionProduct",
        "demandFormProduct",
      ],
    },

    location: {
      title: "Quick Add Stockpile",
      endpoint: "/api/locations",
      fields: [
        {
          id: "qa_location_code",
          label: "Location Code",
          type: "text",
          required: true,
          placeholder: "e.g., SP-65",
        },
        {
          id: "qa_location_name",
          label: "Location Name",
          type: "text",
          required: true,
          placeholder: "e.g., Stockpile 65",
        },
        {
          id: "qa_location_type",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "STOCKPILE", label: "Stockpile" },
            { value: "PRODUCTION", label: "Production" },
            { value: "QUARRY", label: "Quarry" },
          ],
        },
        {
          id: "qa_capacity_tonnes",
          label: "Capacity (tonnes)",
          type: "number",
          required: false,
          placeholder: "e.g., 5000",
        },
      ],
      buildPayload: () => ({
        location_code: document.getElementById("qa_location_code").value,
        location_name: document.getElementById("qa_location_name").value,
        location_type: document.getElementById("qa_location_type").value,
        capacity_tonnes:
          parseFloat(
            document.getElementById("qa_capacity_tonnes").value
          ) || null,
      }),
      getNewOption: (result) => ({
        value: result.location_id,
        label: result.location_name,
      }),
      refreshSelects: [
        "productionLocation",
        "saleLocation",
        "demandFormLocation",
      ],
    },

    vehicle: {
      title: "Quick Add Vehicle",
      endpoint: "/api/vehicles",
      fields: [
        {
          id: "qa_registration",
          label: "Registration",
          type: "text",
          required: true,
          placeholder: "e.g., ABC-123",
        },
        {
          id: "qa_vehicle_type",
          label: "Vehicle Type",
          type: "select",
          required: true,
          options: [
            { value: "", label: "Select Type" },
            { value: "TRUCK", label: "Truck" },
            { value: "TRAILER", label: "Trailer" },
            { value: "SIDE_TIPPER", label: "Side Tipper" },
            { value: "ROAD_TRAIN", label: "Road Train" },
            { value: "RIGID", label: "Rigid" },
            { value: "OTHER", label: "Other" },
          ],
        },
        {
          id: "qa_vehicle_capacity",
          label: "Capacity (tonnes)",
          type: "number",
          required: false,
          placeholder: "e.g., 40",
        },
      ],
      buildPayload: () => ({
        registration: document.getElementById("qa_registration").value,
        vehicle_type: document.getElementById("qa_vehicle_type").value,
        capacity_tonnes:
          parseFloat(
            document.getElementById("qa_vehicle_capacity").value
          ) || null,
      }),
      getNewOption: (result) => ({
        value: result.vehicle_id,
        label: `${result.registration} - ${result.vehicle_type}`,
      }),
      refreshSelects: ["saleVehicle", "tareVehicle"],
    },

    customer: {
      title: "Quick Add Customer",
      endpoint: "/api/customers",
      fields: [
        {
          id: "qa_customer_code",
          label: "Customer Code",
          type: "text",
          required: true,
          placeholder: "e.g., CUST-001",
        },
        {
          id: "qa_customer_name",
          label: "Customer Name",
          type: "text",
          required: true,
          placeholder: "e.g., NT Construction",
        },
        {
          id: "qa_contact_person",
          label: "Contact Person",
          type: "text",
          required: false,
          placeholder: "e.g., John Smith",
        },
        {
          id: "qa_customer_phone",
          label: "Phone",
          type: "text",
          required: false,
          placeholder: "e.g., 0412 345 678",
        },
      ],
      buildPayload: () => ({
        customer_code: document.getElementById("qa_customer_code").value,
        customer_name: document.getElementById("qa_customer_name").value,
        contact_person:
          document.getElementById("qa_contact_person").value || null,
        phone: document.getElementById("qa_customer_phone").value || null,
      }),
      getNewOption: (result) => ({
        value: result.customer_id,
        label: result.customer_name,
      }),
      refreshSelects: ["saleCustomer", "demandFormCustomer"],
    },

    driver: {
      title: "Quick Add Driver",
      endpoint: "/api/drivers",
      fields: [
        {
          id: "qa_driver_code",
          label: "Driver Code",
          type: "text",
          required: true,
          placeholder: "e.g., DRV-001",
        },
        {
          id: "qa_driver_name",
          label: "Driver Name",
          type: "text",
          required: true,
          placeholder: "e.g., John Smith",
        },
        {
          id: "qa_license_number",
          label: "License Number",
          type: "text",
          required: false,
          placeholder: "Optional",
        },
      ],
      buildPayload: () => ({
        driver_code: document.getElementById("qa_driver_code").value,
        driver_name: document.getElementById("qa_driver_name").value,
        license_number:
          document.getElementById("qa_license_number").value || null,
      }),
      getNewOption: (result) => ({
        value: result.driver_id,
        label: result.driver_name,
      }),
      refreshSelects: ["saleDriver"],
    },

    carrier: {
      title: "Quick Add Carrier",
      endpoint: "/api/carriers",
      fields: [
        {
          id: "qa_carrier_name",
          label: "Carrier Name",
          type: "text",
          required: true,
          placeholder: "e.g., NT Haulage",
        },
      ],
      buildPayload: () => ({
        carrier_name: document.getElementById("qa_carrier_name").value,
      }),
      getNewOption: (result) => ({
        value: result.carrier_id,
        label: result.carrier_name,
      }),
      refreshSelects: ["saleCarrier", "tareCarrier"],
    },

    delivery: {
      title: "Quick Add Delivery Option",
      endpoint: "/api/deliveries",
      fields: [
        {
          id: "qa_delivery_name",
          label: "Delivery Name",
          type: "text",
          required: true,
          placeholder: "e.g., East Arm Wharf",
        },
        {
          id: "qa_delivery_charge",
          label: "Charge per Tonne ($)",
          type: "number",
          required: false,
          placeholder: "e.g., 15.00",
        },
      ],
      buildPayload: () => ({
        delivery_name: document.getElementById("qa_delivery_name").value,
        delivery_charge_per_tonne:
          parseFloat(
            document.getElementById("qa_delivery_charge").value
          ) || 0,
      }),
      getNewOption: (result) => ({
        value: result.delivery_id,
        label: result.delivery_name,
      }),
      refreshSelects: ["saleDelivery"],
    },
  };

  // Track which select triggered the quick add
  let activeSelectId = null;
  let activeType = null;

  // Initialize on DOM ready
  document.addEventListener("DOMContentLoaded", function () {
    injectModal();
    injectButtons();
    injectStyles();
  });

  // Inject the quick-add modal HTML
  function injectModal() {
    const modalHTML = `
      <div id="quickAddModal" class="modal" style="display: none; z-index: 10000;">
        <div class="modal-content" style="max-width: 500px;">
          <div class="modal-header">
            <h2 id="quickAddTitle">Quick Add</h2>
            <button class="modal-close" onclick="window.quickAdd.close()">×</button>
          </div>
          <form id="quickAddForm" onsubmit="event.preventDefault(); window.quickAdd.save();">
            <div id="quickAddFields"></div>
            <div class="modal-footer">
              <button type="button" class="btn-secondary" onclick="window.quickAdd.close()">Cancel</button>
              <button type="submit" class="btn-primary">💾 Save & Select</button>
            </div>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
  }

  // Inject '+' buttons next to configured selects
  function injectButtons() {
    QUICK_ADD_CONFIG.forEach((config) => {
      const select = document.getElementById(config.selectId);
      if (!select) return;

      // Wrap select in a relative container so button positions correctly
      const wrapper = document.createElement("div");
      wrapper.style.position = "relative";
      wrapper.style.display = "flex";
      wrapper.style.alignItems = "center";
      wrapper.style.gap = "6px";

      select.parentNode.insertBefore(wrapper, select);
      wrapper.appendChild(select);
      select.style.flex = "1";

      // Create the '+' button
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "quick-add-btn";
      btn.title = `Add new ${config.label}`;
      btn.textContent = "+";
      btn.onclick = function (e) {
        e.preventDefault();
        e.stopPropagation();
        openQuickAdd(config.type, config.selectId);
      };

      wrapper.appendChild(btn);
    });
  }

  // Inject CSS styles for quick-add buttons
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .quick-add-btn {
        width: 28px;
        height: 28px;
        min-width: 28px;
        border-radius: 50%;
        border: 2px solid #28a745;
        background: white;
        color: #28a745;
        font-size: 18px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
        padding: 0;
        transition: all 0.15s ease;
      }
      .quick-add-btn:hover {
        background: #28a745;
        color: white;
      }
      #quickAddModal .modal-content {
        border-top: 4px solid #28a745;
      }
      #quickAddFields .qa-field {
        margin-bottom: 16px;
      }
      #quickAddFields .qa-field label {
        display: block;
        margin-bottom: 4px;
        font-weight: 600;
        font-size: 0.9rem;
        color: #333;
      }
      #quickAddFields .qa-field label .required-star {
        color: #dc3545;
      }
      #quickAddFields .qa-field input,
      #quickAddFields .qa-field select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 6px;
        font-size: 0.95rem;
      }
      #quickAddFields .qa-field input:focus,
      #quickAddFields .qa-field select:focus {
        border-color: #28a745;
        outline: none;
        box-shadow: 0 0 0 3px rgba(40, 167, 69, 0.15);
      }
    `;
    document.head.appendChild(style);
  }

  // Open quick-add modal for a specific entity type
  function openQuickAdd(type, selectId) {
    const config = ENTITY_FORMS[type];
    if (!config) return;

    activeSelectId = selectId;
    activeType = type;

    // Set title
    document.getElementById("quickAddTitle").textContent = config.title;

    // Build form fields
    const container = document.getElementById("quickAddFields");
    container.innerHTML = "";

    config.fields.forEach((field) => {
      const div = document.createElement("div");
      div.className = "qa-field";

      const requiredStar = field.required
        ? ' <span class="required-star">*</span>'
        : "";
      let inputHTML = "";

      if (field.type === "select") {
        const optionsHTML = field.options
          .map((opt) => `<option value="${opt.value}">${opt.label}</option>`)
          .join("");
        inputHTML = `<select id="${field.id}" ${
          field.required ? "required" : ""
        }>${optionsHTML}</select>`;
      } else {
        inputHTML = `<input type="${field.type}" id="${field.id}" 
          placeholder="${field.placeholder || ""}" 
          ${field.required ? "required" : ""}
          ${field.type === "number" ? 'step="0.01"' : ""} />`;
      }

      div.innerHTML = `<label>${field.label}${requiredStar}</label>${inputHTML}`;
      container.appendChild(div);
    });

    // Show modal
    document.getElementById("quickAddModal").style.display = "flex";

    // Focus first input
    setTimeout(() => {
      const firstInput = container.querySelector("input, select");
      if (firstInput) firstInput.focus();
    }, 100);
  }

  // Save quick-add entity
  async function saveQuickAdd() {
    const config = ENTITY_FORMS[activeType];
    if (!config) return;

    const payload = config.buildPayload();

    try {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(
          `Failed to create ${activeType}: ${error.error || "Unknown error"}`
        );
        return;
      }

      const result = await response.json();
      const newOption = config.getNewOption(result);

      // Add to all related selects and auto-select on the triggering dropdown
      config.refreshSelects.forEach((selectId) => {
        const select = document.getElementById(selectId);
        if (!select) return;

        const option = new Option(newOption.label, newOption.value);

        // Set data attributes if provided (e.g., cost, price for products)
        if (newOption.data) {
          Object.keys(newOption.data).forEach((key) => {
            option.dataset[key] = newOption.data[key];
          });
        }

        select.add(option);

        // Auto-select on the dropdown that triggered the quick add
        if (selectId === activeSelectId) {
          select.value = newOption.value;
          // Trigger change event so dependent logic fires (e.g., product → stockpile filter)
          select.dispatchEvent(new Event("change"));
        }
      });

      // Close modal
      closeQuickAdd();

      console.log(
        `✅ Quick add: Created ${activeType} "${newOption.label}" (ID: ${newOption.value})`
      );
    } catch (error) {
      console.error("Quick add error:", error);
      alert(`Error creating ${activeType}: ${error.message}`);
    }
  }

  // Close quick-add modal
  function closeQuickAdd() {
    document.getElementById("quickAddModal").style.display = "none";
    document.getElementById("quickAddFields").innerHTML = "";
    activeSelectId = null;
    activeType = null;
  }

  // Expose to global scope for onclick handlers
  window.quickAdd = {
    open: openQuickAdd,
    save: saveQuickAdd,
    close: closeQuickAdd,
  };
})();