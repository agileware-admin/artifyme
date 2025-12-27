import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import crypto from 'crypto';
import { prisma } from '../database/connection.js';
import { publishEvent, updateTransformationStatus } from '../services/redis.service.js';
import dotenv from 'dotenv';

dotenv.config();

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

// ===========================================
// N8N Transformation Complete Webhook
// ===========================================
router.post('/n8n/transformation-complete', async (req: Request, res: Response) => {
  try {
    const { jobId, status, outputUrl, error } = req.body;
    
    // Verify webhook signature (implement your own verification)
    const signature = req.headers['x-n8n-signature'];
    if (!verifyN8NSignature(req.body, signature as string)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    console.log(`📥 N8N Webhook: Job ${jobId} - ${status}`);

    // Update transformation in database
    const transformation = await prisma.transformation.update({
      where: { id: jobId },
      data: {
        status: status === 'success' ? 'completed' : 'failed',
        outputImageUrl: outputUrl,
        errorMessage: error,
        completedAt: new Date(),
      },
      include: { user: true },
    });

    // Update Redis cache and notify via WebSocket
    await updateTransformationStatus(
      jobId,
      status === 'success' ? 'completed' : 'failed',
      { outputUrl, error }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('N8N webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===========================================
// Stripe Webhook
// ===========================================
router.post('/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    res.status(400).json({ error: 'Invalid signature' });
    return;
  }

  console.log(`📥 Stripe Webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleStripeCheckoutComplete(session);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleStripeInvoicePaid(invoice);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleStripeSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleStripeSubscriptionDeleted(subscription);
        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Stripe webhook processing error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===========================================
// Asaas Webhook
// ===========================================
router.post('/asaas', async (req: Request, res: Response) => {
  try {
    const { event, payment, subscription } = req.body;

    // Verify Asaas webhook (implement signature verification)
    const token = req.headers['asaas-access-token'];
    if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    console.log(`📥 Asaas Webhook: ${event}`);

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED':
        await handleAsaasPaymentConfirmed(payment);
        break;

      case 'PAYMENT_OVERDUE':
      case 'PAYMENT_DELETED':
        await handleAsaasPaymentFailed(payment);
        break;

      case 'SUBSCRIPTION_CREATED':
      case 'SUBSCRIPTION_RENEWED':
        await handleAsaasSubscriptionActive(subscription);
        break;

      case 'SUBSCRIPTION_DELETED':
      case 'SUBSCRIPTION_INACTIVE':
        await handleAsaasSubscriptionCancelled(subscription);
        break;

      default:
        console.log(`Unhandled Asaas event: ${event}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Asaas webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===========================================
// Helper Functions
// ===========================================

function verifyN8NSignature(body: unknown, signature: string): boolean {
  if (!process.env.N8N_WEBHOOK_SECRET) return true; // Skip if not configured
  
  const hmac = crypto.createHmac('sha256', process.env.N8N_WEBHOOK_SECRET);
  hmac.update(JSON.stringify(body));
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature || ''),
    Buffer.from(expectedSignature)
  );
}

async function handleStripeCheckoutComplete(session: Stripe.Checkout.Session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'completed' },
    include: { user: true },
  });

  // If it's a credits purchase, add credits to user
  if (order.type === 'credits') {
    const credits = (order.metadata as { credits?: number })?.credits || 0;
    await prisma.user.update({
      where: { id: order.userId },
      data: { credits: { increment: credits } },
    });

    // Notify user via WebSocket
    await publishEvent('notification', {
      userId: order.user.keycloakId,
      type: 'credits_added',
      message: `${credits} créditos adicionados à sua conta!`,
    });
  }
}

async function handleStripeInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string;
  if (!subscriptionId) return;

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscriptionId },
    data: {
      status: 'active',
      currentPeriodEnd: new Date((invoice.lines.data[0]?.period?.end || 0) * 1000),
    },
  });
}

async function handleStripeSubscriptionUpdated(subscription: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: {
      status: subscription.status === 'active' ? 'active' : 'inactive',
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    },
  });
}

async function handleStripeSubscriptionDeleted(subscription: Stripe.Subscription) {
  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: subscription.id },
    data: { status: 'cancelled' },
  });
}

async function handleAsaasPaymentConfirmed(payment: { externalReference?: string; value: number }) {
  const orderId = payment.externalReference;
  if (!orderId) return;

  const order = await prisma.order.update({
    where: { id: orderId },
    data: { status: 'completed' },
    include: { user: true },
  });

  if (order.type === 'credits') {
    const credits = (order.metadata as { credits?: number })?.credits || 0;
    await prisma.user.update({
      where: { id: order.userId },
      data: { credits: { increment: credits } },
    });

    await publishEvent('notification', {
      userId: order.user.keycloakId,
      type: 'credits_added',
      message: `${credits} créditos adicionados à sua conta!`,
    });
  }
}

async function handleAsaasPaymentFailed(payment: { externalReference?: string }) {
  const orderId = payment.externalReference;
  if (!orderId) return;

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'failed' },
  });
}

async function handleAsaasSubscriptionActive(subscription: { externalReference?: string }) {
  const subscriptionId = subscription.externalReference;
  if (!subscriptionId) return;

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'active' },
  });
}

async function handleAsaasSubscriptionCancelled(subscription: { externalReference?: string }) {
  const subscriptionId = subscription.externalReference;
  if (!subscriptionId) return;

  await prisma.subscription.update({
    where: { id: subscriptionId },
    data: { status: 'cancelled' },
  });
}

export default router;
