# Arix Theme Addon Suite for Pterodactyl Panel

A native, secure suite of Minecraft server management addons built specifically for Pterodactyl Panel with the **Arix Theme**:
- 👥 **Player Manager**: Real-time player monitoring (current / max players), interactive 3D player models with Cracked (Steve) / Premium skin rendering, authentic in-game inventory inspector with Ender Chest, one-click player management (OP/De-OP, Kick, Ban, Unban, Heal, Feed, Clear Inventory, Gamemode), and dedicated Banned Players manager.
- 🔌 **Plugin Installer**: Discover and install server plugins for Paper, Purpur, Spigot, Folia, Velocity, BungeeCord, Waterfall, and Bukkit directly to `/plugins`.
- 📦 **Mods Installer**: Browse and install Forge, Fabric, NeoForge, and Quilt mods directly to `/mods`.
- 🗃️ **Modpacks Installer**: One-click install complete Modrinth modpacks with configs, overrides, and live batch progress tracking.
- ⚙️ **Software Installer**: Switch Minecraft server software (Vanilla, Paper, Purpur, Fabric, Forge, NeoForge, Folia, etc.) with build selection and optional server file wipe.
- 🎛️ **Server Options & Properties**: Visual `server.properties` manager with authentic Minecraft multiplayer server banner, unchangeable server address badge with copy button, live MOTD color code editor & in-game preview, instant auto-save on every change, default Sagarmatha Hosting logo auto-seeding, 1-click .zip resource pack uploader, and expiration notice banners.
- ⏱️ **Admin Auto-Suspension & 3-Day Notice System**: Native expiration date scheduling on server creation and details, background auto-suspension via `ptero:auto-suspend`, and courteous 3-day notice emails sent to server owners.

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
  1) All: Plugins + Mods + Modpacks + Software + Options + Players (Recommended)
  2) Plugin Installer only (/plugins)
  3) Mods Installer only (/mods)
  4) Modpacks Installer only (/modpacks)
  5) Software Installer only (/software)
  6) Server Options & Properties only (/options)
  7) Player Manager only (/players)
  8) Uninstall All
Enter choice [1-8] (Default: 1): 
```
*(Press Enter or `1` to install all addons together in a single build pass!)*

---

## 🔗 Arix Theme Setup ("Create link in Server Tools")

In your Pterodactyl panel:
1. Open **Arix Theme Settings** (or Admin Theme Editor).
2. Go to **"Create link in Server Tools"**.
3. Create the links for the addons you have installed:

| Feature | URL in Arix | Icon | Notes |
| :--- | :--- | :--- | :--- |
| **Player Manager** | **`/players`** | `HiOutlineUsers` | Real-time 3D model, inventory & ban management. |
| **Plugin Installer** | **`/plugins`** | `HiOutlinePuzzle` | Manages `/plugins` directory. |
| **Mods Installer** | **`/mods`** | `HiOutlineCubeTransparent` | Manages `/mods` directory. |
| **Modpacks Installer** | **`/modpacks`** | `HiOutlineCollection` | Installs full modpacks with configs & overrides. |
| **Software Installer** | **`/software`** | `HiOutlineServer` | Version Changer for server software. |
| **Server Options** | **`/options`** | `HiOutlineAdjustments` | Visual server.properties, MOTD editor & icon uploader. |

*Be sure to set **Enable link: ON (Checked)*** for each link.*

---

## ⚙️ Features Overview

### 1. Player Manager (`/server/<id>/players`)
- **Live Online / Max Players Header**: Real-time counter (`🟢 4 / 20 Players Online`) with capacity progress bar, server status badge, and search filter.
- **Interactive 3D Player Models**:
  - WebGL 3D player model powered by `skinview3d` with smooth walking, running, or idle animations.
  - Interactive 360° mouse drag rotation, zoom, and auto-rotate toggle.
  - **Cracked / Offline Mode Detection**: Unskinned cracked accounts render with the classic **Steve** 3D model and skin.
  - **Premium Accounts**: Fetches official Mojang skins with 64×64 pixelated head avatars.
- **In-Game Inventory & Equipment Viewer**:
  - **Equipment Row**: Displays Helmet, Chestplate, Leggings, Boots, and Offhand with authentic item icons and silhouette placeholders when empty.
  - **Main Inventory & Hotbar**: Authentic 3×9 main inventory grid (slots 9–35) and 1×9 hotbar (slots 0–8).
  - **Ender Chest Inspector**: Switch to view full 27-slot Ender Chest contents.
  - **Pure PHP Binary NBT Parser**: Direct reading of `playerdata/<uuid>.dat` without external dependencies.
  - **Rich Hover Tooltips**: Formatted item names, identifier (`minecraft:...`), enchantment lists (e.g. `Sharpness V`, `Looting III`), lore, and durability damage.
  - **Live Player Attributes**: Health hearts (HP / 20), Hunger drumsticks (Food / 20), Experience level and progress, Gamemode badge, Dimension badge, and Coordinates (X, Y, Z).
- **Player Actions Control**:
  - 👑 **Give OP / Revoke OP**: Instant operator status toggle.
  - 💖 **Heal**: Instantly restores player to full health.
  - 🍗 **Feed**: Instantly fills player hunger to 20.
  - 🧹 **Clear Inventory**: Clears all items with a confirmation prompt.
  - 🥾 **Kick**: Kick player with custom reason dialog.
  - 🔨 **Ban**: Ban player with reason prompt and optional IP ban (`/ban-ip`).
  - 🎮 **Gamemode Switcher**: 1-click switcher between Survival, Creative, Adventure, and Spectator.
- **Dedicated Banned Players Tab (`Players | Banned players`)**:
  - Switch tabs to view all banned players from `banned-players.json`.
  - Displays player heads, ban reason badges, ban dates, and source.
  - Click any banned player to open their management GUI showing their **3D skin model**, **last known in-game inventory prior to ban**, and a prominent **Unban** button (`/pardon`).

### 2. Server Options & Properties (`/server/<id>/options`)
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

### 3. Plugin Installer (`/server/<id>/plugins`)
- Modrinth API integration with search, filters, and dynamic version detection.
- Filter strictly by plugins and plugin loaders: Paper, Purpur, Folia, Spigot, Velocity, Waterfall, BungeeCord, Bukkit.
- **Installed Detection**: Cards dynamically detect whether a plugin is already in `/plugins` and display `✓ Installed` with a 1-click red trash button.
- **Installed Tab**: 3-column card grid showing puzzle icon, filename, size, and delete button.

### 4. Mods Installer (`/server/<id>/mods`)
- Modrinth Mods catalog targeting `/mods`.
- Filter by mod loaders: **All Loaders**, **Fabric**, **Forge**, **NeoForge**, **Quilt**.
- Minecraft version filter.
- Dynamic installed detection and 3-column card grid in Installed tab.

### 5. Modpacks Installer (`/server/<id>/modpacks`)
- Modrinth Modpacks catalog with categories: **Adventure**, **Technology**, **Magic**, **Quests**, **Optimization**, etc.
- **Native Wings Decompression**: Delegates heavy extraction to Wings daemon native commands, eliminating PHP timeouts.
- **Chunked Batch Installation**: Streams mod downloads in batches with an interactive progress bar and estimated time notice.
- **Wipe Modes**:
  - *Wipe Mods & Configs (Recommended)*: Cleans existing `/mods` and `/config` folders for a conflict-free install without deleting worlds.
  - *Wipe Entire Server*: Completely resets the server.
  - *Keep Existing Files*: Merges with existing files.
- **Installed Tab & Manifest**: Automatically records `.pterodactyl-modpack.json` on the server and provides a 1-click **Uninstall Modpack** button.

### 6. Software Installer (`/server/<id>/software`)
- Powered by official **MCJars v2 API** (`mcjars.app/api/v2`).
- **Screen 1**: Software catalog grid (Vanilla, Paper, Pufferfish, Spigot, Folia, Purpur, Waterfall, Velocity, Fabric, BungeeCord, Quilt, Forge, NeoForge, Mohist, Arclight, Sponge, Leaves, Canvas).
- **Screen 2**: Version selector with `Go Back` button and `Show Snapshot Versions` filter toggle.
- **Screen 3**: Install modal with Build selector dropdown, **WIPE SERVER FILES** toggle switch with warning, and Install action button.

### 7. Admin Auto-Suspension & 3-Day Expiration Notice System
- **Admin Server Creation Card**: Native HTML5 datetime picker box placed prominently above "Core Details" (`admin/servers/new`) allowing admins to set an optional expiration date.
- **Admin Server Details Management**: View, extend, or clear expiration date at any time in `admin/servers/view/{id}/details`.
- **Automated Suspension Daemon**: Scheduled command (`php artisan ptero:auto-suspend`) executes every 5 minutes through Pterodactyl's native cron scheduler, suspending expired servers automatically via `SuspensionService` and syncing with Wings.
- **Courteous 3-Day Owner Notification**:
  - Automatically notifies the server owner via email exactly 3 days (72 hours) before expiration.
  - Zero spam: tracks warning timestamps to ensure owners receive exactly one polite notice per renewal period.
- **In-Panel Expiration Alerts**:
  - A prominent alert banner appears in the server options view (`/options`) when a server has 3 days or fewer remaining, displaying exact days and renewal reminders.
  - If suspended, a clear suspension notice informs the user without confusing technical jargon.

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
├── install-arix.sh                     # Master 1-click installer (Plugins, Mods, Modpacks, Software, Options, Players, Auto-Suspension)
├── uninstall-arix.sh                   # Clean uninstaller for all addons
├── README.md
└── pterodactyl-addon/
    ├── PlayerManagerContainer.tsx      # React component for Player Manager (3D Model, Inventory, Bans)
    ├── PlayerManagerController.php     # Laravel controller for Player Manager (SLP Ping, NBT parser, Actions)
    ├── PluginInstallerContainer.tsx    # React component for Plugins
    ├── PluginInstallerController.php   # Laravel controller for Plugins
    ├── ModInstallerContainer.tsx       # React component for Mods
    ├── ModInstallerController.php      # Laravel controller for Mods
    ├── ModpackInstallerContainer.tsx   # React component for Modpacks
    ├── ModpackInstallerController.php  # Laravel controller for Modpacks
    ├── SoftwareInstallerContainer.tsx  # React component for Software
    ├── SoftwareInstallerController.php # Laravel controller for Software
    ├── OptionsContainer.tsx            # React component for Options, MOTD, and Expiration Alerts
    ├── OptionsController.php           # Laravel controller for Options, server.properties & resourcepack
    ├── AutoSuspendServersCommand.php   # Artisan command for automated suspension & 3-day notice
    ├── ServerSuspensionWarningNotification.php # Courteous email notification for server owners
    ├── migrations/                     # Database migration adding expire_at and warning timestamp
    ├── logo_minecraft.png              # 64x64 default server icon (auto-seeded to /server-icon.png)
    └── logo_highqualtiy.png            # High-resolution Sagarmatha Hosting logo for web GUI
```
