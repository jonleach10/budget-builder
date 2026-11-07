# Money in minor units, with each row's rate locked on it

Decided: 2026-10-31

Amounts are integer minor units plus a currency, never floats, and rates are decimal text, so no money value passes through floating point. Each EUR row converts to USD at import, at the saved ECB rate for its posted date, or the latest rate in the seven days before it when that date has none. The rate and the USD amount it gives are stored on the row and can't be updated, so a past month's figures never change when rates move. A row dated after today waits for a later import, because its rate doesn't exist yet. In the Combined view, Germany's budget amounts convert at the first-of-month rate, while its spending uses each row's locked USD amount. The base currency is USD and read-only in the first version, a choice made on 2026-11-01, because changing it would mean reconverting every locked row.
