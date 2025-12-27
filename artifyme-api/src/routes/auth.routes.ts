import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { confirmPasswordReset, requestPasswordReset } from '@/services/password.reset.service';
import { confirmReactivation, requestReactivation } from '@/services/account.reactivation.service';

dotenv.config();

const router = Router();

// ===========================================
// Validation Schemas
// ===========================================
const tokenExchangeSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  redirectUri: z.string().url('Invalid redirect URI'),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),
});

const passwordResetSchema = z.object({
  email: z.string().email('Email inválido'),
});

// ===========================================
// Get Keycloak Configuration
// ===========================================
router.get('/config', (req: Request, res: Response) => {
  res.json({
    url: process.env.KEYCLOAK_URL,
    realm: process.env.KEYCLOAK_REALM,
    clientId: process.env.KEYCLOAK_CLIENT_ID,
  });
});

// ===========================================
// Exchange Authorization Code for Tokens
// ===========================================
router.post('/token', async (req: Request, res: Response) => {
  try {
    const { code, redirectUri } = tokenExchangeSchema.parse(req.body);
    
    const tokenUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    });
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const error:any = await response.json();
      res.status(400).json({ 
        error: 'Failed to exchange token',
        details: error.error_description,
      });
      return;
    }
    
    const tokens = await response.json();
    res.json(tokens);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Token exchange error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// Refresh Access Token
// ===========================================
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = refreshTokenSchema.parse(req.body);
    
    const tokenUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
    
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
      refresh_token: refreshToken,
    });
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const error:any = await response.json();
      res.status(401).json({ 
        error: 'Failed to refresh token',
        details: error.error_description,
      });
      return;
    }
    
    const tokens = await response.json();
    res.json(tokens);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation error', details: error.errors });
      return;
    }
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ===========================================
// Logout
// ===========================================
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      const logoutUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/logout`;
      
      const params = new URLSearchParams({
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
        refresh_token: refreshToken,
      });
      
      await fetch(logoutUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    }
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    // Still return success even if Keycloak logout fails
    res.json({ message: 'Logged out successfully' });
  }
});

// ===========================================
// Verify Token
// ===========================================
router.get('/verify', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ valid: false, error: 'No token provided' });
    return;
  }
  
  const token = authHeader.substring(7);
  
  try {
    // Introspect token with Keycloak
    const introspectUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token/introspect`;
    
    const params = new URLSearchParams({
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET!,
      token,
    });
    
    const response = await fetch(introspectUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    
    const result:any = await response.json();
    
    if (!result.active) {
      res.status(401).json({ valid: false, error: 'Token is not active' });
      return;
    }
    
    res.json({
      valid: true,
      user: {
        id: result.sub,
        email: result.email,
        name: result.name,
        roles: result.realm_access?.roles || [],
      },
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ valid: false, error: 'Verification failed' });
  }
});

// ===========================================
// Login with Email/Password (Direct Access Grant)
// ===========================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    
    const tokenUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
    
    const params = new URLSearchParams({
      grant_type: 'password',
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      username: email,
      password,
      scope: 'openid profile email',
    });
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    
    if (!response.ok) {
      const error:any = await response.json();
      if (error.error === 'invalid_grant') {
        res.status(401).json({ 
          error: 'Credenciais inválidas',
          message: 'Email ou senha incorretos',
        });
        return;
      }
      res.status(400).json({ 
        error: 'Falha no login',
        message: error.error_description || 'Erro desconhecido',
      });
      return;
    }
    
    const tokens:any = await response.json();
    
    // Decode the access token to get user info
    const tokenPayload = JSON.parse(
      Buffer.from(tokens.access_token.split('.')[1], 'base64').toString()
    );
    
    res.json({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      user: {
        id: tokenPayload.sub,
        email: tokenPayload.email,
        name: tokenPayload.name || tokenPayload.preferred_username,
        roles: tokenPayload.realm_access?.roles || [],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      return;
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ===========================================
// Register New User
// ===========================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);
    
    // First, get admin token
    const adminTokenUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
    const adminParams = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
      client_secret: process.env.KEYCLOAK_ADMIN_CLIENT_SECRET || '',
    });
    
    // Try with admin credentials if client_credentials fails
    let adminToken: string;
    let adminResponse = await fetch(adminTokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: adminParams.toString(),
    });
    
    if (!adminResponse.ok) {
      // Try with password grant
      const passwordParams = new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: process.env.KEYCLOAK_ADMIN_USER || 'admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD || '',
      });
      
      adminResponse = await fetch(adminTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: passwordParams.toString(),
      });
    }
    
    if (!adminResponse.ok) {
      console.error('Failed to get admin token');
      res.status(500).json({ error: 'Erro ao criar usuário' });
      return;
    }
    
    const adminTokenData:any = await adminResponse.json();
    adminToken = adminTokenData.access_token;
    
    // Create user in Keycloak
    const usersUrl = `${process.env.KEYCLOAK_URL}/admin/realms/${process.env.KEYCLOAK_REALM}/users`;
    
    const nameParts = name.split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || '';
    
    const createUserResponse = await fetch(usersUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        username: email,
        email,
        firstName,
        lastName,
        enabled: true,
        emailVerified: true, // Set to false if email verification is required
        credentials: [{
          type: 'password',
          value: password,
          temporary: false,
        }],
        realmRoles: ['user'],
      }),
    });
    
    if (!createUserResponse.ok) {
      const errorText = await createUserResponse.text();
      console.log("Password being sent to Keycloak:", password);
      console.error('Create user error:', errorText);
      
      if (createUserResponse.status === 409) {
        res.status(409).json({ 
          error: 'Usuário já existe',
          message: 'Este email já está cadastrado',
        });
        return;
      }
      
      res.status(400).json({ 
        error: 'Falha ao criar usuário',
        message: 'Não foi possível criar a conta',
      });
      return;
    }
    
    // Get the created user ID from Location header
    const locationHeader = createUserResponse.headers.get('Location');
    const userId = locationHeader?.split('/').pop();
    
    // Now login the user automatically
    const tokenUrl = `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}/protocol/openid-connect/token`;
    
    const loginParams = new URLSearchParams({
      grant_type: 'password',
      client_id: process.env.KEYCLOAK_CLIENT_ID!,
      client_secret: process.env.KEYCLOAK_CLIENT_SECRET || '',
      username: email,
      password,
      scope: 'openid profile email',
    });
    
    const loginResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: loginParams.toString(),
    });
    
    if (!loginResponse.ok) {
      // User created but couldn't login automatically
      res.status(201).json({
        message: 'Conta criada com sucesso',
        user: { id: userId, email, name },
      });
      return;
    }
    
    const tokens:any = await loginResponse.json();
    const tokenPayload = JSON.parse(
      Buffer.from(tokens.access_token.split('.')[1], 'base64').toString()
    );
    
    res.status(201).json({
      message: 'Conta criada com sucesso',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      user: {
        id: tokenPayload.sub,
        email: tokenPayload.email,
        name: tokenPayload.name || name,
        roles: tokenPayload.realm_access?.roles || ['user'],
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {  
      res.status(400).json({ error: 'Dados inválidos', details: error.errors });
      return;
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});

// ===========================================
// Password Reset Request
// ===========================================
router.post("/password-reset", async (req, res) => {
  const schema = z.object({ email: z.string().email() });
  const { email } = schema.parse(req.body);
  console.log("[pwd-reset] request for email:", email);
  // sempre sucesso para evitar enumeração
  try {
    await requestPasswordReset(email);
  } catch (err) {
    console.error("[pwd-reset] requestPasswordReset failed:", err);
  }

  return res.json({
    message: "Se o email existir, você receberá instruções para redefinir a senha.",
  });
});

router.post("/password-reset/confirm", async (req, res) => {
  const schema = z.object({
    token: z.string().min(10),
    newPassword: z.string().min(8),
  });

  const { token, newPassword } = schema.parse(req.body);

  try {
    await confirmPasswordReset(token, newPassword);
    return res.json({ message: "Senha atualizada com sucesso." });
  } catch {
    // Resposta genérica (não revela se token existe/expirou)
    return res.status(400).json({ message: "Token inválido ou expirado." });
  }
});

router.post("/reactivate-request", async (req, res) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);

  await requestReactivation(email).catch(() => {});
  return res.json({ message: "Se o email existir, enviaremos instruções de reativação." });
});

router.post("/reactivate-confirm", async (req, res) => {
  const { token } = z.object({ token: z.string().min(10) }).parse(req.body);

  try {
    await confirmReactivation(token);
    return res.json({ message: "Conta reativada com sucesso." });
  } catch {
    return res.status(400).json({ message: "Token inválido ou expirado." });
  }
});



export default router;
