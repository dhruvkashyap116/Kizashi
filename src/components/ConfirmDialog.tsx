import React, { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    cancelBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onCancel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div className="w-full max-w-md rounded-2xl border border-[#EADFE2] dark:border-[#26262C] bg-white dark:bg-[#0A0A0C] p-6 shadow-xl">
        <h3 id="confirm-dialog-title" className="font-display text-lg font-semibold text-[#1C191C] dark:text-[#F4F4F5]">
          {title}
        </h3>
        <p id="confirm-dialog-desc" className="mt-2 text-sm text-[#574F54] dark:text-[#A1A1AA] leading-relaxed">
          {description}
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            ref={cancelBtnRef}
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-[#EADFE2] dark:border-[#27272A] px-4 py-2 text-sm font-medium text-[#1C191C] dark:text-[#E4E4E7] hover:bg-[#FAF2F4] dark:hover:bg-[#141418] transition-colors min-h-[40px]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-[#C94A6A] dark:bg-[#E87A90] px-4 py-2 text-sm font-semibold text-white dark:text-black hover:opacity-90 disabled:opacity-50 transition-opacity min-h-[40px]"
          >
            {busy ? 'Syncing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
