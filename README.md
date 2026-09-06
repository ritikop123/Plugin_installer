# Arix Theme Addon Suite for Pterodactyl Panel

A native, secure suite of Minecraft server management addons built specifically for Pterodactyl Panel with the **Arix Theme**:
- 🔌 **Plugin Installer**: Discover and install server plugins for Paper, Purpur, Spigot, Folia, Velocity, BungeeCord directly to `/plugins`.
- 📦 **Mods Installer**: Browse and install Forge, Fabric, NeoForge, and Quilt mods directly to `/mods`.
- ⚙️ **Software Installer**: Switch Minecraft server software (Vanilla, Paper, Purpur, Fabric, Forge, NeoForge, Folia, etc.) with build selection and optional server file wipe.

Repository: [https://github.com/ritikop123/Plugin_installer](https://github.com/ritikop123/Plugin_installer)

---

## ⚡ 1-Click Master Installer (VPS Terminal as root)

Run this single command on your Pterodactyl VPS:

```bash
bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/install-arix.sh?$(date +%s)")
```

### Installation Menu:
When executed, you will be prompted:
```text
Select an installation option:
  1) All: Plugins + Mods + Software Installers (Recommended)
  2) Plugin Installer only (/plugins)
  3) Mods Installer only (/mods)
  4) Software Installer only (/software)
  5) Uninstall All
Enter choice [1-5] (Default: 1): 
```
*(Press Enter or `1` to install all three addons together in a single build pass!)*

---

## 🔗 Arix Theme Setup ("Create link in Server Tools")

In your Pterodactyl panel:
1. Open **Arix Theme Settings** (or Admin Theme Editor).
2. Go to **"Create link in Server Tools"**.
3. Create the links for the addons you have installed:

| Feature | URL in Arix | Icon | Notes |
| :--- | :--- | :--- | :--- |
| **Plugin Installer** | **`/plugins`** | `HiOutlinePuzzle` | Manages `/plugins` directory. |
| **Mods Installer** | **`/mods`** | `HiOutlineCubeTransparent` | Manages `/mods` directory. |
| **Software Installer** | **`/software`** | `HiOutlineServer` | Version Changer for server software. |

*Be sure to set **Enable link: ON (Checked)*** for each link.*

---

## ⚙️ Features Overview

### 1. Plugin Installer (`/server/<id>/plugins`)
- Modrinth API integration with search, filters, and dynamic version detection.
- **Installed Detection**: Cards dynamically detect whether a plugin is already in `/plugins` and display `✓ Installed` with a 1-click red trash button.
- **Installed Tab**: 3-column card grid showing puzzle icon, filename, size, and delete button.

### 2. Mods Installer (`/server/<id>/mods`)
- Modrinth Mods catalog targeting `/mods`.
- Filter by mod loaders: **All Loaders**, **Fabric**, **Forge**, **NeoForge**, **Quilt**.
- Minecraft version filter.
- Dynamic installed detection and 3-column card grid in Installed tab.

### 3. Software Installer (`/server/<id>/software`)
- Powered by official **MCJars v2 API** (`mcjars.app/api/v2`).
- **Screen 1**: Software catalog grid (Vanilla, Paper, Pufferfish, Spigot, Folia, Purpur, Waterfall, Velocity, Fabric, BungeeCord, Quilt, Forge, NeoForge, Mohist, Arclight, Sponge, Leaves, Canvas).
- **Screen 2**: Version selector with `Go Back` button and `Show Snapshot Versions` filter toggle.
- **Screen 3**: Install modal with Build selector dropdown, **WIPE SERVER FILES** toggle switch with warning, and Install action button.

---

## 🗑️ Uninstallation

To cleanly remove all addons, restore original routes, and recompile assets:

```bash
bash <(curl -sH 'Cache-Control: no-cache' "https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/uninstall-arix.sh?$(date +%s)")
```

---

## 📂 Repository File Structure

```text
Plugin_installer/
├── install-arix.sh                     # Master 1-click installer (Plugins + Mods + Software)
├── uninstall-arix.sh                   # Clean uninstaller for all addons
├── README.md
└── pterodactyl-addon/
    ├── PluginInstallerContainer.tsx    # React component for Plugins
    ├── PluginInstallerController.php   # Laravel controller for Plugins
    ├── ModInstallerContainer.tsx       # React component for Mods
    ├── ModInstallerController.php      # Laravel controller for Mods
    ├── SoftwareInstallerContainer.tsx  # React component for Software
    └── SoftwareInstallerController.php # Laravel controller for Software
```
