import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  authUsersTable,
  campaignMaterialWithdrawalItemsTable,
  campaignMaterialWithdrawalsTable,
  campaignMaterialsTable,
  citiesTable,
  db,
  regionsTable,
} from "@workspace/db";
import { cityScopeCondition, hasPermission } from "../lib/auth";
import { requirePermission } from "../middlewares/auth";

const router: IRouter = Router();
const statuses = ["requested", "separated", "delivered", "cancelled"] as const;
type WithdrawalStatus = (typeof statuses)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textValue(value: unknown, required = false): string | null {
  if (typeof value !== "string") return required ? null : null;
  const clean = value.trim();
  return clean || (required ? null : null);
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalQuantity(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  const parsed = positiveInteger(value);
  return parsed ?? undefined;
}

function statusValue(value: unknown): WithdrawalStatus | null {
  return typeof value === "string" && statuses.includes(value as WithdrawalStatus)
    ? value as WithdrawalStatus
    : null;
}

type WithdrawalItemInput = { materialId: number; quantity: number | null };

function parseItems(value: unknown): WithdrawalItemInput[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<number>();
  const items: WithdrawalItemInput[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const materialId = positiveInteger(raw.materialId);
    const quantity = optionalQuantity(raw.quantity);
    if (!materialId || quantity === undefined || seen.has(materialId)) return null;
    seen.add(materialId);
    items.push({ materialId, quantity });
  }
  return items;
}

function materialScope(principal: NonNullable<Express.Request["auth"]>) {
  return cityScopeCondition(principal);
}

async function visibleCity(cityId: number, principal: NonNullable<Express.Request["auth"]>) {
  const [city] = await db
    .select({ id: citiesTable.id, name: citiesTable.name, regionName: regionsTable.name })
    .from(citiesTable)
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .where(and(eq(citiesTable.id, cityId), cityScopeCondition(principal)));
  return city;
}

async function visibleResponsible(
  userId: number,
  cityId: number,
  principal: NonNullable<Express.Request["auth"]>,
) {
  const [user] = await db
    .select({ id: authUsersTable.id, cityId: authUsersTable.cityId, role: authUsersTable.role })
    .from(authUsersTable)
    .leftJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
    .where(and(
      eq(authUsersTable.id, userId),
      eq(authUsersTable.isActive, true),
      or(eq(authUsersTable.cityId, cityId), eq(authUsersTable.role, "ADMIN_GERAL")),
      principal.user.role === "ADMIN_GERAL" ? undefined : materialScope(principal),
    ));
  return user;
}

async function detail(id: number, principal: NonNullable<Express.Request["auth"]>) {
  const [withdrawal] = await db
    .select({
      id: campaignMaterialWithdrawalsTable.id,
      cityId: campaignMaterialWithdrawalsTable.cityId,
      cityName: citiesTable.name,
      regionName: regionsTable.name,
      responsibleUserId: campaignMaterialWithdrawalsTable.responsibleUserId,
      responsibleName: authUsersTable.fullName,
      status: campaignMaterialWithdrawalsTable.status,
      postalCode: campaignMaterialWithdrawalsTable.postalCode,
      street: campaignMaterialWithdrawalsTable.street,
      number: campaignMaterialWithdrawalsTable.number,
      complement: campaignMaterialWithdrawalsTable.complement,
      neighborhood: campaignMaterialWithdrawalsTable.neighborhood,
      addressCity: campaignMaterialWithdrawalsTable.addressCity,
      state: campaignMaterialWithdrawalsTable.state,
      notes: campaignMaterialWithdrawalsTable.notes,
      createdByUserId: campaignMaterialWithdrawalsTable.createdByUserId,
      createdAt: campaignMaterialWithdrawalsTable.createdAt,
      updatedAt: campaignMaterialWithdrawalsTable.updatedAt,
    })
    .from(campaignMaterialWithdrawalsTable)
    .innerJoin(citiesTable, eq(citiesTable.id, campaignMaterialWithdrawalsTable.cityId))
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .innerJoin(authUsersTable, eq(authUsersTable.id, campaignMaterialWithdrawalsTable.responsibleUserId))
    .where(and(eq(campaignMaterialWithdrawalsTable.id, id), materialScope(principal)));
  if (!withdrawal) return undefined;

  const items = await db
    .select({
      id: campaignMaterialWithdrawalItemsTable.id,
      materialId: campaignMaterialWithdrawalItemsTable.materialId,
      materialName: campaignMaterialsTable.name,
      unit: campaignMaterialsTable.unit,
      quantity: campaignMaterialWithdrawalItemsTable.quantity,
    })
    .from(campaignMaterialWithdrawalItemsTable)
    .innerJoin(campaignMaterialsTable, eq(campaignMaterialsTable.id, campaignMaterialWithdrawalItemsTable.materialId))
    .where(eq(campaignMaterialWithdrawalItemsTable.withdrawalId, id))
    .orderBy(asc(campaignMaterialsTable.name));
  return { ...withdrawal, items };
}

router.get(
  "/materials",
  requirePermission("materials:view"),
  async (_req, res): Promise<void> => {
    const includeInactive = _req.query.includeInactive === "true" && _req.auth?.user.role === "ADMIN_GERAL";
    const materials = await db
      .select()
      .from(campaignMaterialsTable)
      .where(includeInactive ? undefined : eq(campaignMaterialsTable.isActive, true))
      .orderBy(asc(campaignMaterialsTable.name));
    res.json(materials);
  },
);

router.post(
  "/materials",
  requirePermission("materials:catalog"),
  async (req, res): Promise<void> => {
    if (!isRecord(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const name = textValue(req.body.name, true);
    if (!name) {
      res.status(400).json({ error: "O nome do material é obrigatório." });
      return;
    }
    const [material] = await db.insert(campaignMaterialsTable).values({
      name,
      description: textValue(req.body.description),
      unit: textValue(req.body.unit) ?? "unidade",
      isActive: req.body.isActive !== false,
    }).returning();
    res.status(201).json(material);
  },
);

router.patch(
  "/materials/:id",
  requirePermission("materials:catalog"),
  async (req, res): Promise<void> => {
    const id = positiveInteger(req.params.id);
    if (!id || !isRecord(req.body)) {
      res.status(400).json({ error: "Material ou dados inválidos." });
      return;
    }
    const values: Partial<typeof campaignMaterialsTable.$inferInsert> = {};
    if (req.body.name !== undefined) {
      const name = textValue(req.body.name, true);
      if (!name) {
        res.status(400).json({ error: "O nome do material é obrigatório." });
        return;
      }
      values.name = name;
    }
    if (req.body.description !== undefined) values.description = textValue(req.body.description);
    if (req.body.unit !== undefined) values.unit = textValue(req.body.unit) ?? "unidade";
    if (req.body.isActive !== undefined) {
      if (typeof req.body.isActive !== "boolean") {
        res.status(400).json({ error: "O status do material é inválido." });
        return;
      }
      values.isActive = req.body.isActive;
    }
    const [material] = await db.update(campaignMaterialsTable).set(values).where(eq(campaignMaterialsTable.id, id)).returning();
    if (!material) {
      res.status(404).json({ error: "Material não encontrado." });
      return;
    }
    res.json(material);
  },
);

router.delete(
  "/materials/:id",
  requirePermission("materials:catalog"),
  async (req, res): Promise<void> => {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Material inválido." });
      return;
    }
    const [material] = await db.update(campaignMaterialsTable).set({ isActive: false }).where(eq(campaignMaterialsTable.id, id)).returning();
    if (!material) {
      res.status(404).json({ error: "Material não encontrado." });
      return;
    }
    res.status(204).send();
  },
);

router.get(
  "/material-withdrawals/options",
  requirePermission("materials:view"),
  async (req, res): Promise<void> => {
    const requestedCityId = positiveInteger(req.query.cityId);
    const cities = await db
      .select({ id: citiesTable.id, name: citiesTable.name, regionName: regionsTable.name })
      .from(citiesTable)
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .where(materialScope(req.auth!))
      .orderBy(asc(citiesTable.name));
    const users = await db
      .select({
        id: authUsersTable.id,
        name: authUsersTable.fullName,
        role: authUsersTable.role,
        cityId: authUsersTable.cityId,
        cityName: citiesTable.name,
      })
      .from(authUsersTable)
      .leftJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
      .where(and(
        eq(authUsersTable.isActive, true),
        req.auth!.user.role === "ADMIN_GERAL" ? undefined : materialScope(req.auth!),
      ))
      .orderBy(
        requestedCityId
          ? sql`case when ${authUsersTable.cityId} = ${requestedCityId} then 0 else 1 end`
          : asc(authUsersTable.fullName),
        ...(requestedCityId ? [asc(authUsersTable.fullName)] : []),
      );
    const includeInactive = hasPermission(req.auth!, "materials:catalog");
    const materials = await db.select().from(campaignMaterialsTable)
      .where(includeInactive ? undefined : eq(campaignMaterialsTable.isActive, true))
      .orderBy(asc(campaignMaterialsTable.name));
    res.json({ cities, users, materials });
  },
);

router.get(
  "/material-withdrawals",
  requirePermission("materials:view"),
  async (req, res): Promise<void> => {
    const conditions = [materialScope(req.auth!)];
    const status = statusValue(req.query.status);
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const cityId = positiveInteger(req.query.cityId);
    if (status) conditions.push(eq(campaignMaterialWithdrawalsTable.status, status));
    if (cityId) conditions.push(eq(campaignMaterialWithdrawalsTable.cityId, cityId));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(ilike(citiesTable.name, pattern), ilike(authUsersTable.fullName, pattern), ilike(campaignMaterialWithdrawalsTable.addressCity, pattern)));
    }
    const withdrawals = await db
      .select({
        id: campaignMaterialWithdrawalsTable.id,
        cityId: campaignMaterialWithdrawalsTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        responsibleUserId: campaignMaterialWithdrawalsTable.responsibleUserId,
        responsibleName: authUsersTable.fullName,
        status: campaignMaterialWithdrawalsTable.status,
        postalCode: campaignMaterialWithdrawalsTable.postalCode,
        street: campaignMaterialWithdrawalsTable.street,
        number: campaignMaterialWithdrawalsTable.number,
        complement: campaignMaterialWithdrawalsTable.complement,
        neighborhood: campaignMaterialWithdrawalsTable.neighborhood,
        addressCity: campaignMaterialWithdrawalsTable.addressCity,
        state: campaignMaterialWithdrawalsTable.state,
        notes: campaignMaterialWithdrawalsTable.notes,
        createdAt: campaignMaterialWithdrawalsTable.createdAt,
        updatedAt: campaignMaterialWithdrawalsTable.updatedAt,
        itemCount: sql<number>`(select count(*)::int from campaign_material_withdrawal_items i where i.withdrawal_id = ${campaignMaterialWithdrawalsTable.id})`,
      })
      .from(campaignMaterialWithdrawalsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignMaterialWithdrawalsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignMaterialWithdrawalsTable.responsibleUserId))
      .where(and(...conditions))
      .orderBy(desc(campaignMaterialWithdrawalsTable.createdAt));
    res.json(withdrawals);
  },
);

router.get(
  "/material-withdrawals/:id",
  requirePermission("materials:view"),
  async (req, res): Promise<void> => {
    const id = positiveInteger(req.params.id);
    const withdrawal = id ? await detail(id, req.auth!) : undefined;
    if (!withdrawal) {
      res.status(404).json({ error: "Retirada não encontrada." });
      return;
    }
    res.json(withdrawal);
  },
);

router.post(
  "/material-withdrawals",
  requirePermission("materials:create"),
  async (req, res): Promise<void> => {
    if (!isRecord(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const cityId = positiveInteger(req.body.cityId);
    const responsibleUserId = positiveInteger(req.body.responsibleUserId);
    const items = parseItems(req.body.items);
    const selectedAll = req.body.allMaterials === true;
    const address = {
      postalCode: textValue(req.body.postalCode, true),
      street: textValue(req.body.street, true),
      number: textValue(req.body.number, true),
      complement: textValue(req.body.complement),
      neighborhood: textValue(req.body.neighborhood, true),
      addressCity: textValue(req.body.addressCity, true),
      state: textValue(req.body.state, true),
      notes: textValue(req.body.notes),
    };
    if (!cityId || !responsibleUserId || !address.postalCode || !address.street || !address.number || !address.neighborhood || !address.addressCity || !address.state || items === null || (!items.length && !selectedAll)) {
      res.status(400).json({ error: "Cidade, responsável, endereço e pelo menos um material são obrigatórios." });
      return;
    }
    if (!await visibleCity(cityId, req.auth!) || !await visibleResponsible(responsibleUserId, cityId, req.auth!)) {
      res.status(403).json({ error: "A cidade ou o responsável está fora do seu escopo." });
      return;
    }
    const requiredAddress = {
      postalCode: address.postalCode,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      addressCity: address.addressCity,
      state: address.state,
      notes: address.notes,
    } as {
      postalCode: string;
      street: string;
      number: string;
      complement: string | null;
      neighborhood: string;
      addressCity: string;
      state: string;
      notes: string | null;
    };
    const materialItems = selectedAll
      ? await db.select({ materialId: campaignMaterialsTable.id, quantity: sql<number | null>`null` }).from(campaignMaterialsTable).where(eq(campaignMaterialsTable.isActive, true))
      : items;
    if (!materialItems.length) {
      res.status(400).json({ error: "Não há materiais ativos no catálogo." });
      return;
    }
    const [created] = await db.transaction(async (tx) => {
      const [withdrawal] = await tx.insert(campaignMaterialWithdrawalsTable).values({
        cityId,
        responsibleUserId,
        status: "requested",
        ...requiredAddress,
        createdByUserId: req.auth!.user.id,
      }).returning({ id: campaignMaterialWithdrawalsTable.id });
      await tx.insert(campaignMaterialWithdrawalItemsTable).values(materialItems.map((item) => ({
        withdrawalId: withdrawal.id,
        materialId: item.materialId,
        quantity: item.quantity,
      })));
      return [withdrawal];
    });
    const withdrawal = await detail(created.id, req.auth!);
    res.status(201).json(withdrawal);
  },
);

router.patch(
  "/material-withdrawals/:id",
  requirePermission("materials:update"),
  async (req, res): Promise<void> => {
    const id = positiveInteger(req.params.id);
    if (!id || !isRecord(req.body)) {
      res.status(400).json({ error: "Retirada ou dados inválidos." });
      return;
    }
    const existing = await detail(id, req.auth!);
    if (!existing) {
      res.status(404).json({ error: "Retirada não encontrada." });
      return;
    }
    const cityId = req.body.cityId === undefined ? existing.cityId : positiveInteger(req.body.cityId);
    const responsibleUserId = req.body.responsibleUserId === undefined ? existing.responsibleUserId : positiveInteger(req.body.responsibleUserId);
    const status = req.body.status === undefined ? existing.status : statusValue(req.body.status);
    const items = req.body.items === undefined ? null : parseItems(req.body.items);
    if (!cityId || !responsibleUserId || !status || (req.body.items !== undefined && (!items || !items.length))) {
      res.status(400).json({ error: "Dados da retirada inválidos." });
      return;
    }
    if (!await visibleCity(cityId, req.auth!) || !await visibleResponsible(responsibleUserId, cityId, req.auth!)) {
      res.status(403).json({ error: "A cidade ou o responsável está fora do seu escopo." });
      return;
    }
    const values: Partial<typeof campaignMaterialWithdrawalsTable.$inferInsert> = {
      cityId,
      responsibleUserId,
      status,
    };
    for (const field of ["postalCode", "street", "number", "complement", "neighborhood", "addressCity", "state", "notes"] as const) {
      if (req.body[field] !== undefined) {
        const value = field === "complement" || field === "notes" ? textValue(req.body[field]) : textValue(req.body[field], true);
        if (field !== "complement" && field !== "notes" && !value) {
          res.status(400).json({ error: "Todos os campos principais do endereço são obrigatórios." });
          return;
        }
        values[field] = value as never;
      }
    }
    await db.transaction(async (tx) => {
      await tx.update(campaignMaterialWithdrawalsTable).set(values).where(eq(campaignMaterialWithdrawalsTable.id, id));
      if (items) {
        await tx.delete(campaignMaterialWithdrawalItemsTable).where(eq(campaignMaterialWithdrawalItemsTable.withdrawalId, id));
        await tx.insert(campaignMaterialWithdrawalItemsTable).values(items.map((item) => ({ withdrawalId: id, ...item })));
      }
    });
    res.json(await detail(id, req.auth!));
  },
);

router.delete(
  "/material-withdrawals/:id",
  requirePermission("materials:delete"),
  async (req, res): Promise<void> => {
    const id = positiveInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Retirada inválida." });
      return;
    }
    const existing = await detail(id, req.auth!);
    if (!existing) {
      res.status(404).json({ error: "Retirada não encontrada." });
      return;
    }
    if (existing.status === "delivered") {
      res.status(409).json({ error: "Uma retirada entregue não pode ser excluída." });
      return;
    }
    await db.delete(campaignMaterialWithdrawalsTable).where(eq(campaignMaterialWithdrawalsTable.id, id));
    res.status(204).send();
  },
);

export default router;