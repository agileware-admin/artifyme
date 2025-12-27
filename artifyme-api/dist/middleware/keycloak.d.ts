import { Request, Response, NextFunction } from 'express';
declare global {
    namespace Express {
        interface Request {
            user?: {
                id: string;
                email: string;
                name: string;
                roles: string[];
                isAdmin: boolean;
            };
        }
    }
}
export declare function keycloakMiddleware(req: Request, res: Response, next: NextFunction): Promise<void>;
export declare function adminOnly(req: Request, res: Response, next: NextFunction): void;
export declare function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void>;
//# sourceMappingURL=keycloak.d.ts.map