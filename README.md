# Vitto — Loan Repayment Service

A loan management application that generates EMI (Equated Monthly Instalment) schedules and tracks payment allocation. Built with Next.js 14, PostgreSQL (via Prisma), and Firebase Authentication.

## Setup

### Prerequisites

- Node.js 18+
- A PostgreSQL database (we used [Supabase](https://supabase.com))
- A Firebase project with Email/Password and Google sign-in enabled

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in the values.

> **Note:** Prisma CLI commands (migrate, seed) read from `.env`, not `.env.local`. 
> Copy `.env.local` to `.env` as well before running the database setup step below:
> ```bash
> copy .env.local .env   
> ```


Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string from Supabase/Neon |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web app API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase auth domain (e.g. `project.firebaseapp.com`) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase project ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web app ID |
| `FIREBASE_ADMIN_PROJECT_ID` | Same project ID, used by the admin SDK |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | Service account email from the downloaded JSON |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Service account private key (with `\n` newlines) |

> **Note:** `.env.local` is in `.gitignore` and must never be committed.

### 3. Set up the database

```bash
npx prisma migrate dev --name init
```

### 4. Seed the database

```bash
npx prisma db seed
```

This creates one loan: ₹2,00,000 principal, 18% annual rate, 24-month tenure, disbursed today.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your Firebase test account.

---

## Running Tests

```bash
npm test
```

This runs all unit and integration tests via Vitest. Integration tests use the same PostgreSQL database (test data is cleaned up before and after each run).

---

## API Reference

All endpoints require a valid Firebase ID token in the `Authorization: Bearer <token>` header. Unauthenticated requests receive a `401` response.

All error responses use the shape: `{ error: { code: string, message: string } }`.

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/api/loans` | — | Array of loan summaries |
| `POST` | `/api/loans` | `{ principal, annualRate, tenureMonths, disbursementDate }` | Created loan with full instalment schedule (201) |
| `GET` | `/api/loans/[id]` | — | Loan with schedule + `position` summary |
| `POST` | `/api/loans/[id]/payments` | `{ amount, paymentDate }` | Updated schedule + position + payment record |

### Position summary (included in GET and POST payment responses)

```json
{
  "position": {
    "outstandingPrincipal": 19200000,
    "nextDueDate": "2024-03-15T00:00:00.000Z",
    "nextDueAmount": 998600,
    "overdueAmount": 0
  }
}
```

- `outstandingPrincipal`: sum of `principalComponent` for all instalments where `amountPaid < totalDue`
- `nextDueDate` / `nextDueAmount`: the earliest unpaid instalment
- `overdueAmount`: sum of `(totalDue - amountPaid)` where `dueDate < today` and `amountPaid < totalDue`

### Input validation

All inputs are validated with Zod. The API returns `400` for:
- Negative or zero amounts
- Non-integer money values
- Missing required fields
- Invalid date formats

---

## Design Decisions

### Money representation: integers in paise, not floats

All money values are stored as `Int` in the database, representing **paise** (1 rupee = 100 paise). The annual interest rate is stored as `rate × 100` (e.g. 18% → 1800).

This avoids the well-known floating-point precision problems that plague financial software. JavaScript's `Number` type is an IEEE 754 double, which cannot represent many decimal fractions exactly — `0.1 + 0.2 !== 0.3`. By working in the smallest currency unit (paise) and using integer arithmetic, we eliminate rounding drift entirely.

All EMI calculations use the `decimal.js` library for arbitrary-precision decimal arithmetic. Values are rounded to the nearest paisa only when writing each instalment row, ensuring that intermediate computations don't accumulate error.

### EMI schedule generation

The standard EMI formula is used:

```
r = annualRate / 100 / 12 / 100    (monthly rate as a decimal, from the stored integer)
EMI = P × r × (1+r)^n / ((1+r)^n − 1)
```

Per instalment:
- Interest is computed on the outstanding principal balance: `round(outstanding × r)`
- Principal is the remainder: `EMI − interest`
- The **final instalment** absorbs any rounding remainder, so the sum of all principal components equals the original principal exactly. This is a standard amortization technique — without it, cumulative rounding errors could leave a small residual balance.

The reference test case verifies: ₹2,00,000 at 18% for 24 months → EMI ≈ ₹9,986/month, and `sum(principalComponent) === principal` exactly.

### Payment allocation: oldest-due-first, no principal reduction

When a payment is recorded, it is allocated to instalments in chronological order (oldest unpaid first):

1. Find the earliest instalment where `amountPaid < totalDue`
2. Apply the payment up to that instalment's `totalDue`
3. If money remains, roll to the next unpaid instalment and repeat
4. If money remains after every instalment is fully paid, it is returned as `unallocatedAmount` — it is **not** applied as a principal reduction

This was chosen because it keeps allocation logic simple and predictable. The alternative — reducing principal on overpayment — would require recomputing the amortization schedule mid-life, which is out of scope for this assessment. The current approach means overpayment simply settles future instalments early.

### Idempotency

Duplicate payment submissions are detected using a SHA-256 hash of `loanId + amount + paymentDateISOString`. If a payment with the same idempotency key already exists, the API returns the existing result with `200 OK` instead of creating a duplicate record. This prevents double-charging from network retries or UI double-clicks.

### Overdue calculation

An instalment is flagged as overdue whenever `today > dueDate AND amountPaid < totalDue`, regardless of when a payment eventually posts. This means a late payment that fully settles an instalment will clear the overdue status, but the instalment was correctly reported as overdue for the period between its due date and the payment date.

---

## Project Structure

```
├── app/
│   ├── api/loans/              # REST API route handlers
│   │   ├── route.ts            # GET /api/loans, POST /api/loans
│   │   └── [id]/
│   │       ├── route.ts        # GET /api/loans/[id]
│   │       └── payments/
│   │           └── route.ts    # POST /api/loans/[id]/payments
│   ├── components/
│   │   └── LoanDashboard.tsx   # Main UI component
│   ├── login/
│   │   └── page.tsx            # Login page
│   ├── globals.css             # Design tokens + styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page (auth gate)
├── lib/
│   ├── __tests__/              # Unit tests
│   │   ├── schedule.test.ts
│   │   └── allocation.test.ts
│   ├── allocation.ts           # Payment allocation logic
│   ├── auth.ts                 # Server-side token verification
│   ├── firebase-admin.ts       # Firebase admin SDK
│   ├── firebase-client.ts      # Firebase client SDK
│   ├── prisma.ts               # Prisma client singleton
│   ├── schedule.ts             # EMI schedule generation
│   └── validation.ts           # Zod schemas
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed script
├── tests/
│   └── integration/
│       └── api.test.ts         # Integration tests
├── .env.example                # Env var template
├── vitest.config.ts            # Test configuration
└── README.md
```
