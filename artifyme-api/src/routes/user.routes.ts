import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../database/connection.js';
import { keycloakDisableAndLogoutUser } from '@/services/keycloak.admin.service.js';
import { keycloakMiddleware } from '@/middleware/keycloak.js';

const router = Router();

// ===========================================
// Get Current User Profile
// ===========================================
router.get("/me", keycloakMiddleware, async (req, res) => {
  try {
    const keycloakId = req.user!.id;

    // inclua a subscription aqui também, pra manter o tipo igual ao create()
    let user = await prisma.user.findUnique({
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

    // bloqueia soft-deleted (redundante com o middleware, mas é bom defensivo)
    if (user?.deletedAt) {
      return res.status(403).json({ message: "Conta desativada" });
    }

    // Create user if doesn't exist (first login)
    if (!user) {
      const email = req.user!.email;
      if (!email) {
        // Isso normalmente indica que o Keycloak não está incluindo "email" no token/introspection
        return res.status(400).json({
          message: "Token não contém email. Verifique scope/mappers no Keycloak.",
        });
      }

      user = await prisma.user.create({
        data: {
          keycloakId,
          email,
          name: req.user!.name ?? null,
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

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      credits: user.credits,
      isAdmin: req.user!.isAdmin,
      subscription: user.subscription,
      createdAt: user.createdAt,
    });
  } catch (error) {
    console.error("Get user profile error:", error);
    return res.status(500).json({ error: "Failed to get user profile" });
  }
});

// ===========================================
// Update User Profile
// ===========================================
const updateProfileSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  preferences: z.object({
    emailNotifications: z.boolean().optional(),
    smsNotifications: z.boolean().optional(),
    language: z.enum(['pt-BR', 'pt-PT', 'en']).optional(),
  }).optional(),
});

router.patch('/me', async (req: Request, res: Response) => {
  try {
    const keycloakId = req.user!.id;
    const data = updateProfileSchema.parse(req.body);

    const user = await prisma.user.update({
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
  } catch (error) {
    if (error instanceof z.ZodError) {
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
router.get('/credits', async (req: Request, res: Response) => {
  try {
    const keycloakId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { keycloakId },
      select: { credits: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ credits: user.credits });
  } catch (error) {
    console.error('Get credits error:', error);
    res.status(500).json({ error: 'Failed to get credits balance' });
  }
});

// ===========================================
// Get User Statistics
// ===========================================
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const keycloakId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { keycloakId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [
      totalTransformations,
      completedTransformations,
      favoriteStyle,
    ] = await Promise.all([
      prisma.transformation.count({ where: { userId: user.id } }),
      prisma.transformation.count({ 
        where: { userId: user.id, status: 'completed' } 
      }),
      prisma.transformation.groupBy({
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
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get user statistics' });
  }
});

router.delete("/me", keycloakMiddleware, async (req, res) => {
  const keycloakId = req.user!.id;

  // idempotente: se não existir no banco, ainda assim desativa no KC (se existir lá)
  const dbUser = await prisma.user.findUnique({
    where: { keycloakId },
    select: { id: true, deletedAt: true },
  });

  // Marca soft delete (se existir e ainda não estiver deletado)
  if (dbUser && !dbUser.deletedAt) {
    await prisma.user.update({
      where: { keycloakId },
      data: { deletedAt: new Date() },
    });
  }

  // Revoga sessões e desativa no Keycloak
  await keycloakDisableAndLogoutUser(keycloakId);

  return res.json({ message: "Conta desativada" });
});

export default router;
