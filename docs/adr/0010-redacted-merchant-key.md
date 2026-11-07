# Redacted rows get a merchant key that only suggests

Decided: 2026-11-07

Import removes account and card numbers from bank text and leaves a `[REDACTED]` placeholder, so rows that differed only in that number now read the same. Rows with redacted text get a `redacted:` merchant key on the text left once the placeholder is removed, which groups them in the Review inbox. A category the owner confirmed under that key is only ever a suggestion, at import and in the inbox, never a category on its own, because the removed number may have told two payees apart. A row holding only the placeholder has no key and stays in No Merchant. Text rules also ignore the placeholder, so a short value can't match every redacted row. The key is worked out from stored text, so nothing new is stored.

**Considered options:** a keyed hash of the removed number, stored with the row, was rejected. It changes text cleaning, which is frozen once rows are stored, and it couldn't group order numbers that change with each purchase.
