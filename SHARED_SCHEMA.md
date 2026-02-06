# TODO: Shared Data Schema & Contracts

## Context
This project uses a single normalized data model that all components
(extension UI, background logic, sync jobs) must read/write without mutation.

All storage operations MUST conform exactly to this schema.

## Canonical Schema

```json
{
  "user_profile": {
    "total_monthly_budget": 0.00,
    "currency": "USD",
    "last_synced": "ISO-8601 timestamp"
  },
  "ledger": [
    {
      "id": "string",
      "date": "ISO-8601 timestamp",
      "amount": 0.00,
      "vendor": "string",
      "category": "string",
      "type": "Fixed | Variable"
    }
  ],
  "categories": ["Food", "Shopping", "Bills", "Entertainment", "Transport"]
}
