-- Invo Match PostgreSQL Database Schema and Seeding Script

-- Enable UUID extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =========================================================================
-- 1. VENDORS
-- =========================================================================
CREATE TABLE IF NOT EXISTS vendors (
    id SERIAL PRIMARY KEY,
    vendor_id VARCHAR(50) UNIQUE NOT NULL,
    vendor_name VARCHAR(255) NOT NULL,
    vendor_aliases JSONB DEFAULT '[]'::jsonb,
    email_domains JSONB DEFAULT '[]'::jsonb,
    default_currency VARCHAR(10) DEFAULT 'INR',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 2. PURCHASE ORDERS
-- =========================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) UNIQUE NOT NULL,
    vendor_id VARCHAR(50) REFERENCES vendors(vendor_id) ON DELETE SET NULL,
    vendor_name_snapshot VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL,
    approval_status VARCHAR(50) DEFAULT 'Draft',
    po_date DATE,
    approved_net_amount DECIMAL(15, 2) DEFAULT 0.00,
    approved_tax_amount DECIMAL(15, 2) DEFAULT 0.00,
    approved_gross_amount DECIMAL(15, 2) DEFAULT 0.00,
    remaining_amount DECIMAL(15, 2) DEFAULT 0.00,
    tolerance_percent DECIMAL(5, 2) DEFAULT 2.00,
    tolerance_amount DECIMAL(15, 2) DEFAULT 100.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 3. PO LINE ITEMS
-- =========================================================================
CREATE TABLE IF NOT EXISTS po_line_items (
    id SERIAL PRIMARY KEY,
    po_number VARCHAR(50) REFERENCES purchase_orders(po_number) ON DELETE CASCADE,
    line_number INT NOT NULL,
    sku VARCHAR(100),
    description TEXT,
    quantity DECIMAL(15, 4) DEFAULT 0.0000,
    unit_price DECIMAL(15, 2) DEFAULT 0.00,
    tax_rate DECIMAL(5, 2) DEFAULT 0.00,
    line_net_amount DECIMAL(15, 2) DEFAULT 0.00,
    line_tax_amount DECIMAL(15, 2) DEFAULT 0.00,
    line_gross_amount DECIMAL(15, 2) DEFAULT 0.00,
    UNIQUE(po_number, line_number)
);

-- =========================================================================
-- 4. INVOICES
-- =========================================================================
CREATE TABLE IF NOT EXISTS invoices (
    id SERIAL PRIMARY KEY,
    vendor_name VARCHAR(255),
    vendor_id VARCHAR(50),
    purchase_order_number VARCHAR(50),
    purchase_order_match VARCHAR(50) DEFAULT 'Not Found',
    invoice_number VARCHAR(50),
    invoice_date DATE,
    due_date DATE,
    currency VARCHAR(10),
    net_amount DECIMAL(15, 2) DEFAULT 0.00,
    tax_amount DECIMAL(15, 2) DEFAULT 0.00,
    gross_amount DECIMAL(15, 2) DEFAULT 0.00,
    line_items_raw TEXT, -- Store raw JSON
    confidence_score DECIMAL(4, 2) DEFAULT 0.00,
    extraction_warnings TEXT, -- JSON Array
    ocr_used BOOLEAN DEFAULT FALSE,
    low_confidence_reason TEXT,
    missing_critical_fields TEXT, -- JSON Array
    duplicate_flag BOOLEAN DEFAULT FALSE,
    duplicate_type VARCHAR(50) DEFAULT 'None',
    validation_status VARCHAR(50) DEFAULT 'Procurement Review',
    discrepancy_summary TEXT,
    validation_results_json TEXT,
    reviewer_comments TEXT,
    override_decision VARCHAR(50) DEFAULT 'None',
    approved_at TIMESTAMP WITH TIME ZONE,
    rejected_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    invoice_attachment TEXT, -- Path or URL to attachment
    attachment_hash VARCHAR(255),
    sender_email VARCHAR(255),
    sender_name VARCHAR(255),
    email_subject VARCHAR(255),
    received_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- 5. INVOICE LINE ITEMS
-- =========================================================================
CREATE TABLE IF NOT EXISTS invoice_line_items (
    id SERIAL PRIMARY KEY,
    invoice_id INT REFERENCES invoices(id) ON DELETE CASCADE,
    line_number INT,
    sku VARCHAR(100),
    description TEXT,
    quantity DECIMAL(15, 4) DEFAULT 0.0000,
    unit_price DECIMAL(15, 2) DEFAULT 0.00,
    tax_rate DECIMAL(5, 2) DEFAULT 0.00,
    line_net_amount DECIMAL(15, 2) DEFAULT 0.00,
    line_tax_amount DECIMAL(15, 2) DEFAULT 0.00,
    line_gross_amount DECIMAL(15, 2) DEFAULT 0.00,
    matched_po_line_id INT, -- Refers to po_line_items.id if matched
    match_status VARCHAR(50) DEFAULT 'Match',
    match_notes TEXT
);

-- =========================================================================
-- 6. VALIDATION RESULTS
-- =========================================================================
CREATE TABLE IF NOT EXISTS validation_results (
    id SERIAL PRIMARY KEY,
    invoice_id INT REFERENCES invoices(id) ON DELETE CASCADE,
    po_number VARCHAR(50),
    field_name VARCHAR(100),
    rule_category VARCHAR(100),
    invoice_value VARCHAR(255),
    po_value VARCHAR(255),
    match_status VARCHAR(50),
    severity VARCHAR(50),
    rule_id VARCHAR(100),
    message TEXT
);

-- =========================================================================
-- 7. AUDIT LOG
-- =========================================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50) NOT NULL, -- 'Invoice', 'PO', 'Review'
    entity_id VARCHAR(100) NOT NULL,
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(100) DEFAULT 'System',
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    details_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =========================================================================
-- INDEXES FOR PERFORMANCE
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_po_line_po_number ON po_line_items(po_number);
CREATE INDEX IF NOT EXISTS idx_invoice_attachment_hash ON invoices(attachment_hash);
CREATE INDEX IF NOT EXISTS idx_invoice_po_number ON invoices(purchase_order_number);
CREATE INDEX IF NOT EXISTS idx_validation_invoice_id ON validation_results(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- =========================================================================
-- SEED DATA
-- =========================================================================

-- Seed Vendors
INSERT INTO vendors (vendor_id, vendor_name, vendor_aliases, email_domains, default_currency, active)
VALUES 
('VEND-001', 'Acme Office Supplies Pvt Ltd', '["Acme Office", "Acme Supplies", "Acme Office Supplies"]'::jsonb, '["acme.com", "acmeoffice.in"]'::jsonb, 'INR', TRUE),
('VEND-002', 'Northwind Components', '["Northwind", "Northwind Comp"]'::jsonb, '["northwind.com"]'::jsonb, 'USD', TRUE),
('VEND-003', 'BluePeak Cloud Services', '["BluePeak", "BluePeak Cloud"]'::jsonb, '["bluepeak.co", "bluepeak.com"]'::jsonb, 'INR', TRUE)
ON CONFLICT (vendor_id) DO NOTHING;

-- Seed Purchase Orders
INSERT INTO purchase_orders (po_number, vendor_id, vendor_name_snapshot, currency, approval_status, po_date, approved_net_amount, approved_tax_amount, approved_gross_amount, remaining_amount, tolerance_percent, tolerance_amount)
VALUES
('PO-2026-1001', 'VEND-001', 'Acme Office Supplies Pvt Ltd', 'INR', 'Approved', '2026-06-01', 50000.00, 9000.00, 59000.00, 59000.00, 2.00, 100.00),
('PO-2026-1002', 'VEND-002', 'Northwind Components', 'USD', 'Approved', '2026-06-02', 1200.00, 120.00, 1320.00, 1320.00, 2.00, 5.00),
('PO-2026-1003', 'VEND-003', 'BluePeak Cloud Services', 'INR', 'Approved', '2026-06-03', 75000.00, 13500.00, 88500.00, 88500.00, 2.00, 100.00),
('PO-2026-1004', 'VEND-001', 'Acme Office Supplies Pvt Ltd', 'INR', 'Draft', '2026-06-04', 10000.00, 1800.00, 11800.00, 11800.00, 2.00, 100.00),
('PO-2026-1005', 'VEND-002', 'Northwind Components', 'USD', 'Approved', '2026-06-05', 2500.00, 250.00, 2750.00, 2750.00, 2.00, 5.00),
('PO-2026-1006', 'VEND-003', 'BluePeak Cloud Services', 'INR', 'Approved', '2026-06-06', 30000.00, 5400.00, 35400.00, 35400.00, 2.00, 100.00)
ON CONFLICT (po_number) DO NOTHING;

-- Seed PO Line Items
INSERT INTO po_line_items (po_number, line_number, sku, description, quantity, unit_price, tax_rate, line_net_amount, line_tax_amount, line_gross_amount)
VALUES
('PO-2026-1001', 1, 'OFF-PAP-A4', 'A4 Copy Paper Box', 20.0000, 1500.00, 18.00, 30000.00, 5400.00, 35400.00),
('PO-2026-1001', 2, 'OFF-PEN-BLU', 'Blue Ballpoint Pens Pack', 100.0000, 200.00, 18.00, 20000.00, 3600.00, 23600.00),
('PO-2026-1002', 1, 'COMP-RAM-8G', '8GB DDR4 RAM Module', 24.0000, 50.00, 10.00, 1200.00, 120.00, 1320.00),
('PO-2026-1003', 1, 'CLOUD-VM-STD', 'Standard Virtual Machine Hosting', 3.0000, 25000.00, 18.00, 75000.00, 13500.00, 88500.00),
('PO-2026-1004', 1, 'OFF-CHAIR-01', 'Ergonomic Office Chair', 2.0000, 5000.00, 18.00, 10000.00, 1800.00, 11800.00),
('PO-2026-1005', 1, 'COMP-SSD-500', '500GB NVMe SSD', 50.0000, 50.00, 10.00, 2500.00, 250.00, 2750.00),
('PO-2026-1006', 1, 'CLOUD-SUP-PREM', 'Premium Technical Support Plan', 1.0000, 30000.00, 18.00, 30000.00, 5400.00, 35400.00)
ON CONFLICT (po_number, line_number) DO NOTHING;
