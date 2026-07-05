# Invo Match Database Schema Definition

This document outlines the NocoDB database tables, columns, data types, and relationships.

---

## 1. Vendors (`vendors`)
Stores information about approved suppliers.

| Column Name | UI Label | Data Type | Notes / Constraints |
| --- | --- | --- | --- |
| `id` | ID | Auto Increment | Primary key |
| `vendor_id` | Vendor ID | SingleLineText | Unique business identifier (e.g. `VEND-001`) |
| `vendor_name` | Vendor Name | SingleLineText | Canonical name |
| `vendor_aliases` | Vendor Aliases | LongText (JSON array) | Alternate spellings (e.g. `["Acme Inc", "Acme Office"]`) |
| `email_domains` | Email Domains | LongText (JSON array) | Sender validation domains (e.g. `["acme.com"]`) |
| `default_currency` | Default Currency | SingleSelect | INR, USD, EUR |
| `active` | Active | Checkbox | Active/inactive flag |
| `created_at` | Created At | CreatedTime | System timestamp |
| `updated_at` | Updated At | LastModifiedTime | System timestamp |

---

## 2. Purchase Orders (`purchase_orders`)
Stores approved client Purchase Orders against which invoices are validated.

| Column Name | UI Label | Data Type | Notes / Constraints |
| --- | --- | --- | --- |
| `id` | ID | Auto Increment | Primary key |
| `po_number` | PO Number | SingleLineText | Unique PO reference (e.g. `PO-2026-1001`) |
| `vendor_id` | Vendor | LinkToTable | Links to `vendors.id` |
| `vendor_name_snapshot` | Vendor Name Snapshot | SingleLineText | Cached name snapshot at PO creation |
| `currency` | Currency | SingleSelect | INR, USD, EUR |
| `approval_status` | Approval Status | SingleSelect | Draft, Approved, Closed, Cancelled |
| `po_date` | PO Date | Date | PO issue date |
| `approved_net_amount` | Approved Net Amount | Decimal (10, 2) | Subtotal before taxes |
| `approved_tax_amount` | Approved Tax Amount | Decimal (10, 2) | Expected tax |
| `approved_gross_amount` | Approved Gross Amount | Decimal (10, 2) | Total approved amount |
| `remaining_amount` | Remaining Amount | Decimal (10, 2) | Unbilled balance |
| `tolerance_percent` | Tolerance Percent | Decimal (4, 2) | Default: `2.00` |
| `tolerance_amount` | Tolerance Amount | Decimal (10, 2) | Absolute limit (e.g. `100.00`) |
| `created_at` | Created At | CreatedTime | System timestamp |
| `updated_at` | Updated At | LastModifiedTime | System timestamp |

---

## 3. PO Line Items (`po_line_items`)
Line items contained in a Purchase Order.

| Column Name | UI Label | Data Type | Notes / Constraints |
| --- | --- | --- | --- |
| `id` | ID | Auto Increment | Primary key |
| `po_id` | PO Number | LinkToTable | Links to `purchase_orders.id` |
| `line_number` | Line Number | Integer | Index of line in PO |
| `sku` | SKU | SingleLineText | SKU/Part number |
| `description` | Description | LongText | Description of product/service |
| `quantity` | Quantity | Decimal (10, 4) | Approved quantity |
| `unit_price` | Unit Price | Decimal (10, 2) | Approved rate per unit |
| `tax_rate` | Tax Rate | Decimal (5, 2) | Applied percentage (e.g. `18.00` for 18%) |
| `line_net_amount` | Line Net Amount | Decimal (10, 2) | `quantity * unit_price` |
| `line_tax_amount` | Line Tax Amount | Decimal (10, 2) | Calculated tax |
| `line_gross_amount` | Line Gross Amount | Decimal (10, 2) | `net + tax` |

---

## 4. Invoices (`invoices`)
Captures all details parsed from supplier invoices and the outcome of the validation run.

| Column Name | UI Label | Data Type | Notes / Constraints |
| --- | --- | --- | --- |
| `id` | ID | Auto Increment | Primary key |
| `vendor_name` | Vendor Name | SingleLineText | Extracted supplier name |
| `vendor_id` | Vendor ID | SingleLineText | Matched vendor id or null |
| `purchase_order_number` | Purchase Order Number | SingleLineText | Extracted PO reference |
| `purchase_order_match` | Purchase Order Match | SingleSelect | Found, Not Found, Multiple Candidates, Not Approved |
| `invoice_number` | Invoice Number | SingleLineText | Supplier-issued invoice identifier |
| `invoice_date` | Invoice Date | Date | Extracted date |
| `due_date` | Due Date | Date | Extracted due date |
| `currency` | Currency | SingleSelect | Extracted currency (INR, USD, EUR) |
| `net_amount` | Net Amount | Decimal (10, 2) | Extracted subtotal |
| `tax_amount` | Tax Amount | Decimal (10, 2) | Extracted tax amount |
| `gross_amount` | Gross Amount | Decimal (10, 2) | Extracted total payable |
| `line_items_raw` | Line Items Raw | LongText (JSON) | Extracted raw JSON string |
| `confidence_score` | Confidence Score | Decimal (3, 2) | Extraction confidence (0.00 to 1.00) |
| `extraction_warnings` | Extraction Warnings | LongText (JSON) | Warnings from extraction engine |
| `ocr_used` | OCR Used | Checkbox | True if OCR was run |
| `low_confidence_reason` | Low Confidence Reason | LongText | Description of why confidence is low |
| `missing_critical_fields` | Missing Critical Fields | LongText (JSON) | Array of empty critical fields |
| `duplicate_flag` | Duplicate Flag | Checkbox | Checked if duplicate detected |
| `duplicate_type` | Duplicate Type | SingleSelect | None, Attachment Hash, Business Duplicate, Both |
| `validation_status` | Validation Status | SingleSelect | Ready for Payment, Procurement Review, Rejected |
| `discrepancy_summary` | Discrepancy Summary | LongText | Human-readable explanation of discrepancies |
| `validation_results_json` | Validation Results JSON | LongText (JSON) | Complete validation engine output payload |
| `reviewer_comments` | Reviewer Comments | LongText | Manual comments during override |
| `override_decision` | Override Decision | SingleSelect | None, Approved, Rejected |
| `approved_at` | Approved At | DateTime | Time manual approval was recorded |
| `rejected_at` | Rejected At | DateTime | Time manual rejection was recorded |
| `rejection_reason` | Rejection Reason | LongText | Required if rejected |
| `invoice_attachment` | Invoice Attachment | Attachment | Original PDF file |
| `attachment_hash` | Attachment Hash | SingleLineText | SHA-256 hash |
| `sender_email` | Sender Email | SingleLineText | Email header |
| `sender_name` | Sender Name | SingleLineText | Email header |
| `email_subject` | Email Subject | SingleLineText | Email header |
| `received_at` | Received At | DateTime | Ingestion timestamp |
| `updated_at` | Updated At | LastModifiedTime | System timestamp |

---

## 5. Invoice Line Items (`invoice_line_items`)
Extracted lines from the supplier invoice.

| Column Name | UI Label | Data Type | Notes / Constraints |
| --- | --- | --- | --- |
| `id` | ID | Auto Increment | Primary key |
| `invoice_id` | Invoice | LinkToTable | Links to `invoices.id` |
| `line_number` | Line Number | Integer | Extracted index |
| `sku` | SKU | SingleLineText | Extracted SKU/Part number |
| `description` | Description | LongText | Extracted description |
| `quantity` | Quantity | Decimal (10, 4) | Extracted quantity |
| `unit_price` | Unit Price | Decimal (10, 2) | Extracted rate |
| `tax_rate` | Tax Rate | Decimal (5, 2) | Extracted tax percentage |
| `line_net_amount` | Line Net Amount | Decimal (10, 2) | Extracted net amount |
| `line_tax_amount` | Line Tax Amount | Decimal (10, 2) | Extracted tax amount |
| `line_gross_amount` | Line Gross Amount | Decimal (10, 2) | Extracted gross amount |
| `matched_po_line_id` | Matched PO Line | LinkToTable | Links to `po_line_items.id` |
| `match_status` | Match Status | SingleSelect | Match, Minor Mismatch, Major Mismatch, Extra Line, Missing PO Line |
| `match_notes` | Match Notes | LongText | Details on item matching result |

---

## 6. Validation Results (`validation_results`)
Granular checks recorded by the validation engine for auditing and visual warnings.

| Column Name | UI Label | Data Type | Notes / Constraints |
| --- | --- | --- | --- |
| `id` | ID | Auto Increment | Primary key |
| `invoice_id` | Invoice | LinkToTable | Links to `invoices.id` |
| `po_number` | PO Number | SingleLineText | Linked PO identifier (for quick search) |
| `field_name` | Field Name | SingleSelect | Vendor, PO Number, Currency, Quantity, Unit Price, Net Amount, Tax Amount, Gross Amount, Line Items |
| `rule_category` | Rule Category | SingleSelect | Header Match, Line Item Match, Amount Validation, PO Eligibility, Duplicate Check, Extraction Quality |
| `invoice_value` | Invoice Value | SingleLineText | Extracted or calculated value |
| `po_value` | PO Value | SingleLineText | Reference PO value |
| `match_status` | Match Status | SingleSelect | Match, Minor Mismatch, Major Mismatch, Missing, Not Applicable |
| `severity` | Severity | SingleSelect | Info, Minor, Major, Critical |
| `rule_id` | Rule ID | SingleLineText | Unique rule mnemonic (e.g. `UNIT_PRICE_TOLERANCE`) |
| `message` | Message | LongText | Readable error/warning description |

---

## 7. Audit Log (`audit_log`)
Timeline record of actions taken on an invoice.

| Column Name | UI Label | Data Type | Notes / Constraints |
| --- | --- | --- | --- |
| `id` | ID | Auto Increment | Primary key |
| `entity_type` | Entity Type | SingleSelect | Invoice, PO, Review |
| `entity_id` | Entity ID | SingleLineText | Primary key or ID of entity (e.g. invoice id) |
| `action` | Action | SingleSelect | email_received, manual_upload_received, attachment_filtered, pdf_text_extracted, ocr_fallback_used, invoice_extracted, po_lookup_completed, duplicate_check_completed, validation_completed, routed_to_review, ready_for_payment, approved, rejected, override_applied, error_occurred |
| `actor` | Actor | SingleLineText | System trigger or user identity |
| `previous_status` | Previous Status | SingleLineText | Previous validation status |
| `new_status` | New Status | SingleLineText | New validation status |
| `details_json` | Details JSON | LongText (JSON) | Metadata/context about the event |
| `created_at` | Created At | CreatedTime | System timestamp |
