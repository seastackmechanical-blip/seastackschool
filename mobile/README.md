# SeastackSchool Android app

A Capacitor shell that opens https://seastackschool.com/ . The app is always the current site, so publishing the
site updates the app; a new APK is needed only when this folder changes.

Built by `.github/workflows/android-apk.yml` (manual, or by changing `mobile/.build-trigger`). The signed APK is
committed to `downloads/seastackschool.apk` and served at https://seastackschool.com/downloads/seastackschool.apk .

Signing: repo secrets ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD.
Every update must be signed with the same key, or phones refuse to install it over the old one.
