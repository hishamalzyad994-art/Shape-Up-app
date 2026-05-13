// Daily workout reminders. Uses expo-notifications on native; falls back to
// browser Notification API on web (best-effort — limited by browser policy).
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY_NOTIF_SCHEDULED = 'shapeup:reminder:scheduled';
const KEY_NOTIF_ENABLED = 'shapeup:reminder:enabled';
const WEB_INTERVAL_KEY = 'shapeup:web-interval';

const MESSAGES = [
  { title: '🔥 Time to ShapeUp!', body: "Your daily workout is waiting. Crush it." },
  { title: '💪 No excuses', body: "5 minutes now > 0 minutes never. Open ShapeUp." },
  { title: '⚡ Coach C says…', body: "The hardest rep is the first. Let's go." },
  { title: '🏆 Streak alert', body: "Don't break your streak — open ShapeUp now." },
  { title: '🎯 Stay on target', body: "Future you is begging you to start. Tap to begin." },
];

function pickMessage() {
  return MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
}

// Set notification handler (foreground display)
if (Platform.OS !== 'web') {
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (_) {}
}

export async function isReminderEnabled(): Promise<boolean> {
  const v = await AsyncStorage.getItem(KEY_NOTIF_ENABLED);
  return v !== 'false'; // default ON
}

export async function setReminderEnabled(enabled: boolean) {
  await AsyncStorage.setItem(KEY_NOTIF_ENABLED, enabled ? 'true' : 'false');
  if (enabled) {
    await scheduleDailyReminder();
  } else {
    await cancelDailyReminder();
  }
}

export async function requestPermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    try {
      // @ts-ignore
      if (typeof window === 'undefined' || !window.Notification) return false;
      // @ts-ignore
      if (window.Notification.permission === 'granted') return true;
      // @ts-ignore
      const res = await window.Notification.requestPermission();
      return res === 'granted';
    } catch (_) {
      return false;
    }
  }
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (existing !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    return status === 'granted';
  } catch (_) {
    return false;
  }
}

export async function scheduleDailyReminder(hour = 9, minute = 0) {
  const ok = await requestPermission();
  if (!ok) return false;

  if (Platform.OS === 'web') {
    // Web fallback: poll every 5 minutes; fire when local clock first hits the target hour each day.
    try {
      // @ts-ignore
      const existing = (window as any)[WEB_INTERVAL_KEY];
      if (existing) clearInterval(existing);
      let lastFired: string | null = null;
      const tick = () => {
        const now = new Date();
        const today = now.toDateString();
        if (lastFired === today) return;
        if (now.getHours() === hour && now.getMinutes() >= minute && now.getMinutes() < minute + 10) {
          const m = pickMessage();
          try {
            // @ts-ignore
            new window.Notification(m.title, { body: m.body });
            lastFired = today;
          } catch (_) {}
        }
      };
      // @ts-ignore
      (window as any)[WEB_INTERVAL_KEY] = setInterval(tick, 5 * 60 * 1000);
      await AsyncStorage.setItem(KEY_NOTIF_SCHEDULED, 'web');
      return true;
    } catch (_) {
      return false;
    }
  }

  // Native: cancel previous + schedule a daily repeating trigger
  try {
    const prev = await AsyncStorage.getItem(KEY_NOTIF_SCHEDULED);
    if (prev) {
      try { await Notifications.cancelScheduledNotificationAsync(prev); } catch (_) {}
    }
    const m = pickMessage();
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: m.title, body: m.body, sound: 'default' },
      // @ts-ignore daily trigger
      trigger: { hour, minute, repeats: true },
    });
    await AsyncStorage.setItem(KEY_NOTIF_SCHEDULED, id);
    return true;
  } catch (_) {
    return false;
  }
}

export async function cancelDailyReminder() {
  if (Platform.OS === 'web') {
    try {
      // @ts-ignore
      const existing = (window as any)[WEB_INTERVAL_KEY];
      if (existing) clearInterval(existing);
    } catch (_) {}
    await AsyncStorage.removeItem(KEY_NOTIF_SCHEDULED);
    return;
  }
  try {
    const id = await AsyncStorage.getItem(KEY_NOTIF_SCHEDULED);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(KEY_NOTIF_SCHEDULED);
  } catch (_) {}
}
