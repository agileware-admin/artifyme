interface PaymentRequest {
    orderId: string;
    amount: number;
    description: string;
    customerEmail: string;
    customerName: string;
}
interface SubscriptionRequest {
    userId: string;
    plan: string;
    billingCycle: 'monthly' | 'yearly';
    amount: number;
    customerEmail: string;
    customerName: string;
}
export declare function createAsaasPayment(request: PaymentRequest): Promise<{
    paymentId: string;
    paymentUrl: string;
}>;
export declare function createAsaasSubscription(request: SubscriptionRequest): Promise<{
    subscriptionId: string;
    paymentUrl: string;
}>;
export declare function cancelAsaasSubscription(subscriptionId: string): Promise<void>;
export declare function getAsaasPaymentStatus(paymentId: string): Promise<{
    status: string;
    value: number;
    paidAt?: string;
}>;
export {};
//# sourceMappingURL=asaas.service.d.ts.map