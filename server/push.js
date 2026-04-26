import webpush from 'web-push';
import { all, exec } from './db.js';

const vapidPublicKey = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const vapidPrivateKey = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const rawVapidSubject = String(process.env.VAPID_SUBJECT || '').trim();

function normalizeVapidSubject(subject) {
  const value = String(subject || '').trim();
  if (!value) return '';
  if (/^mailto:/i.test(value)) return value;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;

  try {
    // web-push accepts a URL or a mailto: URL as the VAPID subject.
    new URL(value);
    return value;
  } catch {
    return '';
  }
}

const vapidSubject = normalizeVapidSubject(rawVapidSubject);
let pushEnabled = !!(vapidPublicKey && vapidPrivateKey && vapidSubject);

if (pushEnabled) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  } catch (error) {
    pushEnabled = false;
    console.warn('[push] Invalid VAPID configuration, web push disabled:', error?.message || error);
  }
} else {
  if (rawVapidSubject && !vapidSubject) {
    console.warn('[push] Invalid VAPID_SUBJECT, expected URL or email, web push disabled');
  }
  console.warn('[push] VAPID is not configured, web push disabled');
}

function normalizeSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') return null;
  const endpoint = String(subscription.endpoint || '').trim();
  const p256dh = String(subscription.keys?.p256dh || '').trim();
  const auth = String(subscription.keys?.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime: subscription.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}

export function isPushEnabled() {
  return pushEnabled;
}

export function getPushPublicKey() {
  return vapidPublicKey;
}

export async function savePushSubscription(userId, subscription, userAgent = '') {
  const normalized = normalizeSubscription(subscription);
  if (!normalized) {
    const err = new Error('Некорректная push-подписка');
    err.statusCode = 400;
    throw err;
  }
  await exec(
    `INSERT INTO push_subscriptions (user_id, endpoint, subscription, user_agent, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       subscription = EXCLUDED.subscription,
       user_agent = EXCLUDED.user_agent,
       updated_at = CURRENT_TIMESTAMP`,
    [userId, normalized.endpoint, JSON.stringify(normalized), String(userAgent || '').slice(0, 1000)],
  );
  return normalized;
}

export async function deletePushSubscription(userId, endpoint) {
  const cleanEndpoint = String(endpoint || '').trim();
  if (!cleanEndpoint) return;
  await exec('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, cleanEndpoint]);
}

async function removeSubscription(endpoint) {
  await exec('DELETE FROM push_subscriptions WHERE endpoint = ?', [endpoint]);
}

export async function sendPushToUser(userId, payload) {
  const id = parseInt(userId, 10);
  if (!pushEnabled || !id) return { sent: 0, failed: 0 };
  const rows = await all('SELECT endpoint, subscription FROM push_subscriptions WHERE user_id = ?', [id]);
  return sendPushRows(rows, payload);
}

export async function sendPushToUsers(userIds, payload) {
  if (!pushEnabled) return { sent: 0, failed: 0 };
  const ids = [...new Set((userIds || []).map(v => parseInt(v, 10)).filter(Boolean))];
  if (ids.length === 0) return { sent: 0, failed: 0 };
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const rows = await all(`SELECT endpoint, subscription FROM push_subscriptions WHERE user_id IN (${placeholders})`, ids);
  return sendPushRows(rows, payload);
}

async function sendPushRows(rows, payload) {
  let sent = 0;
  let failed = 0;
  const body = JSON.stringify(payload || {});

  for (const row of rows) {
    try {
      const subscription = JSON.parse(row.subscription);
      await webpush.sendNotification(subscription, body, { TTL: 60 });
      sent += 1;
    } catch (error) {
      failed += 1;
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await removeSubscription(row.endpoint).catch(() => {});
      } else {
        console.error('[push] send failed:', error?.message || error);
      }
    }
  }

  return { sent, failed };
}
