# ConstructPulse updated project

## Included changes
- Daily attendance records keyed by team leader + date to prevent duplicate submissions.
- Temporary drafts remain browser-local and are not submitted.
- Daily wage calculation: Present = 1 day, Half Day = 0.5 day, Leave/Absent = 0; each OT unit adds 0.5 day.
- Worker payments stored with the daily attendance record and aggregated by site.
- Admin weekly team/site payment report and edit request queue.
- Team leader edit requests; admin approval grants one edit. Resubmission sets editAllowed back to false.
- Firestore rules accept existing teamleader/teamLeader profile role spellings.

## Setup
1. Unzip the project.
2. Copy your own `.env` from your backup into the project root (it is intentionally not included in this ZIP).
3. Run `npm install`, then `npm run dev`.
4. Review `firestore.rules` before deploying.

## Important security note
This version uses Firestore security rules and client-side writes. The rules are a baseline; test the edit request and admin approval flows with separate leader/admin accounts before using real payroll data. The browser-local draft is only available in that browser/device.

## Firestore rules deployment (do this only after reviewing)
1. Open Firebase Console → Firestore Database → Rules.
2. Save a copy of your current rules before changing anything.
3. Paste the updated `firestore.rules` contents into the Rules editor and click Publish.
4. Test with one team leader account and one admin account before entering real payment data.

The included ZIP intentionally excludes `.env` and `node_modules`. Copy your own `.env` from your backup into the project root; do not share it publicly. Then run `npm install` and `npm run dev`.
