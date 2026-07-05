import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

// Setup invoice details mapping
const invoices = [
  {
    filename: "INV-1001-perfect-match.pdf",
    invoice_number: "INV-1001",
    po_number: "PO-2026-1001",
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_address: "123 Office Plaza, Connaught Place, New Delhi, India",
    currency: "INR",
    net_amount: "50000.00",
    tax_amount: "9000.00",
    gross_amount: "59000.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 20, unit_price: "1500.00", tax_rate: "18.0", line_net_amount: "30000.00", line_tax_amount: "5400.00", line_gross_amount: "35400.00" },
      { line_number: 2, sku: "OFF-PEN-BLU", description: "Blue Ballpoint Pens Pack", quantity: 100, unit_price: "200.00", tax_rate: "18.0", line_net_amount: "20000.00", line_tax_amount: "3600.00", line_gross_amount: "23600.00" }
    ]
  },
  {
    filename: "INV-1002-price-mismatch.pdf",
    invoice_number: "INV-1002",
    po_number: "PO-2026-1002",
    vendor_name: "Northwind Components",
    vendor_address: "456 Tech Industrial Park, Seattle, WA, USA",
    currency: "USD",
    net_amount: "1205.00",
    tax_amount: "120.50",
    gross_amount: "1325.50",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "COMP-RAM-8G", description: "8GB DDR4 RAM Module", quantity: 24, unit_price: "50.20", tax_rate: "10.0", line_net_amount: "1204.80", line_tax_amount: "120.48", line_gross_amount: "1325.28" }
    ]
  },
  {
    filename: "INV-1003-missing-po.pdf",
    invoice_number: "INV-1003",
    po_number: "PO-2026-9999",
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_address: "123 Office Plaza, Connaught Place, New Delhi, India",
    currency: "INR",
    net_amount: "15000.00",
    tax_amount: "2700.00",
    gross_amount: "17700.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 10, unit_price: "1500.00", tax_rate: "18.0", line_net_amount: "15000.00", line_tax_amount: "2700.00", line_gross_amount: "17700.00" }
    ]
  },
  {
    filename: "INV-1004-extra-line-item.pdf",
    invoice_number: "INV-1004",
    po_number: "PO-2026-1001",
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_address: "123 Office Plaza, Connaught Place, New Delhi, India",
    currency: "INR",
    net_amount: "51000.00",
    tax_amount: "9180.00",
    gross_amount: "60180.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 20, unit_price: "1500.00", tax_rate: "18.0", line_net_amount: "30000.00", line_tax_amount: "5400.00", line_gross_amount: "35400.00" },
      { line_number: 2, sku: "OFF-PEN-BLU", description: "Blue Ballpoint Pens Pack", quantity: 100, unit_price: "200.00", tax_rate: "18.0", line_net_amount: "20000.00", line_tax_amount: "3600.00", line_gross_amount: "23600.00" },
      { line_number: 3, sku: "OFF-STAP-01", description: "Standard Stapler", quantity: 10, unit_price: "100.00", tax_rate: "18.0", line_net_amount: "1000.00", line_tax_amount: "180.00", line_gross_amount: "1180.00" }
    ]
  },
  {
    filename: "INV-1005-scanned-low-confidence.pdf",
    invoice_number: "INV-1005",
    po_number: "PO-2026-1003",
    vendor_name: "BluePeak Cloud Services",
    vendor_address: "789 Cloud Heights, Electronic City, Bangalore, India",
    currency: "INR",
    net_amount: "75000.00",
    tax_amount: "13500.00",
    gross_amount: "88500.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    // Note: n8n Extract node or script mock can simulate OCR trigger
    is_scanned_look: true,
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: "25000.00", tax_rate: "18.0", line_net_amount: "75000.00", line_tax_amount: "13500.00", line_gross_amount: "88500.00" }
    ]
  },
  {
    filename: "INV-1006-vendor-mismatch.pdf",
    invoice_number: "INV-1006",
    po_number: "PO-2026-1002",
    vendor_name: "BluePeak Cloud Services", // PO PO-2026-1002 is for Northwind Components
    vendor_address: "789 Cloud Heights, Electronic City, Bangalore, India",
    currency: "USD",
    net_amount: "1200.00",
    tax_amount: "120.00",
    gross_amount: "1320.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "COMP-RAM-8G", description: "8GB DDR4 RAM Module", quantity: 24, unit_price: "50.00", tax_rate: "10.0", line_net_amount: "1200.00", line_tax_amount: "120.00", line_gross_amount: "1320.00" }
    ]
  },
  {
    filename: "INV-1007-currency-mismatch.pdf",
    invoice_number: "INV-1007",
    po_number: "PO-2026-1003",
    vendor_name: "BluePeak Cloud Services",
    vendor_address: "789 Cloud Heights, Electronic City, Bangalore, India",
    currency: "USD", // PO is INR
    net_amount: "75000.00",
    tax_amount: "13500.00",
    gross_amount: "88500.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: "25000.00", tax_rate: "18.0", line_net_amount: "75000.00", line_tax_amount: "13500.00", line_gross_amount: "88500.00" }
    ]
  },
  {
    filename: "INV-1008-duplicate-invoice.pdf",
    invoice_number: "INV-1001", // duplicate invoice number of INV-1001
    po_number: "PO-2026-1001",
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_address: "123 Office Plaza, Connaught Place, New Delhi, India",
    currency: "INR",
    net_amount: "50000.00",
    tax_amount: "9000.00",
    gross_amount: "59000.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "OFF-PAP-A4", description: "A4 Copy Paper Box", quantity: 20, unit_price: "1500.00", tax_rate: "18.0", line_net_amount: "30000.00", line_tax_amount: "5400.00", line_gross_amount: "35400.00" },
      { line_number: 2, sku: "OFF-PEN-BLU", description: "Blue Ballpoint Pens Pack", quantity: 100, unit_price: "200.00", tax_rate: "18.0", line_net_amount: "20000.00", line_tax_amount: "3600.00", line_gross_amount: "23600.00" }
    ]
  },
  {
    filename: "INV-1009-po-not-approved.pdf",
    invoice_number: "INV-1009",
    po_number: "PO-2026-1004", // PO is in Draft status
    vendor_name: "Acme Office Supplies Pvt Ltd",
    vendor_address: "123 Office Plaza, Connaught Place, New Delhi, India",
    currency: "INR",
    net_amount: "10000.00",
    tax_amount: "1800.00",
    gross_amount: "11800.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "OFF-CHAIR-01", description: "Ergonomic Office Chair", quantity: 2, unit_price: "5000.00", tax_rate: "18.0", line_net_amount: "10000.00", line_tax_amount: "1800.00", line_gross_amount: "11800.00" }
    ]
  },
  {
    filename: "INV-1010-missing-line-item.pdf",
    invoice_number: "INV-1010",
    po_number: "PO-2026-1005", // PO has SSD SKU COMP-SSD-500
    vendor_name: "Northwind Components",
    vendor_address: "456 Tech Industrial Park, Seattle, WA, USA",
    currency: "USD",
    net_amount: "0.00",
    tax_amount: "0.00",
    gross_amount: "0.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [] // Missing PO Line item!
  },
  {
    filename: "INV-1011-tax-miscalculation.pdf",
    invoice_number: "INV-1011",
    po_number: "PO-2026-1006",
    vendor_name: "BluePeak Cloud Services",
    vendor_address: "789 Cloud Heights, Electronic City, Bangalore, India",
    currency: "INR",
    net_amount: "30000.00",
    tax_amount: "5450.00", // Mismatched tax (should be 5400.00)
    gross_amount: "35450.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "CLOUD-SUP-PREM", description: "Premium Technical Support Plan", quantity: 1, unit_price: "30000.00", tax_rate: "18.0", line_net_amount: "30000.00", line_tax_amount: "5400.00", line_gross_amount: "35400.00" }
    ]
  },
  {
    filename: "INV-1012-total-exceeds-po.pdf",
    invoice_number: "INV-1012",
    po_number: "PO-2026-1003", // PO gross is 88500.00
    vendor_name: "BluePeak Cloud Services",
    vendor_address: "789 Cloud Heights, Electronic City, Bangalore, India",
    currency: "INR",
    net_amount: "80000.00", // Exceeds PO total
    tax_amount: "14400.00",
    gross_amount: "94400.00",
    invoice_date: "2026-06-15",
    due_date: "2026-07-15",
    line_items: [
      { line_number: 1, sku: "CLOUD-VM-STD", description: "Standard Virtual Machine Hosting", quantity: 3, unit_price: "26666.67", tax_rate: "18.0", line_net_amount: "80000.01", line_tax_amount: "14400.00", line_gross_amount: "94400.01" }
    ]
  }
];

const OUTPUT_DIR = path.resolve("./data/sample_invoices");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function drawInvoice(inv, outputPath) {
  const doc = new PDFDocument({ margin: 50 });
  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  // If mock scanned PDF scenario, we render a low quality look (just add some noise or warning)
  if (inv.is_scanned_look) {
    doc.fillColor("#dd3333").fontSize(10).text("MOCK SCANNED PDF FOR OCR FALLBACK TESTING", { align: "center" });
    doc.moveDown(1);
  }

  // Header Details
  doc.fillColor("#333333").fontSize(20).text("TAX INVOICE", { align: "right" });
  doc.moveDown(0.5);

  // Vendor Details
  doc.fontSize(12).fillColor("#2b6cb0").text(inv.vendor_name, { bold: true });
  doc.fontSize(9).fillColor("#718096").text(inv.vendor_address);
  doc.moveDown(1.5);

  // Metadata Block
  const startY = doc.y;
  doc.fontSize(10).fillColor("#4a5568").text(`Invoice Number: ${inv.invoice_number}`, 50, startY);
  doc.text(`Invoice Date: ${inv.invoice_date}`, 50, startY + 15);
  doc.text(`Due Date: ${inv.due_date}`, 50, startY + 30);
  
  doc.text(`Purchase Order: ${inv.po_number}`, 350, startY);
  doc.text(`Currency: ${inv.currency}`, 350, startY + 15);
  doc.moveDown(3);

  // Draw Line Items Table
  const tableTop = doc.y;
  doc.fillColor("#2d3748").fontSize(10);
  doc.rect(50, tableTop, 500, 20).fill("#edf2f7");
  doc.fillColor("#2d3748");
  doc.text("L#", 55, tableTop + 5, { width: 30 });
  doc.text("SKU", 90, tableTop + 5, { width: 90 });
  doc.text("Description", 190, tableTop + 5, { width: 170 });
  doc.text("Qty", 370, tableTop + 5, { width: 40, align: "right" });
  doc.text("Price", 420, tableTop + 5, { width: 60, align: "right" });
  doc.text("Total", 490, tableTop + 5, { width: 55, align: "right" });
  
  let currentY = tableTop + 20;

  if (inv.line_items.length === 0) {
    doc.text("(No line items included)", 55, currentY + 5);
    currentY += 20;
  } else {
    inv.line_items.forEach((item) => {
      doc.text(String(item.line_number), 55, currentY + 5, { width: 30 });
      doc.text(item.sku || "N/A", 90, currentY + 5, { width: 90 });
      doc.text(item.description, 190, currentY + 5, { width: 170 });
      doc.text(String(item.quantity), 370, currentY + 5, { width: 40, align: "right" });
      doc.text(item.unit_price, 420, currentY + 5, { width: 60, align: "right" });
      doc.text(item.line_gross_amount, 490, currentY + 5, { width: 55, align: "right" });
      currentY += 20;
    });
  }

  // Draw Totals section
  doc.moveDown(1.5);
  const totalY = doc.y;
  doc.fontSize(10);
  doc.text(`Subtotal (Net):`, 350, totalY, { width: 120, align: "right" });
  doc.text(`${inv.net_amount} ${inv.currency}`, 480, totalY, { width: 70, align: "right" });
  
  doc.text(`Tax Amount:`, 350, totalY + 15, { width: 120, align: "right" });
  doc.text(`${inv.tax_amount} ${inv.currency}`, 480, totalY + 15, { width: 70, align: "right" });
  
  doc.fontSize(11).rect(350, totalY + 32, 200, 1).fill("#cbd5e0");
  
  doc.fontSize(12).fillColor("#2b6cb0");
  doc.text(`Total Due (Gross):`, 350, totalY + 38, { width: 120, align: "right" });
  doc.text(`${inv.gross_amount} ${inv.currency}`, 480, totalY + 38, { width: 70, align: "right" });

  doc.end();
  
  return new Promise((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });
}

async function run() {
  console.log(`Generating mock PDFs in ${OUTPUT_DIR}...`);
  for (const inv of invoices) {
    const p = path.join(OUTPUT_DIR, inv.filename);
    console.log(`- Writing ${inv.filename}`);
    await drawInvoice(inv, p);
  }
  console.log("All mock PDF invoices generated successfully.");
}

run().catch((err) => {
  console.error("Failed to generate PDFs:", err);
  process.exit(1);
});
