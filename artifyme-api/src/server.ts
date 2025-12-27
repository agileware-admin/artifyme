import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.routes.js';
import transformRoutes from './routes/transform.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import userRoutes from './routes/user.routes.js';
import webhookRoutes from './routes/webhook.routes.js';
import adminRoutes from './routes/admin.routes.js';

// Import middleware
import { errorHandler } from './middleware/errorHandler.js';
import { keycloakMiddleware } from './middleware/keycloak.js';

// Import services
import { connectDatabase } from './database/connection.js';
import { connectRedis } from './services/redis.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ===========================================
// Security Middleware
// ===========================================
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ===========================================
// Request Parsing
// ===========================================
// Webhook routes need raw body for signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===========================================
// Logging
// ===========================================
app.use(morgan('combined'));

// ===========================================
// Health Check
// ===========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

// ===========================================
// API Routes
// ===========================================
app.use('/api/auth', authRoutes);
app.use('/api/transform', keycloakMiddleware, transformRoutes);
app.use('/api/payments', keycloakMiddleware, paymentRoutes);
app.use('/api/users', keycloakMiddleware, userRoutes);
app.use('/api/admin', keycloakMiddleware, adminRoutes);
app.use('/api/webhooks', webhookRoutes);

// ===========================================
// Error Handling
// ===========================================
app.use(errorHandler);

// ===========================================
// 404 Handler
// ===========================================
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ===========================================
// Start Server
// ===========================================
async function startServer() {
  try {
    // Connect to database
    await connectDatabase();
    console.log('✅ Database connected');

    // Connect to Redis
    await connectRedis();
    console.log('✅ Redis connected');

    // Start listening
    app.listen(PORT, () => {
      console.log(`🚀 ArtifyMe API Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

export default app;
