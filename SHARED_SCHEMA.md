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
    "total_monthly_budget": 1200.00,
    "currency": "USD",
    "last_synced": "2026-02-06T16:25:00Z"
  },

  "ledger": [
    {
      "id": "txn_20260201_amazon",
      "date": "2026-02-01T14:30:00Z",
      "amount": 45.50,
      "vendor": "Amazon",
      "category": "Shopping",
      "type": "Variable",
      "source": "email | scraper | manual",
      "status": "confirmed"
    }
  ],

  "recurring_payments": [
    {
      "id": "rec_netflix",
      "vendor": "Netflix",
      "amount": 15.99,
      "category": "Entertainment",
      "frequency": "monthly",
      "billing_day": 12,
      "type": "Fixed",
      "active": true,
      "last_generated": "2026-01-12T00:00:00Z"
    }
  ],

  "categories": {
    "system": ["Food", "Shopping", "Bills", "Entertainment", "Transport"],
    "user": []
  }
}
```
