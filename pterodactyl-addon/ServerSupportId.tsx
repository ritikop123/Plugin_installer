import React, { useState } from 'react';
import { ServerContext } from '@/state/server';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCopy, faLifeRing } from '@fortawesome/free-solid-svg-icons';

interface Props {
    className?: string;
}

const ServerSupportId: React.FC<Props> = ({ className = '' }) => {
    const rawSupportId = ServerContext.useStoreState((state) => state.server.data?.support_id);
    const serverUuid = ServerContext.useStoreState((state) => state.server.data?.uuid);
    const [copied, setCopied] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);

    const supportId = React.useMemo(() => {
        if (rawSupportId && typeof rawSupportId === 'string' && rawSupportId.trim().length > 0) {
            const clean = rawSupportId.trim();
            if (clean.toUpperCase().startsWith('SUP-')) {
                return `SUP-${clean.slice(4, 10).toUpperCase()}`;
            }
            return `SUP-${clean.slice(0, 6).toUpperCase()}`;
        }
        if (serverUuid && typeof serverUuid === 'string') {
            const cleanUuid = serverUuid.replace(/-/g, '').toUpperCase();
            return `SUP-${cleanUuid.slice(0, 6)}`;
        }
        return '';
    }, [rawSupportId, serverUuid]);

    const copySupportId = async () => {
        if (!supportId) return;

        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(supportId);
            } else {
                fallbackCopy();
            }
            setCopied(true);
            setCopyFailed(false);
        } catch {
            try {
                fallbackCopy();
                setCopied(true);
                setCopyFailed(false);
            } catch {
                setCopyFailed(true);
                setCopied(false);
            }
        }

        window.setTimeout(() => {
            setCopied(false);
            setCopyFailed(false);
        }, 2000);
    };

    const fallbackCopy = () => {
        const input = document.createElement('textarea');
        input.value = supportId || '';
        input.setAttribute('readonly', '');
        input.style.position = 'fixed';
        input.style.opacity = '0';
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(input);

        if (!copied) {
            throw new Error('Clipboard copy failed.');
        }
    };

    if (!supportId) return null;

    return (
        <button
            type="button"
            title={copyFailed ? 'Could not copy support ID.' : 'Click to copy support ID'}
            aria-label={copyFailed ? `Could not copy support ID ${supportId}` : `Copy support ID ${supportId}`}
            onClick={copySupportId}
            className={`flex items-center gap-x-1 py-1 text-gray-300 hover:text-white transition-colors duration-200 cursor-pointer select-none bg-transparent border-0 outline-none group ${className}`}
        >
            <FontAwesomeIcon icon={faLifeRing} className="text-gray-300 text-sm" />
            <span className="font-normal">{supportId}</span>
            <FontAwesomeIcon
                icon={copied ? faCheck : faCopy}
                className={copied ? 'text-emerald-400 text-xs ml-0.5' : 'text-gray-400 group-hover:text-gray-200 text-xs ml-0.5'}
            />
            <span className="sr-only" aria-live="polite">
                {copied ? 'Support ID copied.' : copyFailed ? 'Could not copy support ID.' : ''}
            </span>
        </button>
    );
};

export default ServerSupportId;
