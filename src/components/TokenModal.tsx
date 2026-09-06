import { useState } from 'react';
import { Key, CheckCircle, AlertTriangle, ExternalLink, X, Shield, Lock, Trash2 } from 'lucide-react';
import { getStoredToken, setStoredToken, validateModrinthToken } from '../services/modrinthApi';

interface TokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenUpdated: () => void;
}

export const TokenModal: React.FC<TokenModalProps> = ({ isOpen, onClose, onTokenUpdated }) => {
  const [tokenInput, setTokenInput] = useState(getStoredToken());
  const [isValidating, setIsValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleSaveAndTest = async () => {
    if (!tokenInput.trim()) {
      setStoredToken('');
      setValidationResult({ success: true, message: 'Switched to Public Mode (Unauthenticated)' });
      onTokenUpdated();
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    const result = await validateModrinthToken(tokenInput.trim());
    setIsValidating(false);

    if (result.valid) {
      setStoredToken(tokenInput.trim());
      setValidationResult({
        success: true,
        message: `Successfully connected as "${result.username}"! Token saved.`,
      });
      onTokenUpdated();
    } else {
      setValidationResult({
        success: false,
        message: result.error || 'Token verification failed. Please check permissions & email verification.',
      });
    }
  };

  const handleClear = () => {
    setTokenInput('');
    setStoredToken('');
    setValidationResult({ success: true, message: 'Token cleared. Using public rate limit.' });
    onTokenUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-[#101522] border border-cyan-500/30 rounded-2xl shadow-arix-modal overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#161c2d]/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Modrinth API Token Configuration</h2>
              <p className="text-xs text-slate-400">Manage your Personal Access Token (PAT) for high rate limits</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Quick Guide Box */}
          <div className="p-4 rounded-xl bg-[#151b2d] border border-slate-800 text-sm space-y-3">
            <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs tracking-wider uppercase">
              <Shield className="w-4 h-4" /> Recommended Token Scopes (From Your Settings)
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              When creating the Personal Access Token on Modrinth, check these boxes:
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-lg bg-[#0d111b] border border-slate-800/80 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-slate-200 font-medium">Read projects</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d111b] border border-slate-800/80 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-slate-200 font-medium">Read versions</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d111b] border border-slate-800/80 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-slate-200 font-medium">Read user data</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d111b] border border-slate-800/80 flex items-center gap-2 text-slate-400">
                <span className="w-2 h-2 rounded-full bg-slate-600" />
                <span>No Write/Delete needed!</span>
              </div>
            </div>

            {/* Email verification warning reminder */}
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                <strong>Important:</strong> If Modrinth displays <em>"Account action required"</em> at the top of your screen, click <strong>"Re-send verification email"</strong> and confirm your email first, otherwise the token may fail to create.
              </span>
            </div>
          </div>

          {/* Token Input Form */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-300">Modrinth Personal Access Token (PAT)</label>
              <a
                href="https://modrinth.com/settings/pats"
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline"
              >
                Open modrinth.com/settings/pats <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <input
                type="password"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="mrp_xxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-3 bg-[#0a0d14] border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 font-mono transition-all"
              />
              <div className="absolute right-3 top-3 text-slate-500">
                <Lock className="w-4 h-4" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Tokens are stored safely in your local browser storage and sent directly to Modrinth's API via SSL.
            </p>
          </div>

          {/* Validation Result Banner */}
          {validationResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
                validationResult.success
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {validationResult.success ? (
                <CheckCircle className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              <span>{validationResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-[#161c2d]/70">
          <button
            onClick={handleClear}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 flex items-center gap-1.5 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Token
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSaveAndTest}
              disabled={isValidating}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition-all disabled:opacity-50"
            >
              {isValidating ? 'Validating Token...' : 'Save & Verify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
