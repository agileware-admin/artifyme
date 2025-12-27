"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerN8NTransformation = triggerN8NTransformation;
exports.checkN8NWorkflowStatus = checkN8NWorkflowStatus;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// ===========================================
// Trigger N8N Transformation Workflow
// ===========================================
async function triggerN8NTransformation(request) {
    const webhookUrl = process.env.N8N_WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('N8N_WEBHOOK_URL not configured');
        throw new Error('N8N integration not configured');
    }
    try {
        console.log(`🎨 Triggering N8N transformation for job ${request.jobId}`);
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(process.env.N8N_API_KEY && {
                    'Authorization': `Bearer ${process.env.N8N_API_KEY}`,
                }),
            },
            body: JSON.stringify({
                jobId: request.jobId,
                image: request.imageBase64,
                style: request.style,
                callbackUrl: request.callbackUrl,
                timestamp: new Date().toISOString(),
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`N8N webhook failed: ${response.status} - ${errorText}`);
            throw new Error(`N8N webhook failed: ${response.status}`);
        }
        console.log(`✅ N8N transformation triggered for job ${request.jobId}`);
    }
    catch (error) {
        console.error('Failed to trigger N8N workflow:', error);
        throw error;
    }
}
// ===========================================
// N8N Workflow Status Check (optional)
// ===========================================
async function checkN8NWorkflowStatus(executionId) {
    const n8nBaseUrl = process.env.N8N_BASE_URL;
    const apiKey = process.env.N8N_API_KEY;
    if (!n8nBaseUrl || !apiKey) {
        throw new Error('N8N configuration incomplete');
    }
    try {
        const response = await fetch(`${n8nBaseUrl}/api/v1/executions/${executionId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
        if (!response.ok) {
            throw new Error(`Failed to get execution status: ${response.status}`);
        }
        const execution = await response.json();
        return {
            status: execution.finished
                ? (execution.stoppedAt ? 'success' : 'error')
                : 'running',
            data: execution.data,
        };
    }
    catch (error) {
        console.error('Failed to check N8N workflow status:', error);
        throw error;
    }
}
//# sourceMappingURL=n8n.service.js.map