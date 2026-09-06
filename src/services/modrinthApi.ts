import axios from 'axios';
import {
  ModrinthSearchResponse,
  ModrinthVersion,
  ModrinthProjectDetails,
  SoftwareLoader,
  SortOption,
} from '../types/modrinth';

const BASE_URL = 'https://api.modrinth.com/v2';
const TOKEN_STORAGE_KEY = 'arix_modrinth_pat_token';

// Always provide a descriptive User-Agent as required by Modrinth API Guidelines
const DEFAULT_USER_AGENT = 'Arix-Theme-PluginInstaller/1.0.0 (pterodactyl-addon@arix.gg)';

export const getStoredToken = (): string => {
  return localStorage.getItem(TOKEN_STORAGE_KEY) || '';
};

export const setStoredToken = (token: string): void => {
  if (token.trim()) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token.trim());
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
};

const createApiClient = () => {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'User-Agent': DEFAULT_USER_AGENT,
    Accept: 'application/json',
  };

  if (token) {
    // Modrinth accepts Personal Access Tokens in Authorization header directly
    headers['Authorization'] = token.startsWith('Bearer ') || token.startsWith('mrp_') ? token : `Bearer ${token}`;
  }

  return axios.create({
    baseURL: BASE_URL,
    headers,
    timeout: 15000,
  });
};

/**
 * Search Modrinth projects for plugins
 */
export const searchPlugins = async (params: {
  query?: string;
  loader?: SoftwareLoader;
  gameVersion?: string;
  sortBy?: SortOption;
  page?: number;
  limit?: number;
}): Promise<ModrinthSearchResponse> => {
  const api = createApiClient();
  const limit = params.limit || 20;
  const page = params.page || 1;
  const offset = (page - 1) * limit;

  // Build Modrinth facets
  // Modrinth uses a 2D JSON array: [ ["facet1", "facet2"], ["facet3"] ]
  // Elements inside inner array are OR-ed, outer array elements are AND-ed.
  const facets: string[][] = [];

  // Filter to plugins/mods that work on server platforms
  if (params.loader && params.loader !== 'all') {
    facets.push([`categories:${params.loader}`]);
  } else {
    // Default server plugin categories
    facets.push([
      'categories:spigot',
      'categories:paper',
      'categories:purpur',
      'categories:velocity',
      'categories:bungeecord',
      'categories:folia',
      'categories:sponge',
      'categories:fabric',
    ]);
  }

  if (params.gameVersion && params.gameVersion !== 'all') {
    facets.push([`versions:${params.gameVersion}`]);
  }

  const queryParams: Record<string, string | number> = {
    query: params.query?.trim() || '',
    limit,
    offset,
    index: params.sortBy || 'downloads',
  };

  if (facets.length > 0) {
    queryParams.facets = JSON.stringify(facets);
  }

  const response = await api.get<ModrinthSearchResponse>('/search', {
    params: queryParams,
  });

  return response.data;
};

/**
 * Fetch detailed information for a single project
 */
export const getProjectDetails = async (idOrSlug: string): Promise<ModrinthProjectDetails> => {
  const api = createApiClient();
  const response = await api.get<ModrinthProjectDetails>(`/project/${encodeURIComponent(idOrSlug)}`);
  return response.data;
};

/**
 * Fetch all versions of a project with optional filters
 */
export const getProjectVersions = async (
  idOrSlug: string,
  filters?: {
    loaders?: string[];
    gameVersions?: string[];
  }
): Promise<ModrinthVersion[]> => {
  const api = createApiClient();
  const params: Record<string, string> = {};

  if (filters?.loaders && filters.loaders.length > 0) {
    params.loaders = JSON.stringify(filters.loaders);
  }

  if (filters?.gameVersions && filters.gameVersions.length > 0) {
    params.game_versions = JSON.stringify(filters.gameVersions);
  }

  const response = await api.get<ModrinthVersion[]>(`/project/${encodeURIComponent(idOrSlug)}/version`, {
    params,
  });

  return response.data;
};

/**
 * Validates the token by making a quick request to the current user endpoint
 */
export const validateModrinthToken = async (token: string): Promise<{ valid: boolean; username?: string; error?: string }> => {
  try {
    const testHeader = token.startsWith('Bearer ') || token.startsWith('mrp_') ? token : `Bearer ${token}`;
    const response = await axios.get('https://api.modrinth.com/v2/user', {
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        Authorization: testHeader,
      },
      timeout: 8000,
    });
    return { valid: true, username: response.data.username || response.data.name };
  } catch (err: any) {
    return {
      valid: false,
      error: err?.response?.data?.description || err?.message || 'Invalid or expired token',
    };
  }
};
