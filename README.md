# Arix Theme Plugin Installer (Modrinth Integration)

A high-performance Minecraft Plugin Installer designed to match the **Arix Theme** aesthetic for Pterodactyl Panel, powered by the **Modrinth API v2**.

Repository: [https://github.com/ritikop123/Plugin_installer](https://github.com/ritikop123/Plugin_installer)

---

## ⚡ 1-Click Installation on Pterodactyl Server

Run this single command on your Pterodactyl VPS:

```bash
bash <(curl -s https://raw.githubusercontent.com/ritikop123/Plugin_installer/main/install.sh)
```

---

## 🔗 Arix Theme: "Create link in Server Tools" Settings

When adding the link in your Arix Theme settings (as shown in your screenshot):

| Field | Enter Exactly This | Explanation |
| :--- | :--- | :--- |
| **Name** | `Plugin Installer` | The label shown in your server tools sidebar. |
| **URL** | `/plugins/index.html` (or `/plugins`) | Path where the built installer is hosted on Pterodactyl. |
| **Icon** | `HiOutlinePuzzle` | Clean puzzle piece icon matching plugins in Heroicons. *(Or `HiOutlineCube` / `HiOutlineDownload`)* |
| **Enable link** | **Toggle ON** | Activates the button for your users. |

---

From your screenshot on `modrinth.com/settings/pats`:

### Step 1: Handle Any Account Warning Banner
At the top of your Modrinth screen, notice if there is a warning:
> ⚠️ **Account action required:** *For security reasons, Modrinth needs you to verify your email...*

If you see this banner:
1. Click the button on the right: **"Re-send verification email"**.
2. Open your email inbox and click the verification link from Modrinth.
3. Refresh the `modrinth.com/settings/pats` page.

---

### Step 2: Fill Out the "Create Personal Access Token" Dialog

In the popup modal shown in your screenshot:

1. **Name**:
   Enter any name, for example:
   ```text
   Arix Plugin Installer
   ```
   *(or `Pterodactyl Plugins`)*

2. **Scopes**:
   Select **ONLY the following read permissions**:
   - Under **Projects**:
     - ☑️ **`Read projects`** *(Allows viewing project details and info)*
   - Under **Versions**:
     - ☑️ **`Read versions`** *(Allows viewing versions and downloading `.jar` files)*
   - Under **User account**:
     - ☑️ **`Read user data`** *(Allows validating the token connection)*

   > 🔒 **Security Tip:** Do **NOT** select any `Write` or `Delete` scopes (`Write projects`, `Delete projects`, `Write user data`, etc.). Only `Read` permissions are needed to search, view, and install plugins.

3. **Generate and Copy**:
   - Click the green **"Create"** button at the bottom of the dialog.
   - Modrinth will generate a token string starting with `mrp_...`.
   - Click **Copy** immediately and keep it safe (Modrinth will not show it again).

---

## 🚀 2. How to Run the Installer Locally

Open a terminal in this folder (`c:\Users\wgues\OneDrive\Documents\Plugin installer`) and run:

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev
```

The application will launch in your browser at `http://localhost:3000`.

---

## 🎨 3. Features Matching the Arix Theme

1. **Header Controls**:
   - **Search Bar**: Real-time debounced query across thousands of plugins on Modrinth.
   - **Software Selector**: Filter by `Paper`, `Purpur`, `Spigot`, `Folia`, `Velocity`, `BungeeCord`, `Fabric`, or `All`.
   - **Minecraft Version Selector**: Filter by game versions (`1.21.4`, `1.21`, `1.20.4`, `1.20.1`, `1.19.4`, `1.16.5`, etc.).
   - **Sort Selector**: Sort by Most Downloads, Relevance, Recently Updated, or Newest.
   - **Token Indicator**: Shows token connection status and allows instant testing/saving.

2. **Plugin Cards**:
   - High-res plugin icon, name, author, and description.
   - Download counter and follower stats.
   - Glowing software pills matching Arix theme colors (`#00d2ff` cyan, `#7952ff` violet, `#101522` carbon).
   - "Versions" button opening the version popup modal.

3. **Version Selection Pop-up Modal**:
   - When a plugin card is clicked, a popup modal opens.
   - Inside the modal, users can filter versions by:
     - **Software / Loader** (e.g. Paper, Spigot, Purpur, Velocity)
     - **Minecraft Game Version** (e.g. 1.20.4, 1.21)
     - **Version Type**: `All`, `Release` (green), `Beta` (amber), `Alpha` (red)
   - Lists all matching versions with:
     - Version number & release type badge.
     - Compatible game versions and platforms.
     - Release date and file size.
     - Direct `.jar` download and "Install Plugin" actions.

---

## ⚙️ 4. How to Connect to Pterodactyl Panel (Arix Theme)

If you are embedding this into your Pterodactyl Panel with Arix Theme:

1. Copy the `src/components/` and `src/services/modrinthApi.ts` files into your Pterodactyl panel's React source:
   ```text
   resources/scripts/components/server/plugin-installer/
   ```
2. Replace the simulated `handleInstall` trigger in `src/components/PluginModal.tsx` with your server's download endpoint:
   ```typescript
   // Example Pterodactyl API download to /plugins folder:
   await http.post(`/api/client/servers/${serverId}/files/pull`, {
     url: primaryFile.url,
     directory: '/plugins',
     filename: primaryFile.filename,
   });
   ```
3. Rebuild your panel assets using `yarn build:production`.
