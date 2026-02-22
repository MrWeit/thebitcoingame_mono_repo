import { useToastStore } from '@/stores/toastStore';

export function useToast() {
  const addToast = useToastStore((s) => s.addToast);
  return { toast: addToast };
}
