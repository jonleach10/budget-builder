# EUR and USD rows never pair as transfers

Decided: 2026-11-01

Transfers between the US and German accounts are rare, and the two sides of one are in different currencies, so only dates and converted amounts could link them. The owner's check found no real transfer among EUR and USD rows that matched on date and amount, so automatic pairing across currencies was dropped. Two rows can only be one transfer when they're on different accounts, in the same currency, with the same amount going out of one and into the other. That holds at import and when the owner marks a transfer in the Review inbox. The fallback is setting each row's type to Transfer by hand, which leaves it unpaired. Exchange-rate differences between the two sides aren't tracked.
