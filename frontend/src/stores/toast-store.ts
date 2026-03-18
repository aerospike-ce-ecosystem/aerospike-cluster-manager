import { create } from "zustand";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  timerId?: ReturnType<typeof setTimeout>;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (type, message, duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const timerId = setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, duration);
    set((state) => ({ toasts: [...state.toasts, { id, type, message, timerId }] }));
  },
  removeToast: (id) =>
    set((state) => {
      const toast = state.toasts.find((t) => t.id === id);
      if (toast?.timerId !== undefined) clearTimeout(toast.timerId);
      return { toasts: state.toasts.filter((t) => t.id !== id) };
    }),
}));
