# Firestore security checks

## Browser checks with Playwright

The browser checks cover team leader and admin sign-in, protected page access,
and role separation. Copy `.env.test.example` to `.env.test`, set Firebase web
app values for a separate test project, and create an active admin account and
an active team leader account there. Set `TL_ID` to the team leader's employee
ID. Keep this project separate from production because a successful team leader
login updates that account's last-login timestamp.

Install Chromium once with `npx playwright install chromium`, then run
`npm run test:e2e`. Playwright requires the test project settings and accounts
in `.env.test`; it stops if `.env.test` points to the same project as `.env`.
Use
`npm run test:e2e:ui` to open the interactive test runner.

For a disposable Firebase project that intentionally matches `.env`, the guard
can be overridden for one PowerShell session by setting
`$env:E2E_ALLOW_SHARED_FIREBASE_PROJECT = "true"` before running the tests.
Do not use this override with a project you need to preserve.

To run only the concurrent admin and team leader session check, use
`npm run test:e2e:multi-user`. It signs in both roles at the same time in
separate browser sessions, checks that each is blocked from the other role's
page, and confirms both original sessions remain signed in.

These checks run against the local Firestore Emulator with the demo project ID
`demo-constructpulse-security`. They seed fake users, workers, and attendance
records and do not connect to the Firebase project in `.env`.

## Requirements

- Node.js 24.12.0 or newer
- Firebase CLI
- Java 21 or newer for the Firestore Emulator

Install the project dependencies and run:

```sh
npm install
npm run test:security
```

On Windows, if Java 17 is selected but Android Studio's Java 21 is installed,
PowerShell can use that JDK for the current terminal session:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:Path = "$env:JAVA_HOME\bin;$env:Path"
npm run test:security
```

The rules limit team leaders to their own records and reserve worker management,
attendance approval, and cross-team reads for active admins. Attendance can be
submitted from the client on Firebase's Spark plan, so its contents and amounts
are unverified until admin approval. On approval, the app recalculates payout
using stored worker rates. Admins must still check the submitted attendance,
site, overtime, and historical rate details before approving.

The emulator tests do not connect to the Firebase project in `.env`.

## Spark plan deployment

This project is configured for Firebase Hosting and Firestore; it does not
configure Cloud Functions. After selecting your Firebase project and adding its
web app settings to `.env`, build and deploy Hosting plus the Firestore rules:

```sh
npm run build
firebase deploy --only hosting,firestore:rules
```

Firebase's Spark plan includes no-cost Hosting and Firestore quotas. It does not
support Cloud Functions, which is why payroll submitted from the browser must be
reviewed by an administrator before it is treated as verified. Check current
[Firebase plan details](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
and [pricing limits](https://firebase.google.com/pricing/) before publishing.
