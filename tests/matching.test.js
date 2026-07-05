import test from "node:test";
import assert from "node:assert";
import { matchInvoiceToPO } from "../src/matching.js";
import { normalizeInvoice, normalizePO } from "../src/normalize.js";
import { ValidationStatus } from "../src/schema.js";

// Mock PO Data
const rawPOs = {
  "PO-2026-1001": {
    po_number: "PO-2026-1001",
    vendor_id: "VEND-001",
    vendor_name_snapshot: "Acme Office Supplies Pvt Ltd",
    currency: "INR",
    approval_status: "Approved",
    approved_net_amount: 50000,
    approved_tax_amount: 9000,
    approved_gross_amount: 59000,
    remaining_amount: 59000,
    tolerance_percent: 2,
    tolerance_amount: 100,
    po_date: "2026-06-01"
  },
  "PO-2026-1002": {
    po_number: "PO-2026-1002",
    vendor_id: "VEND-002",
    vendor_name_snapshot: "Northwind Components",
    currency: "USD",
    approval_status: "Approved",
    approved_net_amount: 1200,
    approved_tax_amount: 120,
    approved_gross_amount: 1320,
    remaining_amount: 1320,
    tolerance_percent: 2,
    tolerance_amount: 5,
    po_date: "2026-06-02"
  },
  "PO-2026-1003": {
    po_number: "PO-2026-1003",
    vendor_id: "VEND-003",
    vendor_name_snapshot: "BluePeak Cloud Services",
    currency: "INR",
    approval_status: "Approved",
    approved_net_amount: 75000,
    approved_tax_amount: 13500,
    approved_gross_amount: 88500,
    remaining_amount: 88500,
    tolerance_percent: 2,
    tolerance_amount: 100,
    po_date: "2026-06-03"
  },
  "PO-2026-1004": {
    po_number: "PO-2026-1004",
    vendor_id: "VEND-001",
    vendor_name_snapshot: "Acme Office Supplies Pvt Ltd",
    currency: "INR",
    approval_status: "Draft", // NOT approved
    approved_net_amount: 10000,
    approved_tax_amount: 1800,
    approved_gross_amount: 11800,
    remaining_amount: 11800,
    tolerance_percent: 2,
    tolerance_amount: 100,
    po_date: "2026-06-04"
  },
  "PO-2026-1005": {
    po_number: "PO-2026-1005",
    vendor_id: "VEND-002",
    vendor_name_snapshot: "Northwind Components",
    currency: "USD",
    approval_status: "Approved",
    approved_net_amount: 2500,
    approved_tax_amount: 250,
    approved_gross_amount: 2750,
    remaining_amount: 2750,
    tolerance_percent: 2,
    tolerance_amount: 5,
    po_date: "2026-06-05"
  },
  "PO-2026-1006": {
    po_number: "PO-2026-1006",
    vendor_id: "VEND-003",
    vendor_name_snapshot: "BluePeak Cloud Services",
    currency: "INR",
    approval_status: "Approved",
    approved_net_amount: 30000,
    approved_tax_amount: 5400,
    approved_gross_amount: 35400,
    remaining_amount: 35400,
    tolerance_percent: 2,
    tolerance_amount: 100,
    po_date: "2026-06-06"
  }
};

const rawPOLineItems = {
  "PO-2026-1001": [
    { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 20, unit_price: 1500, tax_rate: 18, line_net_amount: 30000, line_tax_amount: 5400, line_gross_amount: 35400 },
    { line_number: 2, sku: "OFF-PEN-BLU", description: "Blue Ballpoint Pens Pack", quantity: 100, unit_price: 200, tax_rate: 18, line_net_amount: 20000, line_tax_amount: 3600, line_gross_amount: 23600 }
  ],
  "PO-2026-1002": [
    { line_number: 1, sku: "COMP-RAM-8G", description: "8GB DDR4 RAM Module", quantity: 24, unit_price: 50, tax_rate: 10, line_net_amount: 1200, line_tax_amount: 120, line_gross_amount: 1320 }
  ],
  "PO-2026-1003": [
    { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: 25000, tax_rate: 18, line_net_amount: 75000, line_tax_amount: 13500, line_gross_amount: 88500 }
  ],
  "PO-2026-1004": [
    { line_number: 1, sku: "OFF-CHAIR-01", description: "Ergonomic Office Chair", quantity: 2, unit_price: 5000, tax_rate: 18, line_net_amount: 10000, line_tax_amount: 1800, line_gross_amount: 11800 }
  ],
  "PO-2026-1005": [
    { line_number: 1, sku: "COMP-SSD-500", description: "500GB NVMe SSD", quantity: 50, unit_price: 50, tax_rate: 10, line_net_amount: 2500, line_tax_amount: 250, line_gross_amount: 2750 }
  ],
  "PO-2026-1006": [
    { line_number: 1, sku: "CLOUD-SUP-PREM", description: "Premium Technical Support Plan", quantity: 1, unit_price: 30000, tax_rate: 18, line_net_amount: 30000, line_tax_amount: 5400, line_gross_amount: 35400 }
  ]
};

// Helper to get PO in normalized format
function getPO(poNumber) {
  const po = rawPOs[poNumber];
  if (!po) return null;
  const items = rawPOLineItems[poNumber] || [];
  return normalizePO(po, items);
}

// 1. Happy Path - Perfect Match
test("INV-1001: Perfect Match Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_id: "VEND-001",
    purchase_order_number: "PO-2026-1001",
    invoice_number: "INV-1001",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    currency: "INR",
    net_amount: 50000,
    tax_amount: 9000,
    gross_amount: 59000,
    confidence_score: 0.95,
    extraction_warnings: [],
    line_items: [
      { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 20, unit_price: 1500, tax_rate: 18, line_net_amount: 30000, line_tax_amount: 5400, line_gross_amount: 35400 },
      { line_number: 2, sku: "OFF-PEN-BLU", description: "Blue Ballpoint Pens Pack", quantity: 100, unit_price: 200, tax_rate: 18, line_net_amount: 20000, line_tax_amount: 3600, line_gross_amount: 23600 }
    ]
  });

  const po = getPO("PO-2026-1001");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.READY_FOR_PAYMENT);
  assert.strictEqual(matchResult.discrepancies.length, 0);
  assert.strictEqual(matchResult.duplicate_flag, false);
});

// 2. Tolerance-based Review - Price mismatch within tolerance
test("INV-1002: Price mismatch within tolerance", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "Northwind Components",
    vendor_id: "VEND-002",
    purchase_order_number: "PO-2026-1002",
    invoice_number: "INV-1002",
    invoice_date: "2026-06-15",
    currency: "USD",
    net_amount: 1205.00, // +$5 mismatch (allowed under absolute tolerance of $5)
    tax_amount: 120.50,
    gross_amount: 1325.50,
    confidence_score: 0.90,
    extraction_warnings: [],
    line_items: [
      // Unit price is 50.20 instead of 50.00 (+0.4% - well within 2% pct tolerance)
      { line_number: 1, sku: "COMP-RAM-8G", description: "8GB DDR4 RAM Module", quantity: 24, unit_price: 50.20, tax_rate: 10, line_net_amount: 1204.80, line_tax_amount: 120.48, line_gross_amount: 1325.28 }
    ]
  });

  const po = getPO("PO-2026-1002");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  // Mismatches within tolerance should route to Procurement Review
  assert.strictEqual(matchResult.validation_status, ValidationStatus.PROCUREMENT_REVIEW);
  assert.ok(matchResult.discrepancies.includes("unit price mismatch"));
});

// 3. Rejected - Missing PO
test("INV-1003: Missing PO Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "Acme Office Supplies Pvt Ltd",
    purchase_order_number: "PO-2026-9999",
    invoice_number: "INV-1003",
    net_amount: 1000,
    tax_amount: 180,
    gross_amount: 1180,
    confidence_score: 0.90,
    line_items: []
  });

  const po = getPO("PO-2026-9999"); // returns null
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.ok(matchResult.discrepancies.includes("missing purchase order"));
});

// 4. Rejected - Extra Line Item
test("INV-1004: Extra Line Item Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_id: "VEND-001",
    purchase_order_number: "PO-2026-1001",
    invoice_number: "INV-1004",
    net_amount: 60000,
    tax_amount: 10800,
    gross_amount: 70800,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 20, unit_price: 1500, tax_rate: 18, line_net_amount: 30000, line_tax_amount: 5400, line_gross_amount: 35400 },
      { line_number: 2, sku: "OFF-PEN-BLU", description: "Blue Ballpoint Pens Pack", quantity: 100, unit_price: 200, tax_rate: 18, line_net_amount: 20000, line_tax_amount: 3600, line_gross_amount: 23600 },
      { line_number: 3, sku: "OFF-STAP-01", description: "Standard Stapler", quantity: 10, unit_price: 100, tax_rate: 18, line_net_amount: 1000, line_tax_amount: 180, line_gross_amount: 1180 }
    ]
  });

  const po = getPO("PO-2026-1001");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.ok(matchResult.discrepancies.includes("additional line item"));
});

// 5. Procurement Review - Scanned/Low Confidence
test("INV-1005: Low Confidence Routing", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "BluePeak Cloud Services",
    vendor_id: "VEND-003",
    purchase_order_number: "PO-2026-1003",
    invoice_number: "INV-1005",
    currency: "INR",
    net_amount: 75000,
    tax_amount: 13500,
    gross_amount: 88500,
    confidence_score: 0.70, // Below 0.80 but above 0.60
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: 25000, tax_rate: 18, line_net_amount: 75000, line_tax_amount: 13500, line_gross_amount: 88500 }
    ]
  });

  const po = getPO("PO-2026-1003");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.PROCUREMENT_REVIEW);
  assert.ok(matchResult.discrepancies.includes("low confidence extraction"));
});

// 6. Rejected - Vendor Mismatch
test("INV-1006: Vendor Mismatch Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "BluePeak Cloud Services", // PO-2026-1002 is for Northwind Components
    vendor_id: "VEND-003",
    purchase_order_number: "PO-2026-1002",
    invoice_number: "INV-1006",
    currency: "USD",
    net_amount: 1200,
    tax_amount: 120,
    gross_amount: 1320,
    confidence_score: 0.90,
    line_items: [
      { line_number: 1, sku: "COMP-RAM-8G", description: "8GB DDR4 RAM Module", quantity: 24, unit_price: 50, tax_rate: 10, line_net_amount: 1200, line_tax_amount: 120, line_gross_amount: 1320 }
    ]
  });

  const po = getPO("PO-2026-1002");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.ok(matchResult.discrepancies.includes("vendor mismatch"));
});

// 7. Rejected - Currency Mismatch
test("INV-1007: Currency Mismatch Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "BluePeak Cloud Services",
    vendor_id: "VEND-003",
    purchase_order_number: "PO-2026-1003",
    invoice_number: "INV-1007",
    currency: "USD", // PO is INR
    net_amount: 75000,
    tax_amount: 13500,
    gross_amount: 88500,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: 25000, tax_rate: 18, line_net_amount: 75000, line_tax_amount: 13500, line_gross_amount: 88500 }
    ]
  });

  const po = getPO("PO-2026-1003");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.ok(matchResult.discrepancies.includes("currency mismatch"));
});

// 8. Rejected - Duplicate Invoice
test("INV-1008: Duplicate Invoice Detection", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_id: "VEND-001",
    purchase_order_number: "PO-2026-1001",
    invoice_number: "INV-1001", // matches existing invoice number
    currency: "INR",
    net_amount: 50000,
    tax_amount: 9000,
    gross_amount: 59000,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 20, unit_price: 1500, tax_rate: 18, line_net_amount: 30000, line_tax_amount: 5400, line_gross_amount: 35400 }
    ]
  });

  const po = getPO("PO-2026-1001");
  const existing = [
    { id: 45, invoice_number: "INV-1001", vendor_id: "VEND-001", gross_amount: 59000 }
  ];

  // Business duplicate check
  const matchResult = matchInvoiceToPO(invoiceData, po, { existingInvoices: existing });

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.strictEqual(matchResult.duplicate_flag, true);
  assert.ok(matchResult.discrepancies.includes("duplicate invoice"));
});

// 9. Rejected - PO Not Approved
test("INV-1009: PO Status Check", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_id: "VEND-001",
    purchase_order_number: "PO-2026-1004", // status Draft
    invoice_number: "INV-1009",
    currency: "INR",
    net_amount: 10000,
    tax_amount: 1800,
    gross_amount: 11800,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "OFF-CHAIR-01", description: "Ergonomic Office Chair", quantity: 2, unit_price: 5000, tax_rate: 18, line_net_amount: 10000, line_tax_amount: 1800, line_gross_amount: 11800 }
    ]
  });

  const po = getPO("PO-2026-1004");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.ok(matchResult.discrepancies.includes("po not approved"));
});

// 10. Rejected - Missing PO Line Item
test("INV-1010: Missing PO Line Item Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "Northwind Components",
    vendor_id: "VEND-002",
    purchase_order_number: "PO-2026-1005", // PO has SKU COMP-SSD-500
    invoice_number: "INV-1010",
    currency: "USD",
    net_amount: 0,
    tax_amount: 0,
    gross_amount: 0,
    confidence_score: 0.95,
    line_items: [] // Empty line items!
  });

  const po = getPO("PO-2026-1005");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.ok(matchResult.discrepancies.includes("missing line item"));
});

// 11. Procurement Review - Tax Miscalculation
test("INV-1011: Tax Miscalculation Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "BluePeak Cloud Services",
    vendor_id: "VEND-003",
    purchase_order_number: "PO-2026-1006",
    invoice_number: "INV-1011",
    currency: "INR",
    net_amount: 30000,
    tax_amount: 5450, // tax is mismatched by +50 INR (within tolerance of 100 INR)
    gross_amount: 35450,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "CLOUD-SUP-PREM", description: "Premium Technical Support Plan", quantity: 1, unit_price: 30000, tax_rate: 18, line_net_amount: 30000, line_tax_amount: 5400, line_gross_amount: 35400 }
    ]
  });

  const po = getPO("PO-2026-1006");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.PROCUREMENT_REVIEW);
  assert.ok(matchResult.discrepancies.includes("tax mismatch"));
});

// 12. Rejected - Total Exceeds PO
test("INV-1012: Total exceeds PO Scenario", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "BluePeak Cloud Services",
    vendor_id: "VEND-003",
    purchase_order_number: "PO-2026-1003",
    invoice_number: "INV-1012",
    currency: "INR",
    net_amount: 80000, // exceeds PO net 75000 by 5000 (well beyond 100 absolute tolerance)
    tax_amount: 14400,
    gross_amount: 94400,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: 26666.67, tax_rate: 18, line_net_amount: 80000.01, line_tax_amount: 14400, line_gross_amount: 94400.01 }
    ]
  });

  const po = getPO("PO-2026-1003");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.REJECTED);
  assert.ok(matchResult.discrepancies.includes("total exceeds po"));
});

// 13. Procurement Review - Tax inconsistent with line items
test("INV-1013: Tax inconsistent with line items check", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "BluePeak Cloud Services",
    vendor_id: "VEND-003",
    purchase_order_number: "PO-2026-1003",
    invoice_number: "INV-1013",
    currency: "INR",
    net_amount: 75000,
    tax_amount: 13600, // Misaligned: Line items sum is 13500
    gross_amount: 88600,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: 25000, tax_rate: 18, line_net_amount: 75000, line_tax_amount: 13500, line_gross_amount: 88500 }
    ]
  });

  const po = getPO("PO-2026-1003");
  const matchResult = matchInvoiceToPO(invoiceData, po);

  assert.strictEqual(matchResult.validation_status, ValidationStatus.PROCUREMENT_REVIEW);
  assert.ok(matchResult.discrepancies.includes("tax mismatch"));
});

// 14. Procurement Review - Multiple matching POs found
test("INV-1014: Multiple matching POs found check", () => {
  const invoiceData = normalizeInvoice({
    vendor_name: "BluePeak Cloud Services",
    vendor_id: "VEND-003",
    purchase_order_number: "PO-2026-1003",
    invoice_number: "INV-1014",
    currency: "INR",
    net_amount: 75000,
    tax_amount: 13500,
    gross_amount: 88500,
    confidence_score: 0.95,
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: 25000, tax_rate: 18, line_net_amount: 75000, line_tax_amount: 13500, line_gross_amount: 88500 }
    ]
  });

  const po = getPO("PO-2026-1003");
  const matchResult = matchInvoiceToPO(invoiceData, po, { multiplePOsFound: true });

  assert.strictEqual(matchResult.validation_status, ValidationStatus.PROCUREMENT_REVIEW);
  assert.strictEqual(matchResult.purchase_order_match, "Multiple Candidates");
  assert.ok(matchResult.discrepancies.includes("multiple purchase orders found"));
});

