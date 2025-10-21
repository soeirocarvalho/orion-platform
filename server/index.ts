import express, { type Request, Response, NextFunction } from "express";
import multer from "multer";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { validateStartupIntegrity as validateFixedLoaderIntegrity } from "./services/fixed-data-loader.js";
import { validateStartupIntegrity as validateIntegrityValidator } from "./services/integrity-validator.js";
import { databaseSeeder } from "./services/database-seeder.js";

// Validate required environment variables at startup
function validateEnvironment() {
  const required = ['DATABASE_URL', 'OPENAI_API_KEY', 'SESSION_SECRET'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error('❌ FATAL: Missing required environment variables:');
    missing.forEach(key => console.error(`   - ${key}`));
    console.error('\nProduction deployment requires these variables to be set.');
    console.error('See replit.md for deployment checklist.');
    process.exit(1);
  }
  
  // Warn about optional but recommended variables
  const optional = ['STRIPE_SECRET_KEY', 'REPLIT_DOMAINS'];
  const missingOptional = optional.filter(key => !process.env[key]);
  if (missingOptional.length > 0) {
    console.warn('⚠️  Optional environment variables not set (some features may be unavailable):');
    missingOptional.forEach(key => {
      console.warn(`   - ${key}`);
      if (key === 'REPLIT_DOMAINS') {
        console.warn('     (Required for Replit OAuth authentication - skip if deploying elsewhere)');
      }
    });
  }
}

// Run validation in production mode
if (process.env.NODE_ENV === 'production') {
  validateEnvironment();
}

// Global error handlers to prevent server crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Promise Rejection:', reason);
  console.error('Promise:', promise);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Log but don't exit - let the server continue running
});

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// CRITICAL FIX: Disable HTTP caching for API routes to prevent 304 responses with empty bodies
// This fixes the deployment "0 forces" issue where 304 responses are interpreted as empty data
app.set('etag', false); // Disable ETag generation
app.disable('etag'); // Double-ensure ETag is disabled

// Add no-cache middleware for all API routes
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 200 * 1024 * 1024, // 200MB limit for large database imports
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/json'];
    const allowedExtensions = ['.csv', '.xls', '.xlsx', '.json'];
    
    const hasValidType = allowedTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some(ext => file.originalname.toLowerCase().endsWith(ext));
    
    if (hasValidType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV, Excel, and JSON files are allowed.'));
    }
  }
});

// Make upload middleware available to routes
app.locals.upload = upload;

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize backend invariants
  try {
    log('Ensuring default project invariant...');
    await storage.ensureDefaultProject();
    log('Default project invariant verified');
    
    // Auto-seed database if needed (production startup)
    log('Checking database seed status...');
    await databaseSeeder.seedIfNeeded();
    log('Database seed check completed');
    
    // Fixed loader startup integrity validation
    log('Running fixed loader startup integrity validation...');
    try {
      await validateFixedLoaderIntegrity();
      await validateIntegrityValidator();
      log('Fixed loader integrity validation completed');
    } catch (error) {
      if (error instanceof Error && error.name === 'StartupIntegrityError') {
        console.error('🚨 CRITICAL: Fixed loader integrity validation failed');
        console.error(error.message);
        // In strict mode, we could choose to exit here, but for now just log
        console.error('⚠️  Continuing with degraded functionality...');
      } else {
        console.warn('Fixed loader integrity check encountered issues:', error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error('Failed to ensure default project:', error);
    throw error;
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error('[Express Error Handler]', err);
    res.status(status).json({ message });
    // Don't throw - just log the error to prevent server crashes
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
