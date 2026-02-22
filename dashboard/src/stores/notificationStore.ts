import { create } from "zustand";
import { type NotificationItem, mockNotifications } from "@/mocks/notifications";
import { useToastStore } from "./toastStore";

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  addNotification: (item: Omit<NotificationItem, "id" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  togglePanel: () => void;
  closePanel: () => void;
}

function countUnread(notifications: NotificationItem[]): number {
  return notifications.filter((n) => !n.read).length;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: mockNotifications,
  unreadCount: countUnread(mockNotifications),
  isOpen: false,

  addNotification: (item) => {
    const id = `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newNotification: NotificationItem = { ...item, id, read: false };

    set((state) => {
      const notifications = [newNotification, ...state.notifications];
      return { notifications, unreadCount: countUnread(notifications) };
    });

    // Fire toast if panel is closed
    if (!get().isOpen) {
      const toastType =
        item.type === "mining"
          ? "mining"
          : item.type === "gamification"
            ? "badge"
            : "info";
      useToastStore.getState().addToast({
        type: toastType,
        title: item.title,
        message: item.description,
      });
    }
  },

  markAsRead: (id) =>
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: countUnread(notifications) };
    }),

  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  closePanel: () => set({ isOpen: false }),
}));
