# Invo Match — System Design Document

## 1. Problem Statement

Accounts payable teams manually process hundreds of invoices weekly: verifying vendor details, matching line items against Purchase Orders, checking amounts, and routing for approval. This is slow, error-prone, and doesn't scale.

**Invo Match** automates this entire pipeline using AI extraction + rule-based matching on a self-hosted, free-tier infrastructure.

---

## 2. High-Level Architecture

```
                    ┌───────────────────────────────────────────────────┐
                    │                  n8n (Orchestrator)               │
                    │                                                   │
  Gmail ────IMAP───▶│  Email Trigger ──▶ Encode PDF ──▶ Gemini API    │
                    │                                         │         │
  Webhook ─────────▶│  Webhook Trigger ──────────────────────▶         │
                    │                                         │         │
                    │                            Normalize JSON         │
                    │                                 │                 │
                    │              NocoDB Lookups (PO, Vendor)          │
                    │                                 │                 │
                    │                    Matching Service (Docker)      │
                    │                                 │                 │
                    │                    Store to NocoDB                │
                    │                                 │                 │
                    │                    Route ──▶ Email (SMTP)         │
                    └───────────────────────────────────────────────────┘
                                               │
                              ┌────────────────┴────────────────┐
                              │           NocoDB UI             │
                              │   (Invoices, POs, Audit Log)    │
                              └─────────────────────────────────┘
```

---

## 3. Component Design

### 3.1 Ingestion Layer — n8n Workflows

Two parallel ingestion paths converge to the same pipeline:

**Path A — Email Ingestion** (`invo-match-main.n8n.json`)
- Polls Gmail IMAP every 60 seconds
- Filters for emails with PDF attachments
- Extracts the PDF binary and passes to the shared pipeline

**Path B — Manual Upload** (`invo-match-manual-upload.n8n.json`)
- Listens on `POST /webhook/invo-match-upload`
- Reads PDF from local Docker volume `/data/sample_invoices/`
- Joins the shared pipeline at the same point

**Shared Pipeline (both paths):**
```
Compute Hash → Write PDF to disk → Encode Base64
     ↓
Gemini AI Extraction (REST API call)
     ↓
Normalize Extracted JSON (Code node)
     ↓
NocoDB Lookups: Invoices (duplicate check) + PO + PO Line Items + Vendor
     ↓
Build PO Object (Code node)
     ↓
Matching Service (HTTP POST to port 4000)
     ↓
Store Invoice + Line Items + Validation Results (NocoDB REST API)
     ↓
Switch on validation_status → Email Notification
     ↓
Audit Log (sub-workflow)
```

---

### 3.2 AI Extraction Layer — Google Gemini

- **Model**: `gemini-2.5-flash` (configured via `GEMINI_MODEL` env var)
- **Input**: Base64-encoded PDF sent as `inline_data` in the Gemini REST API request
- **Output**: Structured JSON conforming to invoice schema
- **Prompt style**: Zero-shot with explicit schema in system prompt
- **Response format**: `application/json` (Gemini structured output mode)
- **Retry**: 5 retries with 15s backoff on the n8n HTTP node

**Extracted Fields:**
```json
{
  "vendor_name": "string",
  "vendor_id": "string",
  "purchase_order_number": "string",
  "invoice_number": "string",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "currency": "INR|USD|EUR",
  "net_amount": 0.0,
  "tax_amount": 0.0,
  "gross_amount": 0.0,
  "confidence_score": 0.0,
  "extraction_warnings": [],
  "line_items": [...]
}
```

---

### 3.3 Matching Engine — Node.js Microservice

A standalone Express.js service running in Docker (`matching-service:4000`).

**Input** (POST `/match`):
```json
{
  "invoice": { ...extracted fields... },
  "po": { ...purchase order from NocoDB... },
  "options": { "existingInvoices": [...], "attachmentHash": "...", "vendorAliases": [...] }
}
```

**Validation Rules (in order of severity):**

| Rule ID | Rule | Severity | Outcome Trigger |
|---------|------|----------|----------------|
| R01 | PO exists | Critical | Rejected if missing |
| R02 | PO approved | Critical | Rejected if not approved |
| R03 | Duplicate detection (hash + invoice number) | Critical | Rejected if duplicate |
| R04 | Vendor match (with alias support) | Major | Rejected if mismatch |
| R05 | Currency match | Major | Rejected if mismatch |
| R06 | Total within PO remaining budget | Critical | Rejected if exceeded |
| R07 | Net/gross amount match | Major | Rejected if mismatch |
| R08 | Tax calculation correctness | Minor | Review if wrong |
| R09 | Line item count match | Major | Rejected if extra/missing |
| R10 | Line item price match (per-item, with tolerance) | Minor | Review if within tolerance |
| R11 | Confidence score ≥ 0.80 | Minor | Review if < 0.80 |
| R11b | Confidence score ≥ 0.60 | Critical | Rejected if < 0.60 |
| R12 | Tax amount consistent with line items | Minor | Review if mismatch |
| R13 | Single PO match (no duplicates in DB) | Minor | Review if multiple found |

**Tolerance**: Configurable per PO (`tolerance_percent` and `tolerance_amount` fields).

**Output:**
```json
{
  "invoice": { ...normalized invoice... },
  "po": { ...matched PO... },
  "validation": {
    "status": "Ready for Payment|Procurement Review|Rejected",
    "discrepancies": [...],
    "results": [...per-rule results...],
    "line_items": [...]
  },
  "duplicate_flag": false,
  "duplicate_type": ""
}
```

---

### 3.4 Database Layer — NocoDB + PostgreSQL

NocoDB provides a no-code UI over PostgreSQL. Tables:

| Table | Purpose |
|-------|---------|
| `vendors` | Vendor master data + aliases |
| `purchase_orders` | PO header (amount, approval status, tolerance) |
| `po_line_items` | Individual PO line items |
| `invoices` | Processed invoices + validation status |
| `invoice_line_items` | Extracted invoice line items |
| `validation_results` | Per-rule validation output |
| `audit_log` | Full event trail |

**Key design decisions:**
- `attachment_hash` (SHA-256) stored on invoices for duplicate detection
- `override_decision` field on invoices for manual procurement review
- `validation_status` is the primary routing field

---

### 3.5 Notification Layer — Gmail SMTP

After validation, n8n routes to one of three email nodes:
- **Ready for Payment** → accounting team email
- **Procurement Review** → procurement team email (with discrepancy details)
- **Rejected** → sender email (with rejection reasons)

---

## 4. Data Flow Diagram

```
Invoice PDF (email or webhook)
         │
         ▼
   [Hash computation]     ─────────────────────────────────┐
         │                                                   │ (duplicate check)
         ▼                                                   │
   [Base64 encode]                                          │
         │                                                   │
         ▼                                                ┌──▼──────────────┐
   [Gemini API]                                           │ NocoDB Invoices │
         │                                                └─────────────────┘
         ▼
   [Normalize JSON]
         │
         ├──────────────────────────────────────────────────┐
         │                                                   │
         ▼                                                   ▼
   [NocoDB PO Lookup]                               [NocoDB Vendor Lookup]
         │
         ▼
   [Build PO Object]
         │
         ▼
   [Matching Engine]  ◀──── Validation Rules (R01–R11)
         │
         ├───────────────────────────────────┐
         │                                   │
         ▼                                   ▼
   [Store Invoice]                   [Validation Results]
         │
         ▼
   [Email Routing]
   Ready │ Review │ Rejected
```

---

## 5. Scalability Considerations

| Concern | Current Approach | Scale-Up Path |
|---------|-----------------|---------------|
| Invoice volume | Sequential n8n polling | n8n queue mode + multiple workers |
| AI rate limits | 5 retries, 15s backoff | Gemini batch API or multiple keys |
| Database | Single PostgreSQL instance | Read replicas, connection pooling |
| Matching service | Single Docker container | Horizontal scaling with load balancer |

---

## 6. Security

- API keys stored in `.env`, injected as Docker environment variables
- n8n API authentication via JWT token
- NocoDB API token auth on all REST calls
- No invoice PDFs stored in cloud — all local Docker volumes
- SHA-256 attachment hashing for integrity verification

---

## 7. Key Design Decisions

1. **Self-hosted only**: No SaaS dependencies — all components run in Docker
2. **Gemini for PDF**: Direct PDF-as-base64 to Gemini avoids needing a separate PDF parser library
3. **Matching as a microservice**: Keeps business logic in testable Node.js code, separate from n8n orchestration
4. **NocoDB as UI**: Gives the procurement team a no-code interface to view and override invoices
5. **Audit trail**: Every state change logged to `audit_log` table via sub-workflow
6. **Duplicate detection**: SHA-256 hash of attachment + invoice number uniqueness check
