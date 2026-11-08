# No transaction data to AI services or analytics

Decided: 2026-10-31

The rows are private financial data, and the repo is public and built with AI agents. So transaction data is never sent to AI services or analytics, and the app has no analytics or AI service in it. Apart from the database, the only outside call during import fetches exchange rates, with dates and currency codes and nothing from a row. Errors carry a reason and never the input, and import results are counts only. Test fixtures and the local sandbox use synthetic rows, so an agent working on the code or looking at a screen never sees real data. There's no error reporting service yet; its record comes with #74.
