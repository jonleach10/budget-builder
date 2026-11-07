# One owner on Supabase, with MFA and row-level security

Decided: 2026-10-31

The data is one household's finances, and the app's key to the database is public by design. So Supabase holds the data for one owner, with signups closed and no shared access. Sign-in needs a password and then an authenticator code. Every table has row-level security, with two policies: a row belongs to its owner, and nothing can be read or written without a session that passed MFA, so a stolen password alone can't reach the data through the API. The pages check the session as well, but row-level security is the final check. Tests cover the policies for every table.
