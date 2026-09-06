export interface ModrinthSearchHit {
  project_id: string;
  project_type: string;
  slug: string;
  author: string;
  title: string;
  description: string;
  categories: string[];
  display_categories: string[];
  versions: string[];
  downloads: number;
  follows: number;
  icon_url: string | null;
  date_created: string;
  date_modified: string;
  latest_version: string;
  license: string;
  client_side: string;
  server_side: string;
  gallery: string[];
}

export interface ModrinthSearchResponse {
  hits: ModrinthSearchHit[];
  offset: number;
  limit: number;
  total_hits: number;
}

export interface ModrinthVersionFile {
  hashes: {
    sha1?: string;
    sha512?: string;
  };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  file_type: string | null;
}

export interface ModrinthVersion {
  id: string;
  project_id: string;
  author_id: string;
  name: string;
  version_number: string;
  changelog: string | null;
  game_versions: string[];
  version_type: 'release' | 'beta' | 'alpha';
  loaders: string[];
  featured: boolean;
  status?: string;
  date_published: string;
  downloads: number;
  files: ModrinthVersionFile[];
}

export interface ModrinthProjectDetails {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  categories: string[];
  loaders: string[];
  icon_url: string | null;
  issues_url?: string;
  source_url?: string;
  wiki_url?: string;
  discord_url?: string;
  donation_urls?: { id: string; platform: string; url: string }[];
  downloads: number;
  followers: number;
  published: string;
  updated: string;
}

export type SoftwareLoader =
  | 'all'
  | 'paper'
  | 'purpur'
  | 'spigot'
  | 'bungeecord'
  | 'velocity'
  | 'folia'
  | 'fabric'
  | 'forge'
  | 'sponge';

export type VersionTypeFilter = 'all' | 'release' | 'beta' | 'alpha';

export type SortOption = 'downloads' | 'relevance' | 'updated' | 'newest';
