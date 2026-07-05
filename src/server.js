import express from "express";
import { matchInvoiceToPO } from "./matching.js";

const app = express();
app.use(express.json());

app.post("/match", (req, res) => {
  try {
    const { invoice, po, options } = req.body;
    
    if (!invoice) {
      return res.status(400).json({ error: "Missing invoice object in request body." });
    }
    
    const result = matchInvoiceToPO(invoice, po, options);
    
    // Format the response to be backwards-compatible with what the n8n workflows expect
    res.json({
      invoice,
      po,
      purchase_order_match: result.purchase_order_match,
      validation_status: result.validation_status,
      duplicate_flag: result.duplicate_flag,
      duplicate_type: result.duplicate_type,
      validation: {
        status: result.validation_status,
        discrepancies: result.discrepancies,
        results: result.field_results,
        line_items: result.line_item_results
      }
    });
  } catch (error) {
    console.error("Error in /match endpoint:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Matching service listening on port ${PORT}`);
});
