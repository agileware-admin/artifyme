interface TransformationRequest {
    jobId: string;
    imageBase64: string;
    style: string;
    callbackUrl: string;
}
export declare function triggerN8NTransformation(request: TransformationRequest): Promise<void>;
export declare function checkN8NWorkflowStatus(executionId: string): Promise<{
    status: 'running' | 'success' | 'error';
    data?: unknown;
}>;
export {};
//# sourceMappingURL=n8n.service.d.ts.map