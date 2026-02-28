# Burr Buddy

Two-user sender/receiver flow:

- `/create`: sender enters message, emoji, sender email, then creates a tokenized link.
- `/r/:token`: short receiver URL for typing from the printed token.
- `/p/:token`: receiver URL alias (also works).
- `POST /api/reply`: stores reply and emails it to sender via Resend or SendGrid.
- STL export: sender can download a printable plaque with token text debossed.

## API Routes

- `POST /api/create`
  - body: `{ senderMessage, emoji, senderEmail }`
  - returns: `{ token }`
  - token format: `word-word-word-suffix` (example: `mint-lake-star-7k2q9v`)
- `GET /api/message?token=...`
  - returns: `{ token, emoji, senderMessage, createdAt, repliedAt }`
- `POST /api/reply`
  - body: `{ token, reply }`
  - returns: `{ ok: true, repliedAt }`

## Storage

SQLite table (`messages`) with schema:

- `token` (PK)
- `senderEmail`
- `senderMessage`
- `emoji`
- `createdAt`
- `receiverReply`
- `repliedAt`

Default DB file: `data/burrbuddy.sqlite` (ignored by git).  
Override path with `BURR_BUDDY_DB_PATH`.

## Email Configuration

Set one provider:

- `RESEND_API_KEY` (preferred)
- or `SENDGRID_API_KEY`

Optional:

- `EMAIL_FROM` (defaults to a placeholder sender)

## Run

```bash
npm install
npm run dev
```

For local API + frontend parity with Vercel routing, use:

```bash
vercel dev
```
