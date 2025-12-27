"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToUser = sendToUser;
exports.broadcast = broadcast;
const ws_1 = require("ws");
const http_1 = require("http");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
const redis_service_js_1 = require("./services/redis.service.js");
dotenv_1.default.config();
const PORT = parseInt(process.env.PORT || '3001', 10);
// Store connected clients by user ID
const clients = new Map();
// Create HTTP server
const server = (0, http_1.createServer)((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy', connections: clients.size }));
    }
    else {
        res.writeHead(404);
        res.end();
    }
});
// Create WebSocket server
const wss = new ws_1.WebSocketServer({ server });
// ===========================================
// Authentication
// ===========================================
function authenticateToken(token) {
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const roles = decoded.realm_access?.roles || [];
        const role = roles.includes('admin') ? 'admin' : 'user';
        return { userId: decoded.sub, role };
    }
    catch (error) {
        return null;
    }
}
// ===========================================
// WebSocket Connection Handler
// ===========================================
wss.on('connection', (ws, req) => {
    console.log('🔌 New WebSocket connection attempt');
    // Extract token from query string
    const url = new URL(req.url || '', `http://localhost:${PORT}`);
    const token = url.searchParams.get('token');
    if (!token) {
        ws.close(4001, 'Authentication required');
        return;
    }
    const auth = authenticateToken(token);
    if (!auth) {
        ws.close(4002, 'Invalid token');
        return;
    }
    const { userId, role } = auth;
    console.log(`✅ User ${userId} connected (role: ${role})`);
    // Add client to user's connection set
    if (!clients.has(userId)) {
        clients.set(userId, new Set());
    }
    clients.get(userId).add(ws);
    // Send welcome message
    ws.send(JSON.stringify({
        type: 'connected',
        userId,
        role,
        timestamp: new Date().toISOString(),
    }));
    // Handle incoming messages
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            handleClientMessage(ws, userId, role, message);
        }
        catch (error) {
            console.error('Invalid message format:', error);
        }
    });
    // Handle disconnection
    ws.on('close', () => {
        console.log(`👋 User ${userId} disconnected`);
        clients.get(userId)?.delete(ws);
        if (clients.get(userId)?.size === 0) {
            clients.delete(userId);
        }
    });
    // Handle errors
    ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
    });
});
// ===========================================
// Message Handler
// ===========================================
function handleClientMessage(ws, userId, role, message) {
    switch (message.type) {
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
            break;
        case 'subscribe':
            // Subscribe to specific events
            console.log(`User ${userId} subscribed to:`, message.payload);
            break;
        default:
            console.log(`Unknown message type: ${message.type}`);
    }
}
// ===========================================
// Send Notification to User
// ===========================================
function sendToUser(userId, message) {
    const userClients = clients.get(userId);
    if (userClients) {
        const payload = JSON.stringify(message);
        userClients.forEach((client) => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
}
// ===========================================
// Broadcast to All Connected Users
// ===========================================
function broadcast(message, role) {
    const payload = JSON.stringify(message);
    wss.clients.forEach((client) => {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(payload);
        }
    });
}
// ===========================================
// Redis Pub/Sub for Cross-Instance Communication
// ===========================================
async function setupRedisPubSub() {
    await (0, redis_service_js_1.connectRedis)();
    // Subscribe to transformation events
    await redis_service_js_1.redisSubscriber.subscribe('transformation:complete', (message) => {
        try {
            const data = JSON.parse(message);
            sendToUser(data.userId, {
                type: 'transformation:complete',
                payload: data,
            });
        }
        catch (error) {
            console.error('Error processing transformation message:', error);
        }
    });
    // Subscribe to order events
    await redis_service_js_1.redisSubscriber.subscribe('order:update', (message) => {
        try {
            const data = JSON.parse(message);
            sendToUser(data.userId, {
                type: 'order:update',
                payload: data,
            });
        }
        catch (error) {
            console.error('Error processing order message:', error);
        }
    });
    // Subscribe to notification events
    await redis_service_js_1.redisSubscriber.subscribe('notification', (message) => {
        try {
            const data = JSON.parse(message);
            sendToUser(data.userId, {
                type: 'notification',
                payload: data,
            });
        }
        catch (error) {
            console.error('Error processing notification:', error);
        }
    });
    console.log('✅ Redis Pub/Sub connected');
}
// ===========================================
// Start Server
// ===========================================
async function start() {
    try {
        await setupRedisPubSub();
        server.listen(PORT, () => {
            console.log(`🔌 WebSocket Server running on port ${PORT}`);
        });
    }
    catch (error) {
        console.error('❌ Failed to start WebSocket server:', error);
        process.exit(1);
    }
}
start();
//# sourceMappingURL=websocket-server.js.map