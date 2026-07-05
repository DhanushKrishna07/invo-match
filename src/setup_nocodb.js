/**
 * Local environment setup checker and diagnostic utility.
 * Verifies if local docker-compose services (n8n, NocoDB) are running and reachable.
 */

import http from "http";
import dotenv from "dotenv";

dotenv.config();

function checkURL(url, serviceName) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        resolve({ service: serviceName, status: "ONLINE", code: res.statusCode });
      } else {
        resolve({ service: serviceName, status: "UNHEALTHY", code: res.statusCode });
      }
    });

    req.on("error", (e) => {
      resolve({ service: serviceName, status: "OFFLINE", error: e.message });
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ service: serviceName, status: "TIMEOUT" });
    });
  });
}

async function runDiagnostics() {
  console.log("=========================================");
  console.log("INVO MATCH SETUP DIAGNOSTICS");
  console.log("=========================================");
  
  console.log("\nChecking local service endpoints...");
  
  const n8nCheck = await checkURL("http://localhost:5678/healthz", "n8n (Port 5678)");
  const nocodbCheck = await checkURL("http://localhost:8080/dashboard/", "NocoDB (Port 8080)");

  console.log(`- ${n8nCheck.service}: [${n8nCheck.status}] ${n8nCheck.error ? `(${n8nCheck.error})` : ""}`);
  console.log(`- ${nocodbCheck.service}: [${nocodbCheck.status}] ${nocodbCheck.error ? `(${nocodbCheck.error})` : ""}`);

  console.log("\n-----------------------------------------");
  console.log("NEXT STEPS FOR SETUP:");
  console.log("1. Ensure Docker Desktop is running.");
  console.log("2. Run 'docker compose up -d' to start the containers.");
  console.log("3. Access NocoDB at http://localhost:8080, register an admin account.");
  console.log("4. Create a new Base, connect to external Postgres using: ");
  console.log("   - Host: postgres-nocodb");
  console.log("   - Port: 5432");
  console.log("   - Database: nocodb");
  console.log("   - Username: nocodb");
  console.log(`   - Password: ${process.env.POSTGRES_NOCODB_PASSWORD || "nocodb_password"}`);
  console.log("5. In NocoDB, all tables (vendors, purchase_orders, etc.) will be automatically visible and seeded!");
  console.log("6. Access n8n at http://localhost:5678 to import workflows.");
  console.log("=========================================");
}

runDiagnostics();
