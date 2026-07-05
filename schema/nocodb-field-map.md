# NocoDB Field Map

This document lists the mapping between the AI-extracted invoice schema and NocoDB database fields.

## 1. Invoice Header Mapping

| Extracted JSON Field | NocoDB Table Column | Target Data Type |
| --- | --- | --- |
| `vendor_name` | `vendor_name` | SingleLineText |
| `vendor_id` | `vendor_id` | SingleLineText |
| `purchase_order_number` | `purchase_order_number` | SingleLineText |
| `invoice_number` | `invoice_number` | SingleLineText |
| `invoice_date` | `invoice_date` | Date |
| `due_date` | `due_date` | Date |
| `currency` | `currency` | SingleSelect |
| `net_amount` | `net_amount` | Decimal |
| `tax_amount` | `tax_amount` | Decimal |
| `gross_amount` | `gross_amount` | Decimal |
| `confidence_score` | `confidence_score` | Decimal |
| `extraction_warnings` | `extraction_warnings` | LongText (JSON serialized) |

## 2. Invoice Line Items Mapping

The items under `line_items` array in the JSON:

| Extracted JSON Field | NocoDB Table Column | Target Data Type |
| --- | --- | --- |
| `line_number` | `line_number` | Integer |
| `sku` | `sku` | SingleLineText |
| `description` | `description` | LongText |
| `quantity` | `quantity` | Decimal |
| `unit_price` | `unit_price` | Decimal |
| `tax_rate` | `tax_rate` | Decimal |
| `line_net_amount` | `line_net_amount` | Decimal |
| `line_tax_amount` | `line_tax_amount` | Decimal |
| `line_gross_amount` | `line_gross_amount` | Decimal |

## 3. Validation Rules Output Mapping

Mapped from the `field_results` and `line_item_results` returned by `matching.js`:

| Engine field | NocoDB Table Column | Target Data Type |
| --- | --- | --- |
| `fieldName` | `field_name` | SingleSelect |
| `ruleCategory` | `rule_category` | SingleSelect |
| `invoiceValue` | `invoice_value` | SingleLineText |
| `poValue` | `po_value` | SingleLineText |
| `matchStatus` | `match_status` | SingleSelect |
| `severity` | `severity` | SingleSelect |
| `ruleId` | `rule_id` | SingleLineText |
| `message` | `message` | LongText |
