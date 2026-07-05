import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import http from "http";
import crypto from "crypto";

dotenv.config();

const NOCODB_BASE_URL = process.env.NOCODB_BASE_URL || "http://localhost:8080";
const NOCODB_BASE_ID = process.env.NOCODB_BASE_ID;
const NOCODB_INVOICES_TABLE_ID = process.env.NOCODB_INVOICES_TABLE_ID;
const NOCODB_API_TOKEN = process.env.NOCODB_API_TOKEN;
const N8N_BASE_URL = "http://localhost:5678";

function makeRequest(url, method, headers, body = null) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(typeof body === "object" ? JSON.stringify(body) : body);
    }
    req.end();
  });
}

async function runTest() {
  console.log("=========================================");
  console.log("INVO MATCH END-TO-END INTEGRATION TEST");
  console.log("=========================================");

  if (!NOCODB_BASE_ID || !NOCODB_INVOICES_TABLE_ID || !NOCODB_API_TOKEN) {
    console.error("Error: Missing NocoDB environment variables in .env.");
    console.log(
      "Please make sure NOCODB_BASE_ID, NOCODB_INVOICES_TABLE_ID, and NOCODB_API_TOKEN are set.",
    );
    process.exit(1);
  }

  // 1. Read Expected Results CSV
  const csvPath = path.resolve("data/expected_results.csv");
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: expected_results.csv not found at ${csvPath}`);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf8");
  const lines = csvContent.trim().split("\n");
  const headers = lines[0].split(",");

  const testCases = lines
    .slice(1)
    .map((line) => {
      const values = line.split(",");
      const row = {};
      headers.forEach((h, index) => {
        row[h.trim()] = values[index]?.trim();
      });
      return row;
    })
    .filter((t) => !!t.invoice_file); // run all test cases

  console.log(
    `Loaded ${testCases.length} scenarios from expected_results.csv.\n`,
  );
  console.log(
    "Running validations sequentially. Please ensure Docker containers are running...\n",
  );

  // n8n production webhook URL uses /webhook/<path> — the path is set on the WebhookTrigger node
  const WEBHOOK_PATH = "invo-match-upload";
  const WEBHOOK_URL = `${N8N_BASE_URL}/webhook/${WEBHOOK_PATH}`;
  console.log(`Using webhook URL: ${WEBHOOK_URL}\n`);

  const results = [];
  let passedCount = 0;

  for (const testCase of testCases) {
    const filename = testCase.invoice_file;
    const expectedStatus = testCase.expected_validation_status;
    const invoiceNumber = filename.split("-").slice(0, 2).join("-"); // e.g., INV-1001

    // Read the PDF file to compute its SHA-256 hash
    let attachmentHash = null;
    try {
      const filePath = path.resolve("data", "sample_invoices", filename);
      const fileBuffer = fs.readFileSync(filePath);
      attachmentHash = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");
    } catch (err) {
      console.error(
        `  - Warning: Could not compute hash for local file ${filename}: ${err.message}`,
      );
    }

    console.log(
      `[TESTING] triggering pipeline for file: ${filename} (Invoice: ${invoiceNumber}, Hash: ${attachmentHash?.substring(0, 8) || "N/A"})`,
    );

    let response;
    try {
      response = await makeRequest(
        WEBHOOK_URL,
        "POST",
        { "Content-Type": "application/json" },
        { filename },
      );
    } catch (e) {
      console.error(
        `Error: Failed to connect to n8n at ${N8N_BASE_URL}. Is n8n running?`,
      );
      console.log(e.message);
      process.exit(1);
    }

    if (response.statusCode >= 400) {
      console.error(
        `  - Error: Webhook returned status ${response.statusCode}: ${response.body}`,
      );
      results.push({
        filename,
        invoiceNumber,
        expectedStatus,
        actualStatus: "WEBHOOK_ERROR",
        passed: false,
      });
      continue;
    }

    console.log(
      "  - Polling NocoDB for Gemini extraction and NocoDB write (up to 45 seconds)...",
    );

    let record = null;
    const queryParam = attachmentHash
      ? `(attachment_hash,eq,${attachmentHash})`
      : `(invoice_number,eq,${invoiceNumber})`;
    const nocodbUrl = `${NOCODB_BASE_URL}/api/v2/tables/${NOCODB_INVOICES_TABLE_ID}/records?where=${encodeURIComponent(queryParam)}&sort=-id&limit=1`;

    for (let attempt = 1; attempt <= 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        const res = await makeRequest(nocodbUrl, "GET", {
          "xc-token": NOCODB_API_TOKEN,
        });

        if (res.statusCode === 200) {
          const nocoData = JSON.parse(res.body);
          if (nocoData.list && nocoData.list.length > 0) {
            record = nocoData.list[0];
            break;
          }
        }
      } catch (e) {
        // Ignore transient network errors during polling
      }
    }

    if (!record) {
      console.log(
        `  - Error: No invoice row found in NocoDB for invoice number ${invoiceNumber} after polling`,
      );
      results.push({
        filename,
        invoiceNumber,
        expectedStatus,
        actualStatus: "NOT_FOUND",
        passed: false,
      });
      continue;
    }

    const actualStatus = record.validation_status;
    const isDuplicate = record.duplicate_flag;
    const expectedDuplicate = testCase.expected_duplicate_flag === "true";
    const statusMatch = actualStatus === expectedStatus;
    const duplicateMatch = Boolean(isDuplicate) === expectedDuplicate;

    const testPassed = statusMatch && duplicateMatch;

    if (testPassed) {
      passedCount++;
      console.log(
        `  - [PASS] Status: "${actualStatus}", Duplicate: ${isDuplicate}`,
      );
    } else {
      console.log(
        `  - [FAIL] Status: "${actualStatus}" (Expected: "${expectedStatus}"), Duplicate: ${isDuplicate} (Expected: ${expectedDuplicate})`,
      );
    }

    results.push({
      filename,
      invoiceNumber,
      expectedStatus,
      actualStatus,
      passed: testPassed,
    });

    // Add a 12 second cooldown between test runs to avoid API rate limit triggers
    console.log("  - Cooldown 12 seconds before the next scenario...");
    await new Promise((resolve) => setTimeout(resolve, 12000));
  }

  // 3. Print Results Summary
  console.log("\n=========================================");
  console.log("INTEGRATION VERIFICATION REPORT");
  console.log("=========================================");
  console.log(`Total Run: ${testCases.length}`);
  console.log(`Passed:    ${passedCount}`);
  console.log(`Failed:    ${testCases.length - passedCount}`);
  console.log("-----------------------------------------");
  console.log("Result Table:");
  console.log(
    "Invoice    | Expected Status      | Actual Status        | Result",
  );
  console.log(
    "-----------|----------------------|----------------------|-------",
  );

  results.forEach((r) => {
    const inv = r.invoiceNumber.padEnd(10);
    const exp = r.expectedStatus.padEnd(20);
    const act = r.actualStatus.padEnd(20);
    const status = r.passed ? "PASS" : "FAIL";
    console.log(`${inv} | ${exp} | ${act} | ${status}`);
  });

  console.log("=========================================");
  process.exit(testCases.length === passedCount ? 0 : 1);
}

runTest();
