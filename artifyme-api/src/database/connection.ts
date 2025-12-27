import { PrismaClient } from '@prisma/client';

// Create Prisma client singleton
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// ===========================================
// Database Connection
// ===========================================
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('📦 Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

// ===========================================
// Graceful Shutdown
// ===========================================
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('📦 Database disconnected');
}

// Handle process termination
process.on('beforeExit', async () => {
  await disconnectDatabase();
});
