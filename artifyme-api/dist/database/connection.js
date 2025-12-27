"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
exports.connectDatabase = connectDatabase;
exports.disconnectDatabase = disconnectDatabase;
const client_1 = require("@prisma/client");
// Create Prisma client singleton
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
// ===========================================
// Database Connection
// ===========================================
async function connectDatabase() {
    try {
        await exports.prisma.$connect();
        console.log('📦 Database connected successfully');
    }
    catch (error) {
        console.error('❌ Database connection failed:', error);
        throw error;
    }
}
// ===========================================
// Graceful Shutdown
// ===========================================
async function disconnectDatabase() {
    await exports.prisma.$disconnect();
    console.log('📦 Database disconnected');
}
// Handle process termination
process.on('beforeExit', async () => {
    await disconnectDatabase();
});
//# sourceMappingURL=connection.js.map