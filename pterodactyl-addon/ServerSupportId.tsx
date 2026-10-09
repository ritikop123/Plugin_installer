import React, { useState } from 'react';
import { ServerContext } from '@/state/server';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCopy, faLifeRing } from '@fortawesome/free-solid-svg-icons';

interface Props {
    className?: string;
}

const ServerSupportId: React.FC<Props> = ({ className = '' }) => {
    const supportId = ServerContext.useStoreState((state) => state.server.data?.support_id);
    const [copied, setCopied] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);

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
            title={copyFailed ? 'Could not copy support ID.' : 'Click to copy this support ID.'}
            aria-label={copyFailed ? `Could not copy support ID ${supportId}` : `Copy support ID ${supportId}`}
            onClick={copySupportId}
            className={`inline-flex items-center gap-1.5 text-xs text-gray-300 hover:text-white transition-colors ${className}`}
        >
            <FontAwesomeIcon icon={faLifeRing} className="text-gray-400" />
            <span>{supportId}</span>
            <FontAwesomeIcon
                icon={copied ? faCheck : faCopy}
                className={copied ? 'text-emerald-400' : 'text-gray-500'}
            />
            <span className="sr-only" aria-live="polite">
                {copied ? 'Support ID copied.' : copyFailed ? 'Could not copy support ID.' : ''}
            </span>
        </button>
    );
};

export default ServerSupportId;
