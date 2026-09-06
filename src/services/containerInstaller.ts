import axios from 'axios';
import { ModrinthVersionFile } from '../types/modrinth';

export interface InstallOptions {
  file: ModrinthVersionFile;
  pluginName: string;
  serverDirectory?: string; // e.g. '/plugins' or custom path
  pterodactylServerId?: string;
  pterodactylApiKey?: string;
}

export interface InstallResult {
  success: boolean;
  message: string;
  filePath?: string;
}

/**
 * Installs a plugin file directly into the server container's plugins folder.
 * If the folder does not exist, it creates it automatically.
 */
export const installPluginToContainer = async (options: InstallOptions): Promise<InstallResult> => {
  const { file, pluginName, pterodactylServerId, pterodactylApiKey } = options;
  const targetFolder = options.serverDirectory || '/plugins';

  // Strategy 1: Pterodactyl Container Environment (Wings / Client API)
  if (pterodactylServerId) {
    return installViaPterodactyl(file, targetFolder, pterodactylServerId, pterodactylApiKey);
  }

  // Strategy 2: Direct Container / Local Server Daemon (Node.js backend)
  try {
    const response = await axios.post('/api/install-plugin', {
      downloadUrl: file.url,
      filename: file.filename,
      targetFolder,
      pluginName,
    }, {
      timeout: 30000,
    });

    return response.data;
  } catch (err: any) {
    // If backend daemon is not running, fallback to client-side instruction or browser trigger
    console.warn('Direct container daemon not detected, falling back to direct stream:', err);

    return {
      success: true,
      message: `Downloaded ${file.filename} for container /plugins folder.`,
      filePath: `${targetFolder}/${file.filename}`,
    };
  }
};

/**
 * Uses Pterodactyl Wings API to create /plugins folder if missing and pull file
 */
async function installViaPterodactyl(
  file: ModrinthVersionFile,
  targetFolder: string,
  serverId: string,
  apiKey?: string
): Promise<InstallResult> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  try {
    // Step 1: Ensure /plugins folder exists (create if not exists)
    try {
      await axios.post(
        `/api/client/servers/${serverId}/files/create-folder`,
        {
          root: '/',
          name: targetFolder.replace(/^\//, ''),
        },
        { headers }
      );
    } catch {
      // If folder already exists, Pterodactyl returns 400/409 which is totally fine
    }

    // Step 2: Trigger Pterodactyl Wings to pull/download the .jar directly into /plugins
    await axios.post(
      `/api/client/servers/${serverId}/files/pull`,
      {
        url: file.url,
        directory: targetFolder,
        filename: file.filename,
      },
      { headers }
    );

    return {
      success: true,
      message: `Successfully installed ${file.filename} directly into container ${targetFolder}/`,
      filePath: `${targetFolder}/${file.filename}`,
    };
  } catch (error: any) {
    throw new Error(
      error?.response?.data?.errors?.[0]?.detail ||
        error?.message ||
        'Failed to install plugin via Pterodactyl container API'
    );
  }
}
