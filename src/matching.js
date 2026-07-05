import { normalizeVendorName, normalizeCurrency, normalizeAmount } from "./normalize.js";
import { ValidationStatus, Severity, RuleCategory, DuplicateType } from "./schema.js";

/**
 * Calculates if a value is within tolerance of a reference value.
 */
export function isWithinTolerance(val, refVal, percent = 2.0, absolute = 100.0) {
  const diff = Math.abs(val - refVal);
  const allowedPercentDelta = (refVal * percent) / 100.0;
  const allowedDelta = Math.max(allowedPercentDelta, absolute);
  return diff <= allowedDelta;
}

/**
 * String similarity helper using Jaccard index on word sets.
 */
export function stringSimilarity(str1, str2) {
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(Boolean));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(Boolean));
  if (words1.size === 0 && words2.size === 0) return 1.0;
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Core validation engine: compares normalized Invoice against PO and existing databases.
 */
export function matchInvoiceToPO(invoice, po, options = {}) {
  const {
    existingInvoices = [],
    attachmentHash = null,
    vendorAliases = [],
    multiplePOsFound = false
  } = options;

  const results = [];
  const discrepancies = [];
  const decisionReasons = [];
  
  let validationStatus = ValidationStatus.READY_FOR_PAYMENT;
  let maxSeverity = Severity.INFO;
  
  let duplicateFlag = false;
  let duplicateType = DuplicateType.NONE;

  // 1. EXTRACTION QUALITY / CONFIDENCE CHECK
  const confidence = invoice.confidence_score;
  let confidenceStatus = "Match";
  let confidenceSeverity = Severity.INFO;
  let confidenceMsg = `Extraction confidence is high: ${(confidence * 100).toFixed(0)}%`;

  if (confidence < 0.60) {
    validationStatus = ValidationStatus.REJECTED;
    confidenceStatus = "Major Mismatch";
    confidenceSeverity = Severity.CRITICAL;
    confidenceMsg = `Extraction confidence is dangerously low: ${(confidence * 100).toFixed(0)}%`;
    discrepancies.push("low confidence extraction");
    decisionReasons.push(confidenceMsg);
  } else if (confidence < 0.80) {
    if (validationStatus !== ValidationStatus.REJECTED) {
      validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
    }
    confidenceStatus = "Minor Mismatch";
    confidenceSeverity = Severity.MINOR;
    confidenceMsg = `Extraction confidence is moderate: ${(confidence * 100).toFixed(0)}%, review recommended`;
    discrepancies.push("low confidence extraction");
    decisionReasons.push(confidenceMsg);
  }

  results.push({
    fieldName: "Confidence Score",
    ruleCategory: RuleCategory.EXTRACTION_QUALITY,
    invoiceValue: confidence.toFixed(2),
    poValue: "0.80",
    matchStatus: confidenceStatus,
    severity: confidenceSeverity,
    ruleId: "EXTRACTION_CONFIDENCE",
    message: confidenceMsg
  });

  // 2. DUPLICATE CHECK (AP CONTROL)
  // 2.1 Attachment Hash Duplicate
  if (attachmentHash) {
    const hashMatch = existingInvoices.find(inv => inv.attachment_hash === attachmentHash);
    if (hashMatch) {
      duplicateFlag = true;
      duplicateType = DuplicateType.ATTACHMENT_HASH;
      validationStatus = ValidationStatus.REJECTED;
      maxSeverity = Severity.CRITICAL;
      discrepancies.push("duplicate invoice");
      
      const msg = `Duplicate PDF attachment detected (SHA-256 matched Invoice #${hashMatch.invoice_number})`;
      decisionReasons.push(msg);
      results.push({
        fieldName: "Invoice Attachment",
        ruleCategory: RuleCategory.DUPLICATE_CHECK,
        invoiceValue: attachmentHash.substring(0, 8),
        poValue: "N/A",
        matchStatus: "Major Mismatch",
        severity: Severity.CRITICAL,
        ruleId: "DUPLICATE_ATTACHMENT",
        message: msg
      });
    }
  }

  // 2.2 Business Duplicate
  if (!duplicateFlag && invoice.invoice_number && invoice.vendor_name) {
    const bizMatch = existingInvoices.find(inv => {
      // Compare normalized invoice number and vendor ID or vendor name
      const sameInv = inv.invoice_number && 
                      inv.invoice_number.trim().toLowerCase() === invoice.invoice_number.trim().toLowerCase();
      const sameVendor = inv.vendor_id === invoice.vendor_id || 
                         normalizeVendorName(inv.vendor_name) === normalizeVendorName(invoice.vendor_name);
      // Double check amount if we want to be specific, or reject purely on vendor + inv number
      return sameInv && sameVendor;
    });

    if (bizMatch) {
      duplicateFlag = true;
      duplicateType = DuplicateType.BUSINESS_DUPLICATE;
      validationStatus = ValidationStatus.REJECTED;
      maxSeverity = Severity.CRITICAL;
      discrepancies.push("duplicate invoice");
      
      const msg = `Business Duplicate detected: Vendor and Invoice Number #${invoice.invoice_number} already exists in database (Invoice ID: ${bizMatch.id})`;
      decisionReasons.push(msg);
      results.push({
        fieldName: "Invoice Number",
        ruleCategory: RuleCategory.DUPLICATE_CHECK,
        invoiceValue: invoice.invoice_number,
        poValue: "N/A",
        matchStatus: "Major Mismatch",
        severity: Severity.CRITICAL,
        ruleId: "DUPLICATE_BUSINESS_KEY",
        message: msg
      });
    }
  }

  if (!duplicateFlag) {
    results.push({
      fieldName: "Invoice Number",
      ruleCategory: RuleCategory.DUPLICATE_CHECK,
      invoiceValue: invoice.invoice_number || "None",
      poValue: "N/A",
      matchStatus: "Match",
      severity: Severity.INFO,
      ruleId: "DUPLICATE_CHECK_PASS",
      message: "No duplicates found for this invoice."
    });
  }

  // 3. PURCHASE ORDER RETRIEVAL / ELIGIBILITY CHECK
  if (multiplePOsFound) {
    if (duplicateFlag) {
      validationStatus = ValidationStatus.REJECTED;
    } else {
      validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
    }
    discrepancies.push("multiple purchase orders found");
    const msg = `Multiple matching Purchase Orders found for PO Number ${invoice.purchase_order_number || 'N/A'}.`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "PO Number",
      ruleCategory: RuleCategory.PO_ELIGIBILITY,
      invoiceValue: invoice.purchase_order_number || "None",
      poValue: "Multiple",
      matchStatus: "Minor Mismatch",
      severity: Severity.MINOR,
      ruleId: "MULTIPLE_POS_FOUND",
      message: msg
    });

    return {
      purchase_order_match: "Multiple Candidates",
      validation_status: validationStatus,
      duplicate_flag: duplicateFlag,
      duplicate_type: duplicateType,
      field_results: results,
      line_item_results: [],
      discrepancies,
      summary: duplicateFlag ? `Rejected: Duplicate invoice with multiple POs` : `Routed to review: ${msg}`
    };
  }

  if (!po) {
    validationStatus = ValidationStatus.REJECTED;
    maxSeverity = Severity.CRITICAL;
    discrepancies.push("missing purchase order");
    
    const msg = `Purchase Order ${invoice.purchase_order_number || "N/A"} was not found in the database.`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "PO Number",
      ruleCategory: RuleCategory.PO_ELIGIBILITY,
      invoiceValue: invoice.purchase_order_number || "None",
      poValue: "N/A",
      matchStatus: "Major Mismatch",
      severity: Severity.CRITICAL,
      ruleId: "PO_NOT_FOUND",
      message: msg
    });

    return {
      purchase_order_match: "Not Found",
      validation_status: validationStatus,
      duplicate_flag: duplicateFlag,
      duplicate_type: duplicateType,
      field_results: results,
      line_item_results: [],
      discrepancies,
      summary: `Rejected: ${decisionReasons.join("; ")}`
    };
  }

  // Check PO Status
  if (po.approval_status !== "Approved") {
    validationStatus = ValidationStatus.REJECTED;
    maxSeverity = Severity.CRITICAL;
    discrepancies.push("po not approved");
    
    const msg = `Purchase Order ${po.po_number} status is '${po.approval_status}', not 'Approved'.`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "PO Number",
      ruleCategory: RuleCategory.PO_ELIGIBILITY,
      invoiceValue: invoice.purchase_order_number,
      poValue: po.approval_status,
      matchStatus: "Major Mismatch",
      severity: Severity.CRITICAL,
      ruleId: "PO_NOT_APPROVED",
      message: msg
    });
  } else {
    results.push({
      fieldName: "PO Number",
      ruleCategory: RuleCategory.PO_ELIGIBILITY,
      invoiceValue: invoice.purchase_order_number,
      poValue: "Approved",
      matchStatus: "Match",
      severity: Severity.INFO,
      ruleId: "PO_APPROVED",
      message: `Purchase Order ${po.po_number} is approved and eligible.`
    });
  }

  // 4. VENDOR MATCHING
  const normInvVendor = normalizeVendorName(invoice.vendor_name);
  const normPoVendor = normalizeVendorName(po.vendor_name_snapshot);
  
  let vendorMatch = normInvVendor === normPoVendor;
  let vendorMatchMethod = "Direct name comparison";

  if (!vendorMatch && invoice.vendor_id && po.vendor_id) {
    vendorMatch = invoice.vendor_id === po.vendor_id;
    vendorMatchMethod = "Vendor ID comparison";
  }

  if (!vendorMatch && vendorAliases.length > 0) {
    const isAlias = vendorAliases.some(alias => normalizeVendorName(alias) === normInvVendor);
    if (isAlias) {
      vendorMatch = true;
      vendorMatchMethod = "Alias list match";
    }
  }

  if (vendorMatch) {
    results.push({
      fieldName: "Vendor Name",
      ruleCategory: RuleCategory.HEADER_MATCH,
      invoiceValue: invoice.vendor_name,
      poValue: po.vendor_name_snapshot,
      matchStatus: "Match",
      severity: Severity.INFO,
      ruleId: "VENDOR_MATCH",
      message: `Vendor matched successfully via ${vendorMatchMethod}.`
    });
  } else {
    validationStatus = ValidationStatus.REJECTED;
    maxSeverity = Severity.CRITICAL;
    discrepancies.push("vendor mismatch");
    const msg = `Vendor mismatch: Extracted '${invoice.vendor_name}' but PO is for '${po.vendor_name_snapshot}'.`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "Vendor Name",
      ruleCategory: RuleCategory.HEADER_MATCH,
      invoiceValue: invoice.vendor_name,
      poValue: po.vendor_name_snapshot,
      matchStatus: "Major Mismatch",
      severity: Severity.CRITICAL,
      ruleId: "VENDOR_MISMATCH",
      message: msg
    });
  }

  // 5. CURRENCY MATCHING
  if (invoice.currency === po.currency) {
    results.push({
      fieldName: "Currency",
      ruleCategory: RuleCategory.HEADER_MATCH,
      invoiceValue: invoice.currency,
      poValue: po.currency,
      matchStatus: "Match",
      severity: Severity.INFO,
      ruleId: "CURRENCY_MATCH",
      message: `Currency codes match: ${invoice.currency}.`
    });
  } else {
    validationStatus = ValidationStatus.REJECTED;
    maxSeverity = Severity.CRITICAL;
    discrepancies.push("currency mismatch");
    const msg = `Currency mismatch: Extracted '${invoice.currency}' but PO requires '${po.currency}'.`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "Currency",
      ruleCategory: RuleCategory.HEADER_MATCH,
      invoiceValue: invoice.currency,
      poValue: po.currency,
      matchStatus: "Major Mismatch",
      severity: Severity.CRITICAL,
      ruleId: "CURRENCY_MISMATCH",
      message: msg
    });
  }

  // 6. LINE ITEMS MATCHING AND VALIDATION
  const lineItemResults = [];
  const matchedPoLineIds = new Set();
  
  const tolerancePct = po.tolerance_percent;
  const toleranceAbs = po.tolerance_amount;

  for (const invLine of invoice.line_items) {
    let bestPoLine = null;
    let matchReason = "";
    
    // 6.1 Try matching by SKU
    if (invLine.sku) {
      bestPoLine = po.line_items.find(l => l.sku && l.sku.toLowerCase() === invLine.sku.toLowerCase());
      if (bestPoLine) matchReason = "SKU match";
    }
    
    // 6.2 Try matching by Description Similarity
    if (!bestPoLine && invLine.description) {
      let maxSim = 0;
      for (const poLine of po.line_items) {
        if (matchedPoLineIds.has(poLine.line_number)) continue;
        const sim = stringSimilarity(invLine.description, poLine.description);
        if (sim > maxSim && sim >= 0.5) {
          maxSim = sim;
          bestPoLine = poLine;
          matchReason = `Description similarity: ${(sim * 100).toFixed(0)}%`;
        }
      }
    }

    if (bestPoLine) {
      matchedPoLineIds.add(bestPoLine.line_number);
      let lineMatchStatus = "Match";
      let lineMatchSeverity = Severity.INFO;
      let lineMatchNotes = `Matched PO Line #${bestPoLine.line_number} via ${matchReason}.`;

      // Compare unit price
      const priceDiff = Math.abs(invLine.unit_price - bestPoLine.unit_price);
      if (priceDiff > 0.01) {
        const withinTolerance = isWithinTolerance(invLine.unit_price, bestPoLine.unit_price, tolerancePct, toleranceAbs);
        if (withinTolerance) {
          lineMatchStatus = "Minor Mismatch";
          lineMatchSeverity = Severity.MINOR;
          lineMatchNotes += ` Unit price minor mismatch (Invoice: ${invLine.unit_price}, PO: ${bestPoLine.unit_price}).`;
          if (validationStatus !== ValidationStatus.REJECTED) {
            validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
          }
          discrepancies.push("unit price mismatch");
        } else {
          lineMatchStatus = "Major Mismatch";
          lineMatchSeverity = Severity.MAJOR;
          lineMatchNotes += ` Unit price major mismatch (Invoice: ${invLine.unit_price}, PO: ${bestPoLine.unit_price}).`;
          validationStatus = ValidationStatus.REJECTED;
          discrepancies.push("unit price mismatch");
        }
      }

      // Compare quantity
      if (invLine.quantity > bestPoLine.quantity) {
        const qtyDeltaPct = ((invLine.quantity - bestPoLine.quantity) / bestPoLine.quantity) * 100;
        if (qtyDeltaPct <= tolerancePct) {
          lineMatchStatus = "Minor Mismatch";
          lineMatchSeverity = Severity.MINOR;
          lineMatchNotes += ` Quantity slightly exceeds PO (Invoice: ${invLine.quantity}, PO: ${bestPoLine.quantity}).`;
          if (validationStatus !== ValidationStatus.REJECTED) {
            validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
          }
          discrepancies.push("quantity mismatch");
        } else {
          lineMatchStatus = "Major Mismatch";
          lineMatchSeverity = Severity.MAJOR;
          lineMatchNotes += ` Quantity exceeds PO limits (Invoice: ${invLine.quantity}, PO: ${bestPoLine.quantity}).`;
          validationStatus = ValidationStatus.REJECTED;
          discrepancies.push("quantity mismatch");
        }
      }

      lineItemResults.push({
        line_number: invLine.line_number,
        sku: invLine.sku,
        description: invLine.description,
        quantity: invLine.quantity,
        unit_price: invLine.unit_price,
        tax_rate: invLine.tax_rate,
        line_net_amount: invLine.line_net_amount,
        line_tax_amount: invLine.line_tax_amount,
        line_gross_amount: invLine.line_gross_amount,
        matched_po_line: bestPoLine.line_number,
        match_status: lineMatchStatus,
        match_notes: lineMatchNotes,
        severity: lineMatchSeverity
      });

    } else {
      // Extra line item in invoice
      validationStatus = ValidationStatus.REJECTED;
      discrepancies.push("additional line item");
      
      const notes = `Extra invoice line item: SKU '${invLine.sku || ""}' / '${invLine.description}' not found in PO.`;
      decisionReasons.push(notes);
      
      lineItemResults.push({
        line_number: invLine.line_number,
        sku: invLine.sku,
        description: invLine.description,
        quantity: invLine.quantity,
        unit_price: invLine.unit_price,
        tax_rate: invLine.tax_rate,
        line_net_amount: invLine.line_net_amount,
        line_tax_amount: invLine.line_tax_amount,
        line_gross_amount: invLine.line_gross_amount,
        matched_po_line: null,
        match_status: "Extra Line",
        match_notes: notes,
        severity: Severity.MAJOR
      });
    }
  }

  // 6.3 Check for Missing PO Line Items (Undershipment/Completeness)
  for (const poLine of po.line_items) {
    if (!matchedPoLineIds.has(poLine.line_number)) {
      // Missing item from invoice
      // If we strict-require all items, reject. Otherwise warning.
      // Based on scenario INV-1010-missing-line-item.pdf: Expected outcome = Rejected.
      // So missing PO line is a major mismatch!
      validationStatus = ValidationStatus.REJECTED;
      discrepancies.push("missing line item");
      
      const msg = `Omitted PO Line Item: Line #${poLine.line_number} (SKU: ${poLine.sku || "N/A"}, Description: "${poLine.description}") is missing from the invoice.`;
      decisionReasons.push(msg);
    }
  }

  // Write line-item summaries to field validation results
  const badLinesCount = lineItemResults.filter(l => l.match_status !== "Match").length;
  if (badLinesCount > 0) {
    results.push({
      fieldName: "Line Items",
      ruleCategory: RuleCategory.LINE_ITEM_MATCH,
      invoiceValue: `${invoice.line_items.length} lines`,
      poValue: `${po.line_items.length} lines`,
      matchStatus: validationStatus === ValidationStatus.REJECTED ? "Major Mismatch" : "Minor Mismatch",
      severity: validationStatus === ValidationStatus.REJECTED ? Severity.MAJOR : Severity.MINOR,
      ruleId: "LINE_ITEMS_VALIDATION_FAILED",
      message: `Discrepancies found in ${badLinesCount} line item(s).`
    });
  } else {
    results.push({
      fieldName: "Line Items",
      ruleCategory: RuleCategory.LINE_ITEM_MATCH,
      invoiceValue: `${invoice.line_items.length} lines`,
      poValue: `${po.line_items.length} lines`,
      matchStatus: "Match",
      severity: Severity.INFO,
      ruleId: "LINE_ITEMS_VALIDATION_PASS",
      message: "All line items matched successfully with correct rates and quantities."
    });
  }

  // 7. OVERALL AMOUNTS & TOLERANCE VALIDATIONS
  // 7.1 Net Amount Validation
  const netMatched = isWithinTolerance(invoice.net_amount, po.approved_net_amount, tolerancePct, toleranceAbs);
  if (!netMatched) {
    const isClose = isWithinTolerance(invoice.net_amount, po.approved_net_amount, tolerancePct * 2, toleranceAbs * 2);
    const severity = isClose ? Severity.MINOR : Severity.MAJOR;
    const status = isClose ? "Minor Mismatch" : "Major Mismatch";
    
    if (isClose) {
      if (validationStatus !== ValidationStatus.REJECTED) {
        validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
      }
    } else {
      validationStatus = ValidationStatus.REJECTED;
    }
    
    discrepancies.push("net amount mismatch");
    const msg = `Subtotal net amount discrepancy. Invoice: ${invoice.net_amount}, PO: ${po.approved_net_amount}`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "Net Amount",
      ruleCategory: RuleCategory.AMOUNT_VALIDATION,
      invoiceValue: invoice.net_amount.toFixed(2),
      poValue: po.approved_net_amount.toFixed(2),
      matchStatus: status,
      severity: severity,
      ruleId: "NET_AMOUNT_MISMATCH",
      message: msg
    });
  } else {
    results.push({
      fieldName: "Net Amount",
      ruleCategory: RuleCategory.AMOUNT_VALIDATION,
      invoiceValue: invoice.net_amount.toFixed(2),
      poValue: po.approved_net_amount.toFixed(2),
      matchStatus: "Match",
      severity: Severity.INFO,
      ruleId: "NET_AMOUNT_MATCH",
      message: "Net amount matches PO within tolerance limits."
    });
  }

  // 7.2 Tax Amount Validation
  // Recalculate tax from line items when available
  const recalculatedTax = (invoice.line_items || []).reduce((sum, l) => sum + (l.line_tax_amount || 0), 0);
  const isLineTaxMismatched = Math.abs(invoice.tax_amount - recalculatedTax) > 0.05;

  if (isLineTaxMismatched) {
    if (validationStatus !== ValidationStatus.REJECTED) {
      validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
    }
    if (!discrepancies.includes("tax mismatch")) {
      discrepancies.push("tax mismatch");
    }
    const msg = `Tax amount mismatch with line items. Invoice Tax: ${invoice.tax_amount.toFixed(2)}, Recalculated from Line Items: ${recalculatedTax.toFixed(2)}`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "Tax Amount (Line Items)",
      ruleCategory: RuleCategory.AMOUNT_VALIDATION,
      invoiceValue: invoice.tax_amount.toFixed(2),
      poValue: recalculatedTax.toFixed(2),
      matchStatus: "Minor Mismatch",
      severity: Severity.MINOR,
      ruleId: "TAX_LINE_ITEMS_MISMATCH",
      message: msg
    });
  }

  // Simple check: compare invoice tax vs PO tax, and check if tax makes sense
  const taxDiff = Math.abs(invoice.tax_amount - po.approved_tax_amount);
  const allowedTaxDelta = Math.max((po.approved_tax_amount * tolerancePct) / 100.0, toleranceAbs);
  
  if (taxDiff <= 0.05) {
    results.push({
      fieldName: "Tax Amount",
      ruleCategory: RuleCategory.AMOUNT_VALIDATION,
      invoiceValue: invoice.tax_amount.toFixed(2),
      poValue: po.approved_tax_amount.toFixed(2),
      matchStatus: "Match",
      severity: Severity.INFO,
      ruleId: "TAX_AMOUNT_MATCH",
      message: "Tax amount matches PO within rounding tolerance."
    });
  } else {
    const isClose = taxDiff <= allowedTaxDelta;
    const severity = isClose ? Severity.MINOR : Severity.MAJOR;
    const status = isClose ? "Minor Mismatch" : "Major Mismatch";

    if (isClose) {
      if (validationStatus !== ValidationStatus.REJECTED) {
        validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
      }
    } else {
      validationStatus = ValidationStatus.REJECTED;
    }

    discrepancies.push("tax mismatch");
    const msg = `Tax amount mismatch. Invoice Tax: ${invoice.tax_amount}, PO Tax: ${po.approved_tax_amount}`;
    decisionReasons.push(msg);
    results.push({
      fieldName: "Tax Amount",
      ruleCategory: RuleCategory.AMOUNT_VALIDATION,
      invoiceValue: invoice.tax_amount.toFixed(2),
      poValue: po.approved_tax_amount.toFixed(2),
      matchStatus: status,
      severity: severity,
      ruleId: "TAX_AMOUNT_MISMATCH",
      message: msg
    });
  }

  // 7.3 Gross Amount Validation / Overbilling Protection
  // Does invoice gross amount exceed remaining PO value?
  const allowedGrossDelta = Math.max((po.approved_gross_amount * tolerancePct) / 100.0, toleranceAbs);
  if (invoice.gross_amount > po.remaining_amount) {
    const delta = invoice.gross_amount - po.remaining_amount;
    const exceedsLimit = delta > allowedGrossDelta;
    if (exceedsLimit) {
      validationStatus = ValidationStatus.REJECTED;
      discrepancies.push("total exceeds po");
      const msg = `Invoice total (${invoice.gross_amount}) exceeds PO remaining balance (${po.remaining_amount}) beyond tolerance.`;
      decisionReasons.push(msg);
      results.push({
        fieldName: "Gross Amount",
        ruleCategory: RuleCategory.AMOUNT_VALIDATION,
        invoiceValue: invoice.gross_amount.toFixed(2),
        poValue: po.remaining_amount.toFixed(2),
        matchStatus: "Major Mismatch",
        severity: Severity.CRITICAL,
        ruleId: "OVERBILLING_PROTECTION",
        message: msg
      });
    } else {
      if (validationStatus !== ValidationStatus.REJECTED) {
        validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
      }
      discrepancies.push("total exceeds po");
      const msg = `Invoice total (${invoice.gross_amount}) slightly exceeds PO remaining balance (${po.remaining_amount}) within tolerance limit.`;
      decisionReasons.push(msg);
      results.push({
        fieldName: "Gross Amount",
        ruleCategory: RuleCategory.AMOUNT_VALIDATION,
        invoiceValue: invoice.gross_amount.toFixed(2),
        poValue: po.remaining_amount.toFixed(2),
        matchStatus: "Minor Mismatch",
        severity: Severity.MINOR,
        ruleId: "OVERBILLING_TOLERANCE",
        message: msg
      });
    }
  } else {
    // Basic match check
    const grossMatched = isWithinTolerance(invoice.gross_amount, po.approved_gross_amount, tolerancePct, toleranceAbs);
    if (!grossMatched) {
      if (validationStatus !== ValidationStatus.REJECTED) {
        validationStatus = ValidationStatus.PROCUREMENT_REVIEW;
      }
      discrepancies.push("gross amount mismatch");
      const msg = `Total gross amount discrepancy. Invoice: ${invoice.gross_amount}, PO: ${po.approved_gross_amount}`;
      decisionReasons.push(msg);
      results.push({
        fieldName: "Gross Amount",
        ruleCategory: RuleCategory.AMOUNT_VALIDATION,
        invoiceValue: invoice.gross_amount.toFixed(2),
        poValue: po.approved_gross_amount.toFixed(2),
        matchStatus: "Minor Mismatch",
        severity: Severity.MINOR,
        ruleId: "GROSS_AMOUNT_MISMATCH",
        message: msg
      });
    } else {
      results.push({
        fieldName: "Gross Amount",
        ruleCategory: RuleCategory.AMOUNT_VALIDATION,
        invoiceValue: invoice.gross_amount.toFixed(2),
        poValue: po.approved_gross_amount.toFixed(2),
        matchStatus: "Match",
        severity: Severity.INFO,
        ruleId: "GROSS_AMOUNT_MATCH",
        message: "Invoice total matches PO."
      });
    }
  }

  // 8. FINAL DECISION SUMMARY
  let finalSummary = "";
  if (validationStatus === ValidationStatus.READY_FOR_PAYMENT) {
    finalSummary = "Invoice fully matches approved Purchase Order. Approved for automated payment.";
  } else if (validationStatus === ValidationStatus.PROCUREMENT_REVIEW) {
    finalSummary = `Routed to manual review due to: ${discrepancies.join(", ")}. Reasons: ${decisionReasons.join("; ") || "Minor tolerances exceeded."}`;
  } else {
    finalSummary = `Rejected: ${discrepancies.join(", ")}. Details: ${decisionReasons.join("; ") || "Critical mismatches detected."}`;
  }

  return {
    purchase_order_match: "Found",
    validation_status: validationStatus,
    duplicate_flag: duplicateFlag,
    duplicate_type: duplicateType,
    field_results: results,
    line_item_results: lineItemResults,
    discrepancies,
    summary: finalSummary
  };
}
