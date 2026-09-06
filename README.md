# Arix Theme Plugin & Mod Installers for Pterodactyl Panel

Native, secure Minecraft **Plugin Manager** and **Mods Manager** built specifically for Pterodactyl Panel with the **Arix Theme**.

Repository: [https://github.com/ritikop123/Plugin_installer](https://github.com/ritikop123/Plugin_installer)

---

## ⚡ 1-Click Installers (Run as root on your VPS)

### 🔌 Option 1: Minecraft Plugin Manager (`/server/<id>/plugins`)
Installs the Plugin Manager targeting the **`/plugins`** directory (Paper, Purpur, Spigot, BungeeCord, Velocity, Folia).

```bash
bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/install-arix.sh?$(date +%s)")
```

### 📦 Option 2: Minecraft Mods Manager (`/server/<id>/mods`)
Installs the Mods Manager targeting the **`/mods`** directory (Forge, Fabric, NeoForge, Quilt).

```bash
bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/install-mods.sh?$(date +%s)")
```

---

## 🏗️ Architecture

Both addons integrate directly into Pterodactyl's native architecture without requiring Blueprint or external daemons:

```text
Browser (Arix Theme)
   ↓
React Component (PluginInstallerContainer.tsx / ModInstallerContainer.tsx)
   ↓
Pterodactyl Authenticated API (/api/client/servers/{server}/plugins OR /mods)
   ↓
Laravel PHP Controller (PluginInstallerController.php / ModInstallerController.php)
   ↓
Modrinth Public API v2  /  Pterodactyl Wings Daemon
   ↓
Minecraft Server Container (/plugins OR /mods directory)
```

- **Zero API Tokens**: Uses the public Modrinth API with an identifying `User-Agent`. No secrets in frontend or backend.
- **SSRF & Path Traversal Protected**: Strict HTTPS validation restricted to `cdn.modrinth.com` and strict filename sanitization preventing directory traversal.
- **Native Routing**: Registered directly in `resources/scripts/routers/routes.ts` with `name: undefined` so Arix provides the navigation link in Server Tools without duplicate standard navigation items.
- **Native Vector Icons**: Uses Pterodactyl's core `@fortawesome/react-fontawesome` SVG components for 100% reliable rendering without external font stylesheet dependencies.
- **Installed Detection & 1-Click Uninstall**: Dynamically inspects server container files and provides instant 1-click deletion buttons directly on cards.

---

## 🔗 Arix Theme Setup ("Create link in Server Tools")

In your Pterodactyl panel:
1. Open **Arix Theme settings** (or Admin Theme Editor).
2. Go to **"Create link in Server Tools"**.

### Link for Plugin Manager:
| Field | Value to Enter |
| :--- | :--- |
| **Name** | `Plugin Installer` |
| **URL** | **`/plugins`** |
| **Icon** | `HiOutlinePuzzle` |
| **Enable link** | **ON** |

### Link for Mods Manager:
| Field | Value to Enter |
| :--- | :--- |
| **Name** | `Mods Manager` |
| **URL** | **`/mods`** |
| **Icon** | `HiOutlineCubeTransparent` (or `HiOutlinePuzzle`) |
| **Enable link** | **ON** |

---

## 🗑️ Uninstallation

To cleanly remove either addon, restore original routes, and recompile assets:

- **Uninstall Plugin Manager:**
  ```bash
  bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/uninstall-arix.sh?$(date +%s)")
  ```

- **Uninstall Mods Manager:**
  ```bash
  bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/uninstall-mods.sh?$(date +%s)")
  ```

---

## 📂 Repository File Structure

```text
Plugin_installer/
├── install-arix.sh                    # 1-click Plugin Manager installer
├── uninstall-arix.sh                  # Plugin Manager uninstaller
├── install-mods.sh                    # 1-click Mods Manager installer
├── uninstall-mods.sh                  # Mods Manager uninstaller
├── README.md
└── pterodactyl-addon/
    ├── PluginInstallerContainer.tsx   # React component for Plugins
    ├── PluginInstallerController.php  # Laravel controller for Plugins
    ├── ModInstallerContainer.tsx      # React component for Mods
    └── ModInstallerController.php     # Laravel controller for Mods
```
