"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const connection_js_1 = require("../database/connection.js");
const router = (0, express_1.Router)();
// ===========================================
// Get Current User Profile
// ===========================================
router.get('/me', async (req, res) => {
    try {
        const keycloakId = req.user.id;
        let user = await connection_js_1.prisma.user.findUnique({
            where: { keycloakId },
            include: {
                subscription: {
                    select: {
                        plan: true,
                        status: true,
                        billingCycle: true,
                        currentPeriodEnd: true,
                    },
                },
            },
        });
        // Create user if doesn't exist (first login)
        if (!user) {
            user = await connection_js_1.prisma.user.create({
                data: {
                    keycloakId,
                    email: req.user.email,
                    name: req.user.name,
                    credits: 3, // Free credits for new users
                },
                include: {
                    subscription: {
                        select: {
                            plan: true,
                            status: true,
                            billingCycle: true,
                            currentPeriodEnd: true,
                        },
                    },
                },
            });
        }
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            credits: user.credits,
            isAdmin: req.user.isAdmin,
            subscription: user.subscription,
            createdAt: user.createdAt,
        });
    }
    catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ error: 'Failed to get user profile' });
    }
});
// ===========================================
// Update User Profile
// ===========================================
const updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100).optional(),
    preferences: zod_1.z.object({
        emailNotifications: zod_1.z.boolean().optional(),
        smsNotifications: zod_1.z.boolean().optional(),
        language: zod_1.z.enum(['pt-BR', 'pt-PT', 'en']).optional(),
    }).optional(),
});
router.patch('/me', async (req, res) => {
    try {
        const keycloakId = req.user.id;
        const data = updateProfileSchema.parse(req.body);
        const user = await connection_js_1.prisma.user.update({
            where: { keycloakId },
            data: {
                name: data.name,
                preferences: data.preferences,
            },
        });
        res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            preferences: user.preferences,
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation error', details: error.errors });
            return;
        }
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});
// ===========================================
// Get User Credits Balance
// ===========================================
router.get('/credits', async (req, res) => {
    try {
        const keycloakId = req.user.id;
        const user = await connection_js_1.prisma.user.findUnique({
            where: { keycloakId },
            select: { credits: true },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json({ credits: user.credits });
    }
    catch (error) {
        console.error('Get credits error:', error);
        res.status(500).json({ error: 'Failed to get credits balance' });
    }
});
// ===========================================
// Get User Statistics
// ===========================================
router.get('/stats', async (req, res) => {
    try {
        const keycloakId = req.user.id;
        const user = await connection_js_1.prisma.user.findUnique({
            where: { keycloakId },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const [totalTransformations, completedTransformations, favoriteStyle,] = await Promise.all([
            connection_js_1.prisma.transformation.count({ where: { userId: user.id } }),
            connection_js_1.prisma.transformation.count({
                where: { userId: user.id, status: 'completed' }
            }),
            connection_js_1.prisma.transformation.groupBy({
                by: ['style'],
                where: { userId: user.id },
                _count: { style: true },
                orderBy: { _count: { style: 'desc' } },
                take: 1,
            }),
        ]);
        res.json({
            totalTransformations,
            completedTransformations,
            successRate: totalTransformations > 0
                ? Math.round((completedTransformations / totalTransformations) * 100)
                : 0,
            favoriteStyle: favoriteStyle[0]?.style || null,
            credits: user.credits,
        });
    }
    catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get user statistics' });
    }
});
exports.default = router;
//# sourceMappingURL=user.routes.js.map