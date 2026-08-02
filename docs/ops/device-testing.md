# Testing on a real Android device

Everything here needs a machine with the Android SDK; none of it has been run
from the development container, so treat the first pass as a shakedown.

The quickest useful test does **not** need a deployed server or a database —
run the API on your desktop and point the phone at it over the LAN.

## The fast path: your phone's browser, no SDK

Before wrestling an SDK onto SteamOS, most of what needs checking can be
checked in the phone's browser against the dev server. This covers the portrait
layout, the first session, clearance, and the shift digest — everything except
native notifications and the APK itself.

`npm run viewports -w @deepholdings/client` checks the layout parts of that
without a phone at all: every screen reachable without a gesture, nothing
overflowing sideways, every touch target ≥44px where the pointer is coarse. It
exists because two portrait rules shipped and had to be reported from a real
device, and neither was the kind of thing a unit test can hold.

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


> **On plain `http://` from a LAN address the page is not a secure context.**
> That is not a warning about this project's security posture — it changes
> which browser APIs exist. `crypto.randomUUID` is one of the ones that
> vanishes, and minting a device id is the first thing the client does, so the
> symptom is a blank screen and `crypto.randomUUID is not a function` before
> anything renders. Fixed in `api/deviceId.ts`, which falls back to
> `crypto.getRandomValues` — that one has never been restricted. If you add
> code here, anything gated on `window.isSecureContext` will fail on this
> path and pass everywhere else you test it.

Add it to the home screen for a fullscreen, chrome-free approximation of the
app.

`hostname -I` prints nothing useful if you run it after a blocking command —
`npm run dev:server` does not return, so give it its own terminal.

Outside production the API accepts any private-network origin, so the LAN
address the phone loads the page from passes CORS without configuration.
Setting `CORS_ORIGINS` explicitly turns that off and uses your list verbatim,
which is how you reproduce production behaviour locally.

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
java -version          # 21 specifically — Gradle 8.14.3 cannot parse its own
                        # build scripts on a JDK newer than this (fails with
                        # "Unsupported class file major version"), and 17 is
                        # too old to compile capacitor-android's bytecode
                        # target. `pacman -S jdk21-openjdk` if neither of the
                        # JDKs Android Studio or your distro shipped is 21,
                        # and point JAVA_HOME at it for the gradlew commands
                        # below.
echo $ANDROID_HOME     # e.g. ~/Android/Sdk — install via Android Studio if empty
adb devices            # your phone, with USB debugging on
```

The SDK also needs `build-tools;35.0.0` and an accepted license, which
`gradlew` will refuse to fetch silently — it fails once with a licence
error and a `sdkmanager --licenses` pointer. Accepting it is a one-time,
non-interactive step (`yes | sdkmanager --licenses`, or the docs above).

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

That permits the *socket* — a separate gate, the WebView's own mixed-content
policy, blocks it anyway, because the app loads from `https://localhost` and
a fetch to `http://<lan-ip>:8787` from a secure origin is mixed content
regardless of what the network security config allows. `MainActivity.java`
sets `WebSettings.MIXED_CONTENT_ALWAYS_ALLOW` for debug builds to cover this;
if requests to the LAN API silently fail with nothing in `adb logcat` beyond
a "Mixed Content" warning, this is the first thing to check.

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

## 4. Run history

Run for the first time on 2026-08-02, on a Pixel 10 Pro XL over USB/LAN, to
verify the push wire end to end (`push.md`). `assembleDebug` and
`installDebug` both worked once three things were fixed — see `push.md`'s
"What is verified" for the detail:

- JDK 21 specifically (§0, above).
- `buildFeatures.buildConfig true` in `app/build.gradle`, and a fixed `--`
  inside an XML comment in `ic_launcher_background.xml` — both one-time repo
  fixes, already applied.
- The WebView mixed-content block (§2, above) — a one-time repo fix, already
  applied.

The desktop firewall (§1, above) still needs opening per-machine; it isn't a
repo fix and won't stay fixed across a new desktop or a firewall reset.
`curl http://<ip>:8787/health` from the phone's browser is still the fastest
way to tell "firewall" apart from "app bug" — both look identical from the
phone (nothing arrives, no error), but the browser test rules the app out.
