import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { PluginCard } from './components/PluginCard';
import { PluginModal } from './components/PluginModal';
import { Pagination } from './components/Pagination';
import { searchPlugins } from './services/modrinthApi';
import { ModrinthSearchHit, SoftwareLoader, SortOption } from './types/modrinth';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';

export function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedLoader, setSelectedLoader] = useState<SoftwareLoader>('all');
  const [selectedGameVersion, setSelectedGameVersion] = useState('all');
  const [sortBy, setSortBy] = useState<SortOption>('downloads');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const [plugins, setPlugins] = useState<ModrinthSearchHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [selectedPlugin, setSelectedPlugin] = useState<ModrinthSearchHit | null>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Load plugins from Modrinth API
  const fetchPlugins = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await searchPlugins({
        query: debouncedQuery,
        loader: selectedLoader,
        gameVersion: selectedGameVersion,
        sortBy,
        page: currentPage,
        limit: pageSize,
      });

      setPlugins(data.hits || []);
      setTotalHits(data.total_hits || 0);
    } catch (err: any) {
      console.error('Error fetching plugins:', err);
      setError(
        err?.response?.data?.description ||
          err?.message ||
          'Failed to load plugins from Modrinth. Check your connection or Modrinth token.'
      );
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, selectedLoader, selectedGameVersion, sortBy, currentPage]);

  useEffect(() => {
    fetchPlugins();
  }, [fetchPlugins]);

  // Reset page when filters change
  const handleLoaderChange = (loader: SoftwareLoader) => {
    setSelectedLoader(loader);
    setCurrentPage(1);
  };

  const handleGameVersionChange = (version: string) => {
    setSelectedGameVersion(version);
    setCurrentPage(1);
  };

  const handleSortChange = (sort: SortOption) => {
    setSortBy(sort);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-[#0a0d14] text-slate-100 flex flex-col selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Header with search, filters and token status */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        selectedLoader={selectedLoader}
        onLoaderChange={handleLoaderChange}
        selectedGameVersion={selectedGameVersion}
        onGameVersionChange={handleGameVersionChange}
        sortBy={sortBy}
        onSortChange={handleSortChange}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-8 py-8 space-y-6">
        {/* Error Notice */}
        {error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <p className="text-sm font-medium">Searching Modrinth plugins...</p>
          </div>
        )}

        {/* Empty Results */}
        {!loading && !error && plugins.length === 0 && (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700 mx-auto flex items-center justify-center text-slate-500">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-200">No plugins found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              We couldn't find any plugins matching &quot;{debouncedQuery}&quot;. Try adjusting your search query, software, or Minecraft version.
            </p>
          </div>
        )}

        {/* Plugins Grid View */}
        {!loading && !error && plugins.length > 0 && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.project_id}
                  plugin={plugin}
                  onSelect={(p) => setSelectedPlugin(p)}
                />
              ))}
            </div>

            {/* Pagination Controls */}
            <Pagination
              currentPage={currentPage}
              totalHits={totalHits}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-6 border-t border-slate-800/80 text-center text-xs text-slate-500">
        <p>Arix Theme Compatible Plugin Installer • Powered by the Modrinth API v2</p>
      </footer>

      {/* Plugin Versions Modal */}
      <PluginModal
        plugin={selectedPlugin}
        onClose={() => setSelectedPlugin(null)}
      />
    </div>
  );
}
export default App;
