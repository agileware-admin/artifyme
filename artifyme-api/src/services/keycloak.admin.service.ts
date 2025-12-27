import axios from "axios";

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

type AdminTokenResponse = {
  access_token: string;
  expires_in: number;
};

export async function getKeycloakAdminToken(): Promise<string> {
  const keycloakUrl = requiredEnv("KEYCLOAK_URL");
  const realm = requiredEnv("KEYCLOAK_REALM");
  const adminClientId = requiredEnv("KEYCLOAK_ADMIN_CLIENT_ID");
  const adminClientSecret = requiredEnv("KEYCLOAK_ADMIN_CLIENT_SECRET");

  const url = `${keycloakUrl}/realms/${realm}/protocol/openid-connect/token`;

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: adminClientId,
    client_secret: adminClientSecret,
  });

  const { data } = await axios.post<AdminTokenResponse>(url, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 8000,
  });

  return data.access_token;
}

export async function keycloakResetPassword(args: {
  keycloakUserId: string;
  newPassword: string;
}) {
  const keycloakUrl = requiredEnv("KEYCLOAK_URL");
  const realm = requiredEnv("KEYCLOAK_REALM");

  const token = await getKeycloakAdminToken();

  const url = `${keycloakUrl}/admin/realms/${realm}/users/${args.keycloakUserId}/reset-password`;

  await axios.put(
    url,
    { type: "password", value: args.newPassword, temporary: false },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    }
  );
}

export async function keycloakLogoutUser(keycloakUserId: string) {
  const keycloakUrl = requiredEnv("KEYCLOAK_URL");
  const realm = requiredEnv("KEYCLOAK_REALM");
  const token = await getKeycloakAdminToken();

  const url = `${keycloakUrl}/admin/realms/${realm}/users/${keycloakUserId}/logout`;

  // Keycloak aceita POST sem body
  await axios.post(url, null, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 8000,
  });
}

export async function keycloakDisableUser(keycloakUserId: string) {
  const keycloakUrl = requiredEnv("KEYCLOAK_URL");
  const realm = requiredEnv("KEYCLOAK_REALM");
  const token = await getKeycloakAdminToken();

  const url = `${keycloakUrl}/admin/realms/${realm}/users/${keycloakUserId}`;

  await axios.put(
    url,
    { enabled: false },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    }
  );
}

/**
 * Idempotente: tenta logout e disable; se já estiver deslogado/desabilitado, não quebra o fluxo.
 */
export async function keycloakDisableAndLogoutUser(keycloakUserId: string) {
  try {
    await keycloakLogoutUser(keycloakUserId);
  } catch {
    // ignora (ex.: usuário já não tem sessão ativa)
  }

  try {
    await keycloakDisableUser(keycloakUserId);
  } catch {
    // se falhar aqui, vale logar em observabilidade
    throw new Error("KEYCLOAK_DISABLE_FAILED");
  }
}


export async function keycloakEnableUser(keycloakUserId: string) {
  const keycloakUrl = requiredEnv("KEYCLOAK_URL");
  const realm = requiredEnv("KEYCLOAK_REALM");
  const token = await getKeycloakAdminToken();

  const url = `${keycloakUrl}/admin/realms/${realm}/users/${keycloakUserId}`;

  await axios.put(
    url,
    { enabled: true },
    { headers: { Authorization: `Bearer ${token}` }, timeout: 8000 }
  );
}

