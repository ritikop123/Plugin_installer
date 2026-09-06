import { Search, PackageCheck } from 'lucide-react';
import { SoftwareLoader, SortOption } from '../types/modrinth';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedLoader: SoftwareLoader;
  onLoaderChange: (loader: SoftwareLoader) => void;
  selectedGameVersion: string;
  onGameVersionChange: (version: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const POPULAR_MINECRAFT_VERSIONS = [
  'all',
  '1.21.4',
  '1.21.3',
  '1.21.1',
  '1.21',
  '1.20.6',
  '1.20.4',
  '1.20.2',
  '1.20.1',
  '1.19.4',
  '1.19.2',
  '1.18.2',
  '1.17.1',
  '1.16.5',
  '1.12.2',
  '1.8.9',
];

const SOFTWARE_LOADERS: { value: SoftwareLoader; label: string }[] = [
  { value: 'all', label: 'All Platforms' },
  { value: 'paper', label: 'Paper' },
  { value: 'purpur', label: 'Purpur' },
  { value: 'spigot', label: 'Spigot' },
  { value: 'folia', label: 'Folia' },
  { value: 'velocity', label: 'Velocity' },
  { value: 'bungeecord', label: 'BungeeCord' },
  { value: 'fabric', label: 'Fabric' },
  { value: 'sponge', label: 'Sponge' },
];

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  selectedLoader,
  onLoaderChange,
  selectedGameVersion,
  onGameVersionChange,
  sortBy,
  onSortChange,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#0a0d14]/90 backdrop-blur-xl border-b border-slate-800/80 px-4 lg:px-8 py-4 shadow-xl">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Top bar: Title and Subtitle */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 border border-cyan-500/40 text-cyan-400 shadow-arix-glow">
            <PackageCheck className="w-6 h-6" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full animate-ping opacity-75" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-cyan-400 rounded-full" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight">Plugin Installer</h1>
            <p className="text-xs text-slate-400">Discover and install plugins directly from Modrinth</p>
          </div>
        </div>

        {/* Filter Controls Row: Search, Software, Version, Sort */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          {/* Search bar */}
          <div className="lg:col-span-5 relative">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search plugins (e.g. EssentialsX, LuckPerms, ViaVersion)..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#101522] border border-slate-800 hover:border-slate-700 focus:border-cyan-500/80 rounded-xl text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-500 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>

          {/* Software Loader selector */}
          <div className="lg:col-span-3">
            <select
              value={selectedLoader}
              onChange={(e) => onLoaderChange(e.target.value as SoftwareLoader)}
              aria-label="Filter by server software"
              className="w-full px-3 py-2.5 bg-[#101522] border border-slate-800 hover:border-slate-700 focus:border-cyan-500/80 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
            >
              {SOFTWARE_LOADERS.map((loader) => (
                <option key={loader.value} value={loader.value} className="bg-[#101522] text-white">
                  Software: {loader.label}
                </option>
              ))}
            </select>
          </div>

          {/* Minecraft Game Version selector */}
          <div className="lg:col-span-2">
            <select
              value={selectedGameVersion}
              onChange={(e) => onGameVersionChange(e.target.value)}
              aria-label="Filter by Minecraft version"
              className="w-full px-3 py-2.5 bg-[#101522] border border-slate-800 hover:border-slate-700 focus:border-cyan-500/80 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
            >
              <option value="all" className="bg-[#101522] text-white">
                Version: All
              </option>
              {POPULAR_MINECRAFT_VERSIONS.filter((v) => v !== 'all').map((ver) => (
                <option key={ver} value={ver} className="bg-[#101522] text-white">
                  Version: {ver}
                </option>
              ))}
            </select>
          </div>

          {/* Sort By selector */}
          <div className="lg:col-span-2">
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              aria-label="Sort plugins by"
              className="w-full px-3 py-2.5 bg-[#101522] border border-slate-800 hover:border-slate-700 focus:border-cyan-500/80 rounded-xl text-xs sm:text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-all"
            >
              <option value="downloads" className="bg-[#101522] text-white">
                Sort: Most Downloads
              </option>
              <option value="relevance" className="bg-[#101522] text-white">
                Sort: Relevance
              </option>
              <option value="updated" className="bg-[#101522] text-white">
                Sort: Recently Updated
              </option>
              <option value="newest" className="bg-[#101522] text-white">
                Sort: Newest
              </option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
};
