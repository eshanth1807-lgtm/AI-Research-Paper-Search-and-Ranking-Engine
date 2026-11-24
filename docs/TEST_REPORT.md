# PaperLens v1.3 — verification report

Completed 24 November 2026. All changes saved in the Mac project folder.

## Improvements delivered

- Ten-paper pagination in search results and reading lists; global rank numbers remain correct.
- Full-collection JSON export regardless of the page being viewed.
- Search cancellation with upstream cancellation for Crossref and arXiv.
- Crossref parsing tolerates invalid individual records and missing/malformed author lists.
- Admin logout invalidates pending UI requests so delayed analytics cannot reopen the dashboard.
- Package, health endpoint and UI version aligned to 1.3. Minimum Node version aligned to used APIs.

## Automated verification

45 tests passed; zero failures or skipped tests. See TEST_OUTPUT.txt.
Coverage includes ranking, query normalization, filters, source parsing, caching, partial provider failure, complete source failure, cancellation, pagination, exports, bookmark persistence, invalid browser storage, authentication, login throttling, logout, tracking time, analytics persistence, corrupt analytics preservation, proxy IP handling and startup errors.

All 19 JavaScript files passed syntax checks. Both launcher scripts passed shell syntax checks. Local module imports were verified. HTTP smoke checks verified the public assets, admin login route, authenticated-only analytics API, private-file isolation, and the v1.3 health response.

## Browser verification

The in-app browser exercised the real application on an isolated local test port:

- Live transformer search returned 100 papers (50 Crossref and 50 arXiv candidates) in approximately 18 seconds.
- Pagination displayed 10 cards per page; page 2 began at rank 11.
- Cancel search returned the interface to a usable state; a subsequent search succeeded.
- Saving a paper from page 2, opening the reading list, reloading, and removing the saved paper succeeded.
- Demo language search returned four papers. Filtering since 2020 returned three; newest-first placed LoRA first.
- An unmatched query displayed an accurate empty-results message.
- Admin navigation showed a password sign-in page, not visitor data.
- JSON export was verified in automated frontend tests, including exporting all 23 fixture results while viewing a later page.

A browser screenshot is saved as paperlens-v1.3.jpg. No real password was read or replaced.

## Limits of verification and product scope

This is a tested working prototype, not a guarantee of bug-free operation. The current ranking is lexical BM25, not neural semantic search. Live sources and temporary tunnels can be slow or unavailable. The public tunnel was not restarted during this verification because starting the user's authenticated sharing session requires their password. A separate physical device and every browser/operating system combination have not been tested. OpenAI summaries were not tested against the paid API; no API key is configured. Mock tests cover that optional integration. Analytics are approximate, client-reported and cookie-based; they cannot identify people or personal device names reliably.

## Run

Run the existing share.command from Terminal, enter your password, and use the newly printed public URL. Add /admin for the dashboard. Control+C stops sharing and the app. Restart an existing process to load these backend changes.
