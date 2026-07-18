# Invo Match - System Design Assumptions & Tolerances

This document details the tolerances, assumptions, constraints, and business rules implemented in the Invo Match procurement automation engine.

---

## 1. Core Matching Tolerances

Discrepancy calculations are governed by rules defined inside the database and handled programmatically by `src/matching.js`.

- **Unit Price tolerance**: Default allowed price variance is **2.0%** or **100 INR** (or **5 USD**), whichever is larger.
- **Subtotal (Net Amount) tolerance**: Checked similarly at **2.0%** of the PO's net amount.
- **Rounding tolerance**: Float rounding issues up to **0.05** are marked as a Match.
- **Quantity tolerance**: Only allowed on physical PO line items if explicitly configured; default behavior flags quantity overages immediately (within tolerance → Procurement Review; exceeding tolerance → Rejected). Missing PO line items (short shipments) are flagged as a **Major Mismatch** and result in Rejected status.

---

## 2. Duplicate Detection Constraints

Automated duplicate prevention is standard on all incoming invoices to prevent double-payment:

- **Attachment Hash duplicate**: Calculated as `SHA-256` of the binary PDF. If matches a previously stored record, it is rejected immediately.
- **Business duplicate**: Normalized `Vendor Name + Invoice Number` check. Rejects matching records to prevent duplicate invoices sent with minor text edits.

---

## 3. Ingestion and OCR Assumptions

- **File Format**: The engine filters and processes only `.pdf` invoice attachments.
- **LLM Prompting & Confidence**: We assume the Gemini API free tier is utilized. For scanned low-text PDF structures, the LLM confidence score decreases. A confidence score between **0.60 and 0.80** routes to `Procurement Review` automatically; below **0.60** is rejected.
- **Security & PII**: To respect Gemini's free tier data improvement terms, **only mock/fake purchase orders and invoice PDFs are utilized for this local demo**. Storing real corporate banking or financial PII is prohibited in the default setup.
