# 📘 Invo Match — User Verification & Testing Guide

This guide explains how to operate, test, and verify the **Invo Match** automated invoice processing system. Follow these steps to simulate real-world invoice processing, review system decisions, and test the matching engine.

---

## 📋 1. Prerequisites & Environment Check

Before beginning verification, ensure all services are running and databases are initialized.

### Start the Stack
If you haven't already, start the Docker services from the root of the project:
```bash
docker compose up -d
```

Verify that all containers are healthy:
```bash
docker compose ps
```
You should see four active containers:
* `invo-match-n8n` (n8n dashboard on port `5678`)
* `invo-match-nocodb` (NocoDB dashboard on port `8080`)
* `invo-match-postgres-nocodb` (Postgres DB)
* `invo-match-matching-service` (Express matching engine on port `4000`)

### Accessing the Dashboards
* **NocoDB:** Open `http://localhost:8080` in your web browser.
* **n8n:** Open `http://localhost:5678` in your web browser.

---

## 🧹 2. Preparing a Clean Test Run

To start with a fresh slate for testing:

1. Clear old invoice run data from the PostgreSQL database by running the following command:
   ```bash
   docker exec invo-match-postgres-nocodb psql -U nocodb -d nocodb -c "TRUNCATE invoices, invoice_line_items, validation_results, audit_log RESTART IDENTITY CASCADE;"
   ```
2. Navigate to NocoDB and verify that the `invoices`, `invoice_line_items`, `validation_results`, and `audit_log` tables are empty.
3. Open the `purchase_orders` table to view the pre-seeded POs (e.g., `PO-2026-1001` approved for `INR 59,000.00`).

---

## 📤 3. Ingesting Invoices for Testing

You can trigger invoice processing using either **Manual Webhook Upload** (recommended for deterministic testing) or **Email Ingestion**.

### Option A: Manual Webhook Ingestion (Recommended)
You can trigger the validation pipeline by sending a request to the manual upload webhook containing the name of a sample invoice PDF located in `data/sample_invoices/`.

#### Trigger Invoice 1: Perfect Match Scenario (INV-1001)
Run the following PowerShell command to submit `INV-1001-perfect-match.pdf`:
```powershell
Invoke-WebRequest -Uri "http://localhost:5678/webhook/invo-match-upload" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"filename":"INV-1001-perfect-match.pdf"}' `
  -UseBasicParsing
```
1. Open n8n and go to **Executions** under the `Invo Match - Manual Upload Fallback` workflow. Watch it complete successfully.
2. Go to NocoDB's **Ready for Payment** view. You will see a new record for `INV-1001` with status `Ready for Payment`.

#### Trigger Invoice 2: Price Mismatch Within Tolerance (INV-1002)
Run this command to process an invoice with a minor price mismatch:
```powershell
Invoke-WebRequest -Uri "http://localhost:5678/webhook/invo-match-upload" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"filename":"INV-1002-price-mismatch.pdf"}' `
  -UseBasicParsing
```
* **Expected Result:** The matching engine detects a minor unit price mismatch that is within the PO tolerance limit. The invoice is automatically routed to the **Needs Review** view with a status of `Procurement Review`.

#### Trigger Invoice 3: Missing Purchase Order (INV-1003)
Run this command to process an invoice referencing a non-existent PO:
```powershell
Invoke-WebRequest -Uri "http://localhost:5678/webhook/invo-match-upload" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"filename":"INV-1003-missing-po.pdf"}' `
  -UseBasicParsing
```
* **Expected Result:** The system flags the invoice as `Rejected`. In NocoDB under the **Rejected** view, you will find `INV-1003` with a discrepancy description of `missing purchase order`.

---

## 🔍 4. Inspecting Validation Results & Audit Logs

Invo Match provides granular transparency for auditing every automation step.

### Inspecting Granular Rule Output
1. Navigate to NocoDB and open the **Validation Results** table.
2. Sort or filter by the Invoice ID. You will see a checklist of individual business rules (e.g., `AMOUNT_TOLERANCE`, `VENDOR_MATCH`, `PO_STATUS_CHECK`) showing a status of `Passed` or `Failed`, the rule's severity level, and a human-readable description of any discrepancies.

### Auditing the Timeline
1. In NocoDB, open the **Audit Log** table.
2. Observe the step-by-step lifecycle of each processed invoice:
   - `invoice_extracted` (Gemini successfully extracted data)
   - `po_lookup_completed` (PO retrieved from database)
   - `validation_completed` (Node.js matching engine completed check)
   - `ready_for_payment` or `routed_to_review` (Workflow routing outcome)

---

## 🔄 5. Processing Procurement Review Overrides

When an invoice is placed in the `Procurement Review` state, an administrator can manually override the decision.

1. Navigate to the **Needs Review** view in the `invoices` table.
2. Select invoice `INV-1002`.
3. Set the `override_decision` field to **`Approved`**.
4. *(Optional)* Add a comment in `reviewer_comments`, e.g., *"Price variance approved per contract appendix."*
5. Wait for the `Invo Match - Procurement Review Webhook` scheduler to poll (runs once per minute), or manually trigger it in n8n.
6. Refresh NocoDB. You will observe:
   - `validation_status` has changed to **`Ready for Payment`**.
   - `override_decision` has reset back to **`None`**.
   - `approved_at` timestamp is populated.
   - An event of type `override_applied` has been recorded in the **Audit Log** table.

*Note: If you attempt to override an invoice to **`Rejected`** without filling in the `rejection_reason` column, the override scheduler will automatically reverse the override back to `None` and send a warning notification email to the procurement email address.*

---

## 🛡️ 6. Verifying AP Safeguards & Duplicate Control

To test the duplicate invoice block:
1. Re-run the command for `INV-1001-perfect-match.pdf` (Option A above).
2. Because the invoice hash matches a previously stored file, the workflow immediately flags it as a duplicate, marks it **`Rejected`**, and sets `duplicate_flag` to `true`.
3. Check the **Audit Log** table to verify a `duplicate_check_completed` warning was registered.

---

## 🗂️ 7. Full Test Suite Scenarios Reference

The system includes 12 sample invoices designed to test various matching engine rules:

| Invoice Filename | Target PO | Expected Status | Primary Validation Behavior Tested |
|------------------|-----------|-----------------|-----------------------------------|
| `INV-1001-perfect-match.pdf` | `PO-2026-1001` | `Ready for Payment` | Happy path invoice where all line items and sums match. |
| `INV-1002-price-mismatch.pdf` | `PO-2026-1002` | `Procurement Review` | Unit price mismatch within tolerance limit. |
| `INV-1003-missing-po.pdf` | `PO-2026-9999` (none) | `Rejected` | Reference to missing/invalid PO number. |
| `INV-1004-extra-line-item.pdf` | `PO-2026-1001` | `Rejected` | Invoice contains line items not present on PO. |
| `INV-1005-scanned-low-confidence.pdf`| `PO-2026-1003` | `Procurement Review` | Low quality/scanned invoice triggering OCR. |
| `INV-1006-vendor-mismatch.pdf` | `PO-2026-1002` | `Rejected` | Invoice vendor name does not match PO vendor name. |
| `INV-1007-currency-mismatch.pdf` | `PO-2026-1003` | `Rejected` | Invoice currency does not match PO currency. |
| `INV-1008-duplicate-invoice.pdf` | `PO-2026-1001` | `Rejected` | Duplicate invoice number and file hash detection. |
| `INV-1009-po-not-approved.pdf` | `PO-2026-1004` | `Rejected` | Refers to a PO that is still in `Draft` state. |
| `INV-1010-missing-line-item.pdf` | `PO-2026-1005` | `Rejected` | Expected line item from PO is missing from invoice. |
| `INV-1011-tax-miscalculation.pdf` | `PO-2026-1006` | `Procurement Review` | Line items do not sum to total tax amount. |
| `INV-1012-total-exceeds-po.pdf` | `PO-2026-1003` | `Rejected` | Gross amount exceeds PO limit. |
