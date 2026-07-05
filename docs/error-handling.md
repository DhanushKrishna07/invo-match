# Invo Match - Error Handling & Resilience Plan

This document details the system recovery steps, failure alerts, and error boundary behaviors.

---

## 1. Retry Policies

To survive API rate limits, database locks, or mail delays, n8n nodes are configured with built-in retry settings:

| API Operation | Max Attempts | Wait Between Retries | Backoff Multiplier |
| --- | --- | --- | --- |
| Gemini AI Extraction | 2 | 5 seconds | Linear |
| NocoDB HTTP Queries | 3 | 2 seconds | Exponential |
| Email Notifications | 2 | 10 seconds | Linear |

---

## 2. Centralized Error Webhook

An error sub-workflow is configured (`workflows/error-handler.n8n.json`) to catch execution errors globally:

1. **Catch**: Any node failure triggers the central error sub-workflow.
2. **Log**: Execution details (Workflow Name, Error Node, Exception Message, ID) are logged directly to the `audit_log` table.
3. **Notify**: An email alert is automatically dispatched to the procurement administrator containing link logs.
4. **Resilience**: If a database write fails partially, the system keeps the state inside `Procurement Review` so the invoice does not disappear from auditing.

### Wiring up Error Handling in n8n

Because n8n workflow IDs are assigned dynamically upon import, you must connect the error handler sub-workflow manually:

1. Open n8n and **import** the error handler workflow from `workflows/error-handler.n8n.json`.
2. Save the workflow, activate it, and copy its **Workflow ID** (available in the n8n browser URL or the workflow settings dialog).
3. Import the main workflows (`invo-match-main.n8n.json` and `invo-match-manual-upload.n8n.json`).
4. For both workflows, go to **Workflow Settings** (gear icon in the top right), locate the **Error Workflow** field, and paste the copied ID.
5. Save both workflows.
