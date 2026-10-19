import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot } from '@fortawesome/free-solid-svg-icons';
import { ServerContext } from '@/state/server';
import AiConsoleModal from '@/components/server/AiConsoleModal';

interface Props {
  className?: string;
}

export default function AiConsoleButton({ className }: Props) {
  const [open, setOpen] = useState(false);

  // Safe check for ServerContext to prevent any crash in admin / preview pages
  let hasServer = false;
  try {
    hasServer = Boolean(ServerContext.useStoreState((state) => state.server?.data?.uuid));
  } catch (e) {
    hasServer = false;
  }

  // Never render outside active server context (e.g. in /admin/arix theme preview)
  if (!hasServer) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600/25 via-indigo-600/25 to-blue-600/25 hover:from-cyan-500/40 hover:to-blue-500/40 border border-cyan-400/40 hover:border-cyan-400/70 text-cyan-300 hover:text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-cyan-500/10 hover:shadow-cyan-500/25 active:scale-95 ${
          className || ''
        }`}
        title="Analyze console errors & auto-fix server with ALLaM AI"
      >
        <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <FontAwesomeIcon icon={faRobot} className="text-cyan-400" />
        <span>AI Auto-Fix & Diagnose</span>
      </button>

      {open && <AiConsoleModal visible={open} onClose={() => setOpen(false)} />}
    </>
  );
}
