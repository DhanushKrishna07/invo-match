import test from "node:test";
import assert from "node:assert";
import {
  normalizeVendorName,
  normalizeCurrency,
  normalizeAmount,
  normalizeQuantity,
  normalizeDate,
  normalizeInvoice,
  normalizePO
} from "../src/normalize.js";

test("Vendor Name Normalization", () => {
  assert.strictEqual(normalizeVendorName("Acme Office Supplies Pvt. Ltd."), "acme office supplies");
  assert.strictEqual(normalizeVendorName("Northwind Components Inc"), "northwind components");
  assert.strictEqual(normalizeVendorName("BluePeak Cloud Services, LLC"), "bluepeak cloud services");
  assert.strictEqual(normalizeVendorName("   Test Co.   "), "test");
  assert.strictEqual(normalizeVendorName(null), "");
});

test("Currency Normalization", () => {
  assert.strictEqual(normalizeCurrency("$"), "USD");
  assert.strictEqual(normalizeCurrency("₹"), "INR");
  assert.strictEqual(normalizeCurrency("eur"), "EUR");
  assert.strictEqual(normalizeCurrency("usd "), "USD");
  assert.strictEqual(normalizeCurrency("INR"), "INR");
  assert.strictEqual(normalizeCurrency(null), null);
});

test("Amount Normalization", () => {
  assert.strictEqual(normalizeAmount(10.556), 10.56);
  assert.strictEqual(normalizeAmount(" $1,250.50 "), 1250.50);
  assert.strictEqual(normalizeAmount("123"), 123.00);
  assert.strictEqual(normalizeAmount(null), 0.00);
  assert.strictEqual(normalizeAmount("invalid"), 0.00);
});

test("Quantity Normalization", () => {
  assert.strictEqual(normalizeQuantity(5), 5);
  assert.strictEqual(normalizeQuantity("10.5"), 10.5);
  assert.strictEqual(normalizeQuantity(null), 0);
  assert.strictEqual(normalizeQuantity("abc"), 0);
});

test("Date Normalization", () => {
  assert.strictEqual(normalizeDate("2026-07-04T12:00:00Z"), "2026-07-04");
  assert.strictEqual(normalizeDate("July 4, 2026"), "2026-07-04");
  assert.strictEqual(normalizeDate("invalid-date"), null);
  assert.strictEqual(normalizeDate(null), null);
});
