import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "../database/connection";
import { sendMail } from "./mail.service";
import { keycloakResetPassword } from "./keycloak.admin.service";

const RESET_TTL_MINUTES = 30;

function nowPlusMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function buildResetLink(token: string) {
  const base = process.env.FRONTEND_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}

export async function requestPasswordReset(email: string) {
  const emailNorm = email.trim().toLowerCase();
  console.log("[pwd-reset] requested for:", emailNorm);

  const user = await prisma.user.findUnique({
    where: { email: emailNorm },
    select: { id: true, keycloakId: true, deletedAt: true },
  });

  console.log("[pwd-reset] user exists?", !!user, "deletedAt:", user?.deletedAt);

  if (!user || user.deletedAt) {
    console.log("[pwd-reset] not sending (missing user or deleted)");
    return;
  }

  const secret = crypto.randomBytes(32).toString("hex");
  const tokenHash = await bcrypt.hash(secret, 12);

  const record = await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: nowPlusMinutes(RESET_TTL_MINUTES),
    },
    select: { id: true },
  });

  const token = `${record.id}.${secret}`;
  const link = buildResetLink(token);

  console.log("[pwd-reset] sending email to:", emailNorm);

  await sendMail({
    to: emailNorm, // <-- use o normalizado
    subject: "Redefinição de senha",
    html: `
      <p>Recebemos uma solicitação para redefinir sua senha.</p>
      <p>Se foi você, clique no link abaixo (expira em ${RESET_TTL_MINUTES} minutos):</p>
      <p><a href="${link}">${link}</a></p>
      <p>Se você não solicitou, ignore este email.</p>
    `,
  });

  console.log("[pwd-reset] email sendMail() done");
}


export async function confirmPasswordReset(token: string, newPassword: string) {
  // Token esperado: "<id>.<secret>"
  const [id, secret] = token.split(".");
  if (!id || !secret) {
    throw new Error("INVALID_TOKEN");
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { id },
    select: {
      id: true,
      tokenHash: true,
      expiresAt: true,
      usedAt: true,
      user: { select: { keycloakId: true, deletedAt: true } },
    },
  });

  if (!record) throw new Error("INVALID_TOKEN");
  if (record.usedAt) throw new Error("INVALID_TOKEN");
  if (record.expiresAt.getTime() < Date.now()) throw new Error("INVALID_TOKEN");
  if (record.user.deletedAt) throw new Error("INVALID_TOKEN");

  const ok = await bcrypt.compare(secret, record.tokenHash);
  if (!ok) throw new Error("INVALID_TOKEN");

  // Marca usado antes de resetar senha (evita corrida)
  await prisma.passwordResetToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  // Atualiza senha no Keycloak
  await keycloakResetPassword({
    keycloakUserId: record.user.keycloakId,
    newPassword,
  });
}
