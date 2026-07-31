# Testing on a real Android device

Everything here needs a machine with the Android SDK; none of it has been run
from the development container, so treat the first pass as a shakedown.

The quickest useful test does **not** need a deployed server or a database —
run the API on your desktop and point the phone at it over the LAN.

## The fast path: your phone's browser, no SDK

Before wrestling an SDK onto SteamOS, most of what needs checking can be
checked in the phone's browser against the dev server. This covers the portrait
layout, the collapsing command bar against a real software keyboard, the first
session, clearance, and the shift digest — everything except native
notifications and the APK itself.

Three terminals on the desktop:

```bash
# 1. the API
TOKEN_SECRET=dev npm run dev:server

# 2. the client, listening on all interfaces
npm run dev

# 3. your address
hostname -I | awk '{print $1}'
```

Then on the phone, over the same wifi, open:

```
http://<desktop-ip>:5173/?api=http://<desktop-ip>:8787
```

…or simply `http://<desktop-ip>:5173` if you build with `VITE_API_URL` set.
Add it to the home screen for a fullscreen, chrome-free approximation of the
app.

`hostname -I` prints nothing useful if you run it after a blocking command —
`npm run dev:server` does not return, so give it its own terminal.

## 0. Prerequisites (for the APK)

**On SteamOS**, the root filesystem is immutable, so do not fight `pacman`.
The clean route is Flatpak, which is already installed:

```bash
flatpak install flathub com.google.AndroidStudio
```

Android Studio brings its own JDK and installs the SDK under your home
directory, both of which survive SteamOS updates. A `distrobox` Arch container
is the other reasonable option if you would rather have the command-line tools
on their own.


```bash
java -version          # 17 or 21
echo $ANDROID_HOME     # e.g. ~/Android/Sdk — install via Android Studio if empty
adb devices            # your phone, with USB debugging on
```

On the phone: Developer options → USB debugging. Accept the RSA prompt.

## 1. Run the API on your desktop

No database required for a smoke test — with `DATABASE_URL` unset the server
uses the in-memory adapter and loses state on restart, which is fine here.

```bash
npm install
npm run build --workspace @deepholdings/shared
TOKEN_SECRET=dev npm run dev:server         # listens on 0.0.0.0:8787
```

With Postgres, so state survives:

```bash
export DATABASE_URL=postgres://localhost/deepholdings
npm run migrate --workspace @deepholdings/server
TOKEN_SECRET=dev npm run dev:server
```

Find the address the phone will use:

```bash
hostname -I | awk '{print $1}'      # e.g. 192.168.1.42
```

Phone and desktop must be on the same network, and the desktop firewall has to
allow 8787.

## 2. Build and install

```bash
cd packages/client
VITE_API_URL=http://192.168.1.42:8787 npm run build:android
cd android && ./gradlew installDebug
```

`build:android` runs the Vite build and `cap sync`; `installDebug` builds the
APK and pushes it over adb. `VITE_API_URL` is baked in at build time — a
device cannot reach your desktop's `localhost`.

Cleartext HTTP to a LAN address is permitted for **debug builds only**
(`app/src/debug/`). Release builds keep Android's secure default and need TLS.

## 3. What to check

**First session** — install fresh (`adb uninstall com.deepholdings.terminal`
first if you have run it before):

- Two tabs only: TERMINAL and ORDERS.
- Three opening log lines, the third about pensions.
- "Form SO-1 has not been filed" until you file it.
- No bezel in portrait; rotate to landscape and the beige machine appears.
- The `>` button bottom-right expands the command line, and the keyboard does
  not cover it.

**Notifications** — Android 13+ prompts on first schedule; accept it.

- Settings (gear) → Notifications, with per-type toggles and quiet hours.
- To force a permit notification quickly: set Target Depth to 12, wait for the
  recruit to reach their permit ceiling, then background the app. The Terminal
  shows "Permit D-N in processing" with an estimate while it is pending.
- Deliveries are scheduled inexactly on purpose. Under Doze they can drift by
  minutes, which is correct for a game — exact alarms are restricted by Play
  and a shift reminder does not qualify.

**Logs**, when something misbehaves:

```bash
adb logcat | grep -i -E "capacitor|deepholdings|chromium"
```

## 4. Known unknowns

Nobody has run any of this on hardware yet. The likely first failures, in order
of probability:

1. **Gradle/SDK version mismatch** — Capacitor 8 wants a recent Android Gradle
   Plugin and compile SDK. Android Studio will offer to fix it.
2. **The phone cannot reach the desktop** — firewall, or the two are on
   different subnets (guest wifi is a common culprit). `curl http://<ip>:8787/health`
   from the phone's browser is the fastest check.
3. **Notifications never arrive** — check the runtime permission was granted,
   and that quiet hours are not swallowing the delivery.
