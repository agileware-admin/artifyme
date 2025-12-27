"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const crypto_1 = __importDefault(require("crypto"));
const connection_js_1 = require("../database/connection.js");
const redis_service_js_1 = require("../services/redis.service.js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const router = (0, express_1.Router)();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
// ===========================================
// N8N Transformation Complete Webhook
// ===========================================
router.post('/n8n/transformation-complete', async (req, res) => {
    try {
        const { jobId, status, outputUrl, error } = req.body;
        // Verify webhook signature (implement your own verification)
        const signature = req.headers['x-n8n-signature'];
        if (!verifyN8NSignature(req.body, signature)) {
            res.status(401).json({ error: 'Invalid signature' });
            return;
        }
        console.log(`📥 N8N Webhook: Job ${jobId} - ${status}`);
        // Update transformation in database
        const transformation = await connection_js_1.prisma.transformation.update({
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
        await (0, redis_service_js_1.updateTransformationStatus)(jobId, status === 'success' ? 'completed' : 'failed', { outputUrl, error });
        res.json({ success: true });
    }
    catch (error) {
        console.error('N8N webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
// ===========================================
// Stripe Webhook
// ===========================================
router.post('/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.error('Stripe webhook signature verification failed:', err);
        res.status(400).json({ error: 'Invalid signature' });
        return;
    }
    console.log(`📥 Stripe Webhook: ${event.type}`);
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                await handleStripeCheckoutComplete(session);
                break;
            }
            case 'invoice.paid': {
                const invoice = event.data.object;
                await handleStripeInvoicePaid(invoice);
                break;
            }
            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                await handleStripeSubscriptionUpdated(subscription);
                break;
            }
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                await handleStripeSubscriptionDeleted(subscription);
                break;
            }
            default:
                console.log(`Unhandled Stripe event type: ${event.type}`);
        }
        res.json({ received: true });
    }
    catch (error) {
        console.error('Stripe webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
// ===========================================
// Asaas Webhook
// ===========================================
router.post('/asaas', async (req, res) => {
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
    }
    catch (error) {
        console.error('Asaas webhook error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});
// ===========================================
// Helper Functions
// ===========================================
function verifyN8NSignature(body, signature) {
    if (!process.env.N8N_WEBHOOK_SECRET)
        return true; // Skip if not configured
    const hmac = crypto_1.default.createHmac('sha256', process.env.N8N_WEBHOOK_SECRET);
    hmac.update(JSON.stringify(body));
    const expectedSignature = hmac.digest('hex');
    return crypto_1.default.timingSafeEqual(Buffer.from(signature || ''), Buffer.from(expectedSignature));
}
async function handleStripeCheckoutComplete(session) {
    const orderId = session.metadata?.orderId;
    if (!orderId)
        return;
    const order = await connection_js_1.prisma.order.update({
        where: { id: orderId },
        data: { status: 'completed' },
        include: { user: true },
    });
    // If it's a credits purchase, add credits to user
    if (order.type === 'credits') {
        const credits = order.metadata?.credits || 0;
        await connection_js_1.prisma.user.update({
            where: { id: order.userId },
            data: { credits: { increment: credits } },
        });
        // Notify user via WebSocket
        await (0, redis_service_js_1.publishEvent)('notification', {
            userId: order.user.keycloakId,
            type: 'credits_added',
            message: `${credits} créditos adicionados à sua conta!`,
        });
    }
}
async function handleStripeInvoicePaid(invoice) {
    const subscriptionId = invoice.subscription;
    if (!subscriptionId)
        return;
    await connection_js_1.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscriptionId },
        data: {
            status: 'active',
            currentPeriodEnd: new Date((invoice.lines.data[0]?.period?.end || 0) * 1000),
        },
    });
}
async function handleStripeSubscriptionUpdated(subscription) {
    await connection_js_1.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: {
            status: subscription.status === 'active' ? 'active' : 'inactive',
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        },
    });
}
async function handleStripeSubscriptionDeleted(subscription) {
    await connection_js_1.prisma.subscription.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { status: 'cancelled' },
    });
}
async function handleAsaasPaymentConfirmed(payment) {
    const orderId = payment.externalReference;
    if (!orderId)
        return;
    const order = await connection_js_1.prisma.order.update({
        where: { id: orderId },
        data: { status: 'completed' },
        include: { user: true },
    });
    if (order.type === 'credits') {
        const credits = order.metadata?.credits || 0;
        await connection_js_1.prisma.user.update({
            where: { id: order.userId },
            data: { credits: { increment: credits } },
        });
        await (0, redis_service_js_1.publishEvent)('notification', {
            userId: order.user.keycloakId,
            type: 'credits_added',
            message: `${credits} créditos adicionados à sua conta!`,
        });
    }
}
async function handleAsaasPaymentFailed(payment) {
    const orderId = payment.externalReference;
    if (!orderId)
        return;
    await connection_js_1.prisma.order.update({
        where: { id: orderId },
        data: { status: 'failed' },
    });
}
async function handleAsaasSubscriptionActive(subscription) {
    const subscriptionId = subscription.externalReference;
    if (!subscriptionId)
        return;
    await connection_js_1.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'active' },
    });
}
async function handleAsaasSubscriptionCancelled(subscription) {
    const subscriptionId = subscription.externalReference;
    if (!subscriptionId)
        return;
    await connection_js_1.prisma.subscription.update({
        where: { id: subscriptionId },
        data: { status: 'cancelled' },
    });
}
exports.default = router;
//# sourceMappingURL=webhook.routes.js.map