const express = require('express');
const db = require('../services/db');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();

function isValidLinkId(id) {
  return typeof id === 'string' && /^[a-f0-9]{32}$/i.test(id);
}

router.get('/admin/permanent-link', requireAdminAuth, async (req, res, next) => {
  try {
    return res.json({
      success: true,
      link: await db.getLatestPermanentDemoLink()
    });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/permanent-link', requireAdminAuth, async (req, res, next) => {
  try {
    const link = await db.createPermanentDemoLink();
    return res.status(201).json({ success: true, link });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/permanent-link/:id/status', requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body || {};
    if (!isValidLinkId(id) || typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'A valid link ID and boolean enabled value are required.'
      });
    }

    const current = await db.getLatestPermanentDemoLink();
    if (!current || current.id !== id) {
      return res.status(404).json({ success: false, error: 'Permanent demo link not found.' });
    }
    if (current.status === 'revoked') {
      return res.status(409).json({ success: false, error: 'A revoked link cannot be re-enabled. Create a replacement link.' });
    }

    const link = await db.setPermanentDemoLinkStatus(id, enabled ? 'enabled' : 'disabled');
    return res.json({ success: true, link });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/permanent-link/:id/revoke', requireAdminAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidLinkId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid permanent demo link ID.' });
    }

    const current = await db.getLatestPermanentDemoLink();
    if (!current || current.id !== id) {
      return res.status(404).json({ success: false, error: 'Permanent demo link not found.' });
    }

    const link = await db.setPermanentDemoLinkStatus(id, 'revoked');
    return res.json({ success: true, link });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
