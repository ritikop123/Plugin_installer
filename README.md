# Arix Theme Plugin Installer for Pterodactyl Panel

A native, secure Minecraft Plugin Installer built specifically for Pterodactyl Panel with the **Arix Theme**.

Repository: [https://github.com/ritikop123/Plugin_installer](https://github.com/ritikop123/Plugin_installer)

---

## 🏗️ Architecture

This addon integrates directly into Pterodactyl's native architecture without requiring Blueprint or external daemons:

```text
Browser (Arix Theme)
   ↓
React Component (PluginInstallerContainer.tsx)
   ↓
Pterodactyl Authenticated API (/api/client/servers/{server}/plugins)
   ↓
Laravel PHP Controller (PluginInstallerController.php)
   ↓
Modrinth Public API v2  /  Pterodactyl Wings Daemon
   ↓
Minecraft Server Container (/plugins directory)
```

- **Zero API Tokens**: Uses the public Modrinth API with an identifying `User-Agent`. No secrets in frontend or backend.
- **SSRF & Path Traversal Protected**: Strict HTTPS validation restricted to `cdn.modrinth.com` and strict filename sanitization preventing directory traversal.
- **Native Routing**: Registered directly in `resources/scripts/routers/routes.ts` with `name: undefined` so Arix provides the navigation link in Server Tools without duplicate standard navigation items.

---

## ⚡ 1-Click Installation (VPS Terminal as root)

Run this single command on your Pterodactyl VPS:

```bash
bash <(curl -s https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/install-arix.sh)
```

### What the installer does:
1. Verifies your Pterodactyl installation and source tree structure.
2. Creates an automatic timestamped backup at `/var/backups/arix-plugin-installer/<timestamp>/` with automatic rollback on any failure.
3. Cleans any previous legacy or conflicting installer files.
4. Installs the PHP Controller at `app/Http/Controllers/Api/Client/Servers/PluginInstallerController.php`.
5. Registers the API routes in `routes/api-client.php`.
6. Installs the React component at `resources/scripts/components/server/plugin-installer/PluginInstallerContainer.tsx`.
7. Registers the route in `resources/scripts/routers/routes.ts`.
8. Compiles production assets with `yarn build:production`.
9. Clears Laravel route, view, and config caches.

---

## 🔗 Arix Theme Setup ("Create link in Server Tools")

In your Pterodactyl panel:
1. Open **Arix Theme settings** (or Admin Theme Editor).
2. Go to **"Create link in Server Tools"**.
3. Enter the following values:

| Field | Value to Enter | Notes |
| :--- | :--- | :--- |
| **Name** | `Plugin Installer` | Label displayed in server tools. |
| **URL** | **`/plugins`** | Relative server route handled by Pterodactyl router. |
| **Icon** | `HiOutlinePuzzle` | Clean puzzle piece icon. |
| **Enable link** | **ON** | Toggle active. |

When you navigate to any server (`https://gp.sagarmatha.site/server/<server-id>`) and click **Plugin Installer** in Server Tools, it opens **`/server/<server-id>/plugins`** natively inside your server dashboard!

---

## 🗑️ Uninstallation

To cleanly remove the addon, restore original routes, and recompile assets:

```bash
bash <(curl -s https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/uninstall-arix.sh)
```

---

## 📂 Repository File Structure

```text
Plugin_installer/
├── install-arix.sh
├── uninstall-arix.sh
├── README.md
└── pterodactyl-addon/
    ├── PluginInstallerContainer.tsx
    └── PluginInstallerController.php
```
