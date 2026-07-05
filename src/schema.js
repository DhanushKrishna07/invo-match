/**
 * Invoice Extraction JSON Schema for Gemini and validation.
 */
export const InvoiceSchema = {
  type: "object",
  properties: {
    vendor_name: { type: ["string", "null"] },
    vendor_id: { type: ["string", "null"] },
    purchase_order_number: { type: ["string", "null"] },
    invoice_number: { type: ["string", "null"] },
    invoice_date: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    due_date: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    currency: { type: ["string", "null"], enum: ["INR", "USD", "EUR", null] },
    net_amount: { type: "number" },
    tax_amount: { type: "number" },
    gross_amount: { type: "number" },
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          line_number: { type: "integer" },
          sku: { type: ["string", "null"] },
          description: { type: ["string", "null"] },
          quantity: { type: "number" },
          unit_price: { type: "number" },
          tax_rate: { type: "number" },
          line_net_amount: { type: "number" },
          line_tax_amount: { type: "number" },
          line_gross_amount: { type: "number" }
        },
        required: [
          "line_number",
          "sku",
          "description",
          "quantity",
          "unit_price",
          "tax_rate",
          "line_net_amount",
          "line_tax_amount",
          "line_gross_amount"
        ]
      }
    },
    confidence_score: { type: "number", minimum: 0.0, maximum: 1.0 },
    extraction_warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "vendor_name",
    "vendor_id",
    "purchase_order_number",
    "invoice_number",
    "invoice_date",
    "due_date",
    "currency",
    "net_amount",
    "tax_amount",
    "gross_amount",
    "line_items",
    "confidence_score",
    "extraction_warnings"
  ]
};

export const ValidationStatus = {
  READY_FOR_PAYMENT: "Ready for Payment",
  PROCUREMENT_REVIEW: "Procurement Review",
  REJECTED: "Rejected"
};

export const DuplicateType = {
  NONE: "None",
  ATTACHMENT_HASH: "Attachment Hash",
  BUSINESS_DUPLICATE: "Business Duplicate",
  BOTH: "Both"
};

export const Severity = {
  INFO: "Info",
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical"
};

export const RuleCategory = {
  HEADER_MATCH: "Header Match",
  LINE_ITEM_MATCH: "Line Item Match",
  AMOUNT_VALIDATION: "Amount Validation",
  PO_ELIGIBILITY: "PO Eligibility",
  DUPLICATE_CHECK: "Duplicate Check",
  EXTRACTION_QUALITY: "Extraction Quality"
};
