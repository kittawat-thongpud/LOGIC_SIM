/**
 * PWA Install Prompt component
 */

import { Download, X } from 'lucide-react';
import { usePWA } from '../hooks';
import { useState } from 'react';

export function PWAInstallPrompt() {
  const { canInstall, install } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  if (!canInstall || dismissed) return null;

  const handleInstall = async () => {
    const installed = await install();
    if (!installed) {
      setDismissed(true);
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-blue-600 px-6 py-3 rounded-lg shadow-xl flex items-center space-x-4 z-50">
      <Download size={20} />
      <span className="text-sm font-medium">Install LogicSim for offline use</span>
      <button
        onClick={handleInstall}
        className="bg-white text-blue-600 px-4 py-1.5 rounded font-bold text-sm hover:bg-gray-100 transition-colors"
      >
        Install
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="p-1 hover:bg-blue-500 rounded"
      >
        <X size={16} />
      </button>
    </div>
  );
}
