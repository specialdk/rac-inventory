export interface Product {
  id: number;
  product_code: string;
  product_name: string;
  family_group: string;
  unit: string;
  standard_cost: number;
  min_stock_level: number;
  max_stock_level: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Location {
  id: number;
  location_code: string;
  location_name: string;
  location_type: string;
  capacity_tonnes: number;
  assigned_product_id: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  customer_code: string;
  customer_name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  payment_terms: number;
  credit_limit: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: number;
  vehicle_code: string;
  registration: string;
  vehicle_type: string;
  capacity_tonnes: number;
  status: string;
  last_service_date: string | null;
  driver_id: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Driver {
  id: number;
  driver_code: string;
  first_name: string;
  last_name: string;
  license_class: string;
  phone: string;
  email: string;
  status: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CurrentStock {
  id: number;
  product_id: number;
  location_id: number;
  current_quantity: number;
  average_cost: number;
  total_value: number;
  last_movement_date: string;
  last_updated: string;
}

export interface StockMovement {
  id: number;
  movement_date: string;
  movement_type: string;
  product_id: number;
  location_id: number;
  quantity: number;
  unit_cost: number;
  total_value: number;
  reference_number: string;
  customer_id: number | null;
  vehicle_id: number | null;
  driver_id: number | null;
  docket_number: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
}
