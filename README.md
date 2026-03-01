# Burr Buddy

Two-user sender/receiver flow:

- `/create`: sender enters message and selects a 3D print shape, then creates a tokenized link.
- `/r/:token`: short receiver URL for typing from the printed token.
- `/p/:token`: receiver URL alias (also works).
- `POST /api/reply`: stores reply. Email send is optional and only runs when a sender email exists.
- STL export: sender can download a printable ~2 inch (50.8 mm) shape plaque with debossed QR code.

## API Routes

- `POST /api/create`
  - body: `{ senderMessage, printShape }`
  - returns: `{ token, printShape }`
  - token format: `word-word-word-suffix` (example: `mint-lake-star-7k2q9v`)
- `GET /api/message?token=...`
  - returns: `{ token, printShape, senderMessage, createdAt, repliedAt }`
- `POST /api/reply`
  - body: `{ token, reply }`
  - returns: `{ ok: true, repliedAt, emailStatus }`

## Storage

SQLite table (`messages`) with schema:

- `token` (PK)
- `senderEmail`
- `senderMessage`
- `emoji` (legacy column used to store `printShape`)
- `createdAt`
- `receiverReply`
- `repliedAt`

Default DB file: `data/burrbuddy.sqlite` (ignored by git).  
Override path with `BURR_BUDDY_DB_PATH`.

## Email Configuration

Optional, only needed if you later collect sender email and want outgoing reply emails:

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
