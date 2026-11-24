# PaperLens — AI Research Paper Search and Ranking Engine

A research discovery application with live Crossref and arXiv search, explainable BM25 ranking, saved papers, and a password-protected admin dashboard. It runs without an API key. Semantic neural ranking is not yet implemented.

## Run on your Mac

Double-click `start.command` or run `./start.command`. Open http://127.0.0.1:8788 on your Mac. Other devices on the same Wi-Fi can open the network URL printed in Terminal. Keep the Terminal open; Control+C stops the server for everyone. Allow incoming connections if macOS asks. Guest Wi-Fi isolation or firewall settings can prevent device-to-device access. No tunnel or API key is required. Live paper search still needs internet access.

Alternatively, with Node.js 20+ installed:

```sh
npm start
```

No package installation, paid API key, or database is needed. The launcher can also use the Node runtime bundled with ChatGPT on this Mac. For portable use, install a standalone Node.js runtime.

## Features

- Live search is the default: Crossref and arXiv each supply up to 50 candidates per query, including subjects outside AI and computing.
- Six-paper offline demo, clearly labeled with paraphrased synopses.
- BM25 ranking with title weighting and AI/LLM/NLP acronym expansion at ranking time.
- Publication-year filter, relevance/newest sorting, match explanations.
- Reading list stored in the current browser's local storage.
- JSON export of results or saved papers.
- Streaming retrieval/ranking activity, readable network failures, and one-hour in-memory query cache.
- Responsive interface with keyboard controls and accessible labels.

## Source layout

`server.mjs` provides the local HTTP server, arXiv retrieval, metadata parsing, and streaming search endpoint. `ranking.mjs` implements ranking. `public/` contains the browser interface. `data/demo.json` contains example records. `tests/search.test.mjs` verifies ranking, parsing, routes, streamed search, and validation.

## Test

```sh
node --test
```

On this Mac without Node on PATH:

```sh
/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node --test
```

## Scope and limitations

This is a first working prototype, not a completed neural research system. Natural-language queries have common English filler words removed. Crossref uses free-text retrieval; arXiv searches up to 20 meaningful terms with OR matching. Unicode words are preserved, but translation is not implemented. BM25 reranks titles, abstracts, and author names; records with no lexical match are excluded. AI, LLM and NLP acronym expansion applies before retrieval and during ranking. The newest option sorts the candidate set by publication year, not the entire corpus. Scores are query-relative lexical scores, not probabilities or research-quality ratings. Missing abstracts are labeled in the interface. Demo synopses are paraphrased examples. Any research topic can be submitted, but matching results depend on source coverage, language, metadata, and availability; irrelevant or invented papers are never inserted to guarantee a result. If one source fails, results from the other remain available with a warning. If both fail, a readable error is displayed. Only complete successful retrievals are cached.

The launcher binds to all IPv4 interfaces for local network access on port 8788. Use it on a trusted network. Direct `npm start` remains localhost-only on port 8787; `PAPERLENS_HOST=127.0.0.1 ./start.command` also restricts access to your Mac. Live search requires internet access and depends on arXiv availability. Requests are serialized with a minimum 3.1-second pause after completion. A maximum of 10 requests can wait or run. The metadata parser supports standard arXiv Atom responses; it is not a general XML parser. Browser bookmarks are local to one browser and can be lost when browser data is cleared; use export for a backup. Google Fonts is optional; system fonts work offline.

## Next development milestones

1. Add sentence-transformer embeddings and hybrid lexical/semantic retrieval.
2. Add a persistent paper index and reproducible ingestion pipeline.
3. Collect relevance judgments; evaluate Recall@k, MRR, and nDCG against BM25.
4. Add a cross-encoder reranker and measure quality/latency tradeoffs.

API documentation: https://info.arxiv.org/help/api/user-manual.html

Thank you to arXiv for use of its open access interoperability.

## Search and automatic summaries (v1.2)

Search corrects common misspellings, including `ariticial intelligence`, and expands AI, LLM and NLP before retrieval. Users see the corrected query. This is bounded dictionary correction, not arbitrary multilingual spellchecking. Search still covers research records, not all websites, and cannot guarantee a match for every topic.

Every matching paper with an abstract gets an automatic, explicitly labeled extract of up to two relevant sentences. Missing abstracts are never invented. Optional AI overviews summarize up to five matching abstracts and link their numbered sources; they do not claim to summarize full PDFs.

To enable OpenAI summaries:

1. Copy `.env.example` to `.env` in this project folder.
2. Enter your own API key after `OPENAI_API_KEY=` locally; do not paste the key into chat or commit it.
3. Optionally change `OPENAI_MODEL` (default `gpt-4.1-mini`).
4. Stop the running app with Control+C in its original Terminal, then run `./start.command` again. Starting a second copy does not reload the existing server's configuration.

The API key remains on the server. With a key configured, query text and retrieved metadata are sent to OpenAI for moderation; the query and up to five abstracts are sent for summarization. API usage may be billed by the provider. Without a key, no OpenAI request is made and the interface identifies its output as abstract extracts, not AI summaries. Failed AI summaries fall back to these extracts.

Adult-content filtering runs on both queries and returned titles/abstracts. Without a key it is a conservative keyword filter, which can miss obfuscations and unfamiliar languages or overblock academic discussion. With a key it additionally uses OpenAI sexual-content moderation; unavailable moderation prevents unchecked results from being displayed. Generated AI summaries are moderated too. No filter provides a guarantee. Non-explicit health education is allowed. Linked external publisher pages are outside this app's filter.

OpenAI references: https://developers.openai.com/api/docs/guides/moderation and https://developers.openai.com/api/reference/resources/responses/methods/create

## Share across different networks

Run `./share.command` to start PaperLens and the separately installed Cloudflare Tunnel executable at `tools/cloudflared` in one Terminal. Share the printed HTTPS trycloudflare.com link. Other devices do not need the same Wi-Fi or any software installation. Keep your Mac awake and online. Control+C stops both processes; restarting creates a new link. If port 8788 is occupied, stop the existing app first. If the tunnel cannot connect, the launcher stops the app too. The executable location can be overridden with PAPERLENS_CLOUDFLARED. This is temporary public sharing, not permanent hosting.

## Launcher password

`share.command` now asks for a password before starting the app or tunnel. On first run, create and confirm a password of at least 8 characters. Typing is hidden. Later runs allow three attempts. Only a salted scrypt hash is saved in `.launcher-password.json`, with owner-only permissions and excluded from Git. Control+C cancels the prompt without starting anything. This is a launcher gate, not website authentication or protection against someone who can edit your project files; `start.command` and direct Node startup remain separate local launch methods. Existing running sessions are unaffected.

## Password-protected visitor dashboard

After restarting `share.command`, open `/admin` on your current public HTTPS link and sign in with the launcher password. Sessions expire after one hour and are cleared on server restart; sign out revokes the session. Login attempts are rate limited. A password must first be set locally by the launcher; there is no public password setup route.

The research page discloses tracking and sends 15-second heartbeats. A random HttpOnly browser cookie identifies a browser, not a person. The dashboard shows latest IP, inferred device category/OS/browser, first/last seen and estimated engaged hours. Personal device names are not available. Hidden or idle pages and gaps over 45 seconds do not accumulate time; measurement is approximate and client-reported. No search text is stored in analytics. Records persist locally with owner-only permissions in `.visitor-analytics.json`, excluded from Git. Records inactive for 30 days are pruned on analytics/admin requests; storage is capped at 5,000 visitors. Counts are cumulative for retained records. New tunnel hostnames, clearing cookies, blocked scripts or disabled JavaScript affect tracking.

`share.command` enables Cloudflare IP-header handling only for loopback peers and uses Secure cookies. Use the public HTTPS link for dashboard login in sharing mode. Direct LAN mode uses socket IPs and does not trust forwarded headers. Local processes can spoof loopback proxy headers, so these records are operational estimates, not identity or forensic evidence. Browser access to analytics always requires an admin session.

## File audit and optional browser checks

All required application source files and browser assets are included. The sharing launcher expects `tools/cloudflared` or the path in `PAPERLENS_CLOUDFLARED`. The binary is excluded from GitHub and must be installed separately on a new machine. No `.env` file is needed in no-key mode. Password and visitor records are generated locally, not example files to recreate or overwrite.

`scripts/browser-check.mjs` is an optional developer check requiring Playwright, which is not needed to run the app or the Node test suite. A damaged analytics file is preserved rather than overwritten; tracking continues temporarily in memory and the dashboard displays a storage warning until the file is repaired.

## Improvements in v1.3

- Results and reading lists display 10 papers per page. JSON export includes the entire current collection, not just the visible page.
- Cancel search stops the browser request and propagates cancellation to Crossref and arXiv fetches. Already received results remain usable. Optional OpenAI calls already in progress may finish in the background.
- Malformed individual Crossref records are skipped instead of discarding the entire provider response.
- Stale admin requests cannot reveal visitor rows after logout.
- Requires Node.js 20.12 or newer; the included launchers can use the ChatGPT Node runtime on this Mac.

See `docs/TEST_REPORT.md` for verification results and known limitations.

## Run a copy from GitHub

Install Node.js 20.12 or newer, download or clone this repository, open a terminal in the project folder, and run `npm start`. Open http://127.0.0.1:8787. The application has no runtime npm dependencies. Run `npm test` for the automated suite.

For temporary public sharing on macOS, obtain cloudflared from its official release, save the executable as `tools/cloudflared` (or set PAPERLENS_CLOUDFLARED to its path), then run `chmod +x start.command share.command tools/cloudflared` once and run `./share.command`. If using a custom binary path, apply executable permissions to that path instead. The first run asks you to create a local password. Neither passwords nor visitor analytics are included in GitHub. `share.command` is a macOS launcher; `npm start` is the portable local-server command.

## License

Original project code is available under the MIT License; see LICENSE. See THIRD_PARTY_NOTICES.md for third-party software and research-content boundaries.
