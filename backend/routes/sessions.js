const express = require('express');
const crypto = require('crypto');
const db = require('../services/db');
const telegramService = require('../services/telegram');
const { requireAdminAuth } = require('../middleware/auth');

const router = express.Router();

/**
 * Helper: Validate and sanitize session ID string
 */
function isValidSessionId(id) {
  return typeof id === 'string' && /^[a-f0-9]{16,64}$/i.test(id);
}

/**
 * POST /api/sessions
 * Create a new demo session (Admin Authorized).
 */
router.post('/', requireAdminAuth, (req, res, next) => {
  try {
    const { label, durationMinutes = 30 } = req.body;

    const parsedDuration = parseInt(durationMinutes, 10);
    if (isNaN(parsedDuration) || parsedDuration < 1 || parsedDuration > 10080) {
      return res.status(400).json({
        success: false,
        error: 'Invalid duration. Must be between 1 minute and 10080 minutes (7 days).'
      });
    }

    const sanitizedLabel = label && typeof label === 'string' ? label.trim().substring(0, 50) : null;

    // Generate unpredictable cryptographically secure 16-byte hex ID
    const sessionId = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + parsedDuration * 60 * 1000).toISOString();

    const session = db.createSession({
      id: sessionId,
      label: sanitizedLabel,
      expiresAt,
      createdAt: now.toISOString()
    });

    return res.status(201).json({
      success: true,
      message: 'Session created successfully.',
      session
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/demo
 * Create one visitor session from a permanent bearer link or a legacy
 * admin-issued single-use session link.
 */
router.post('/demo', (req, res, next) => {
  try {
    const { sourceSessionId, permanentLinkToken } = req.body || {};
    let sourceSession = null;
    let permanentLink = null;

    if (sourceSessionId && permanentLinkToken) {
      return res.status(400).json({
        success: false,
        error: 'Provide either a permanent demo link token or a single-use session ID, not both.'
      });
    }

    if (permanentLinkToken) {
      if (typeof permanentLinkToken !== 'string' || !/^[a-f0-9]{64}$/i.test(permanentLinkToken)) {
        return res.status(400).json({ success: false, error: 'Invalid permanent demo link token.' });
      }

      permanentLink = db.getPermanentDemoLinkByToken(permanentLinkToken);
      if (!permanentLink) {
        return res.status(404).json({ success: false, error: 'Permanent demo link was not found.' });
      }
      if (permanentLink.status !== 'enabled') {
        return res.status(403).json({ success: false, error: 'This permanent demo link is disabled or revoked.' });
      }
    } else if (sourceSessionId) {
      if (!isValidSessionId(sourceSessionId)) {
        return res.status(400).json({ success: false, error: 'Invalid source session ID format.' });
      }

      sourceSession = db.getSessionById(sourceSessionId);
      if (!sourceSession) {
        return res.status(404).json({ success: false, error: 'Source demonstration session was not found.' });
      }
      if (sourceSession.status === 'revoked') {
        return res.status(403).json({ success: false, error: 'This demonstration link has been revoked by the administrator.' });
      }
      if (new Date() > new Date(sourceSession.expiresAt)) {
        return res.status(410).json({ success: false, error: 'This demonstration link has expired. Please request a new link.' });
      }
      if (sourceSession.submissionsCount > 0 || db.getVisitorSessionForSource(sourceSessionId)) {
        return res.status(409).json({ success: false, error: 'This single-use demonstration link has already been used.' });
      }
    } else {
      return res.status(403).json({
        success: false,
        error: 'A valid permanent demo link or single-use session link is required.'
      });
    }

    const sanitizedLabel = sourceSession
      ? `Visitor: ${(sourceSession.label || `Demo ${sourceSession.id.substring(0, 8)}`).substring(0, 40)}`
      : 'Permanent Link Visitor';

    const configuredDuration = parseInt(process.env.DEMO_SESSION_DURATION_MINUTES, 10);
    const parsedDuration = Number.isInteger(configuredDuration) && configuredDuration >= 1 && configuredDuration <= 1440
      ? configuredDuration
      : 30;
    const sessionId = crypto.randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + parsedDuration * 60 * 1000).toISOString();

    const session = db.createSession({
      id: sessionId,
      label: sanitizedLabel,
      expiresAt,
      createdAt: now.toISOString(),
      sourceSessionId: sourceSession ? sourceSession.id : null,
      permanentLinkId: permanentLink ? permanentLink.id : null
    });

    return res.status(201).json({
      success: true,
      message: 'Public demonstration session created.',
      session: {
        id: session.id,
        label: session.label,
        status: session.status,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        submittedAt: session.submittedAt
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions
 * List all sessions (Admin Authorized).
 */
router.get('/', requireAdminAuth, (req, res, next) => {
  try {
    const sessions = db.listSessions();
    return res.json({
      success: true,
      sessions
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sessions/:id
 * Retrieve limited public session info for visitor page or inspection.
 */
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidSessionId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID format.'
      });
    }

    const session = db.getSessionById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found.'
      });
    }

    // Check expiration dynamically
    const now = new Date();
    const expiresAt = new Date(session.expiresAt);
    let effectiveStatus = session.status;

    if (effectiveStatus !== 'revoked' && now > expiresAt) {
      effectiveStatus = 'expired';
    }

    if (session.sourceSessionId && effectiveStatus !== 'revoked') {
      const sourceSession = db.getSessionById(session.sourceSessionId);
      if (!sourceSession) {
        return res.status(404).json({
          success: false,
          error: 'The demonstration link for this visitor session no longer exists.'
        });
      }
      if (sourceSession.status === 'revoked') {
        effectiveStatus = 'revoked';
      } else if (now > new Date(sourceSession.expiresAt)) {
        effectiveStatus = 'expired';
      } else if (sourceSession.submissionsCount > 0) {
        effectiveStatus = 'submitted';
      }
    }

    if (session.permanentLinkId && effectiveStatus !== 'revoked') {
      const permanentLink = db.getPermanentDemoLinkById(session.permanentLinkId);
      if (!permanentLink || permanentLink.status !== 'enabled') effectiveStatus = 'revoked';
    }

    // Return limited public information (never expose internals)
    const events = db.listEvents(id);
    return res.json({
      success: true,
      id: session.id,
      label: session.label,
      status: effectiveStatus,
      submissionsCount: session.submissionsCount || 0,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      events
    });
  } catch (err) {
    next(err);
  }
});

const ALLOWED_EVENT_TYPES = ['page_opened', 'demo_button_clicked', 'simulation_completed'];

/**
 * POST /api/sessions/:id/events
 * Record a non-sensitive awareness demonstration event (page_opened, demo_button_clicked, simulation_completed).
 * Sends a non-sensitive Telegram notification to the administrator if Telegram is configured.
 */
router.post('/:id/events', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { eventType, metadata } = req.body || {};

    if (!isValidSessionId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID format.'
      });
    }

    if (!eventType || !ALLOWED_EVENT_TYPES.includes(eventType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid event type. Allowed types: ${ALLOWED_EVENT_TYPES.join(', ')}`
      });
    }

    const session = db.getSessionById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found.'
      });
    }

    if (session.status === 'revoked') {
      return res.status(403).json({ success: false, error: 'Session has been revoked.' });
    }
    if (new Date() > new Date(session.expiresAt)) {
      return res.status(410).json({ success: false, error: 'Session has expired.' });
    }
    if (session.sourceSessionId) {
      const sourceSession = db.getSessionById(session.sourceSessionId);
      if (!sourceSession || sourceSession.status === 'revoked') {
        return res.status(403).json({ success: false, error: 'The demonstration link for this visitor session is unavailable.' });
      }
      if (new Date() > new Date(sourceSession.expiresAt)) {
        return res.status(410).json({ success: false, error: 'The demonstration link for this visitor session has expired.' });
      }
    }
    if (session.permanentLinkId) {
      const permanentLink = db.getPermanentDemoLinkById(session.permanentLinkId);
      if (!permanentLink || permanentLink.status !== 'enabled') {
        return res.status(403).json({ success: false, error: 'The permanent demo link has been disabled or revoked.' });
      }
    }

    // Record event in DB
    const now = new Date().toISOString();
    const event = db.recordEvent({
      sessionId: id,
      eventType,
      metadata: typeof metadata === 'object' ? metadata : null,
      createdAt: now
    });

    // If event is page_opened, also update session status to opened if it was created
    if (eventType === 'page_opened' && session.status === 'created') {
      db.markSessionOpened(id);
    }

    // Send non-sensitive Telegram notification if configured
    let telegramNotified = false;
    if (telegramService.isConfigured()) {
      try {
        const eventLabels = {
          page_opened: '🌐 Landing Page Viewed',
          demo_button_clicked: '🖱️ Simulation CTA Interacted',
          simulation_completed: '🎓 Awareness Simulation Completed'
        };

        const eventTitle = eventLabels[eventType] || eventType;
        const shortSession = id.substring(0, 8);
        const msg = [
          `<b>🛡️ Phishing Awareness Telemetry</b>`,
          `<b>Event:</b> ${eventTitle}`,
          `<b>Session:</b> <code>#${shortSession}</code>`,
          `<b>Time:</b> ${now}`,
          `<i>Note: Non-sensitive educational event log.</i>`
        ].join('\n');

        await telegramService.sendMessage({ text: msg });
        telegramNotified = true;
      } catch (tgErr) {
        console.warn('[Sessions] Non-critical Telegram event notification failure:', tgErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      event,
      telegramNotified
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:id/opened
 * Record that a visitor has opened the demonstration link.
 */
router.post('/:id/opened', (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidSessionId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID format.'
      });
    }

    const session = db.getSessionById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found.'
      });
    }

    // Verify session state
    if (session.status === 'revoked') {
      return res.status(403).json({
        success: false,
        error: 'Session has been revoked.'
      });
    }

    if (new Date() > new Date(session.expiresAt)) {
      return res.status(410).json({
        success: false,
        error: 'Session has expired.'
      });
    }

    if (session.sourceSessionId) {
      const sourceSession = db.getSessionById(session.sourceSessionId);
      if (!sourceSession) {
        return res.status(404).json({
          success: false,
          error: 'The demonstration link for this visitor session no longer exists.'
        });
      }
      if (sourceSession.status === 'revoked') {
        return res.status(403).json({
          success: false,
          error: 'The demonstration link for this visitor session has been revoked.'
        });
      }
      if (new Date() > new Date(sourceSession.expiresAt)) {
        return res.status(410).json({
          success: false,
          error: 'The demonstration link for this visitor session has expired.'
        });
      }
      if (sourceSession.submissionsCount > 0) {
        return res.status(409).json({
          success: false,
          error: 'The single-use demonstration link has already been used.'
        });
      }
    }

    if (session.permanentLinkId) {
      const permanentLink = db.getPermanentDemoLinkById(session.permanentLinkId);
      if (!permanentLink || permanentLink.status !== 'enabled') {
        return res.status(403).json({
          success: false,
          error: 'The permanent demo link has been disabled or revoked.'
        });
      }
    }

    if (session.status === 'created') {
      db.markSessionOpened(id);
    }

    return res.json({
      success: true,
      status: 'opened'
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/sessions/:id/revoke
 * Revoke an active demonstration session (Admin Authorized).
 */
router.post('/:id/revoke', requireAdminAuth, (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidSessionId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID format.'
      });
    }

    const session = db.getSessionById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found.'
      });
    }

    db.revokeSession(id);

    return res.json({
      success: true,
      message: `Session #${id.substring(0, 8)} revoked successfully.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
