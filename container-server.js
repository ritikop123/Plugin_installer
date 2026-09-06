import express from 'express';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// The container plugins directory (default to './plugins' relative to server root or environment path)
const CONTAINER_ROOT = process.env.SERVER_DIR || process.cwd();
const PLUGINS_DIR = process.env.PLUGINS_DIR || path.join(CONTAINER_ROOT, 'plugins');

app.use(cors());
app.use(express.json());

// Serve static frontend files if built
app.use(express.static(path.join(__dirname, 'dist')));

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    containerPluginsDir: PLUGINS_DIR,
    pluginsDirExists: fs.existsSync(PLUGINS_DIR),
  });
});

/**
 * Endpoint to install plugin directly to container /plugins folder
 * Auto-creates the folder if it does not exist yet!
 */
app.post('/api/install-plugin', async (req, res) => {
  const { downloadUrl, filename, targetFolder } = req.body;

  if (!downloadUrl || !filename) {
    return res.status(400).json({
      success: false,
      message: 'Missing downloadUrl or filename',
    });
  }

  try {
    const targetDir = targetFolder ? path.join(CONTAINER_ROOT, targetFolder.replace(/^\//, '')) : PLUGINS_DIR;

    // Check if the plugins directory exists in the container; create if missing
    if (!fs.existsSync(targetDir)) {
      console.log(`[Container] Folder "${targetDir}" not found. Creating it now...`);
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, filename);
    console.log(`[Container] Downloading ${filename} from Modrinth to ${filePath}...`);

    // Stream download from Modrinth CDN directly to the container file
    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Arix-Container-Installer/1.0.0 (admin@pterodactyl-arix.local)',
      },
    });

    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    writer.on('finish', () => {
      console.log(`[Container] Successfully installed: ${filename}`);
      res.json({
        success: true,
        message: `Installed ${filename} successfully into container folder: ${targetDir}`,
        filePath,
      });
    });

    writer.on('error', (err) => {
      console.error(`[Container] Error writing file:`, err);
      res.status(500).json({
        success: false,
        message: `Failed to write file to container: ${err.message}`,
      });
    });
  } catch (error) {
    console.error(`[Container] Download error:`, error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error downloading plugin into container',
    });
  }
});

app.listen(PORT, () => {
  console.log(`[Arix Container Installer] Running on port ${PORT}`);
  console.log(`[Arix Container Installer] Target plugins folder: ${PLUGINS_DIR}`);
  console.log(`[Arix Container Installer] Plugins folder exists: ${fs.existsSync(PLUGINS_DIR) ? 'YES' : 'NO (Will auto-create on install)'}`);
});
