-- ============================================
-- RAC INVENTORY SYSTEM - MASTER DATA RELOAD
-- ============================================
-- Created: October 27, 2025
-- Purpose: Reload all master data after database reset
-- Usage: Run this script after truncating all tables

-- ============================================
-- 1. PRODUCTS
-- ============================================

-- AGGREGATES
INSERT INTO products (product_code, product_name, family_group, production_cost_per_unit, standard_price_per_unit, min_stock_level, max_stock_level, unit, is_active) VALUES
('A100M', '100 minus', 'AGGREGATES', 25.00, 40.00, 50, 2000, 'tonnes', true),
('A20-STD', '20mm Aggregate', 'AGGREGATES', 35.00, 99.00, 30, 2000, 'tonnes', true),
('A710-STD', '7-10mm Aggregate', 'AGGREGATES', 38.00, 99.00, 20, 1000, 'tonnes', true),
('A20M-STD', '20mm Minus', 'AGGREGATES', 25.00, 35.00, 50, 2000, 'tonnes', true),
('A10MM', '10mm Concrete Aggregate', 'AGGREGATES', 35.00, 35.00, 20, 1000, 'tonnes', true);

-- ROCK ARMOR (Premium Products)
INSERT INTO products (product_code, product_name, family_group, production_cost_per_unit, standard_price_per_unit, min_stock_level, max_stock_level, unit, is_active) VALUES
('R-TYPEE', 'Type E Rip Rap (500-700mm)', 'ROCK_ARMOR', 80.00, 105.75, 100, 1000, 'tonnes', true),
('R-TYPEC', 'Type C Rip Rap (100-200mm)', 'ROCK_ARMOR', 60.00, 99.00, 50, 1000, 'tonnes', true),
('R-TYPED', 'Type D Rip Rap (250-350mm)', 'ROCK_ARMOR', 70.00, 99.00, 50, 1000, 'tonnes', true);

-- SAND
INSERT INTO products (product_code, product_name, family_group, production_cost_per_unit, standard_price_per_unit, min_stock_level, max_stock_level, unit, is_active) VALUES
('S-SCR', 'Screened Sand', 'SAND', 20.00, 60.00, 20, 1000, 'tonnes', true),
('S-FS', 'Fine Sand', 'SAND', 20.00, 60.00, 20, 1000, 'tonnes', true),
('S-RS', 'Red Sand', 'SAND', 25.00, 54.00, 20, 1000, 'tonnes', true);

-- ROAD BASE
INSERT INTO products (product_code, product_name, family_group, production_cost_per_unit, standard_price_per_unit, min_stock_level, max_stock_level, unit, is_active) VALUES
('R-T2', 'Type 2 Road Base', 'ROAD_BASE', 30.00, 55.00, 50, 2000, 'tonnes', true);

-- DUST
INSERT INTO products (product_code, product_name, family_group, production_cost_per_unit, standard_price_per_unit, min_stock_level, max_stock_level, unit, is_active) VALUES
('D-CRU', 'Crusher Dust', 'DUST', 15.00, 40.00, 50, 2000, 'tonnes', true),
('D-CRU100M', 'Crushables 100mm', 'DUST', 40.00, 40.00, 20, 1000, 'tonnes', true),
('D-CRK', 'Cracker Dust', 'DUST', 10.00, 10.00, 20, 1000, 'tonnes', true);

-- Verify products inserted
SELECT COUNT(*) as product_count FROM products;

-- ============================================
-- 2. LOCATIONS
-- ============================================

-- Production Area
INSERT INTO locations (location_code, location_name, location_type, capacity_tonnes, is_active) VALUES
('00', 'Main Production Area', 'PRODUCTION', 0, true);

-- Stockpiles
INSERT INTO locations (location_code, location_name, location_type, capacity_tonnes, is_active) VALUES
('22', 'Stockpile 22', 'STOCKPILE', 1000, true),
('25', 'Stockpile 25', 'STOCKPILE', 1000, true),
('26', 'Stockpile 26', 'STOCKPILE', 1000, true),
('29', 'Stockpile 29', 'STOCKPILE', 1000, true),
('31', 'Stockpile 31', 'STOCKPILE', 1000, true),
('40', 'Stockpile 40', 'STOCKPILE', 1000, true),
('41', 'Stockpile 41', 'STOCKPILE', 1000, true),
('42', 'Stockpile 42', 'STOCKPILE', 1000, true),
('52', 'Stockpile 52', 'STOCKPILE', 1000, true),
('53', 'Stockpile 53', 'STOCKPILE', 1000, true);

-- Verify locations inserted
SELECT COUNT(*) as location_count FROM locations;

-- ============================================
-- 3. CUSTOMERS
-- ============================================

INSERT INTO customers (customer_code, customer_name, customer_type, contact_person, phone, email, is_active) VALUES
('SWISS-01', 'Swiss Aluminium Australia Ltd', 'MAJOR_PROJECT', 'Project Manager', '08 8987 0000', 'swiss@example.com', true),
('BEN-01', 'Ben Hall Construction', 'CONSTRUCTION', 'Ben Hall', '08 8987 1111', 'ben@hallconstruction.com', true),
('SCHAPER-01', 'Schaper Concrete & Construction', 'CONSTRUCTION', 'Contact Person', '08 8987 2222', 'schaper@example.com', true),
('NHUL-01', 'Nhulunbuy Corporation', 'CONSTRUCTION', 'Contact Person', '08 8987 3333', 'nhulunbuy@example.com', true),
('RIO-01', 'Rio Tinto', 'MAJOR_PROJECT', 'Site Manager', '08 8987 4444', 'riotinto@example.com', true),
('RAC-INT', 'RAC Entities (Internal)', 'RAC_INTERNAL', 'RAC Admin', '08 8987 3433', 'admin@rac.org.au', true);

-- Verify customers inserted
SELECT COUNT(*) as customer_count FROM customers;

-- ============================================
-- 4. VEHICLES
-- ============================================

INSERT INTO vehicles (registration, vehicle_type, capacity_tonnes, service_due_date, is_active) VALUES
('RAC-L01', 'LOADER', 20.0, '2026-01-31', true),
('RAC-T01', 'TRUCK', 30.0, '2026-02-28', true),
('RAC-T02', 'TRUCK', 30.0, '2026-03-15', true);

-- Verify vehicles inserted
SELECT COUNT(*) as vehicle_count FROM vehicles;

-- ============================================
-- 5. DRIVERS
-- ============================================

INSERT INTO drivers (driver_code, driver_name, license_number, license_expiry, certifications, is_active) VALUES
('OP-001', 'Production Operator', 'NT12345', '2026-12-31', 'Heavy Vehicle, Loader', true),
('DR-001', 'Driver 1', 'NT12346', '2026-12-31', 'Heavy Vehicle', true),
('DR-002', 'Driver 2', 'NT12347', '2026-12-31', 'Heavy Vehicle', true);

-- Verify drivers inserted
SELECT COUNT(*) as driver_count FROM drivers;

-- ============================================
-- 6. DELIVERIES
-- ============================================

INSERT INTO deliveries (delivery_code, delivery_name, delivery_type, is_active) VALUES
('CUST-PU', 'Customer Pickup', 'PICKUP', true),
('RAC-DEL', 'RAC Delivery', 'DELIVERY', true),
('3RD-PTY', 'Third Party Delivery', 'DELIVERY', true),
('DIRECT', 'Direct Loading', 'DIRECT', true);

-- Verify deliveries inserted
SELECT COUNT(*) as delivery_count FROM deliveries;

-- ============================================
-- VERIFICATION SUMMARY
-- ============================================

SELECT 
    'Products' as table_name, 
    COUNT(*) as row_count 
FROM products
UNION ALL
SELECT 'Locations', COUNT(*) FROM locations
UNION ALL
SELECT 'Customers', COUNT(*) FROM customers
UNION ALL
SELECT 'Vehicles', COUNT(*) FROM vehicles
UNION ALL
SELECT 'Drivers', COUNT(*) FROM drivers
UNION ALL
SELECT 'Deliveries', COUNT(*) FROM deliveries
ORDER BY table_name;

-- ============================================
-- Expected Results:
-- Customers: 6
-- Deliveries: 4
-- Drivers: 3
-- Locations: 11 (1 production + 10 stockpiles)
-- Products: 14
-- Vehicles: 3
-- ============================================

-- End of master data script