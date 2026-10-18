# BAC MGT — mobile

Android app for managing the club, sharing the same Supabase database as the BAC MGT web app. Everything syncs live between phones and the web.

## Features

| Tab / screen | What it does |
| --- | --- |
| **Home** | Collected this month vs expected, still to collect, quick actions, KPIs, who hasn't paid, absence warnings, income vs expenses chart |
| **Learners** | Search, level filter, status chips (unpaid, absence warning, abandoned…), one-tap call, CSV export |
| **Learner profile** | Call / WhatsApp / record payment, totals, 12-month strip, activity timeline, month-by-month bills with receipts (adjust amount due, delete receipt), attendance records with reasons, details, edit, delete |
| **Attendance** | Mark present/absent per level and date, absence reasons, "all present" / "rest absent", absence warnings with "add reason" |
| **Payments** | Month view: collection rate, outstanding, owing/unpaid/partial/paid filters, receipts list, CSV export |
| **Record payment** | Pick learner, starts at oldest unpaid month, spreads money over months, live preview, method/reference/date, shareable receipt |
| **More** → Payment History, Expenses, Reports, Settings, sign out |
| **Expenses** | Monthly spending, change vs last month, net result, by-category breakdown, one-tap copy of recurring costs |
| **Reports** | Expected / collected / outstanding / net, 12-month chart, cash flow month vs year, by payment method, by level, CSV exports |
| **Settings** | Club name, default monthly fee, absence warning weeks (shared with the web app) |

CSV exports open the Android share sheet: save to Drive, or send by WhatsApp or e-mail.

## First-time setup

1. `npm install`
2. Copy `src/config.example.ts` to `src/config.ts` and fill in the same Supabase URL and anon key as the web app's `.env`.
3. Tools (already installed on this PC): JDK 17 in `%USERPROFILE%\.jdks`, Android SDK in `%LOCALAPPDATA%\Android\Sdk` (platform-tools/adb, platform 37, build-tools 37, NDK 27.1, CMake 3.22).

## Run on your phone (USB)

1. On the phone: **Settings → About phone → tap "Build number" 7 times**, then **Settings → Developer options → USB debugging: ON**.
2. Plug it in and tap **Allow** on the "Allow USB debugging?" prompt.
3. Run one of these:

```powershell
npm run phone          # development build; code changes reload live (keep this PC running)
npm run phone:release  # standalone APK that works without the PC
```

Check that the phone is visible with `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb devices`.

The release APK ends up in `android/app/build/outputs/apk/release/app-release.apk`. You can copy it to any Android phone and install it. It is signed with the debug key, which is fine for the team but not for the Play Store.

## Share the app without USB (APK)

Build once on the PC: `cd android && gradlew assembleRelease`. The APK is copied to `D:\Projects\BAC\apk\BAC-MGT.apk` (about 30–50 MB).

1. Send `BAC-MGT.apk` any way you like: WhatsApp (as a **Document**, not a photo), Google Drive, Telegram, Bluetooth or e-mail.
2. On the phone, tap the file → **Install**. The first time, Android asks you to allow "Install unknown apps" for WhatsApp/Drive/Files. Allow it, then go back and tap Install.
3. Open **BAC MGT** and sign in with the same email and password as the web app.

The app talks to Supabase directly, so it only needs internet. No PC is involved.

**Updates:** build again with a higher `versionCode` in `android/app/build.gradle` and send the new APK. It installs over the old one and keeps the user signed in.

**Keep the signing key safe.** `android/app/bac-mgt-release.keystore` and `android/keystore.properties` are not in git. Copy them to Drive. Without them, future updates can't be installed over this version.

### Build in the cloud instead (slow internet)

`.github/workflows/android-apk.yml` builds the APK on GitHub. Push this folder to a GitHub repo and add four secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `KEYSTORE_PASSWORD`, and `KEYSTORE_BASE64` (in PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("android\app\bac-mgt-release.keystore")) | Set-Clipboard`). Then download the APK from **Actions → latest run → Artifacts**.

## Checks

```powershell
npx tsc --noEmit   # types
npm run lint
npm test           # billing & attendance rules
```
