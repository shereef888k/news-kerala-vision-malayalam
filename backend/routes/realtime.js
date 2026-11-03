const express = require('express');
const { requireAdminAuth } = require('../middleware/auth');
const realtimeService = require('../services/realtime');

const router = express.Router();
const activeResponses = new Set();

function writeEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) return false;
  return res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

router.get('/admin/sessions/realtime', requireAdminAuth, async (req, res, next) => {
  let subscription;
  let heartbeat;
  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;
    if (heartbeat) clearInterval(heartbeat);
    activeResponses.delete(res);
    if (subscription) {
      try { await subscription.unsubscribe(); } catch (_) { /* already closed */ }
    }
  };

  try {
    const realtimeState = await realtimeService.subscribeAdminSessions();
    subscription = realtimeState.subscription;

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    activeResponses.add(res);
    heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': keep-alive\n\n');
    }, 20_000);
    heartbeat.unref?.();

    subscription.onChange(snapshot => {
      if (snapshot.status === 'error') {
        writeEvent(res, 'error', { message: 'Neon Realtime session subscription failed.' });
        res.end();
        stop();
        return;
      }
      if (snapshot.data !== undefined) writeEvent(res, 'sessions', snapshot.data);
    });

    subscription.onStateChange(state => {
      if (state === 'error') {
        writeEvent(res, 'error', { message: 'Neon Realtime session subscription failed.' });
        res.end();
        stop();
      }
    });

    req.on('close', stop);
    res.on('close', stop);
    res.on('error', stop);
  } catch (error) {
    if (res.headersSent) {
      writeEvent(res, 'error', { message: 'Neon Realtime is unavailable.' });
      res.end();
      await stop();
      return;
    }
    next(error);
  }
});

router.closeStreams = function closeStreams() {
  for (const response of activeResponses) response.end();
  activeResponses.clear();
};

module.exports = router;
