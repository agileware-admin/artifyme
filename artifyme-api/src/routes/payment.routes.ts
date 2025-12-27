import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../database/connection.js';
import { createAsaasPayment, createAsaasSubscription } from '../services/asaas.service.js';
import { createStripeCheckout, createStripeSubscription } from '../services/stripe.service.js';

const router = Router();

// ===========================================
// Validation Schemas
// ===========================================
const purchaseCreditsSchema = z.object({
  package: z.enum(['small', 'medium', 'large']),
  region: z.enum(['BR', 'PT']),
});

const subscribeSchema = z.object({
  plan: z.enum(['basic', 'pro', 'premium']),
  billingCycle: z.enum(['monthly', 'yearly']),
  region: z.enum(['BR', 'PT']),
});

// Credit packages configuration
const CREDIT_PACKAGES = {
  small: { credits: 10, priceBRL: 1990, priceEUR: 490 }, // R$19.90 / €4.90
  medium: { credits: 50, priceBRL: 7990, priceEUR: 1990 }, // R$79.90 / €19.90
  large: { credits: 150, priceBRL: 19990, priceEUR: 4990 }, // R$199.90 / €49.90
};

// Subscription plans configuration
const SUBSCRIPTION_PLANS = {
  basic: {
    monthlyBRL: 2990,
    yearlyBRL: 28710, // 20% discount
    monthlyEUR: 790,
    yearlyEUR: 7580,
    transformations: 20,
  },
  pro: {
    monthlyBRL: 5990,
    yearlyBRL: 57510,
    monthlyEUR: 1490,
    yearlyEUR: 14310,
    transformations: 50,
  },
  premium: {
    monthlyBRL: 9990,
    yearlyBRL: 95910,
    monthlyEUR: 2490,
    yearlyEUR: 23910,
    transformations: -1, // unlimited
  },
};

// ===========================================
// Purchase Credits
// ===========================================
router.post('/credits/purchase', async (req: Request, res: Response) => {
  try {
    const { package: packageId, region } = purchaseCreditsSchema.parse(req.body);
    const userId = req.user!.id;

    const packageInfo = CREDIT_PACKAGES[packageId];
    
    const user = await prisma.user.findUnique({
      where: { keycloakId: userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Create order record
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        type: 'credits',
        status: 'pending',
        amount: region === 'BR' ? packageInfo.priceBRL : packageInfo.priceEUR,
        currency: region === 'BR' ? 'BRL' : 'EUR',
        metadata: { packageId, credits: packageInfo.credits },
      },
    });

    let paymentResult;

    if (region === 'BR') {
      // Use Asaas for Brazil
      paymentResult = await createAsaasPayment({
        orderId: order.id,
        amount: packageInfo.priceBRL,
        description: `ArtifyMe - ${packageInfo.credits} Créditos`,
        customerEmail: user.email,
        customerName: user.name,
      });
    } else {
      // Use Stripe for Portugal/Europe
      paymentResult = await createStripeCheckout({
        orderId: order.id,
        amount: packageInfo.priceEUR,
        description: `ArtifyMe - ${packageInfo.credits} Credits`,
        customerEmail: user.email,
        successUrl: `${process.env.FRONTEND_URL}/payment/success?order=${order.id}`,
        cancelUrl: `${process.env.FRONTEND_URL}/payment/cancel?order=${order.id}`,
      });
    }

    // Update order with payment reference
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentProvider: region === 'BR' ? 'asaas' : 'stripe',
        paymentId: paymentResult.paymentId,
      },
    });

    res.json({
      orderId: order.id,
      paymentUrl: paymentResult.paymentUrl,
      paymentId: paymentResult.paymentId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Purchase credits error:', error);
    res.status(500).json({ error: 'Failed to process payment' });
  }
});

// ===========================================
// Subscribe to Plan
// ===========================================
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const { plan, billingCycle, region } = subscribeSchema.parse(req.body);
    const userId = req.user!.id;

    const planInfo = SUBSCRIPTION_PLANS[plan];
    const isYearly = billingCycle === 'yearly';
    
    const user = await prisma.user.findUnique({
      where: { keycloakId: userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if user already has active subscription
    if (user.subscription?.status === 'active') {
      res.status(400).json({ 
        error: 'Already subscribed',
        message: 'Please cancel current subscription before subscribing to a new plan',
      });
      return;
    }

    const amount = region === 'BR'
      ? (isYearly ? planInfo.yearlyBRL : planInfo.monthlyBRL)
      : (isYearly ? planInfo.yearlyEUR : planInfo.monthlyEUR);

    let subscriptionResult;

    if (region === 'BR') {
      // Use Asaas for Brazil
      subscriptionResult = await createAsaasSubscription({
        userId: user.id,
        plan,
        billingCycle,
        amount,
        customerEmail: user.email,
        customerName: user.name,
      });
    } else {
      // Use Stripe for Portugal/Europe
      subscriptionResult = await createStripeSubscription({
        userId: user.id,
        plan,
        billingCycle,
        amount,
        customerEmail: user.email,
        successUrl: `${process.env.FRONTEND_URL}/subscription/success`,
        cancelUrl: `${process.env.FRONTEND_URL}/subscription/cancel`,
      });
    }

    res.json({
      subscriptionId: subscriptionResult.subscriptionId,
      paymentUrl: subscriptionResult.paymentUrl,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Failed to create subscription' });
  }
});

// ===========================================
// Get User's Subscription Status
// ===========================================
router.get('/subscription', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { keycloakId: userId },
      include: { subscription: true },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (!user.subscription) {
      res.json({ hasSubscription: false });
      return;
    }

    res.json({
      hasSubscription: true,
      subscription: {
        plan: user.subscription.plan,
        status: user.subscription.status,
        billingCycle: user.subscription.billingCycle,
        currentPeriodEnd: user.subscription.currentPeriodEnd,
        cancelAtPeriodEnd: user.subscription.cancelAtPeriodEnd,
      },
    });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Failed to get subscription' });
  }
});

// ===========================================
// Cancel Subscription
// ===========================================
router.post('/subscription/cancel', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const user = await prisma.user.findUnique({
      where: { keycloakId: userId },
      include: { subscription: true },
    });

    if (!user || !user.subscription) {
      res.status(404).json({ error: 'No active subscription found' });
      return;
    }

    // Mark subscription to cancel at period end
    await prisma.subscription.update({
      where: { id: user.subscription.id },
      data: { cancelAtPeriodEnd: true },
    });

    res.json({
      message: 'Subscription will be cancelled at the end of the current period',
      cancelAt: user.subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// ===========================================
// Get Order History
// ===========================================
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);

    const user = await prisma.user.findUnique({
      where: { keycloakId: userId },
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.order.count({ where: { userId: user.id } }),
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
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// ===========================================
// Get Available Plans and Prices
// ===========================================
router.get('/plans', (req: Request, res: Response) => {
  const { region = 'PT' } = req.query;
  const currency = region === 'BR' ? 'BRL' : 'EUR';

  const plans = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    monthlyPrice: region === 'BR' ? plan.monthlyBRL : plan.monthlyEUR,
    yearlyPrice: region === 'BR' ? plan.yearlyBRL : plan.yearlyEUR,
    transformationsPerMonth: plan.transformations,
    currency,
  }));

  const packages = Object.entries(CREDIT_PACKAGES).map(([id, pkg]) => ({
    id,
    credits: pkg.credits,
    price: region === 'BR' ? pkg.priceBRL : pkg.priceEUR,
    currency,
  }));

  res.json({ plans, packages });
});

export default router;
