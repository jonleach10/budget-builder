# Domain features, thin routes

Decided: 2026-10-31

Code is grouped by domain feature under `features/`, such as import, categorize, review, budget and fx, and each feature holds its own logic, screens and tests. Routes in `app/` are thin: a page checks the session and renders a feature's screen with data the feature loads. Business logic never lives in routes or components, so it can be tested without a page and found by the domain word for it. Shared utilities sit apart from features in `lib/`, and shared interface parts in `components/`.
