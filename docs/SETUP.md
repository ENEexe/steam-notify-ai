# SFP setup tutorial (Linux)

This guide installs the Steam Notify AI Store script with [SFP](https://github.com/PhantomGamers/SFP). The separate Library Home “What’s New” CSS rule is not included in this project or this tutorial. SFP is an unofficial Steam customization tool; follow its [official install instructions](https://github.com/PhantomGamers/SFP#instructions) and [releases](https://github.com/PhantomGamers/SFP/releases).

> The Store script only highlights Steam's explicit developer disclosure; it does not hide games. Review `webkit.js` before enabling JavaScript injection.

## 1. Install SFP

1. Fully exit Steam and any running games before changing Steam files.
2. Download the latest Linux release from [SFP Releases](https://github.com/PhantomGamers/SFP/releases). The SFP README distinguishes framework-dependent `_net7` builds from `_SelfContained` builds; choose the one matching your installed .NET runtime.
3. Extract the archive and run `SFP_UI`.
4. Let SFP detect your Steam installation. Use SFP's **Open File** controls to locate the active customization files rather than assuming a Steam path.
5. Keep SFP running while Steam is open. SFP needs Steam's `-cef-enable-debugging` argument; when launching Steam through SFP it applies the required argument. If SFP offers to restart Steam to add it, first save/exit every running game.

## 2. Enable JavaScript injection in SFP

1. In SFP, select the default `steamui` skin (or the skin whose files are opened by the **Open File** controls).
2. Read and accept SFP's JavaScript-injection warning only after reviewing this repository's `webkit.js`; then enable **JavaScript injection**.
3. If your SFP version exposes **Inject on Steam Start**, enable it if you want the customization applied automatically on later Steam launches. SFP itself must still be running.

SFP's default Store/community JavaScript target is `Steam/steamui/webkit.js`. The AI badge styles are injected by `webkit.js`; this project does not need a separate Store CSS file. The Library Home `libraryroot.custom.css` rule is a separate customization and is not part of this repository.

## 3. Back up existing files

Find the Steam root using SFP's **Open File** controls. If you prefer the shell, the Steam root is often `~/.steam/steam`, but library/custom installations differ. Set `STEAM_ROOT` to the actual directory and confirm it contains `steamui/`:

```bash
STEAM_ROOT="$HOME/.steam/steam"  # change this to your actual Steam root
test -d "$STEAM_ROOT/steamui" || { printf 'Steam root not found: %s\n' "$STEAM_ROOT"; exit 1; }
```

For a first install, preserve an existing Store script once:

```bash
[ ! -f "$STEAM_ROOT/steamui/webkit.js" ] || \
  cp -n "$STEAM_ROOT/steamui/webkit.js" "$STEAM_ROOT/steamui/webkit.js.pre-steam-notify-ai"
```

`cp -n` intentionally keeps the original first-install backup and will not replace it on later updates. Before each update, create a fresh, timestamped copy instead:

```bash
cp "$STEAM_ROOT/steamui/webkit.js" "$STEAM_ROOT/steamui/webkit.js.before-update-$(date +%Y%m%d-%H%M%S)"
```

Do not make Steam files read-only; Steam must remain able to update normally.

## 4. Install the JavaScript

From the root of this repository, copy `webkit.js` to the Steam `steamui` directory:

```bash
cp webkit.js "$STEAM_ROOT/steamui/webkit.js"
```

Or use SFP's **Open File** control for the Store JavaScript target and copy the repository's `webkit.js` there. The separate Library CSS rule is outside this project; leave it unchanged.

## 5. Start Steam and verify injection

1. Start Steam with SFP active. Do not expose Steam's CEF/DevTools listener to your network; keep it bound to loopback.
2. Open SFP's log file. On Linux the usual path is `~/.config/PhantomGamers/SFP/SFP.log`.
3. Confirm the log reports injection of `webkit.js` into `store.steampowered.com`.
4. Open a Store listing with a developer-authored **AI Generated Content Disclosure**. A matching card should receive an outline/badge, and its product page should show a disclosure banner near the purchase/editions area. The script does not mark games based on suspicion or community reports.

## 6. Run the tests (optional)

Node.js is needed only for development tests; the addon itself has no npm dependencies.

```bash
node --check webkit.js
node --test tests/*.test.cjs
```

## 7. Update or remove

- **Update:** close Steam, make a fresh timestamped backup as described in step 3, copy the new repository version, then restart through SFP and check its injection log. This project does not manage the separate Library Home CSS rule.
- **Remove:** close Steam; restore `.pre-steam-notify-ai` to return to the pre-install script, or restore the latest `.before-update-*` snapshot to return to the previous project version. If no prior script existed, delete only the `webkit.js` file installed for this project. Disable JavaScript injection in SFP if no other trusted scripts require it. Do not disable Steam updates or alter game/account data.
