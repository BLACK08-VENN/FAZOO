Install instructions for Fazoo APK

Prerequisites:
- Android device or emulator
- Android SDK platform-tools installed (`adb` available in PATH)

Install (replace device/emulator as needed):

1. Connect device or start emulator
2. Install APK:

   adb install -r artifacts/fazoo.apk

3. If installation fails due to "unknown sources" on device, enable install from unknown sources in device settings.

Troubleshooting:
- Uninstall existing app before reinstalling:

   adb uninstall app.fazoo.mobile || true
   adb install artifacts/fazoo.apk

- To view logs while running the app:

   adb logcat | grep -i fazoo

Sharing options:
- Upload `artifacts/fazoo-release.zip` to a file share (Google Drive, Slack, S3).
- Serve locally (temporary) from this machine:

   python3 -m http.server 8000 --directory artifacts

Then share http://<your-ip>:8000/fazoo-release.zip (ensure firewall allows access).
