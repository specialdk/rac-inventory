import { db } from "./database";
import {
  Product,
  Location,
  Customer,
  Vehicle,
  Driver,
  CurrentStock,
  StockMovement,
} from "./types";

// Products
export const getProducts = async (): Promise<Product[]> => {
  const result = await db.query(`
    SELECT * FROM products 
    ORDER BY family_group ASC, product_name ASC
  `);
  return result.rows;
};

export const saveProduct = async (
  product: Partial<Product>
): Promise<Product> => {
  if (product.id) {
    const result = await db.query(
      `
      UPDATE products 
      SET product_code = $1, product_name = $2, family_group = $3, unit = $4, 
          standard_cost = $5, min_stock_level = $6, max_stock_level = $7, 
          active = $8, updated_at = NOW()
      WHERE id = $9 RETURNING *
    `,
      [
        product.product_code,
        product.product_name,
        product.family_group,
        product.unit,
        product.standard_cost,
        product.min_stock_level,
        product.max_stock_level,
        product.active,
        product.id,
      ]
    );
    return result.rows[0];
  } else {
    const result = await db.query(
      `
      INSERT INTO products (product_code, product_name, family_group, unit, standard_cost, min_stock_level, max_stock_level, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `,
      [
        product.product_code,
        product.product_name,
        product.family_group,
        product.unit,
        product.standard_cost,
        product.min_stock_level,
        product.max_stock_level,
        product.active,
      ]
    );
    return result.rows[0];
  }
};

export const deleteProduct = async (id: number): Promise<void> => {
  await db.query("DELETE FROM products WHERE id = $1", [id]);
};

// Locations
export const getLocations = async (): Promise<Location[]> => {
  const result = await db.query(`
    SELECT * FROM locations 
    ORDER BY location_code ASC
  `);
  return result.rows;
};

export const saveLocation = async (
  location: Partial<Location>
): Promise<Location> => {
  if (location.id) {
    const result = await db.query(
      `
      UPDATE locations 
      SET location_code = $1, location_name = $2, location_type = $3, 
          capacity_tonnes = $4, assigned_product_id = $5, active = $6, updated_at = NOW()
      WHERE id = $7 RETURNING *
    `,
      [
        location.location_code,
        location.location_name,
        location.location_type,
        location.capacity_tonnes,
        location.assigned_product_id,
        location.active,
        location.id,
      ]
    );
    return result.rows[0];
  } else {
    const result = await db.query(
      `
      INSERT INTO locations (location_code, location_name, location_type, capacity_tonnes, assigned_product_id, active)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
    `,
      [
        location.location_code,
        location.location_name,
        location.location_type,
        location.capacity_tonnes,
        location.assigned_product_id,
        location.active,
      ]
    );
    return result.rows[0];
  }
};

export const deleteLocation = async (id: number): Promise<void> => {
  await db.query("DELETE FROM locations WHERE id = $1", [id]);
};

// Customers
export const getCustomers = async (): Promise<Customer[]> => {
  const result = await db.query(`
    SELECT * FROM customers 
    ORDER BY customer_name ASC
  `);
  return result.rows;
};

export const saveCustomer = async (
  customer: Partial<Customer>
): Promise<Customer> => {
  if (customer.id) {
    const result = await db.query(
      `
      UPDATE customers 
      SET customer_code = $1, customer_name = $2, contact_person = $3, phone = $4,
          email = $5, address = $6, payment_terms = $7, credit_limit = $8, active = $9, updated_at = NOW()
      WHERE id = $10 RETURNING *
    `,
      [
        customer.customer_code,
        customer.customer_name,
        customer.contact_person,
        customer.phone,
        customer.email,
        customer.address,
        customer.payment_terms,
        customer.credit_limit,
        customer.active,
        customer.id,
      ]
    );
    return result.rows[0];
  } else {
    const result = await db.query(
      `
      INSERT INTO customers (customer_code, customer_name, contact_person, phone, email, address, payment_terms, credit_limit, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *
    `,
      [
        customer.customer_code,
        customer.customer_name,
        customer.contact_person,
        customer.phone,
        customer.email,
        customer.address,
        customer.payment_terms,
        customer.credit_limit,
        customer.active,
      ]
    );
    return result.rows[0];
  }
};

export const deleteCustomer = async (id: number): Promise<void> => {
  await db.query("DELETE FROM customers WHERE id = $1", [id]);
};

// Vehicles
export const getVehicles = async (): Promise<Vehicle[]> => {
  const result = await db.query(`
    SELECT * FROM vehicles 
    ORDER BY vehicle_code ASC
  `);
  return result.rows;
};

export const saveVehicle = async (
  vehicle: Partial<Vehicle>
): Promise<Vehicle> => {
  if (vehicle.id) {
    const result = await db.query(
      `
      UPDATE vehicles 
      SET vehicle_code = $1, registration = $2, vehicle_type = $3, capacity_tonnes = $4,
          status = $5, last_service_date = $6, driver_id = $7, active = $8, updated_at = NOW()
      WHERE id = $9 RETURNING *
    `,
      [
        vehicle.vehicle_code,
        vehicle.registration,
        vehicle.vehicle_type,
        vehicle.capacity_tonnes,
        vehicle.status,
        vehicle.last_service_date,
        vehicle.driver_id,
        vehicle.active,
        vehicle.id,
      ]
    );
    return result.rows[0];
  } else {
    const result = await db.query(
      `
      INSERT INTO vehicles (vehicle_code, registration, vehicle_type, capacity_tonnes, status, last_service_date, driver_id, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `,
      [
        vehicle.vehicle_code,
        vehicle.registration,
        vehicle.vehicle_type,
        vehicle.capacity_tonnes,
        vehicle.status,
        vehicle.last_service_date,
        vehicle.driver_id,
        vehicle.active,
      ]
    );
    return result.rows[0];
  }
};

export const deleteVehicle = async (id: number): Promise<void> => {
  await db.query("DELETE FROM vehicles WHERE id = $1", [id]);
};

// Drivers
export const getDrivers = async (): Promise<Driver[]> => {
  const result = await db.query(`
    SELECT * FROM drivers 
    ORDER BY last_name ASC, first_name ASC
  `);
  return result.rows;
};

export const saveDriver = async (driver: Partial<Driver>): Promise<Driver> => {
  if (driver.id) {
    const result = await db.query(
      `
      UPDATE drivers 
      SET driver_code = $1, first_name = $2, last_name = $3, license_class = $4,
          phone = $5, email = $6, status = $7, active = $8, updated_at = NOW()
      WHERE id = $9 RETURNING *
    `,
      [
        driver.driver_code,
        driver.first_name,
        driver.last_name,
        driver.license_class,
        driver.phone,
        driver.email,
        driver.status,
        driver.active,
        driver.id,
      ]
    );
    return result.rows[0];
  } else {
    const result = await db.query(
      `
      INSERT INTO drivers (driver_code, first_name, last_name, license_class, phone, email, status, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `,
      [
        driver.driver_code,
        driver.first_name,
        driver.last_name,
        driver.license_class,
        driver.phone,
        driver.email,
        driver.status,
        driver.active,
      ]
    );
    return result.rows[0];
  }
};

export const deleteDriver = async (id: number): Promise<void> => {
  await db.query("DELETE FROM drivers WHERE id = $1", [id]);
};

// Current Stock
export const getCurrentStock = async (): Promise<CurrentStock[]> => {
  const result = await db.query(`
    SELECT * FROM current_stock 
    ORDER BY product_id ASC, location_id ASC
  `);
  return result.rows;
};

// Stock Movements
export const getStockMovements = async (): Promise<StockMovement[]> => {
  const result = await db.query(`
    SELECT * FROM stock_movements 
    ORDER BY movement_date DESC, id DESC 
    LIMIT 100
  `);
  return result.rows;
};

export const saveStockMovement = async (
  movement: Partial<StockMovement>
): Promise<StockMovement> => {
  if (movement.id) {
    const result = await db.query(
      `
      UPDATE stock_movements 
      SET movement_date = $1, movement_type = $2, product_id = $3, location_id = $4,
          quantity = $5, unit_cost = $6, reference_number = $7, customer_id = $8,
          vehicle_id = $9, driver_id = $10, docket_number = $11, notes = $12, created_by = $13
      WHERE id = $14 RETURNING *
    `,
      [
        movement.movement_date,
        movement.movement_type,
        movement.product_id,
        movement.location_id,
        movement.quantity,
        movement.unit_cost,
        movement.reference_number,
        movement.customer_id,
        movement.vehicle_id,
        movement.driver_id,
        movement.docket_number,
        movement.notes,
        movement.created_by,
        movement.id,
      ]
    );
    return result.rows[0];
  } else {
    const result = await db.query(
      `
      INSERT INTO stock_movements (movement_date, movement_type, product_id, location_id, quantity, unit_cost, reference_number, customer_id, vehicle_id, driver_id, docket_number, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *
    `,
      [
        movement.movement_date,
        movement.movement_type,
        movement.product_id,
        movement.location_id,
        movement.quantity,
        movement.unit_cost,
        movement.reference_number,
        movement.customer_id,
        movement.vehicle_id,
        movement.driver_id,
        movement.docket_number,
        movement.notes,
        movement.created_by,
      ]
    );
    return result.rows[0];
  }
};

// Dashboard Metrics
export const getDashboardMetrics = async () => {
  const productsWithStock = await db.query(`
    SELECT DISTINCT product_id FROM current_stock 
    WHERE current_quantity > 0
  `);

  const inventoryValue = await db.query(`
    SELECT SUM(current_quantity * average_cost) as total_value 
    FROM current_stock
  `);

  const lowStockItems = await db.query(`
    SELECT cs.*, p.min_stock_level 
    FROM current_stock cs 
    JOIN products p ON cs.product_id = p.id 
    WHERE cs.current_quantity <= p.min_stock_level
  `);

  const activeVehicles = await db.query(`
    SELECT COUNT(*) as count FROM vehicles 
    WHERE status = 'ACTIVE' AND active = true
  `);

  return {
    productsCount: productsWithStock.rows.length,
    totalInventoryValue: parseFloat(inventoryValue.rows[0]?.total_value || "0"),
    lowStockCount: lowStockItems.rows.length,
    activeVehiclesCount: parseInt(activeVehicles.rows[0]?.count || "0"),
  };
};
