# TODO: Shared Data Schema & Contracts
This schema is authoritative. Never invent fields.

## Context
This project uses a single normalized data model that all components
(extension UI, background logic, sync jobs) must read/write without mutation.

All storage operations MUST conform exactly to this schema.

## Canonical Schema

```json
{
  "user_profile": {
    "total_monthly_budget": 715.88,
    "currency": "USD",
    "last_synced": "2026-02-07T16:06:30.970Z",
    "last_nessie_summary": {
      "balance": 2386.25,
      "accountName": "NudgePay Checking",
      "accountType": "Checking",
      "incomeLast30": 0,
      "spendLast30": 0
    }
  },
  "ledger": [],
  "recurring_payments": [
    {
      "id": "rec_1770418611938",
      "vendor": "Random",
      "amount": 16,
      "category": "Ent",
      "frequency": "monthly",
      "billing_day": 30,
      "type": "Fixed",
      "active": true,
      "last_generated": "2026-02-06T22:56:51.938Z"
    }
  ],
  "categories": {
    "system": [
      "Food",
      "Shopping",
      "Bills",
      "Entertainment",
      "Transport"
    ],
    "user": []
  }
}
```