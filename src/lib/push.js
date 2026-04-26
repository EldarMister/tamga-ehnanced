import { api } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export async function getPushConfig() {
  if (!isPushSupported()) {
    return { supported: false, enabled: false, permission: 'unsupported', subscribed: false };
  }
  const config = await api.get('/api/push/config');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return {
    supported: true,
    enabled: !!config?.enabled,
    publicKey: config?.publicKey || null,
    permission: Notification.permission,
    subscribed: !!subscription,
    endpoint: subscription?.endpoint || null,
  };
}

export async function subscribeToPush() {
  if (!isPushSupported()) {
    throw new Error('Браузер не поддерживает push-уведомления');
  }

  const config = await api.get('/api/push/config');
  if (!config?.enabled || !config?.publicKey) {
    throw new Error('Push-уведомления не настроены на сервере');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Разрешение на уведомления не выдано');
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.publicKey),
    });
  }

  await api.post('/api/push/subscribe', { subscription: subscription.toJSON() });
  return subscription;
}

export async function unsubscribeFromPush() {
  if (!isPushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await api.delete('/api/push/subscribe', { endpoint: subscription.endpoint });
  await subscription.unsubscribe().catch(() => {});
}

export async function syncPushSubscription() {
  if (!isPushSupported()) return;
  if (Notification.permission !== 'granted') return;

  const config = await api.get('/api/push/config');
  if (!config?.enabled) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;
  await api.post('/api/push/subscribe', { subscription: subscription.toJSON() });
}
