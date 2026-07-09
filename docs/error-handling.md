# Invo Match - Error Handling & Resilience Plan

This document details the system recovery steps, failure alerts, and error boundary behaviors.

---

## 1. Retry Policies

To survive API rate limits, database locks, or mail delays, n8n nodes are configured with built-in retry settings:

| API Operation | Max Attempts | Wait Between Retries | Backoff Multiplier |
| --- | --- | --- | --- |
| Gemini AI Extraction | 5 | 15 seconds | Linear |
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

The `wire-workflows.js` script automatically imports all workflows (including `error-handler.n8n.json`), retrieves their dynamic IDs, and configures the **Error Workflow** setting in the Main and Manual Upload workflows. 

If you ever need to check or modify this:
1. Open n8n and go to **Workflow Settings** (gear icon in the top right of the workflow editor) for any of the main workflows.
2. The **Error Workflow** field is automatically pre-filled with the imported `Invo Match - Error Handler Sub-workflow` ID.
