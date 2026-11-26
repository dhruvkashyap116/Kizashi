import React, { useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWA';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-[#C94A6A] dark:bg-[#E87A90] px-3.5 py-2 text-xs font-semibold text-white dark:text-black hover:opacity-90 transition-opacity whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Download className="w-3.5 h-3.5" />
        Install App
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-[#E5D7DC] dark:border-[#26262C] bg-white dark:bg-[#0D0D0F] px-3.5 py-2 text-xs font-medium text-[#1C191C] dark:text-[#F4F4F5] hover:bg-[#FAF2F4] dark:hover:bg-[#16161A] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
      >
        <Smartphone className="w-3.5 h-3.5 text-[#C94A6A] dark:text-[#E87A90]" />
        {isIOS ? 'Add to Home' : 'Install / Widget'}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="install-guide-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-[#EADFE2] dark:border-[#26262C] bg-white dark:bg-[#09090B] p-6 shadow-xl">
            <h3 id="install-guide-title" className="font-display text-xl font-semibold text-[#1C191C] dark:text-white">
              Install Kizashi on Your Device
            </h3>
            <p className="mt-2 text-sm text-[#5C5459] dark:text-[#A1A1AA] leading-relaxed">
              {isIOS
                ? 'In Safari, tap Share at the bottom of the screen, then choose "Add to Home Screen" for instant 1-tap access.'
                : 'On macOS or Windows (Chrome / Edge), click the Install icon in the browser address bar or menu ("Install Kizashi") to launch it as a standalone desktop window with quick shortcuts.'}
            </p>
            <div className="mt-4 rounded-xl border border-[#EADFE2] dark:border-[#222228] bg-[#FCF8F6] dark:bg-black p-3.5 text-xs text-[#5C5459] dark:text-[#A1A1AA]">
              Tip: Pin the Focus Widget link (<span className="font-mono-num">?widget=true</span>) as a compact always-on-top panel or mobile shortcut.
            </div>
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-xl bg-[#1C191C] dark:bg-[#F4F4F5] py-2.5 text-sm font-semibold text-white dark:text-black hover:opacity-90 transition-opacity min-h-[44px]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div className="fixed bottom-20 md:bottom-5 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/90 px-3 py-2 text-xs font-medium text-amber-100 shadow-lg">
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline mode — local habits and schedule remain saved.</span>
    </div>
  );
};
