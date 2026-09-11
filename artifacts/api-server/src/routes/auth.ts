import { Router, type IRouter } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  authPermissionsTable,
  authRolePermissionsTable,
  authUsersTable,
  citiesTable,
  db,
  leadershipsTable,
  regionsTable,
} from "@workspace/db";
import {
  getPermissionsForRole,
  hashPassword,
  hasPermission,
  publicUser,
  ROLE_DEFINITIONS,
  PERMISSION_DEFINITIONS,
  signAccessToken,
  verifyPassword,
} from "../lib/auth";
import {
  requireAnyPermission,
  requireAuth,
  requirePermission,
} from "../middlewares/auth";

const router: IRouter = Router();
const roleKeys = new Set(ROLE_DEFINITIONS.map((role) => role.key));
const permissionKeys = new Set(PERMISSION_DEFINITIONS.map((permission) => permission.key));
const permissionKeySet = new Set<string>(permissionKeys);

type CreateUserInput = {
  email: string;
  password: string;
  fullName: string;
  role: string;
  regionId?: number | null;
  cityId?: number | null;
  leadershipId?: number | null;
  canCreateLeaderUsers?: boolean;
  phone?: string | null;
};

type UpdateUserInput = {
  fullName?: string;
  role?: string;
  regionId?: number | null;
  cityId?: number | null;
  leadershipId?: number | null;
  isActive?: boolean;
  canCreateLeaderUsers?: boolean;
  password?: string;
  phone?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function optionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return value === null ? null : undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseLoginBody(value: unknown): { email: string; password: string } | null {
  if (!isRecord(value) || !isEmail(value.email) || typeof value.password !== "string" || !value.password) return null;
  return { email: value.email, password: value.password };
}

function parseCreateUserBody(value: unknown): CreateUserInput | null {
  if (!isRecord(value) || !isEmail(value.email) || typeof value.password !== "string" || value.password.length < 8 || typeof value.fullName !== "string" || value.fullName.trim().length < 2 || typeof value.role !== "string") return null;
  return {
    email: value.email,
    password: value.password,
    fullName: value.fullName,
    role: value.role,
    regionId: optionalNumber(value.regionId),
    cityId: optionalNumber(value.cityId),
    leadershipId: optionalNumber(value.leadershipId),
    canCreateLeaderUsers: typeof value.canCreateLeaderUsers === "boolean" ? value.canCreateLeaderUsers : undefined,
    phone: typeof value.phone === "string" ? value.phone.trim() || null : value.phone === null ? null : undefined,
  };
}

function parseUpdateUserBody(value: unknown): UpdateUserInput | null {
  if (!isRecord(value)) return null;
  if (value.fullName !== undefined && (typeof value.fullName !== "string" || value.fullName.trim().length < 2)) return null;
  if (value.role !== undefined && typeof value.role !== "string") return null;
  if (value.password !== undefined && (typeof value.password !== "string" || value.password.length < 8)) return null;
  if (value.isActive !== undefined && typeof value.isActive !== "boolean") return null;
  if (value.canCreateLeaderUsers !== undefined && typeof value.canCreateLeaderUsers !== "boolean") return null;
  return {
    fullName: typeof value.fullName === "string" ? value.fullName : undefined,
    role: typeof value.role === "string" ? value.role : undefined,
    regionId: optionalNumber(value.regionId),
    cityId: optionalNumber(value.cityId),
    leadershipId: optionalNumber(value.leadershipId),
    isActive: typeof value.isActive === "boolean" ? value.isActive : undefined,
    canCreateLeaderUsers: typeof value.canCreateLeaderUsers === "boolean" ? value.canCreateLeaderUsers : undefined,
    password: typeof value.password === "string" ? value.password : undefined,
    phone: typeof value.phone === "string" ? value.phone.trim() || null : value.phone === null ? null : undefined,
  };
}

function parseProfileBody(value: unknown): {
  fullName?: string;
  email?: string;
  phone?: string | null;
  password?: string;
} | null {
  if (!isRecord(value)) return null;
  if (value.fullName !== undefined && (typeof value.fullName !== "string" || value.fullName.trim().length < 2)) return null;
  if (value.email !== undefined && !isEmail(value.email)) return null;
  if (value.phone !== undefined && value.phone !== null && typeof value.phone !== "string") return null;
  if (value.password !== undefined && (typeof value.password !== "string" || value.password.length < 8)) return null;
  return {
    fullName: typeof value.fullName === "string" ? value.fullName.trim() : undefined,
    email: typeof value.email === "string" ? value.email.trim().toLowerCase() : undefined,
    phone: typeof value.phone === "string" ? value.phone.trim() || null : value.phone === null ? null : undefined,
    password: typeof value.password === "string" ? value.password : undefined,
  };
}

function roleIsValid(role: string): boolean {
  return roleKeys.has(role as (typeof ROLE_DEFINITIONS)[number]["key"]);
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = parseLoginBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Informe um e-mail e uma senha válidos." });
    return;
  }

  const email = parsed.email.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(authUsersTable)
    .where(eq(authUsersTable.email, email));
  if (!user || !user.isActive || !(await verifyPassword(parsed.password, user.passwordHash))) {
    res.status(401).json({ error: "E-mail ou senha inválidos." });
    return;
  }

  const [updatedUser] = await db
    .update(authUsersTable)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(authUsersTable.id, user.id))
    .returning();
  const currentUser = updatedUser ?? user;
  const permissions = await getPermissionsForRole(currentUser.role);
  res.json({
    token: signAccessToken(currentUser),
    user: publicUser(currentUser, permissions),
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const principal = req.auth;
  if (!principal) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ user: publicUser(principal.user, principal.permissions) });
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const body = parseProfileBody(req.body);
  if (!body || !req.auth) {
    res.status(400).json({ error: "Dados de perfil inválidos." });
    return;
  }
  if (body.email && body.email !== req.auth.user.email) {
    const [existing] = await db
      .select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(eq(authUsersTable.email, body.email));
    if (existing && existing.id !== req.auth.user.id) {
      res.status(409).json({ error: "Já existe um usuário com este e-mail." });
      return;
    }
  }
  const updates = {
    ...(body.fullName !== undefined ? { fullName: body.fullName } : {}),
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...(body.phone !== undefined ? { phone: body.phone } : {}),
    ...(body.password ? { passwordHash: await hashPassword(body.password) } : {}),
    updatedAt: new Date(),
  };
  const [updated] = await db.update(authUsersTable)
    .set(updates)
    .where(eq(authUsersTable.id, req.auth.user.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Usuário não encontrado." });
    return;
  }
  const permissions = await getPermissionsForRole(updated.role);
  res.json({ user: publicUser(updated, permissions) });
});

router.post("/auth/logout", requireAuth, async (_req, res): Promise<void> => {
  res.json({ success: true });
});

router.get(
  "/auth/rbac/roles",
  requirePermission("rbac:manage"),
  async (_req, res): Promise<void> => {
    const [permissions, users] = await Promise.all([
      db.select().from(authPermissionsTable).orderBy(asc(authPermissionsTable.category), asc(authPermissionsTable.label)),
      db
        .select({
          role: authUsersTable.role,
          userCount: sql<number>`count(*)::int`,
        })
        .from(authUsersTable)
        .groupBy(authUsersTable.role),
    ]);
    const userCounts = new Map(users.map((row) => [row.role, row.userCount]));
    const matrix = await Promise.all(
      ROLE_DEFINITIONS.map(async (role) => {
        const rows = await db
          .select({ key: authPermissionsTable.key })
          .from(authRolePermissionsTable)
          .innerJoin(
            authPermissionsTable,
            eq(authPermissionsTable.id, authRolePermissionsTable.permissionId),
          )
          .where(eq(authRolePermissionsTable.role, role.key));
        return {
          ...role,
          userCount: userCounts.get(role.key) ?? 0,
          permissionKeys: rows.map((row) => row.key),
        };
      }),
    );
    res.json({ roles: matrix, permissions });
  },
);

router.patch(
  "/auth/rbac/roles/:role",
  requirePermission("rbac:manage"),
  async (req, res): Promise<void> => {
    const role = Array.isArray(req.params.role) ? req.params.role[0] : req.params.role;
    const body = isRecord(req.body) && Array.isArray(req.body.permissionKeys) && req.body.permissionKeys.every((key): key is string => typeof key === "string")
      ? { permissionKeys: req.body.permissionKeys }
      : null;
    if (!roleIsValid(role) || !body || body.permissionKeys.some((key) => !permissionKeySet.has(key))) {
      res.status(400).json({ error: "Papel ou permissões inválidos." });
      return;
    }
    if (role === "ADMIN_GERAL" && !body.permissionKeys.includes("rbac:manage")) {
      res.status(400).json({ error: "O admin geral precisa manter o acesso ao RBAC." });
      return;
    }

    const selected = await db
      .select({ id: authPermissionsTable.id, key: authPermissionsTable.key })
      .from(authPermissionsTable)
      .where(inArray(authPermissionsTable.key, body.permissionKeys));
    await db.transaction(async (tx) => {
      await tx.delete(authRolePermissionsTable).where(eq(authRolePermissionsTable.role, role));
      if (selected.length) {
        await tx.insert(authRolePermissionsTable).values(
        selected.map((permission) => ({ role, permissionId: permission.id })),
        );
      }
    });
    res.json({ success: true, role, permissionKeys: selected.map((permission) => permission.key) });
  },
);

router.get(
  "/auth/users",
  requireAnyPermission(["users:manage", "leader-users:create"]),
  async (req, res): Promise<void> => {
    const principal = req.auth!;
    const userScope = principal.user.role === "ADMIN_GERAL"
      ? undefined
      : and(
          eq(authUsersTable.role, "LIDERANCA"),
          principal.user.cityId
            ? eq(authUsersTable.cityId, principal.user.cityId)
            : sql`false`,
        );
    const users = await db
      .select({
        id: authUsersTable.id,
        email: authUsersTable.email,
        fullName: authUsersTable.fullName,
        role: authUsersTable.role,
        regionId: authUsersTable.regionId,
        regionName: regionsTable.name,
        cityId: authUsersTable.cityId,
        cityName: citiesTable.name,
        leadershipId: authUsersTable.leadershipId,
        isActive: authUsersTable.isActive,
        canCreateLeaderUsers: authUsersTable.canCreateLeaderUsers,
         phone: authUsersTable.phone,
        lastLoginAt: authUsersTable.lastLoginAt,
        createdAt: authUsersTable.createdAt,
      })
      .from(authUsersTable)
      .leftJoin(regionsTable, eq(regionsTable.id, authUsersTable.regionId))
      .leftJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
      .where(userScope)
      .orderBy(asc(authUsersTable.fullName));
    res.json(users);
  },
);

router.post(
  "/auth/users",
  requireAnyPermission(["users:manage", "leader-users:create"]),
  async (req, res): Promise<void> => {
    const parsed = parseCreateUserBody(req.body);
    if (!parsed || !roleIsValid(parsed.role)) {
      res.status(400).json({ error: "Dados ou papel inválidos." });
      return;
    }
    const principal = req.auth;
    if (!principal) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const isAdmin = principal.user.role === "ADMIN_GERAL";
    const isCoordinatorCreatingLeader =
      principal.user.role === "COORDENADOR" &&
      hasPermission(principal, "leader-users:create") &&
      parsed.role === "LIDERANCA";
    if (!isAdmin && !isCoordinatorCreatingLeader) {
      res.status(403).json({ error: "Você não pode criar este tipo de usuário." });
      return;
    }

    let cityId = isCoordinatorCreatingLeader ? principal.user.cityId : parsed.cityId ?? null;
    let regionId = isCoordinatorCreatingLeader ? principal.user.regionId : parsed.regionId ?? null;
    let leadershipId = parsed.leadershipId ?? null;
    if (isCoordinatorCreatingLeader && !cityId) {
      res.status(403).json({ error: "O coordenador não possui uma cidade vinculada." });
      return;
    }
    if (parsed.role === "LIDERANCA") {
      if (!leadershipId) {
        res.status(400).json({ error: "Uma liderança deve ser vinculada ao usuário." });
        return;
      }
      const [leadership] = await db
        .select({ cityId: leadershipsTable.cityId, regionId: citiesTable.regionId })
        .from(leadershipsTable)
        .innerJoin(citiesTable, eq(citiesTable.id, leadershipsTable.cityId))
        .where(eq(leadershipsTable.id, leadershipId));
      if (!leadership) {
        res.status(400).json({ error: "A liderança selecionada não existe." });
        return;
      }
      if (isCoordinatorCreatingLeader && leadership.cityId !== cityId) {
        res.status(403).json({ error: "A liderança está fora da cidade do coordenador." });
        return;
      }
      cityId = leadership.cityId;
      regionId = leadership.regionId;
    }
    const [existing] = await db
      .select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(eq(authUsersTable.email, parsed.email.trim().toLowerCase()));
    if (existing) {
      res.status(409).json({ error: "Já existe um usuário com este e-mail." });
      return;
    }

    const [created] = await db
      .insert(authUsersTable)
      .values({
        email: parsed.email.trim().toLowerCase(),
        passwordHash: await hashPassword(parsed.password),
        fullName: parsed.fullName.trim(),
        role: parsed.role,
        regionId,
        cityId,
        leadershipId: parsed.role === "LIDERANCA" ? leadershipId : null,
        canCreateLeaderUsers: isAdmin ? parsed.canCreateLeaderUsers ?? false : false,
        phone: parsed.phone ?? null,
      })
      .returning();
    const permissions = await getPermissionsForRole(created.role);
    res.status(201).json({ user: publicUser(created, permissions) });
  },
);

router.patch(
  "/auth/users/:id",
  requirePermission("users:manage"),
  async (req, res): Promise<void> => {
    const id = Number(Array.isArray(req.params.id) ? req.params.id[0] : req.params.id);
    const parsed = parseUpdateUserBody(req.body);
    if (!Number.isInteger(id) || !parsed || (parsed.role && !roleIsValid(parsed.role))) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const updates = {
      ...parsed,
      ...(parsed.password ? { passwordHash: await hashPassword(parsed.password) } : {}),
      updatedAt: new Date(),
    } as Record<string, unknown>;
    delete updates.password;
    const [updated] = await db
      .update(authUsersTable)
      .set(updates)
      .where(eq(authUsersTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Usuário não encontrado." });
      return;
    }
    const permissions = await getPermissionsForRole(updated.role);
    res.json({ user: publicUser(updated, permissions) });
  },
);

export default router;