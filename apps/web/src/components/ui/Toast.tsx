import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastVariant = 'success' | 'warning' | 'info' | 'error';

export interface Toast {
  id:       string;
  title:    string;
  body?:    string;
  variant:  ToastVariant;
}

// ─── Singleton event bus ──────────────────────────────────────────────────────
// ARCH-DECISION: Rather than adding a global store slice for transient UI state,
// we use a lightweight event emitter. Toasts are purely presentational and do
// not need to survive re-renders or be persisted.

type ToastListener = (toast: Toast) => void;
const listeners: Set<ToastListener> = new Set();

export function showToast(toast: Omit<Toast, 'id'>) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  listeners.forEach((cb) => cb({ ...toast, id }));
}

// ─── Style map ────────────────────────────────────────────────────────────────

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-l-4 border-green-500  bg-white',
  warning: 'border-l-4 border-yellow-500 bg-white',
  error:   'border-l-4 border-red-500    bg-white',
  info:    'border-l-4 border-blue-500   bg-white',
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-green-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-500" />,
  error:   <AlertTriangle className="h-5 w-5 text-red-500" />,
  info:    <Info           className="h-5 w-5 text-blue-500" />,
};

// ─── Individual toast item ────────────────────────────────────────────────────

interface ToastItemProps {
  toast:    Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastItemProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => onRemove(toast.id), 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [toast.id, onRemove]);

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex w-80 items-start gap-3 rounded-lg p-3.5 shadow-lg ${VARIANT_STYLES[toast.variant]} animate-slide-in`}
    >
      <span className="shrink-0 pt-0.5">{VARIANT_ICONS[toast.variant]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
        {toast.body && (
          <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">{toast.body}</p>
        )}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── ToastContainer — mount once at app root ──────────────────────────────────

export function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler: ToastListener = (t) => {
      setToasts((prev) => [...prev, t]);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const remove = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={remove} />
      ))}
    </div>
  );
}
