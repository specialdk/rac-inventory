-- RAC INVENTORY SYSTEM DATABASE SCHEMA
-- Run this file after creating PostgreSQL database in Railway

-- Drop tables if they exist (for clean reinstall)
DROP TABLE IF EXISTS product_cost_history CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS current_stock CASCADE;
DROP TABLE IF EXISTS locations CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS vehicles CASCADE;
DROP TABLE IF EXISTS drivers CASCADE;

-- 1. PRODUCTS TABLE
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_code VARCHAR(20) UNIQUE NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    family_group VARCHAR(50) NOT NULL,
    unit VARCHAR(20) DEFAULT 'tonnes',
    standard_cost DECIMAL(10,2) NOT NULL,
    current_price DECIMAL(10,2),
    min_stock_level DECIMAL(10,2),
    max_stock_level DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. LOCATIONS TABLE
CREATE TABLE locations (
    location_id SERIAL PRIMARY KEY,
    location_code VARCHAR(20) UNIQUE NOT NULL,
    location_name VARCHAR(100) NOT NULL,
    location_type VARCHAR(30) NOT NULL,
    assigned_product_id INTEGER REFERENCES products(product_id),
    capacity_tonnes DECIMAL(10,2),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 3. CURRENT_STOCK TABLE
CREATE TABLE current_stock (
    stock_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id),
    location_id INTEGER REFERENCES locations(location_id),
    quantity DECIMAL(10,2) DEFAULT 0,
    average_cost DECIMAL(10,2) DEFAULT 0,
    total_value DECIMAL(12,2) DEFAULT 0,
    last_movement_date TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(product_id, location_id)
);

-- 4. CUSTOMERS TABLE
CREATE TABLE customers (
    customer_id SERIAL PRIMARY KEY,
    customer_code VARCHAR(20) UNIQUE NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    address TEXT,
    customer_type VARCHAR(30),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 5. VEHICLES TABLE
CREATE TABLE vehicles (
    vehicle_id SERIAL PRIMARY KEY,
    registration VARCHAR(20) UNIQUE NOT NULL,
    vehicle_type VARCHAR(30),
    capacity_tonnes DECIMAL(10,2),
    last_service_date DATE,
    next_service_date DATE,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. DRIVERS TABLE
CREATE TABLE drivers (
    driver_id SERIAL PRIMARY KEY,
    driver_code VARCHAR(20) UNIQUE NOT NULL,
    driver_name VARCHAR(100) NOT NULL,
    license_number VARCHAR(50),
    license_class VARCHAR(20),
    license_expiry DATE,
    certifications TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 7. STOCK_MOVEMENTS TABLE
CREATE TABLE stock_movements (
    movement_id SERIAL PRIMARY KEY,
    movement_date DATE NOT NULL,
    movement_type VARCHAR(20) NOT NULL,
    product_id INTEGER REFERENCES products(product_id),
    from_location_id INTEGER REFERENCES locations(location_id),
    to_location_id INTEGER REFERENCES locations(location_id),
    quantity DECIMAL(10,2) NOT NULL,
    unit_cost DECIMAL(10,2),
    total_cost DECIMAL(12,2),
    unit_price DECIMAL(10,2),
    total_revenue DECIMAL(12,2),
    customer_id INTEGER REFERENCES customers(customer_id),
    vehicle_id INTEGER REFERENCES vehicles(vehicle_id),
    driver_id INTEGER REFERENCES drivers(driver_id),
    reference_number VARCHAR(50),
    docket_number VARCHAR(50),
    notes TEXT,
    created_by VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. PRODUCT_COST_HISTORY TABLE
CREATE TABLE product_cost_history (
    history_id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(product_id),
    effective_date DATE NOT NULL,
    cost_per_unit DECIMAL(10,2) NOT NULL,
    reason VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

-- CREATE INDEXES for performance
CREATE INDEX idx_movements_date ON stock_movements(movement_date);
CREATE INDEX idx_movements_product ON stock_movements(product_id);
CREATE INDEX idx_movements_type ON stock_movements(movement_type);
CREATE INDEX idx_current_stock_product ON current_stock(product_id);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_locations_active ON locations(is_active);

-- SEED DATA: Initial Products
INSERT INTO products (product_code, product_name, family_group, standard_cost, current_price, min_stock_level, max_stock_level) VALUES
('A20-STD', '20mm Aggregate', 'AGGREGATES', 35.00, 99.00, 30, 1000),
('A710-STD', '7-10mm Aggregate', 'AGGREGATES', 38.00, 99.00, 20, 1000),
('A20M-STD', '20mm Minus', 'AGGREGATES', 25.00, 35.00, 50, 1000),
('R-TYPEE', 'Type E Rip Rap (500-700mm)', 'ROCK_ARMOR', 80.00, 105.75, 100, 1000),
('R-TYPEC', 'Type C Rip Rap (100-200mm)', 'ROCK_ARMOR', 60.00, 99.00, 50, 1000),
('R-TYPED', 'Type D Rip Rap (250-350mm)', 'ROCK_ARMOR', 70.00, 99.00, 50, 1000),
('S-SCR', 'Screened Sand', 'SAND', 20.00, 60.00, 20, 1000),
('R-T2', 'Type 2 Road Base', 'ROAD_BASE', 30.00, 55.00, 50, 1000),
('D-CRU', 'Crusher Dust', 'DUST', 15.00, 40.00, 50, 1000);

-- SEED DATA: Locations
INSERT INTO locations (location_code, location_name, location_type, capacity_tonnes) VALUES
('00', 'Main Production Area', 'PRODUCTION', 0),
('10', 'Stockpile 22', 'STOCKPILE', 1000),
('11', 'Stockpile 26', 'STOCKPILE', 1000),
('12', 'Stockpile 31', 'STOCKPILE', 1000),
('13', 'Stockpile 53', 'STOCKPILE', 1000),
('14', 'Stockpile 41', 'STOCKPILE', 1000),
('15', 'Stockpile 42', 'STOCKPILE', 1000);

-- SEED DATA: Top Customers
INSERT INTO customers (customer_code, customer_name, customer_type) VALUES
('SWISS-01', 'Swiss Aluminium Australia Ltd', 'MAJOR_PROJECT'),
('SCHAPER-01', 'Schaper Concrete & Construction', 'CONSTRUCTION'),
('NHUL-01', 'Nhulunbuy Corporation', 'CONSTRUCTION'),
('BEN-01', 'Ben Hall Construction', 'CONSTRUCTION'),
('RAC-INT', 'RAC Entities (Internal)', 'RAC_INTERNAL');

-- SEED DATA: Sample Vehicles
INSERT INTO vehicles (registration, vehicle_type, capacity_tonnes) VALUES
('RAC-003', 'TRUCK', 30),
('RAC-L01', 'LOADER', 0);

-- SEED DATA: Sample Drivers
INSERT INTO drivers (driver_code, driver_name, license_class) VALUES
('JW-01', 'Joe Williams', 'HC'),
('OP-01', 'Production Operator', 'C');

-- Verify installation
SELECT 'Products' as table_name, COUNT(*) as row_count FROM products
UNION ALL
SELECT 'Locations', COUNT(*) FROM locations
UNION ALL
SELECT 'Customers', COUNT(*) FROM customers
UNION ALL
SELECT 'Vehicles', COUNT(*) FROM vehicles
UNION ALL
SELECT 'Drivers', COUNT(*) FROM drivers;