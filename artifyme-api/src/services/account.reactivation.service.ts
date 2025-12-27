import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../database/connection";
import { sendMail } from "./mail.service";
import { keycloakDisableUser, keycloakEnableUser } from "./keycloak.admin.service";

const TTL_MINUTES = 30;

function nowPlusMinutes(m: number) {
  return new Date(Date.now() + m * 60 * 1000);
}

function buildLink(token: string) {
  const base = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/reactivate?token=${encodeURIComponent(token)}`;
}

export async function requestReactivation(email: string) {
  const emailNorm = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true, deletedAt: true },
  });

  // Só faz sentido reativar se estiver desativado
  if (!user || !user.deletedAt) return;

  const secret = crypto.randomBytes(32).toString("hex"); // sem pontos
  const tokenHash = await bcrypt.hash(secret, 12);

  const rec = await prisma.accountReactivationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: nowPlusMinutes(TTL_MINUTES),
    },
    select: { id: true },
  });

  const token = `${rec.id}.${secret}`;
  const link = buildLink(token);

  await sendMail({
    to: emailNorm,
    subject: "Reativação de conta",
    html: `
      <p>Recebemos uma solicitação para reativar sua conta.</p>
      <p>Se foi você, clique no link (expira em ${TTL_MINUTES} minutos):</p>
      <p><a href="${link}">${link}</a></p>
      <p>Se você não solicitou, ignore.</p>
    `,
  });
}

export async function confirmReactivation(token: string) {
  const raw = decodeURIComponent(token).trim();

  // split apenas no primeiro ponto
  const dot = raw.indexOf(".");
  if (dot <= 0) throw new Error("INVALID_TOKEN");

  const id = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!id || !secret) throw new Error("INVALID_TOKEN");

  const rec = await prisma.accountReactivationToken.findUnique({
    where: { id },
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { id: true, keycloakId: true, deletedAt: true } },
    },
  });

  if (!rec) throw new Error("INVALID_TOKEN");
  if (rec.usedAt) throw new Error("INVALID_TOKEN");
  if (rec.expiresAt.getTime() < Date.now()) throw new Error("INVALID_TOKEN");

  // Só confirma se o usuário estiver desativado
  if (!rec.user.deletedAt) throw new Error("INVALID_TOKEN");

  const ok = await bcrypt.compare(secret, rec.tokenHash);
  if (!ok) throw new Error("INVALID_TOKEN");

  // Reativa no Keycloak
  await keycloakEnableUser(rec.user.keycloakId);

  try {
    // Marca token usado + reativa no DB (transação)
  await prisma.$transaction([
    prisma.accountReactivationToken.update({
      where: { id: rec.id },
      data: { usedAt: new Date() },
    }),
    prisma.user.update({
      where: { id: rec.user.id },
      data: { deletedAt: null },
    }),
  ]);
  } catch (error) {
    await keycloakDisableUser(rec.user.keycloakId);
  }

}
