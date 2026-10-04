# EcoLoop

EcoLoop is a digital recycling platform. Customers book waste pickups, approved collectors process and weigh recyclables, and admins manage the collection network.

## Features

- Customer/resident registration, login, dashboard, booking, and history
- Collector applications requiring admin approval
- Collector queue, accept/start workflow, weighing, rewards, and admin-controlled mock payment
- Collector availability: available, offline, or busy
- Admin collector management and application review
- Pickup ownership through the authenticated collector account
- Eco Points and recycling totals

## Stack

- Frontend: vanilla HTML, CSS, and JavaScript
- Backend: Node.js and Express
- Database: MongoDB with Mongoose
- Authentication: JWT and bcrypt

## Setup

1. Install MongoDB locally or use MongoDB Atlas.
2. Set environment variables in `.env`:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/ecoloop
JWT_SECRET=change_this_secret
PORT=3000
```

3. Install dependencies and seed development accounts:

```bash
npm install
npm run seed
npm start
```

Open `http://localhost:3000`.

## Development accounts

`npm run seed` creates or updates these local demo accounts:

- Admin: `admin@ecoloop.com` / `admin123`
- Legacy collector: `collector@ecoloop.com` / `collector123`

These credentials are for development/demo use only. Change them before production.

## Customer flow

1. Register at `/register.html`.
2. Log in at `/login.html`.
3. New registrations use role `customer`; older `resident` accounts remain supported.
4. Book pickups at `/book-pickup.html`.
5. View status and rewards on `/dashboard.html` and `/history.html`.

Customer accounts cannot access collector or admin routes.

## Collector application flow

1. Open `/collector-register.html` or choose **Become a Collector** from the home/login pages.
2. Submit name, contact, address, vehicle, verification information, and password.
3. The application is stored as `pending` with a bcrypt-hashed password.
4. Pending applicants cannot log in to the collector dashboard.
5. An admin reviews applications at `/admin.html`.
6. Approval creates an active collector account. Rejection or suspension blocks access; reactivation restores it.

## Admin flow

1. Open `/admin-login.html`, or choose **Admin Login** from the home page.
2. Sign in with the seeded admin account.
3. Use `/admin.html` to view statistics, create collectors, review applications, and activate/deactivate collectors.
4. Collector deactivation is soft: historical pickup data is preserved.

## Role permissions

- Customers/residents can register, book pickups, and view their own dashboard/history.
- Collectors can view scheduled pickups, accept/start assigned work, enter weights, and mark pickups collected. Admins control payment completion.
- Admins can manage collectors, approve applications, view customers and pickups, and assign active collectors.
- Admins can create, activate, and deactivate other admins from the Admin Management section.

## API overview

### Authentication

- `POST /api/auth/register` - create a customer account
- `POST /api/auth/login` - login and receive a JWT (`{email, password, rememberMe}`; unchecked → 2h token in session storage, checked → 30d token in local storage; omitted flag → 7d default)
- `POST /api/auth/admin/login` - admin-only login
- `POST /api/auth/collector/apply` - submit a collector application
- `GET /api/auth/me` - return the authenticated user

### Customer and pickup APIs

- `POST /api/pickups` - customer books a pickup
- `GET /api/pickups/mine` - customer pickup history
- `GET /api/dashboard` - customer dashboard totals and recent pickups

### Payout details APIs

Residents manage one payout destination (UPI or bank account) at
`/payment-details.html`. One document per user; edits reset internal
verification; no cards, PINs, OTPs or passwords are ever collected.

- `GET /api/payment-details` - owner reads their own details
- `PUT /api/payment-details` - owner creates/replaces their own details
- `DELETE /api/payment-details` - owner removes their own details
- `GET /api/admin/users/:userId/payment-details` - admin views a user's details for payout processing
- `PATCH /api/admin/users/:userId/payment-details/verify` - admin sets the internal verified flag (records `verifiedBy`/`verifiedAt`)
- `POST /api/pickups/:id/admin-pay` - accepts an optional `{transactionId}` reference recorded on the paid pickup

### Collector APIs

- `GET /api/pickups/collector` - collector queue and owned processed pickups
- `GET /api/pickups/collector/summary` - collector statistics
- `GET /api/pickups/collector/profile` - collector profile and availability
- `PATCH /api/pickups/collector/availability` - update collector availability
- `POST /api/pickups/:id/accept` - accept a pickup
- `POST /api/pickups/:id/start` - start a pickup
- `POST /api/pickups/:id/weigh` - record weight, amount, points, and collector ownership
- `POST /api/pickups/:id/pay` - legacy collector payment path, rejected for collectors
- `POST /api/pickups/:id/admin-pay` - admin marks a payment-pending pickup as paid

### Admin APIs

- `GET /api/admin/dashboard` - customer, collector, pickup, waste, and reward statistics
- `GET /api/admin/collectors` - list collectors and completed pickup counts
- `GET /api/admin/admins` - list admin accounts and statuses
- `POST /api/admin/admins` - create an admin from an authenticated admin session
- `PATCH /api/admin/admins/:id/status` - activate/deactivate another admin
- `POST /api/admin/collectors` - create an active collector
- `PATCH /api/admin/collectors/:id` - update collector details/password
- `PATCH /api/admin/collectors/:id/status` - activate/deactivate a collector
- `DELETE /api/admin/collectors/:id` - soft-deactivate a collector
- `GET /api/admin/applications` - list collector applications
- `PATCH /api/admin/applications/:id/status` - approve, reject, suspend, or reactivate an application
- `GET /api/admin/customers` - list customer/resident accounts
- `GET /api/admin/pickups` - list pickups with filters
- `PATCH /api/admin/pickups/:id/assign` - assign an active collector

All admin endpoints require a valid JWT with `role: admin`. Collector endpoints require an active collector JWT. Customers cannot call either set of endpoints.

Admin safety rules prevent an administrator from deactivating their own account or removing the final active administrator. Admin passwords are bcrypt-hashed and never returned by the API. There is no public admin registration.

## Rates and points

- Paper: Rs 8/kg
- Cardboard: Rs 7/kg
- Plastic: Rs 12/kg
- Metal: Rs 25/kg
- E-waste: Rs 15/kg
- Other: Rs 5/kg
- Points: `Math.round(totalKg * 10)`

## Resident email-OTP registration

Public resident registration uses email OTP verification only. The phone
number from the form is stored on the user profile but is never
SMS-verified. The final `User` (always `role: resident`) is created only
after the email OTP verifies.

Flow: `register.html` → `POST /api/auth/register` (validates, stores a
`PendingRegistration` with bcrypt password hash + SHA-256 OTP hash, sends
the email OTP) → `verify-otp.html` (one 6-digit Email OTP field) →
`POST /api/auth/verify-registration` → `User` created, pending record
deleted → `login.html` (no auto-login).

Endpoints:

- `POST /api/auth/register` — `{success, message, email, maskedEmail, expiresAt}`. Never returns the OTP. Never creates `User` yet.
- `POST /api/auth/verify-registration` — `{email, emailOtp}`. Wrong OTP → `Incorrect email verification code.` Expired → `Your verification code has expired. Request a new code.`
- `POST /api/auth/resend-registration-otp` — `{email}`. Invalidates the old OTP, resets attempt counter.

### How email OTP works

`services/email.js` sends via Nodemailer SMTP (`EMAIL_HOST`, `EMAIL_PORT`,
`EMAIL_USER`, `EMAIL_PASSWORD`, `EMAIL_FROM`). Subject: `Verify your EcoLoop
account`. Without credentials the endpoint returns `503 OTP service is not
configured…` — it never pretends OTPs were sent.

Gmail setup:

1. Google Account → Security → turn on 2-Step Verification.
2. Security → App passwords → create one for Mail → copy the 16-character code.
3. In `.env`: `EMAIL_HOST=smtp.gmail.com`, `EMAIL_PORT=587`,
   `EMAIL_USER=you@gmail.com`, `EMAIL_PASSWORD=<app password, no spaces>`,
   `EMAIL_FROM=EcoLoop <you@gmail.com>`, `OTP_DEV_MODE=false`.
4. Restart the server (`dotenv` loads `.env` at boot).
5. Verify with `node scripts/test-otp-services.js --email-to=you@example.com`.

### Development OTP mode

```text
OTP_DEV_MODE=true   # log OTPs to the server terminal for local testing ONLY
OTP_DEV_MODE=false  # production: never log OTPs
```

With `OTP_DEV_MODE=true` and no provider credentials, OTPs are printed as
`[DEV OTP] …` and the flow proceeds. Set `false` once real credentials are
configured. Never commit real credentials (`.env` is gitignored).

### OTP expiration and rate limits

- OTPs expire after 10 minutes (`otpExpiresAt`).
- Max 5 failed verification attempts, then the pending registration is
  invalidated and the user must register again.
- Max 3 OTP resends within 15 minutes (`429 Too many OTP requests…`).

## Tests

Run the complete role and pickup integration flow:

```bash
npm run test:e2e
```

The test covers admin login, collector creation, collector application approval, activation/deactivation, OTP resident registration (wrong OTPs, resend, duplicates, attempt limit, expiry, verify → login), customer booking, collector ownership, weight calculation, mock payment, dashboard, and history.

## Project structure

```text
models/User.js
models/Pickup.js
models/CollectorApplication.js
models/PendingRegistration.js
routes/auth.js
routes/pickups.js
routes/dashboard.js
routes/admin.js
middleware/auth.js
services/otp.js
services/email.js
public/admin-login.html
public/admin.html
public/collector-register.html
public/collector.html
public/dashboard.html
public/book-pickup.html
public/history.html
public/verify-otp.html
```

Real payment gateways, Google Maps, AI classification, and community features are intentionally out of scope.
