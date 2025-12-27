import Stripe from 'stripe';
interface CheckoutRequest {
    orderId: string;
    amount: number;
    description: string;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
}
interface SubscriptionRequest {
    userId: string;
    plan: string;
    billingCycle: 'monthly' | 'yearly';
    amount: number;
    customerEmail: string;
    successUrl: string;
    cancelUrl: string;
}
export declare function createStripeCheckout(request: CheckoutRequest): Promise<{
    paymentId: string;
    paymentUrl: string;
}>;
export declare function createStripeSubscription(request: SubscriptionRequest): Promise<{
    subscriptionId: string;
    paymentUrl: string;
}>;
export declare function cancelStripeSubscription(subscriptionId: string): Promise<void>;
export declare function getStripePortalUrl(customerId: string, returnUrl: string): Promise<string>;
export declare function verifyStripeWebhook(payload: Buffer, signature: string): Stripe.Event;
export {};
//# sourceMappingURL=stripe.service.d.ts.map