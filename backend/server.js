require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./services/db');
const telegramService = require('./services/telegram');
const sessionsRouter = require('./routes/sessions');
const photosRouter = require('./routes/photos');
const permanentLinksRouter = require('./routes/permanentLinks');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 4000;
const isProduction = process.env.NODE_ENV === 'production';

// 1. Configure Express reverse proxy trust
// Render deploys services behind a single reverse proxy layer. Trusting 1 hop enables
// express-rate-limit and req.ip to correctly read the client IP from X-Forwarded-For
// without throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR or blindly trusting arbitrary hops.
app.set('trust proxy', 1);

// 2. HTTP Security Headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// 3. Strict CORS Configuration
const defaultOrigins = [
  'https://shereef888k.github.io',
  'https://news-kerala-vision-malayalam.onrender.com',
  'https://news-kerala-vision-malayalam-fronte-five.vercel.app'
];

const envOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-side curl, unit tests, mobile native agents)
    if (!origin) return callback(null, true);

    // In production mode, wildcard '*' is strictly prohibited
    if (isProduction) {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      const corsErr = new Error(`CORS blocked: Origin ${origin} is not in FRONTEND_ORIGIN production whitelist.`);
      corsErr.statusCode = 403;
      return callback(corsErr);
    }

    // Development mode logic:
    // If wildcard explicitly configured in development
    if (allowedOrigins.includes('*')) {
      return callback(null, true);
    }

    // Whitelist check
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow local development server ports (localhost, 127.0.0.1)
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }

    const devCorsErr = new Error(`CORS blocked: Origin ${origin} is not allowed by development CORS policy.`);
    devCorsErr.statusCode = 403;
    return callback(devCorsErr);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key', 'Accept'],
  credentials: true,
  maxAge: 86400 // Cache preflight for 24 hours
};

app.use(cors(corsOptions));

// 3. Rate Limiting
const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requests per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: 'Too many requests from this IP. Please try again after 15 minutes.'
  }
});

const photoSubmissionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 photo submissions per 15 minutes per IP
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: 'Submission rate limit reached. Please wait before attempting further photo uploads.'
  }
});

app.use('/api/', globalApiLimiter);
app.use('/api/sessions/:id/photo', photoSubmissionLimiter);

// 4. Request Body Parsers
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 5. Health Check Endpoint
app.get('/api/health', (req, res) => {
  try {
    db.healthCheck();
    return res.json({
      status: 'ok',
      service: 'Camera Security Demonstration API',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      database: 'connected',
      telegramConfigured: telegramService.isConfigured()
    });
  } catch (error) {
    console.error('[Health] SQLite check failed:', error.message);
    return res.status(503).json({
      status: 'error',
      service: 'Camera Security Demonstration API',
      timestamp: new Date().toISOString(),
      database: 'unavailable'
    });
  }
});

// 6. Mount API Routes
app.use('/api/sessions', sessionsRouter);
app.use('/api', photosRouter);
app.use('/api', permanentLinksRouter);

// 7. 404 & Centralized Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

// Initialize persistent database
db.initDatabase();

// Start server if executed directly
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🛡️  Camera Security Demo Backend Running`);
    console.log(`   Port:            ${PORT}`);
    console.log(`   Environment:     ${process.env.NODE_ENV || 'development'}`);
    console.log(`   Database:        ${process.env.DATABASE_PATH || 'data/sessions.db'}`);
    console.log(`   Allowed Origins: ${allowedOrigins.join(', ')}`);
    console.log(`   Telegram Status: ${telegramService.isConfigured() ? 'Configured ✅' : 'Not Configured ⚠️'}`);
    console.log(`====================================================`);
  });

  // Graceful shutdown handling
  const shutdown = (signal) => {
    console.log(`\nReceived ${signal}. Gracefully shutting down...`);
    server.close(() => {
      db.closeDatabase();
      console.log('Database connection closed. Process exited.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = app;
