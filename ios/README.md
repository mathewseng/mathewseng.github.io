# Pocket Site for iPhone and iPad

A SwiftUI app that opens Backgammon and includes the entire assembled website,
including Gym. It runs on iOS/iPadOS 17 or later. Backgammon's GNUbg WASM engine,
databases, opening books, trainer, Solver and Library are bundled: first launch
does not need an engine download or a prior visit to the website.

## Run on your iPhone

1. Install Xcode and Node 22+. From the repository root run
   `npm --prefix gym ci` once.
2. Open `ios/PocketSite.xcodeproj` in Xcode and select the **PocketSite** scheme.
3. In **Signing & Capabilities**, select your Apple development team. Change the
   bundle identifier if your team requires a different one.
4. Connect and select your iPhone, enable Developer Mode if iOS requests it, and
   press **Run**. Once installed, launch **Pocket Site** from the Home Screen.

The Xcode build compiles Gym and bundles the current site automatically. It
requires Node 22+ on PATH or an existing nvm installation with Node 22. No CocoaPods,
third-party native framework, remote server, or JavaScript package for the wrapper
is needed. An Apple signing team is required for a physical-device install;
Simulator builds need no signing account. This repository does not provision
certificates or publish to TestFlight/the App Store.

## Use

- The dice button opens Backgammon Play; the grid opens the website homepage.
- Swipe back/forward or use the native arrows. The app remembers the last route.
- **App menu → Offline library** opens a native directory of the project families
  and shows the bundled page count, size and Git revision.
- Local game state uses persistent WKWebView storage. Website/Safari saves are
  separate. Backgammon Library's backup export opens the iOS share sheet; choose
  **Save to Files**. Its normal import control opens the Files picker.
- Multiplayer, external links, and remote embedded media/historical images still
  need internet. Archived prototypes retain their existing limitations. External
  links open outside the app. Absolute links to this website stay in the local copy.
- Install a new app build for updated pages. Reinstalling over the existing app
  preserves storage; deleting the app deletes its local saves. Export a backup
  before deleting it. Analysis pauses when iOS suspends the app.

The app is roughly 330 MB uncompressed because it includes the published reports,
reference data, and GNUbg's corresponding source archives and licenses. No remote
content cache needs to be filled before playing offline.

## Architecture

`scripts/prepare-site.sh` invokes the shared `scripts/assemble-site.sh`, which
excludes `ios/` from website publication and from recursive bundling. It generates
a native adapter and license/source directory **only inside the built app**.
Website source files, paths and backgammon offline-manifest hashes stay intact.
The adapter disables website service workers before page modules run; native app
updates replace one complete immutable release. Optional online PeerJS scripts
load asynchronously so offline card tables can initialize immediately.

`LocalSiteServer.swift` serves only the app's bundled `Site` directory, bound to
`127.0.0.1:18973`. A fixed loopback HTTP origin enables modules, workers, WebCrypto,
WASM and IndexedDB, while preserving the storage origin across app launches.
It rejects traversal/symlink escapes, unexpected Host headers and write methods;
it supports correct MIME types, HEAD and byte ranges. It exposes no LAN listener.
ATS is exempted only for local networking.

`SiteBrowser.swift` owns a persistent WKWebView, navigation, crash recovery,
JavaScript dialogs and WKDownload-based Files/share exports. SwiftUI provides
safe-area-aware native navigation and the library sheet. Content keeps the
website's existing responsive design, touch board and appearance controls.

## Checks

From the repository root:

```sh
node --test ios/scripts/prepare-bundle.test.mjs
xcodebuild -project ios/PocketSite.xcodeproj -scheme PocketSite \
  -sdk iphonesimulator -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO build
xcrun simctl list devices available
# Replace the UUID with an installed iPhone/iPad Simulator:
xcodebuild -project ios/PocketSite.xcodeproj -scheme PocketSite \
  -destination 'platform=iOS Simulator,id=YOUR-SIMULATOR-UUID' \
  -derivedDataPath ios/build CODE_SIGNING_ALLOWED=NO test
```

The hosted XCTest suite validates bundle routes, WASM MIME/magic bytes, HEAD,
ranges, errors, directory redirects, Host validation and traversal prevention.
Its real WKWebView blocks all non-loopback HTTP requests, loads the actual GNUbg
module worker, scores a legal position, writes IndexedDB/localStorage and verifies
both survive a reload. Browser tests alone are not the evidence for iOS engine
support. The suite also verifies Blob backup exports reach the native download
delegate with the original JSON bytes, and rejects filesystem symlink escapes.
Physical-device installation and airplane-mode checks are still useful
before distributing a signed build.

Run the repository checks from the root README for site changes. Regenerate the
icon from the site's real SVG board with `node ios/scripts/generate-icon.cjs`
(root Playwright dependencies and Chromium required). Generated app content,
build products and test results are ignored by Git.
