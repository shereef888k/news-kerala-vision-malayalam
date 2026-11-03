const express = require('express');
const multer = require('multer');
const db = require('../services/db');
const telegramService = require('../services/telegram');

const router = express.Router();

// Supported MIME types and limits
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit per file
const MAX_PHOTOS_PER_SESSION = parseInt(process.env.MAX_PHOTOS_PER_SESSION, 10) || 10;

// Configure Multer in-memory storage (never writes sensitive photos to disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_PHOTOS_PER_SESSION
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      const err = new Error(`Unsupported image format (${file.mimetype}). Only JPEG, PNG, and WebP are accepted.`);
      err.statusCode = 400;
      cb(err, false);
    }
  }
});

// Middleware supporting single 'photo' or multiple 'photos'
const uploadMiddleware = upload.fields([
  { name: 'photo', maxCount: MAX_PHOTOS_PER_SESSION },
  { name: 'photos', maxCount: MAX_PHOTOS_PER_SESSION }
]);

// Helper to validate session ID format (prevents injection/traversal attacks)
function isValidSessionId(id) {
  return typeof id === 'string' && /^[a-f0-9]{16,64}$/i.test(id);
}

/**
 * POST /api/sessions/:id/photo
 * Receive explicitly submitted photo(s) from a consented visitor and deliver to Telegram.
 * Supports multiple photo submissions per active demonstration session up to MAX_PHOTOS_PER_SESSION.
 */
router.post('/sessions/:id/photo', uploadMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;

    // 0. Validate session ID format
    if (!isValidSessionId(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid session ID format.'
      });
    }

    // 1. Gather all attached photo files (supports 'photo' or 'photos' field)
    const files = [];
    if (req.file) files.push(req.file);
    if (req.files) {
      if (Array.isArray(req.files)) {
        files.push(...req.files);
      } else {
        if (req.files.photo) files.push(...req.files.photo);
        if (req.files.photos) files.push(...req.files.photos);
      }
    }

    if (files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing photo file. Please provide an image in the "photo" form field.'
      });
    }

    // 2. Validate session existence
    const session = await db.getSessionById(id);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found. The link may be invalid or expired.'
      });
    }

    // 3. Verify session is not revoked
    if (session.status === 'revoked') {
      return res.status(403).json({
        success: false,
        error: 'This demonstration session has been revoked by the administrator.'
      });
    }

    // 4. Verify session has not expired
    const now = new Date();
    if (now > new Date(session.expiresAt)) {
      return res.status(410).json({
        success: false,
        error: 'This demonstration session has expired. Please request a new link.'
      });
    }

    if (session.sourceSessionId) {
      const sourceSession = await db.getSessionById(session.sourceSessionId);
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
      if (now > new Date(sourceSession.expiresAt)) {
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
      const permanentLink = await db.getPermanentDemoLinkById(session.permanentLinkId);
      if (!permanentLink || permanentLink.status !== 'enabled') {
        return res.status(403).json({
          success: false,
          error: 'The permanent demo link has been disabled or revoked.'
        });
      }
    }

    // 5. Check abuse limit (maximum authorized photos per session)
    const currentSubmissionsCount = await db.getSubmissionsCount(session.id);
    if (currentSubmissionsCount + files.length > MAX_PHOTOS_PER_SESSION) {
      return res.status(400).json({
        success: false,
        error: `Submission limit reached for this session (maximum ${MAX_PHOTOS_PER_SESSION} photos, ${currentSubmissionsCount} already submitted).`
      });
    }

    // 6. Transmit each authorized photo to Telegram Bot API and record in database
    const submissionTimestamp = now.toISOString();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const photoNum = currentSubmissionsCount + i + 1;
      const filename = `session-${id.substring(0, 8)}-${photoNum}.jpg`;

      await telegramService.sendPhoto({
        photoBuffer: file.buffer,
        filename,
        mimeType: file.mimetype,
        sessionId: session.id,
        label: session.label ? `${session.label} (Photo ${photoNum}/${MAX_PHOTOS_PER_SESSION})` : `Photo ${photoNum}/${MAX_PHOTOS_PER_SESSION}`,
        timestamp: submissionTimestamp
      });

      // Store each submission as a separate database record with timestamp & session reference
      await db.recordSubmission({
        sessionId: session.id,
        submittedAt: submissionTimestamp,
        filename,
        mimeType: file.mimetype,
        fileSize: file.size
      });
    }

    // 7. Update session to active state (not completed/locked) with latest timestamp
    await db.markSessionActive(session.id, submissionTimestamp);

    const updatedCount = currentSubmissionsCount + files.length;

    // 8. Return structured success
    return res.status(200).json({
      success: true,
      message: `${files.length} photo${files.length > 1 ? 's' : ''} explicitly submitted and delivered to administrator Telegram chat.`,
      session: {
        id: session.id,
        status: 'active',
        submittedAt: submissionTimestamp,
        submissionsCount: updatedCount,
        maxAllowed: MAX_PHOTOS_PER_SESSION
      },
      submissionsCount: updatedCount,
      maxAllowed: MAX_PHOTOS_PER_SESSION
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;

