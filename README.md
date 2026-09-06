# Arix Theme Addon Suite for Pterodactyl Panel

A native, secure suite of Minecraft server management addons built specifically for Pterodactyl Panel with the **Arix Theme**:
- 🔌 **Plugin Installer**: Discover and install server plugins for Paper, Purpur, Spigot, Folia, Velocity, BungeeCord, Waterfall, and Bukkit directly to `/plugins`.
- 📦 **Mods Installer**: Browse and install Forge, Fabric, NeoForge, and Quilt mods directly to `/mods`.
- 🗃️ **Modpacks Installer**: One-click install complete Modrinth modpacks with configs, overrides, and live batch progress tracking.
- ⚙️ **Software Installer**: Switch Minecraft server software (Vanilla, Paper, Purpur, Fabric, Forge, NeoForge, Folia, etc.) with build selection and optional server file wipe.
- 🎛️ **Server Options & Properties**: Visual `server.properties` manager with authentic Minecraft multiplayer server banner, read-only allocation IP/port badge with copy button, live MOTD color code editor & in-game preview, and 64x64 server icon uploader.

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
  1) All: Plugins + Mods + Modpacks + Software + Options (Recommended)
  2) Plugin Installer only (/plugins)
  3) Mods Installer only (/mods)
  4) Modpacks Installer only (/modpacks)
  5) Software Installer only (/software)
  6) Server Options & Properties only (/options)
  7) Uninstall All
Enter choice [1-7] (Default: 1): 
```
*(Press Enter or `1` to install all five addons together in a single build pass!)*

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
| **Modpacks Installer** | **`/modpacks`** | `HiOutlineCollection` | Installs full modpacks with configs & overrides. |
| **Software Installer** | **`/software`** | `HiOutlineServer` | Version Changer for server software. |
| **Server Options** | **`/options`** | `HiOutlineAdjustments` | Visual server.properties, MOTD editor & icon uploader. |

*Be sure to set **Enable link: ON (Checked)*** for each link.*

---

## ⚙️ Features Overview

### 1. Server Options & Properties (`/server/<id>/options`)
- **Multiplayer Server Banner**: Authentic Minecraft multiplayer server list card styling.
- **Unchangeable Allocation Address**: Displays primary server IP / domain and port with 1-click copy feedback and read-only lock badge.
- **Default & Custom Server Icon Manager**:
  - Automatically seeds the default **Sagarmatha Hosting 64×64 logo** to `/server-icon.png` in every server root.
  - Tap/click to upload any custom image; client-side HTML5 canvas automatically scales/crops it to a 64×64 PNG before uploading.
  - 1-click revert to restore default Sagarmatha Hosting icon anytime.
- **Default MOTD & Color Palette Editor**:
  - Automatically sets default MOTD: `Server Hosting at §b§n§lSagarmatha Hosting`.
  - Full 16-color palette (`§0` - `§f`) and formatting styles (Bold `§l`, Italic `§o`, Underline `§n`, Strikethrough `§m`, Magic `§k`, Reset `§r`).
  - Supports both `§` and `&` formatting prefixes with live in-game preview.
- **1-Click Resource Pack (.zip) Upload**:
  - Drag & drop or click to upload any `.zip` resource pack directly.
  - Automatically hosts on panel, computes SHA-1 checksum, and configures `resource-pack` & `resource-pack-sha1` in `server.properties`.
- **Visual `server.properties` GUI Grid**:
  - **General Settings**: Max Players / Slots stepper, Gamemode dropdown, Difficulty dropdown, Hardcore toggle, Force Gamemode toggle.
  - **Access & Security**: Cracked / Offline mode toggle, Whitelist toggle, Enforce Whitelist toggle, Block VPN/Proxy toggle.
  - **Gameplay & Combat**: PvP toggle, Allow Flight toggle, Command Blocks toggle, Nether toggle, Spawn Protection radius stepper.
  - **World & Spawning**: Spawn Monsters toggle, Spawn Animals toggle, Spawn NPCs/Villagers toggle, View Distance stepper, Simulation Distance stepper.
- **Instant Auto-Save**: Every setting, switch, stepper, and MOTD edit auto-saves instantly with debounced background synchronization (no manual save button needed).

### 2. Plugin Installer (`/server/<id>/plugins`)
- Modrinth API integration with search, filters, and dynamic version detection.
- Filter strictly by plugins and plugin loaders: Paper, Purpur, Folia, Spigot, Velocity, Waterfall, BungeeCord, Bukkit.
- **Installed Detection**: Cards dynamically detect whether a plugin is already in `/plugins` and display `✓ Installed` with a 1-click red trash button.
- **Installed Tab**: 3-column card grid showing puzzle icon, filename, size, and delete button.

### 3. Mods Installer (`/server/<id>/mods`)
- Modrinth Mods catalog targeting `/mods`.
- Filter by mod loaders: **All Loaders**, **Fabric**, **Forge**, **NeoForge**, **Quilt**.
- Minecraft version filter.
- Dynamic installed detection and 3-column card grid in Installed tab.

### 4. Modpacks Installer (`/server/<id>/modpacks`)
- Modrinth Modpacks catalog with categories: **Adventure**, **Technology**, **Magic**, **Quests**, **Optimization**, etc.
- **Native Wings Decompression**: Delegates heavy extraction to Wings daemon native commands, eliminating PHP timeouts.
- **Chunked Batch Installation**: Streams mod downloads in batches with an interactive progress bar and estimated time notice.
- **Wipe Modes**:
  - *Wipe Mods & Configs (Recommended)*: Cleans existing `/mods` and `/config` folders for a conflict-free install without deleting worlds.
  - *Wipe Entire Server*: Completely resets the server.
  - *Keep Existing Files*: Merges with existing files.
- **Installed Tab & Manifest**: Automatically records `.pterodactyl-modpack.json` on the server and provides a 1-click **Uninstall Modpack** button.

### 5. Software Installer (`/server/<id>/software`)
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
├── install-arix.sh                     # Master 1-click installer (Plugins + Mods + Modpacks + Software + Options)
├── uninstall-arix.sh                   # Clean uninstaller for all addons
├── README.md
└── pterodactyl-addon/
    ├── PluginInstallerContainer.tsx    # React component for Plugins
    ├── PluginInstallerController.php   # Laravel controller for Plugins
    ├── ModInstallerContainer.tsx       # React component for Mods
    ├── ModInstallerController.php      # Laravel controller for Mods
    ├── ModpackInstallerContainer.tsx   # React component for Modpacks
    ├── ModpackInstallerController.php  # Laravel controller for Modpacks
    ├── SoftwareInstallerContainer.tsx  # React component for Software
    ├── SoftwareInstallerController.php # Laravel controller for Software
    ├── OptionsContainer.tsx            # React component for Options & MOTD
    └── OptionsController.php           # Laravel controller for Options & server.properties
```
