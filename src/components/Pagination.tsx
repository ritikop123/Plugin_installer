import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalHits: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalHits,
  pageSize,
  onPageChange,
}) => {
  const totalPages = Math.ceil(totalHits / pageSize);
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-between px-4 py-6 border-t border-slate-800/80 mt-6">
      <div className="text-xs text-slate-400">
        Showing{' '}
        <span className="text-white font-medium">
          {(currentPage - 1) * pageSize + 1}
        </span>{' '}
        to{' '}
        <span className="text-white font-medium">
          {Math.min(currentPage * pageSize, totalHits)}
        </span>{' '}
        of <span className="text-white font-medium">{totalHits}</span> plugins
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-2 rounded-xl bg-[#101522] border border-slate-800 hover:border-cyan-500/40 text-slate-300 disabled:opacity-40 disabled:hover:border-slate-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="px-3 py-1.5 rounded-xl bg-[#101522] border border-cyan-500/20 text-xs font-semibold text-cyan-300">
          Page {currentPage} of {totalPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-2 rounded-xl bg-[#101522] border border-slate-800 hover:border-cyan-500/40 text-slate-300 disabled:opacity-40 disabled:hover:border-slate-800 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
