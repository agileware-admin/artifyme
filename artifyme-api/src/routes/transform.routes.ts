import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import { prisma } from '../database/connection.js';
import { 
  addTransformationJob, 
  getTransformationStatus,
  publishEvent 
} from '../services/redis.service.js';
import { triggerN8NTransformation } from '../services/n8n.service.js';

const router = Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and WebP are allowed.'));
    }
  },
});

// ===========================================
// Validation Schemas
// ===========================================
const transformRequestSchema = z.object({
  style: z.enum([
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
router.post(
  '/start',
  upload.single('image'),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No image file provided' });
        return;
      }

      const { style } = transformRequestSchema.parse(req.body);
      const userId = req.user!.id;

      // Check user credits
      const user = await prisma.user.findUnique({
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
      const jobId = uuidv4();
      const imageBase64 = req.file.buffer.toString('base64');

      // Store job in database
      const transformation = await prisma.transformation.create({
        data: {
          id: jobId,
          userId: user.id,
          style,
          status: 'pending',
          inputImageData: imageBase64,
        },
      });

      // Add to Redis queue
      await addTransformationJob({
        id: jobId,
        userId,
        imageUrl: imageBase64,
        style,
      });

      // Trigger N8N workflow
      triggerN8NTransformation({
        jobId,
        imageBase64,
        style,
        callbackUrl: `${process.env.API_URL}/api/webhooks/n8n/transformation-complete`,
      });

      // Deduct credit if not on subscription
      if (!hasActiveSubscription && hasCredits) {
        await prisma.user.update({
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
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Validation error', details: error.errors });
        return;
      }
      console.error('Transformation start error:', error);
      res.status(500).json({ error: 'Failed to start transformation' });
    }
  }
);

// ===========================================
// Get Transformation Status
// ===========================================
router.get('/status/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    const userId = req.user!.id;

    // First check Redis for real-time status
    const redisStatus = await getTransformationStatus(jobId);
    
    if (redisStatus) {
      res.json(redisStatus);
      return;
    }

    // Fall back to database
    const transformation = await prisma.transformation.findFirst({
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
  } catch (error) {
    console.error('Get status error:', error);
    res.status(500).json({ error: 'Failed to get transformation status' });
  }
});

// ===========================================
// Get User's Transformation History
// ===========================================
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const user = await prisma.user.findUnique({
      where: { keycloakId: userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [transformations, total] = await Promise.all([
      prisma.transformation.findMany({
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
      prisma.transformation.count({ where: { userId: user.id } }),
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
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to get transformation history' });
  }
});

// ===========================================
// Get Available Styles
// ===========================================
router.get('/styles', (req: Request, res: Response) => {
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

export default router;
