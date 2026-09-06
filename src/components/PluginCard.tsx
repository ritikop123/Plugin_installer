import { Download, Heart, ArrowUpRight, Box } from 'lucide-react';
import { ModrinthSearchHit } from '../types/modrinth';

interface PluginCardProps {
  plugin: ModrinthSearchHit;
  onSelect: (plugin: ModrinthSearchHit) => void;
}

const formatNumber = (num: number): string => {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'k';
  }
  return num.toString();
};

export const PluginCard: React.FC<PluginCardProps> = ({ plugin, onSelect }) => {
  // Extract server categories / loaders for badges
  const loaders = plugin.display_categories || plugin.categories || [];

  return (
    <div
      onClick={() => onSelect(plugin)}
      className="group relative flex flex-col justify-between p-5 bg-[#101522]/90 hover:bg-[#151b2d] border border-slate-800/90 hover:border-cyan-500/50 rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-arix-glow hover:-translate-y-1"
    >
      <div>
        {/* Top Row: Icon, Title, Author, Follows */}
        <div className="flex items-start gap-4">
          <div className="relative w-14 h-14 shrink-0 rounded-2xl bg-[#0d111a] border border-slate-800 overflow-hidden flex items-center justify-center group-hover:border-cyan-500/30 transition-colors shadow-md">
            {plugin.icon_url ? (
              <img
                src={plugin.icon_url}
                alt={plugin.title}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Box className="w-7 h-7 text-cyan-400" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
              {plugin.title}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              by <span className="text-slate-300 font-medium">{plugin.author}</span>
            </p>

            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
              <span className="flex items-center gap-1 font-medium text-slate-300">
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                {formatNumber(plugin.downloads)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="w-3.5 h-3.5 text-rose-400/80" />
                {formatNumber(plugin.follows)}
              </span>
            </div>
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-300 mt-3.5 line-clamp-2 leading-relaxed">
          {plugin.description || 'No description provided by author.'}
        </p>
      </div>

      {/* Bottom Row: Loaders pills and Action Button */}
      <div className="mt-5 pt-3.5 border-t border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 overflow-hidden flex-wrap max-h-6">
          {loaders.slice(0, 3).map((loader) => (
            <span
              key={loader}
              className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-slate-800/80 border border-slate-700/60 text-cyan-300/90"
            >
              {loader}
            </span>
          ))}
          {loaders.length > 3 && (
            <span className="text-[10px] text-slate-500 font-semibold">
              +{loaders.length - 3}
            </span>
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelect(plugin);
          }}
          className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500 text-cyan-300 hover:text-black border border-cyan-500/30 transition-all duration-200"
        >
          <span>Versions</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
