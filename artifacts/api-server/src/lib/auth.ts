import {
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { and, eq, sql } from "drizzle-orm";
import {
  authPermissionsTable,
  authRolePermissionsTable,
  authUsersTable,
  citiesTable,
  db,
  leadershipsTable,
  type AuthRole,
  type AuthUser,
} from "@workspace/db";
import { logger } from "./logger";

const scrypt = promisify(nodeScrypt);
const TOKEN_TTL_SECONDS = 60 * 60 * 8;

export const ROLE_DEFINITIONS: Array<{
  key: AuthRole;
  label: string;
  description: string;
}> = [
  {
    key: "ADMIN_GERAL",
    label: "Admin geral",
    description: "Acesso total, usuários, permissões e configuração do sistema.",
  },
  {
    key: "ARTICULADOR",
    label: "Articulador",
    description: "Visão macro e acompanhamento da região sob sua responsabilidade.",
  },
  {
    key: "COORDENADOR",
    label: "Coordenador",
    description: "Coordenação de uma cidade e gestão dos líderes daquele território.",
  },
  {
    key: "LIDERANCA",
    label: "Liderança",
    description: "Acesso ao próprio contexto de cidade e apoio federal.",
  },
];

export const PERMISSION_DEFINITIONS = [
  {
    key: "dashboard:view",
    label: "Ver painel",
    description: "Acessar o panorama da campanha dentro do próprio escopo.",
    category: "Navegação",
  },
  {
    key: "coverage:view",
    label: "Ver cobertura",
    description: "Consultar regiões, cidades, lideranças e dobrados.",
    category: "Navegação",
  },
  {
    key: "leaderships:view",
    label: "Ver lideranças",
    description: "Consultar pessoas, contatos e apoios federais.",
    category: "Lideranças",
  },
  {
    key: "leaderships:create",
    label: "Criar lideranças",
    description: "Cadastrar uma liderança dentro do escopo permitido.",
    category: "Lideranças",
  },
  {
    key: "leaderships:update",
    label: "Atualizar lideranças",
    description: "Editar dados, contatos, cidade e apoio federal.",
    category: "Lideranças",
  },
  {
    key: "leaderships:delete",
    label: "Excluir lideranças",
    description: "Remover uma liderança do cadastro operacional.",
    category: "Lideranças",
  },
  {
    key: "leader-users:create",
    label: "Criar usuários líderes",
    description: "Criar acessos de usuários com papel de liderança.",
    category: "Usuários",
  },
  {
    key: "users:manage",
    label: "Gerenciar usuários",
    description: "Criar, editar, bloquear e reativar usuários.",
    category: "Usuários",
  },
  {
    key: "rbac:manage",
    label: "Gerenciar permissões",
    description: "Definir os acessos de cada papel do sistema.",
    category: "Administração",
  },
  {
    key: "review:view",
    label: "Ver revisão",
    description: "Consultar registros que precisam de conferência.",
    category: "Administração",
  },
  {
    key: "tasks:view",
    label: "Ver Kanban",
    description: "Consultar tarefas dentro do território autorizado.",
    category: "Operações",
  },
  {
    key: "tasks:create",
    label: "Criar tarefas",
    description: "Criar tarefas operacionais para o próprio escopo.",
    category: "Operações",
  },
  {
    key: "tasks:update",
    label: "Atualizar tarefas",
    description: "Alterar status, prazo e responsáveis de tarefas.",
    category: "Operações",
  },
  {
    key: "tasks:delete",
    label: "Excluir tarefas",
    description: "Excluir tarefas operacionais.",
    category: "Operações",
  },
  {
    key: "tasks:share",
    label: "Compartilhar tarefas",
    description: "Preparar uma tarefa para envio manual pelo WhatsApp.",
    category: "Operações",
  },
  {
    key: "calendar:view",
    label: "Ver agenda",
    description: "Consultar eventos da agenda dentro do próprio escopo.",
    category: "Agenda",
  },
  {
    key: "calendar:manage",
    label: "Gerenciar agenda",
    description: "Criar, editar, sincronizar e cancelar eventos no Google Calendar.",
    category: "Agenda",
  },
  {
    key: "calendar:approve",
    label: "Aprovar avisos da agenda",
    description: "Confirmar que um aviso de evento foi recebido.",
    category: "Agenda",
  },
] as const;

const DEFAULT_ROLE_PERMISSIONS: Record<AuthRole, string[]> = {
  ADMIN_GERAL: PERMISSION_DEFINITIONS.map((permission) => permission.key),
  ARTICULADOR: [
    "dashboard:view",
    "coverage:view",
    "leaderships:view",
    "leaderships:create",
    "leaderships:update",
    "leaderships:delete",
    "review:view",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "tasks:share",
    "calendar:view",
  ],
  COORDENADOR: [
    "dashboard:view",
    "coverage:view",
    "leaderships:view",
    "leaderships:create",
    "leaderships:update",
    "leaderships:delete",
    "leader-users:create",
    "tasks:view",
    "tasks:create",
    "tasks:update",
    "tasks:delete",
    "tasks:share",
    "calendar:view",
  ],
  LIDERANCA: [
    "dashboard:view",
    "coverage:view",
    "leaderships:view",
    "tasks:view",
    "tasks:update",
    "tasks:share",
    "calendar:view",
  ],
};

export type AuthPrincipal = {
  user: AuthUser;
  permissions: string[];
};

function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET must be configured for JWT auth");
  return secret;
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [, encodedSalt, encodedKey] = storedHash.split("$");
  if (!encodedSalt || !encodedKey) return false;
  const salt = Buffer.from(encodedSalt, "base64url");
  const expected = Buffer.from(encodedKey, "base64url");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function signAccessToken(user: AuthUser): string {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = base64Url(
    JSON.stringify({
      sub: String(user.id),
      role: user.role,
      iat: issuedAt,
      exp: issuedAt + TOKEN_TTL_SECONDS,
    }),
  );
  const unsigned = `${header}.${payload}`;
  const signature = createHmac("sha256", getJwtSecret())
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

function decodeToken(token: string): { sub: string; exp: number } | null {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) return null;
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = createHmac("sha256", getJwtSecret())
    .update(unsigned)
    .digest("base64url");
  if (
    signature.length !== expectedSignature.length ||
    !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { sub?: string; exp?: number };
    if (!payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return { sub: payload.sub, exp: payload.exp };
  } catch {
    return null;
  }
}

export async function getPrincipalFromToken(
  token: string | undefined,
): Promise<AuthPrincipal | null> {
  if (!token) return null;
  const decoded = decodeToken(token);
  if (!decoded) return null;
  const userId = Number(decoded.sub);
  if (!Number.isInteger(userId)) return null;
  const [user] = await db
    .select()
    .from(authUsersTable)
    .where(and(eq(authUsersTable.id, userId), eq(authUsersTable.isActive, true)));
  if (!user) return null;
  const permissions = await getPermissionsForRole(user.role);
  return { user, permissions };
}

export async function getPermissionsForRole(role: string): Promise<string[]> {
  const rows = await db
    .select({ key: authPermissionsTable.key })
    .from(authRolePermissionsTable)
    .innerJoin(
      authPermissionsTable,
      eq(authPermissionsTable.id, authRolePermissionsTable.permissionId),
    )
    .where(eq(authRolePermissionsTable.role, role));
  return rows.map((row) => row.key);
}

export function hasPermission(
  principal: AuthPrincipal,
  permission: string,
): boolean {
  return principal.permissions.includes(permission);
}

export function cityScopeCondition(principal: AuthPrincipal) {
  if (principal.user.role === "ADMIN_GERAL") return undefined;
  if (principal.user.role === "ARTICULADOR" && principal.user.regionId) {
    return eq(citiesTable.regionId, principal.user.regionId);
  }
  if (principal.user.cityId) return eq(citiesTable.id, principal.user.cityId);
  return sql`false`;
}

export function leadershipScopeCondition(principal: AuthPrincipal) {
  if (principal.user.role === "ADMIN_GERAL") return undefined;
  if (principal.user.role === "LIDERANCA" && principal.user.leadershipId) {
    return eq(leadershipsTable.id, principal.user.leadershipId);
  }
  return cityScopeCondition(principal);
}

export function coverageScopeCondition(principal: AuthPrincipal) {
  return principal.user.role === "LIDERANCA"
    ? leadershipScopeCondition(principal)
    : cityScopeCondition(principal);
}

export function getBearerToken(authorization: string | undefined): string | undefined {
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length).trim() || undefined;
}

export async function ensureAuthBootstrap(): Promise<void> {
  await db
    .insert(authPermissionsTable)
    .values([...PERMISSION_DEFINITIONS])
    .onConflictDoNothing({ target: authPermissionsTable.key });

  const permissions = await db.select().from(authPermissionsTable);
  const permissionIds = new Map(permissions.map((permission) => [permission.key, permission.id]));
  for (const role of ROLE_DEFINITIONS) {
    const rows = DEFAULT_ROLE_PERMISSIONS[role.key]
      .map((key) => permissionIds.get(key))
      .filter((id): id is number => id !== undefined)
      .map((permissionId) => ({ role: role.key, permissionId }));
    if (rows.length) {
      await db
        .insert(authRolePermissionsTable)
        .values(rows)
        .onConflictDoNothing();
    }
  }

  const adminEmail = (
    process.env.ADMIN_GENERAL_EMAIL ?? "leonardosallesgtf@gmail.com"
  ).trim().toLowerCase();
  const adminPassword = process.env.ADMIN_GENERAL_PASSWORD;
  if (!adminPassword) {
    logger.warn(
      { email: adminEmail },
      "ADMIN_GENERAL_PASSWORD is not configured; admin bootstrap skipped",
    );
    return;
  }

  const [existingAdmin] = await db
    .select({ id: authUsersTable.id })
    .from(authUsersTable)
    .where(eq(authUsersTable.email, adminEmail));
  if (!existingAdmin) {
    await db.insert(authUsersTable).values({
      email: adminEmail,
      passwordHash: await hashPassword(adminPassword),
      fullName: "Administrador geral",
      role: "ADMIN_GERAL",
      isActive: true,
      canCreateLeaderUsers: true,
    });
    logger.info({ email: adminEmail }, "General admin user provisioned");
  }
}

export function publicUser(
  user: AuthUser,
  permissions: string[],
): {
  id: number;
  email: string;
  fullName: string;
  role: string;
  regionId: number | null;
  cityId: number | null;
  leadershipId: number | null;
  isActive: boolean;
  canCreateLeaderUsers: boolean;
  permissions: string[];
} {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    regionId: user.regionId,
    cityId: user.cityId,
    leadershipId: user.leadershipId,
    isActive: user.isActive,
    canCreateLeaderUsers: user.canCreateLeaderUsers,
    permissions,
  };
}