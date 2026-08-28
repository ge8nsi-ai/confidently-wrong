# Failure modes

Run 2026-08-28T16:14:44.779Z against the production build at 390x844, by `npm run failures`. Each row is a state the app was pushed into on purpose; the screenshot is of the card as it looked when the message appeared.

| Failure | Trigger | What the visitor sees | Requests | Server |
| --- | --- | --- | --- | --- |
| [Three words pasted](failures/three-words-pasted.webp) | The word count is under the 200-character floor ("photosynthesis is hard") | 22 characters. Around 200 or more is enough to work with. The button is disabled. | 0 | no request |
| [PDF over the size cap](failures/pdf-over-cap.webp) | A 9MB PDF attached, against an 8MB cap | That file is over 8MB. Paste the text instead. | 0 | no request |
| [Offline](failures/offline.webp) | The browser is offline when Generate is pressed | The request failed. Check your connection and try again. | 0 | request never left the browser |
| [Rate limited](failures/rate-limited.webp) | The limiter's 5 requests a minute are already spent (422, 422, 422, 422, 422) | Too many requests. Wait a minute and try again. | 6 | 429, Retry-After: 60 |

Two of the four never reach the network: the character floor and the size cap
are checked in the browser, so a visitor who pastes too little or attaches too
much spends nothing and waits for nothing. The offline case is the `catch` on
the same `fetch`, which is why its message names the connection rather than the
server. The rate limit is the only one the server decides, and it answers before
it reads the body, so a client hammering the endpoint cannot spend money by
sending large ones.

The limiter is in-memory and per instance, which makes it a cost guard rather
than a security control — the comment above each route handler says so, and says
that the handler is public and unauthenticated.
