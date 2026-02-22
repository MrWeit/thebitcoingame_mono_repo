import { AnimatePresence } from 'framer-motion';
import { useToastStore } from '@/stores/toastStore';
import { Toast } from './Toast';

export function ToastProvider() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div role="region" aria-label="Notifications" className="fixed top-4 right-4 z-50 w-full max-w-[360px] px-4 md:px-0 pointer-events-none">
      <div className="flex flex-col gap-3 pointer-events-auto">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
