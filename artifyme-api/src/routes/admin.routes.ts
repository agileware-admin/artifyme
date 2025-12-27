import { Router, Request, Response } from 'express';
import { adminOnly } from '../middleware/keycloak.js';
import { prisma } from '../database/connection.js';
import { keycloakEnableUser } from '@/services/keycloak.admin.service.js';

const router = Router();

// All routes require admin role
router.use(adminOnly);

// ===========================================
// Dashboard Overview
// ===========================================
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const [
      totalUsers,
      newUsersThisMonth,
      activeUsers,
      totalTransformations,
      transformationsThisMonth,
      totalRevenue,
      revenueThisMonth,
      popularStyles,
      subscriptionDistribution,
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      
      // New users this month
      prisma.user.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      
      // Active users (transformed in last 30 days)
      prisma.user.count({
        where: {
          transformations: {
            some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          },
        },
      }),
      
      // Total transformations
      prisma.transformation.count(),
      
      // Transformations this month
      prisma.transformation.count({
        where: { createdAt: { gte: startOfMonth } },
      }),
      
      // Total revenue
      prisma.order.aggregate({
        where: { status: 'completed' },
        _sum: { amount: true },
      }),
      
      // Revenue this month
      prisma.order.aggregate({
        where: { 
          status: 'completed',
          createdAt: { gte: startOfMonth },
        },
        _sum: { amount: true },
      }),
      
      // Popular styles
      prisma.transformation.groupBy({
        by: ['style'],
        _count: { style: true },
        orderBy: { _count: { style: 'desc' } },
        take: 5,
      }),
      
      // Subscription distribution
      prisma.subscription.groupBy({
        by: ['plan'],
        where: { status: 'active' },
        _count: { plan: true },
      }),
    ]);

    res.json({
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        active: activeUsers,
      },
      transformations: {
        total: totalTransformations,
        thisMonth: transformationsThisMonth,
      },
      revenue: {
        total: totalRevenue._sum.amount || 0,
        thisMonth: revenueThisMonth._sum.amount || 0,
      },
      popularStyles: popularStyles.map((s) => ({
        style: s.style,
        count: s._count.style,
      })),
      subscriptions: subscriptionDistribution.map((s) => ({
        plan: s.plan,
        count: s._count.plan,
      })),
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

// ===========================================
// List Users
// ===========================================
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', search } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where = search
      ? {
          OR: [
            { email: { contains: search as string, mode: 'insensitive' as const } },
            { name: { contains: search as string, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          subscription: { select: { plan: true, status: true } },
          _count: { select: { transformations: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        credits: u.credits,
        subscription: u.subscription,
        transformations: u._count.transformations,
        createdAt: u.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

// ===========================================
// List Orders
// ===========================================
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where = status ? { status: status as string } : {};

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.json({
      orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List orders error:', error);
    res.status(500).json({ error: 'Failed to list orders' });
  }
});

// ===========================================
// List Transformations
// ===========================================
router.get('/transformations', async (req: Request, res: Response) => {
  try {
    const { page = '1', limit = '20', status, style } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (style) where.style = style;

    const [transformations, total] = await Promise.all([
      prisma.transformation.findMany({
        where,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { email: true, name: true } },
        },
      }),
      prisma.transformation.count({ where }),
    ]);

    res.json({
      transformations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('List transformations error:', error);
    res.status(500).json({ error: 'Failed to list transformations' });
  }
});

// ===========================================
// Add Credits to User
// ===========================================
router.post('/users/:userId/credits', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { amount, reason } = req.body;

    if (typeof amount !== 'number' || amount <= 0) {
      res.status(400).json({ error: 'Invalid credits amount' });
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
    });

    // Log admin action
    console.log(`Admin ${req.user!.id} added ${amount} credits to user ${userId}. Reason: ${reason}`);

    res.json({
      message: `Added ${amount} credits to user`,
      newBalance: user.credits,
    });
  } catch (error) {
    console.error('Add credits error:', error);
    res.status(500).json({ error: 'Failed to add credits' });
  }
});

// POST /api/admin/users/:keycloakId/reactivate
router.post("/users/:keycloakId/reactivate", async (req, res) => {
  try {
    const { keycloakId } = req.params;

    // 1) reativa no banco
    const user = await prisma.user.update({
      where: { keycloakId },
      data: { deletedAt: null },
      select: { id: true, email: true, keycloakId: true, deletedAt: true },
    });

    // 2) reativa no keycloak
    await keycloakEnableUser(keycloakId);

    return res.json({ message: "Usuário reativado", user });
  } catch (err) {
    console.error("Admin reactivate error:", err);
    return res.status(500).json({ message: "Falha ao reativar usuário" });
  }
});

export default router;
