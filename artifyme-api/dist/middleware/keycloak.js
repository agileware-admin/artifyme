"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.keycloakMiddleware = keycloakMiddleware;
exports.adminOnly = adminOnly;
exports.optionalAuth = optionalAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ===========================================
// Keycloak Token Verification
// ===========================================
async function verifyKeycloakToken(token) {
    try {
        // In production, verify against Keycloak's public key
        // For now, we'll use the JWT_SECRET for simplicity
        // In production, fetch the public key from Keycloak's JWKS endpoint
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        return decoded;
    }
    catch (error) {
        console.error('Token verification failed:', error);
        return null;
    }
}
// ===========================================
// Authentication Middleware
// ===========================================
async function keycloakMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Authorization header missing or invalid' });
        return;
    }
    const token = authHeader.substring(7);
    const decoded = await verifyKeycloakToken(token);
    if (!decoded) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return;
    }
    // Check token expiration
    if (decoded.exp * 1000 < Date.now()) {
        res.status(401).json({ error: 'Token expired' });
        return;
    }
    // Extract user info from token
    const roles = decoded.realm_access?.roles || [];
    const clientId = process.env.KEYCLOAK_CLIENT_ID || 'artifyme-app';
    const clientRoles = decoded.resource_access?.[clientId]?.roles || [];
    const allRoles = [...new Set([...roles, ...clientRoles])];
    req.user = {
        id: decoded.sub,
        email: decoded.email || '',
        name: decoded.name || decoded.preferred_username || '',
        roles: allRoles,
        isAdmin: allRoles.includes('admin'),
    };
    next();
}
// ===========================================
// Admin Only Middleware
// ===========================================
function adminOnly(req, res, next) {
    if (!req.user?.isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
}
// ===========================================
// Optional Authentication (doesn't fail if no token)
// ===========================================
async function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = await verifyKeycloakToken(token);
        if (decoded && decoded.exp * 1000 >= Date.now()) {
            const roles = decoded.realm_access?.roles || [];
            const clientId = process.env.KEYCLOAK_CLIENT_ID || 'artifyme-app';
            const clientRoles = decoded.resource_access?.[clientId]?.roles || [];
            const allRoles = [...new Set([...roles, ...clientRoles])];
            req.user = {
                id: decoded.sub,
                email: decoded.email || '',
                name: decoded.name || decoded.preferred_username || '',
                roles: allRoles,
                isAdmin: allRoles.includes('admin'),
            };
        }
    }
    next();
}
//# sourceMappingURL=keycloak.js.map