"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStripeCheckout = createStripeCheckout;
exports.createStripeSubscription = createStripeSubscription;
exports.cancelStripeSubscription = cancelStripeSubscription;
exports.getStripePortalUrl = getStripePortalUrl;
exports.verifyStripeWebhook = verifyStripeWebhook;
const stripe_1 = __importDefault(require("stripe"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16',
});
// Price IDs mapping (configure in Stripe Dashboard)
const PRICE_IDS = {
    basic: {
        monthly: process.env.STRIPE_PRICE_BASIC_MONTHLY || '',
        yearly: process.env.STRIPE_PRICE_BASIC_YEARLY || '',
    },
    pro: {
        monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
        yearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
    },
    premium: {
        monthly: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || '',
        yearly: process.env.STRIPE_PRICE_PREMIUM_YEARLY || '',
    },
};
// ===========================================
// Create Checkout Session (One-time payment)
// ===========================================
async function createStripeCheckout(request) {
    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            customer_email: request.customerEmail,
            line_items: [
                {
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: request.description,
                        },
                        unit_amount: request.amount,
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                orderId: request.orderId,
            },
            success_url: request.successUrl,
            cancel_url: request.cancelUrl,
        });
        return {
            paymentId: session.id,
            paymentUrl: session.url,
        };
    }
    catch (error) {
        console.error('Stripe checkout creation failed:', error);
        throw error;
    }
}
// ===========================================
// Create Subscription
// ===========================================
async function createStripeSubscription(request) {
    try {
        const priceId = PRICE_IDS[request.plan]?.[request.billingCycle];
        if (!priceId) {
            // If no predefined price, create a dynamic one
            const session = await stripe.checkout.sessions.create({
                mode: 'subscription',
                payment_method_types: ['card'],
                customer_email: request.customerEmail,
                line_items: [
                    {
                        price_data: {
                            currency: 'eur',
                            product_data: {
                                name: `ArtifyMe - ${request.plan.charAt(0).toUpperCase() + request.plan.slice(1)} Plan`,
                            },
                            unit_amount: request.amount,
                            recurring: {
                                interval: request.billingCycle === 'yearly' ? 'year' : 'month',
                            },
                        },
                        quantity: 1,
                    },
                ],
                metadata: {
                    userId: request.userId,
                    plan: request.plan,
                    billingCycle: request.billingCycle,
                },
                success_url: request.successUrl,
                cancel_url: request.cancelUrl,
            });
            return {
                subscriptionId: session.id,
                paymentUrl: session.url,
            };
        }
        // Use predefined price
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            payment_method_types: ['card'],
            customer_email: request.customerEmail,
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            metadata: {
                userId: request.userId,
                plan: request.plan,
                billingCycle: request.billingCycle,
            },
            success_url: request.successUrl,
            cancel_url: request.cancelUrl,
        });
        return {
            subscriptionId: session.id,
            paymentUrl: session.url,
        };
    }
    catch (error) {
        console.error('Stripe subscription creation failed:', error);
        throw error;
    }
}
// ===========================================
// Cancel Subscription
// ===========================================
async function cancelStripeSubscription(subscriptionId) {
    try {
        await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: true,
        });
    }
    catch (error) {
        console.error('Stripe subscription cancellation failed:', error);
        throw error;
    }
}
// ===========================================
// Get Customer Portal URL
// ===========================================
async function getStripePortalUrl(customerId, returnUrl) {
    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });
        return session.url;
    }
    catch (error) {
        console.error('Failed to create Stripe portal session:', error);
        throw error;
    }
}
// ===========================================
// Verify Webhook Signature
// ===========================================
function verifyStripeWebhook(payload, signature) {
    return stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET);
}
//# sourceMappingURL=stripe.service.js.map