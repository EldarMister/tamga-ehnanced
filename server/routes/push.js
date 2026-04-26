import { Router } from 'express';
import { authRequired } from '../auth.js';
import {
  deletePushSubscription,
  getPushPublicKey,
  isPushEnabled,
  savePushSubscription,
} from '../push.js';

const router = Router();

router.get('/config', authRequired, async (req, res) => {
  res.json({
    enabled: isPushEnabled(),
    publicKey: isPushEnabled() ? getPushPublicKey() : null,
  });
});

router.post('/subscribe', authRequired, async (req, res, next) => {
  try {
    if (!isPushEnabled()) {
      return res.status(503).json({ detail: 'Push-уведомления не настроены на сервере' });
    }
    const subscription = await savePushSubscription(
      req.user.id,
      req.body?.subscription,
      req.headers['user-agent'] || '',
    );
    res.json({ ok: true, endpoint: subscription.endpoint });
  } catch (e) {
    if (e.statusCode) return res.status(e.statusCode).json({ detail: e.message });
    next(e);
  }
});

router.delete('/subscribe', authRequired, async (req, res) => {
  await deletePushSubscription(req.user.id, req.body?.endpoint);
  res.json({ ok: true });
});

export default router;
