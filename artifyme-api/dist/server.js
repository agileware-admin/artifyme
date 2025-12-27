"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables
dotenv_1.default.config();
// Import routes
const auth_routes_js_1 = __importDefault(require("./routes/auth.routes.js"));
const transform_routes_js_1 = __importDefault(require("./routes/transform.routes.js"));
const payment_routes_js_1 = __importDefault(require("./routes/payment.routes.js"));
const user_routes_js_1 = __importDefault(require("./routes/user.routes.js"));
const webhook_routes_js_1 = __importDefault(require("./routes/webhook.routes.js"));
const admin_routes_js_1 = __importDefault(require("./routes/admin.routes.js"));
// Import middleware
const errorHandler_js_1 = require("./middleware/errorHandler.js");
const keycloak_js_1 = require("./middleware/keycloak.js");
// Import services
const connection_js_1 = require("./database/connection.js");
const redis_service_js_1 = require("./services/redis.service.js");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// ===========================================
// Security Middleware
// ===========================================
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:5173'],
    credentials: true,
}));
// Rate limiting
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);
// ===========================================
// Request Parsing
// ===========================================
// Webhook routes need raw body for signature verification
app.use('/api/webhooks', express_1.default.raw({ type: 'application/json' }));
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true }));
// ===========================================
// Logging
// ===========================================
app.use((0, morgan_1.default)('combined'));
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
app.use('/api/auth', auth_routes_js_1.default);
app.use('/api/transform', keycloak_js_1.keycloakMiddleware, transform_routes_js_1.default);
app.use('/api/payments', keycloak_js_1.keycloakMiddleware, payment_routes_js_1.default);
app.use('/api/users', keycloak_js_1.keycloakMiddleware, user_routes_js_1.default);
app.use('/api/admin', keycloak_js_1.keycloakMiddleware, admin_routes_js_1.default);
app.use('/api/webhooks', webhook_routes_js_1.default);
// ===========================================
// Error Handling
// ===========================================
app.use(errorHandler_js_1.errorHandler);
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
        await (0, connection_js_1.connectDatabase)();
        console.log('✅ Database connected');
        // Connect to Redis
        await (0, redis_service_js_1.connectRedis)();
        console.log('✅ Redis connected');
        // Start listening
        app.listen(PORT, () => {
            console.log(`🚀 ArtifyMe API Server running on port ${PORT}`);
            console.log(`📍 Environment: ${process.env.NODE_ENV}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}
startServer();
exports.default = app;
//# sourceMappingURL=server.js.map