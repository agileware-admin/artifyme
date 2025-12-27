"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const uuid_1 = require("uuid");
const multer_1 = __importDefault(require("multer"));
const connection_js_1 = require("../database/connection.js");
const redis_service_js_1 = require("../services/redis.service.js");
const n8n_service_js_1 = require("../services/n8n.service.js");
const router = (0, express_1.Router)();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
        }
    },
});
// ===========================================
// Validation Schemas
// ===========================================
const transformRequestSchema = zod_1.z.object({
    style: zod_1.z.enum([
        'cartoon',
        'graffiti',
        'watercolor',
        'sketch',
        'pop-art',
        'neon',
        'anime',
        'renaissance',
        'impressionist',
        'minimalist',
    ]),
});
// ===========================================
// Start New Transformation
// ===========================================
router.post('/start', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No image file provided' });
            return;
        }
        const { style } = transformRequestSchema.parse(req.body);
        const userId = req.user.id;
        // Check user credits
        const user = await connection_js_1.prisma.user.findUnique({
            where: { keycloakId: userId },
            include: { subscription: true },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        // Check if user has credits or active subscription
        const hasActiveSubscription = user.subscription?.status === 'active';
        const hasCredits = user.credits > 0;
        if (!hasActiveSubscription && !hasCredits) {
            res.status(402).json({
                error: 'No credits available',
                code: 'NO_CREDITS',
                message: 'Please purchase credits or subscribe to continue',
            });
            return;
        }
        // Create transformation job
        const jobId = (0, uuid_1.v4)();
        const imageBase64 = req.file.buffer.toString('base64');
        // Store job in database
        const transformation = await connection_js_1.prisma.transformation.create({
            data: {
                id: jobId,
                userId: user.id,
                style,
                status: 'pending',
                inputImageData: imageBase64,
            },
        });
        // Add to Redis queue
        await (0, redis_service_js_1.addTransformationJob)({
            id: jobId,
            userId,
            imageUrl: imageBase64,
            style,
        });
        // Trigger N8N workflow
        (0, n8n_service_js_1.triggerN8NTransformation)({
            jobId,
            imageBase64,
            style,
            callbackUrl: `${process.env.API_URL}/api/webhooks/n8n/transformation-complete`,
        });
        // Deduct credit if not on subscription
        if (!hasActiveSubscription && hasCredits) {
            await connection_js_1.prisma.user.update({
                where: { id: user.id },
                data: { credits: { decrement: 1 } },
            });
        }
        res.status(202).json({
            jobId,
            status: 'pending',
            message: 'Transformation started',
            estimatedTime: '30-60 seconds',
        });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            res.status(400).json({ error: 'Validation error', details: error.errors });
            return;
        }
        console.error('Transformation start error:', error);
        res.status(500).json({ error: 'Failed to start transformation' });
    }
});
// ===========================================
// Get Transformation Status
// ===========================================
router.get('/status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const userId = req.user.id;
        // First check Redis for real-time status
        const redisStatus = await (0, redis_service_js_1.getTransformationStatus)(jobId);
        if (redisStatus) {
            res.json(redisStatus);
            return;
        }
        // Fall back to database
        const transformation = await connection_js_1.prisma.transformation.findFirst({
            where: {
                id: jobId,
                user: { keycloakId: userId },
            },
            select: {
                id: true,
                status: true,
                style: true,
                outputImageUrl: true,
                errorMessage: true,
                createdAt: true,
                completedAt: true,
            },
        });
        if (!transformation) {
            res.status(404).json({ error: 'Transformation not found' });
            return;
        }
        res.json({
            jobId: transformation.id,
            status: transformation.status,
            style: transformation.style,
            outputUrl: transformation.outputImageUrl,
            error: transformation.errorMessage,
            createdAt: transformation.createdAt,
            completedAt: transformation.completedAt,
        });
    }
    catch (error) {
        console.error('Get status error:', error);
        res.status(500).json({ error: 'Failed to get transformation status' });
    }
});
// ===========================================
// Get User's Transformation History
// ===========================================
router.get('/history', async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = '1', limit = '20' } = req.query;
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const skip = (pageNum - 1) * limitNum;
        const user = await connection_js_1.prisma.user.findUnique({
            where: { keycloakId: userId },
        });
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const [transformations, total] = await Promise.all([
            connection_js_1.prisma.transformation.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
                select: {
                    id: true,
                    style: true,
                    status: true,
                    outputImageUrl: true,
                    createdAt: true,
                    completedAt: true,
                },
            }),
            connection_js_1.prisma.transformation.count({ where: { userId: user.id } }),
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
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get transformation history' });
    }
});
// ===========================================
// Get Available Styles
// ===========================================
router.get('/styles', (req, res) => {
    const styles = [
        { id: 'cartoon', name: 'Cartoon', description: 'Fun cartoon style' },
        { id: 'graffiti', name: 'Graffiti', description: 'Urban street art style' },
        { id: 'watercolor', name: 'Watercolor', description: 'Soft watercolor painting' },
        { id: 'sketch', name: 'Sketch', description: 'Pencil sketch effect' },
        { id: 'pop-art', name: 'Pop Art', description: 'Andy Warhol inspired' },
        { id: 'neon', name: 'Neon', description: 'Vibrant neon lights' },
        { id: 'anime', name: 'Anime', description: 'Japanese animation style' },
        { id: 'renaissance', name: 'Renascentista', description: 'Classical renaissance painting' },
        { id: 'impressionist', name: 'Impressionista', description: 'Impressionist brush strokes' },
        { id: 'minimalist', name: 'Minimalista', description: 'Clean minimal design' },
    ];
    res.json({ styles });
});
exports.default = router;
//# sourceMappingURL=transform.routes.js.map