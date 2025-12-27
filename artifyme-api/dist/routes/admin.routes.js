"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const keycloak_js_1 = require("../middleware/keycloak.js");
const connection_js_1 = require("../database/connection.js");
const router = (0, express_1.Router)();
// All routes require admin role
router.use(keycloak_js_1.adminOnly);
// ===========================================
// Dashboard Overview
// ===========================================
router.get('/dashboard', async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const [totalUsers, newUsersThisMonth, activeUsers, totalTransformations, transformationsThisMonth, totalRevenue, revenueThisMonth, popularStyles, subscriptionDistribution,] = await Promise.all([
            // Total users
            connection_js_1.prisma.user.count(),
            // New users this month
            connection_js_1.prisma.user.count({
                where: { createdAt: { gte: startOfMonth } },
            }),
            // Active users (transformed in last 30 days)
            connection_js_1.prisma.user.count({
                where: {
                    transformations: {
                        some: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
                    },
                },
            }),
            // Total transformations
            connection_js_1.prisma.transformation.count(),
            // Transformations this month
            connection_js_1.prisma.transformation.count({
                where: { createdAt: { gte: startOfMonth } },
            }),
            // Total revenue
            connection_js_1.prisma.order.aggregate({
                where: { status: 'completed' },
                _sum: { amount: true },
            }),
            // Revenue this month
            connection_js_1.prisma.order.aggregate({
                where: {
                    status: 'completed',
                    createdAt: { gte: startOfMonth },
                },
                _sum: { amount: true },
            }),
            // Popular styles
            connection_js_1.prisma.transformation.groupBy({
                by: ['style'],
                _count: { style: true },
                orderBy: { _count: { style: 'desc' } },
                take: 5,
            }),
            // Subscription distribution
            connection_js_1.prisma.subscription.groupBy({
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
    }
    catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ error: 'Failed to get dashboard data' });
    }
});
// ===========================================
// List Users
// ===========================================
router.get('/users', async (req, res) => {
    try {
        const { page = '1', limit = '20', search } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = search
            ? {
                OR: [
                    { email: { contains: search, mode: 'insensitive' } },
                    { name: { contains: search, mode: 'insensitive' } },
                ],
            }
            : {};
        const [users, total] = await Promise.all([
            connection_js_1.prisma.user.findMany({
                where,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                include: {
                    subscription: { select: { plan: true, status: true } },
                    _count: { select: { transformations: true } },
                },
            }),
            connection_js_1.prisma.user.count({ where }),
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
    }
    catch (error) {
        console.error('List users error:', error);
        res.status(500).json({ error: 'Failed to list users' });
    }
});
// ===========================================
// List Orders
// ===========================================
router.get('/orders', async (req, res) => {
    try {
        const { page = '1', limit = '20', status } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = status ? { status: status } : {};
        const [orders, total] = await Promise.all([
            connection_js_1.prisma.order.findMany({
                where,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { email: true, name: true } },
                },
            }),
            connection_js_1.prisma.order.count({ where }),
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
    }
    catch (error) {
        console.error('List orders error:', error);
        res.status(500).json({ error: 'Failed to list orders' });
    }
});
// ===========================================
// List Transformations
// ===========================================
router.get('/transformations', async (req, res) => {
    try {
        const { page = '1', limit = '20', status, style } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const where = {};
        if (status)
            where.status = status;
        if (style)
            where.style = style;
        const [transformations, total] = await Promise.all([
            connection_js_1.prisma.transformation.findMany({
                where,
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { email: true, name: true } },
                },
            }),
            connection_js_1.prisma.transformation.count({ where }),
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
    }
    catch (error) {
        console.error('List transformations error:', error);
        res.status(500).json({ error: 'Failed to list transformations' });
    }
});
// ===========================================
// Add Credits to User
// ===========================================
router.post('/users/:userId/credits', async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, reason } = req.body;
        if (typeof amount !== 'number' || amount <= 0) {
            res.status(400).json({ error: 'Invalid credits amount' });
            return;
        }
        const user = await connection_js_1.prisma.user.update({
            where: { id: userId },
            data: { credits: { increment: amount } },
        });
        // Log admin action
        console.log(`Admin ${req.user.id} added ${amount} credits to user ${userId}. Reason: ${reason}`);
        res.json({
            message: `Added ${amount} credits to user`,
            newBalance: user.credits,
        });
    }
    catch (error) {
        console.error('Add credits error:', error);
        res.status(500).json({ error: 'Failed to add credits' });
    }
});
exports.default = router;
//# sourceMappingURL=admin.routes.js.map