/**
 * Normalization helper functions for invoices and PO data.
 */

export function normalizeVendorName(name) {
  if (!name) return "";
  return name
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") // Remove punctuation
    .replace(/\b(pvt ltd|private limited|ltd|limited|llc|inc|corp|corporation|gmbh|co)\b/g, "") // Remove legal suffixes
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim();
}

export function normalizeCurrency(currency) {
  if (!currency) return null;
  const cleaned = currency.trim().toUpperCase();
  // Map common symbols to ISO codes
  if (cleaned === "$" || cleaned === "USD") return "USD";
  if (cleaned === "₹" || cleaned === "INR" || cleaned === "RS") return "INR";
  if (cleaned === "€" || cleaned === "EUR") return "EUR";
  return cleaned;
}

export function normalizeAmount(value) {
  if (value === null || value === undefined) return 0.00;
  if (typeof value === "string") {
    // Remove currency symbols, commas, and spaces
    const cleaned = value.replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0.00 : Math.round(parsed * 100) / 100;
  }
  if (typeof value === "number") {
    return Math.round(value * 100) / 100;
  }
  return 0.00;
}

export function normalizeQuantity(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return typeof value === "number" ? value : 0;
}

export function normalizeDate(value) {
  if (!value) return null;
  const str = String(value).trim();
  // Check if it starts with YYYY-MM-DD
  const match = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, "0");
    const d = match[3].padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  try {
    const d = new Date(str);
    if (isNaN(d.getTime())) return null;
    
    // If input has explicit UTC timezone indicators, get UTC components
    if (str.includes("Z") || str.includes("T") || str.includes("+") || (str.includes("-") && str.split("-").length > 3)) {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    } else {
      // Treat as local date and get local components
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  } catch {
    return null;
  }
}

export function normalizeLineItem(item) {
  return {
    line_number: parseInt(item.line_number) || 0,
    sku: item.sku ? item.sku.trim() : null,
    description: item.description ? item.description.trim() : "",
    quantity: normalizeQuantity(item.quantity),
    unit_price: normalizeAmount(item.unit_price),
    tax_rate: normalizeQuantity(item.tax_rate),
    line_net_amount: normalizeAmount(item.line_net_amount),
    line_tax_amount: normalizeAmount(item.line_tax_amount),
    line_gross_amount: normalizeAmount(item.line_gross_amount)
  };
}

export function normalizeInvoice(aiJson) {
  if (!aiJson) return null;
  const lineItems = Array.isArray(aiJson.line_items) ? aiJson.line_items : [];
  return {
    vendor_name: aiJson.vendor_name ? aiJson.vendor_name.trim() : null,
    vendor_id: aiJson.vendor_id ? aiJson.vendor_id.trim() : null,
    purchase_order_number: aiJson.purchase_order_number ? aiJson.purchase_order_number.trim() : null,
    invoice_number: aiJson.invoice_number ? aiJson.invoice_number.trim() : null,
    invoice_date: normalizeDate(aiJson.invoice_date),
    due_date: normalizeDate(aiJson.due_date),
    currency: normalizeCurrency(aiJson.currency),
    net_amount: normalizeAmount(aiJson.net_amount),
    tax_amount: normalizeAmount(aiJson.tax_amount),
    gross_amount: normalizeAmount(aiJson.gross_amount),
    line_items: lineItems.map(normalizeLineItem),
    confidence_score: parseFloat(aiJson.confidence_score) || 0.00,
    extraction_warnings: Array.isArray(aiJson.extraction_warnings) ? aiJson.extraction_warnings : []
  };
}

export function normalizePO(poRecord, poLineItems = []) {
  if (!poRecord) return null;
  return {
    po_number: poRecord.po_number ? poRecord.po_number.trim() : null,
    vendor_id: poRecord.vendor_id || null,
    vendor_name_snapshot: poRecord.vendor_name_snapshot ? poRecord.vendor_name_snapshot.trim() : null,
    currency: normalizeCurrency(poRecord.currency),
    approval_status: poRecord.approval_status ? poRecord.approval_status.trim() : null,
    po_date: normalizeDate(poRecord.po_date),
    approved_net_amount: normalizeAmount(poRecord.approved_net_amount),
    approved_tax_amount: normalizeAmount(poRecord.approved_tax_amount),
    approved_gross_amount: normalizeAmount(poRecord.approved_gross_amount),
    remaining_amount: normalizeAmount(poRecord.remaining_amount),
    tolerance_percent: poRecord.tolerance_percent !== undefined ? parseFloat(poRecord.tolerance_percent) : 2.00,
    tolerance_amount: poRecord.tolerance_amount !== undefined ? parseFloat(poRecord.tolerance_amount) : 100.00,
    line_items: poLineItems.map(item => ({
      line_number: parseInt(item.line_number) || 0,
      sku: item.sku ? item.sku.trim() : null,
      description: item.description ? item.description.trim() : "",
      quantity: normalizeQuantity(item.quantity),
      unit_price: normalizeAmount(item.unit_price),
      tax_rate: normalizeQuantity(item.tax_rate),
      line_net_amount: normalizeAmount(item.line_net_amount),
      line_tax_amount: normalizeAmount(item.line_tax_amount),
      line_gross_amount: normalizeAmount(item.line_gross_amount)
    }))
  };
}
