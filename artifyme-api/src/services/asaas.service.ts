import dotenv from 'dotenv';

dotenv.config();

const ASAAS_API_URL = process.env.ASAAS_ENVIRONMENT === 'production'
  ? 'https://api.asaas.com/v3'
  : 'https://sandbox.asaas.com/api/v3';

interface PaymentRequest {
  orderId: string;
  amount: number; // in cents
  description: string;
  customerEmail: string;
  customerName: string;
}

interface SubscriptionRequest {
  userId: string;
  plan: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number; // in cents
  customerEmail: string;
  customerName: string;
}

// ===========================================
// Helper: Make Asaas API Request
// ===========================================
async function asaasRequest(endpoint: string, method: string, body?: unknown) {
  const response = await fetch(`${ASAAS_API_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': process.env.ASAAS_API_KEY!,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Asaas API error:', error);
    throw new Error(error.errors?.[0]?.description || 'Asaas API error');
  }

  return response.json();
}

// ===========================================
// Find or Create Customer
// ===========================================
async function findOrCreateCustomer(email: string, name: string): Promise<string> {
  // Try to find existing customer
  const search = await asaasRequest(`/customers?email=${encodeURIComponent(email)}`, 'GET');
  
  if (search.data?.length > 0) {
    return search.data[0].id;
  }

  // Create new customer
  const customer = await asaasRequest('/customers', 'POST', {
    name,
    email,
    notificationDisabled: false,
  });

  return customer.id;
}

// ===========================================
// Create One-Time Payment
// ===========================================
export async function createAsaasPayment(request: PaymentRequest): Promise<{
  paymentId: string;
  paymentUrl: string;
}> {
  try {
    const customerId = await findOrCreateCustomer(request.customerEmail, request.customerName);

    const payment = await asaasRequest('/payments', 'POST', {
      customer: customerId,
      billingType: 'UNDEFINED', // Let customer choose payment method
      value: request.amount / 100, // Asaas expects value in reais, not cents
      dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 3 days
      description: request.description,
      externalReference: request.orderId,
      postalService: false,
    });

    return {
      paymentId: payment.id,
      paymentUrl: payment.invoiceUrl,
    };
  } catch (error) {
    console.error('Asaas payment creation failed:', error);
    throw error;
  }
}

// ===========================================
// Create Subscription
// ===========================================
export async function createAsaasSubscription(request: SubscriptionRequest): Promise<{
  subscriptionId: string;
  paymentUrl: string;
}> {
  try {
    const customerId = await findOrCreateCustomer(request.customerEmail, request.customerName);

    const cycle = request.billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY';

    const subscription = await asaasRequest('/subscriptions', 'POST', {
      customer: customerId,
      billingType: 'UNDEFINED',
      value: request.amount / 100,
      cycle,
      description: `ArtifyMe - Plano ${request.plan.charAt(0).toUpperCase() + request.plan.slice(1)}`,
      externalReference: request.userId,
    });

    return {
      subscriptionId: subscription.id,
      paymentUrl: subscription.invoiceUrl || `https://asaas.com/c/${subscription.id}`,
    };
  } catch (error) {
    console.error('Asaas subscription creation failed:', error);
    throw error;
  }
}

// ===========================================
// Cancel Subscription
// ===========================================
export async function cancelAsaasSubscription(subscriptionId: string): Promise<void> {
  try {
    await asaasRequest(`/subscriptions/${subscriptionId}`, 'DELETE');
  } catch (error) {
    console.error('Asaas subscription cancellation failed:', error);
    throw error;
  }
}

// ===========================================
// Get Payment Status
// ===========================================
export async function getAsaasPaymentStatus(paymentId: string): Promise<{
  status: string;
  value: number;
  paidAt?: string;
}> {
  try {
    const payment = await asaasRequest(`/payments/${paymentId}`, 'GET');
    return {
      status: payment.status,
      value: payment.value,
      paidAt: payment.paymentDate,
    };
  } catch (error) {
    console.error('Failed to get Asaas payment status:', error);
    throw error;
  }
}
