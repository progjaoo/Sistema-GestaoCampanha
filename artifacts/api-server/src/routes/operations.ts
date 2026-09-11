import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  authUsersTable,
  campaignBoardMembersTable,
  campaignBoardsTable,
  campaignCalendarEventsTable,
  campaignCalendarSharesTable,
  campaignEventAcknowledgementsTable,
  campaignTasksTable,
  campaignTaskActivityTable,
  campaignTaskChecklistItemsTable,
  campaignTaskCommentsTable,
  campaignTaskMembersTable,
  citiesTable,
  coordinatorsTable,
  db,
  leadershipsTable,
  regionsTable,
  articulatorsTable,
} from "@workspace/db";
import { googleCalendarRequest } from "../lib/google-calendar";
import { hasPermission, leadershipScopeCondition, cityScopeCondition } from "../lib/auth";
import { requireAnyPermission, requirePermission } from "../middlewares/auth";

const router: IRouter = Router();
export const publicOperationsRouter: IRouter = Router();

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, required = false): string | null {
  if (typeof value !== "string") return required ? null : null;
  const clean = value.trim();
  return clean || (required ? null : null);
}

function numberValue(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return value === null ? null : undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeWhatsAppPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return /^55\d{10,11}$/.test(normalized) ? normalized : null;
}

function taskScope(principal: NonNullable<Express.Request["auth"]>) {
  return cityScopeCondition(principal);
}

async function taskById(id: number, principal: NonNullable<Express.Request["auth"]>) {
  const [task] = await db
    .select({
      id: campaignTasksTable.id,
      title: campaignTasksTable.title,
      description: campaignTasksTable.description,
      status: campaignTasksTable.status,
      priority: campaignTasksTable.priority,
      dueAt: campaignTasksTable.dueAt,
      boardId: campaignTasksTable.boardId,
      boardName: campaignBoardsTable.title,
      cityId: campaignTasksTable.cityId,
      cityName: citiesTable.name,
      regionName: regionsTable.name,
      leadershipId: campaignTasksTable.leadershipId,
      leadershipName: leadershipsTable.name,
      leadershipContact: leadershipsTable.leadershipContact,
      assigneeUserId: campaignTasksTable.assigneeUserId,
      assigneeName: authUsersTable.fullName,
      createdByUserId: campaignTasksTable.createdByUserId,
      createdAt: campaignTasksTable.createdAt,
      updatedAt: campaignTasksTable.updatedAt,
    })
    .from(campaignTasksTable)
    .leftJoin(campaignBoardsTable, eq(campaignBoardsTable.id, campaignTasksTable.boardId))
    .leftJoin(citiesTable, eq(citiesTable.id, campaignTasksTable.cityId))
    .leftJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .leftJoin(leadershipsTable, eq(leadershipsTable.id, campaignTasksTable.leadershipId))
    .leftJoin(authUsersTable, eq(authUsersTable.id, campaignTasksTable.assigneeUserId))
    .where(and(eq(campaignTasksTable.id, id), taskScope(principal)));
  return task;
}

async function boardById(id: number, principal: NonNullable<Express.Request["auth"]>) {
  const [board] = await db
    .select({
      id: campaignBoardsTable.id,
      title: campaignBoardsTable.title,
      description: campaignBoardsTable.description,
      cityId: campaignBoardsTable.cityId,
      cityName: citiesTable.name,
      regionName: regionsTable.name,
      archived: campaignBoardsTable.archived,
      createdByUserId: campaignBoardsTable.createdByUserId,
      createdAt: campaignBoardsTable.createdAt,
      updatedAt: campaignBoardsTable.updatedAt,
    })
    .from(campaignBoardsTable)
    .innerJoin(citiesTable, eq(citiesTable.id, campaignBoardsTable.cityId))
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .where(and(eq(campaignBoardsTable.id, id), cityScopeCondition(principal)));
  return board;
}

async function recordTaskActivity(
  taskId: number,
  actorUserId: number,
  action: string,
  detail?: string,
) {
  await db.insert(campaignTaskActivityTable).values({
    taskId,
    actorUserId,
    action,
    detail: detail ?? null,
  });
}

async function userInTaskCity(
  userId: number,
  cityId: number | null,
  principal: NonNullable<Express.Request["auth"]>,
) {
  if (!cityId) return undefined;
  const [user] = await db
    .select({ id: authUsersTable.id })
    .from(authUsersTable)
    .innerJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
    .where(and(
      eq(authUsersTable.id, userId),
      eq(authUsersTable.cityId, cityId),
      eq(authUsersTable.isActive, true),
      cityScopeCondition(principal),
    ));
  return user;
}

async function taskDetailById(id: number, principal: NonNullable<Express.Request["auth"]>) {
  const task = await taskById(id, principal);
  if (!task) return undefined;
  const [members, checklist, comments, activity] = await Promise.all([
    db.select({
      id: authUsersTable.id,
      fullName: authUsersTable.fullName,
      email: authUsersTable.email,
      role: authUsersTable.role,
      phone: authUsersTable.phone,
    }).from(campaignTaskMembersTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignTaskMembersTable.userId))
      .where(eq(campaignTaskMembersTable.taskId, id))
      .orderBy(asc(authUsersTable.fullName)),
    db.select({
      id: campaignTaskChecklistItemsTable.id,
      title: campaignTaskChecklistItemsTable.title,
      completed: campaignTaskChecklistItemsTable.completed,
      position: campaignTaskChecklistItemsTable.position,
      createdAt: campaignTaskChecklistItemsTable.createdAt,
      updatedAt: campaignTaskChecklistItemsTable.updatedAt,
    }).from(campaignTaskChecklistItemsTable)
      .where(eq(campaignTaskChecklistItemsTable.taskId, id))
      .orderBy(asc(campaignTaskChecklistItemsTable.position), asc(campaignTaskChecklistItemsTable.createdAt)),
    db.select({
      id: campaignTaskCommentsTable.id,
      body: campaignTaskCommentsTable.body,
      createdAt: campaignTaskCommentsTable.createdAt,
      updatedAt: campaignTaskCommentsTable.updatedAt,
      userId: authUsersTable.id,
      userName: authUsersTable.fullName,
    }).from(campaignTaskCommentsTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignTaskCommentsTable.userId))
      .where(eq(campaignTaskCommentsTable.taskId, id))
      .orderBy(asc(campaignTaskCommentsTable.createdAt)),
    db.select({
      id: campaignTaskActivityTable.id,
      action: campaignTaskActivityTable.action,
      detail: campaignTaskActivityTable.detail,
      createdAt: campaignTaskActivityTable.createdAt,
      actorUserId: authUsersTable.id,
      actorName: authUsersTable.fullName,
    }).from(campaignTaskActivityTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignTaskActivityTable.actorUserId))
      .where(eq(campaignTaskActivityTable.taskId, id))
      .orderBy(desc(campaignTaskActivityTable.createdAt)),
  ]);
  return { ...task, members, checklist, comments, activity };
}

router.get(
  "/boards",
  requirePermission("boards:view"),
  async (req, res): Promise<void> => {
    const archived = req.query.archived === "true";
    const boards = await db
      .select({
        id: campaignBoardsTable.id,
        title: campaignBoardsTable.title,
        description: campaignBoardsTable.description,
        cityId: campaignBoardsTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        archived: campaignBoardsTable.archived,
        createdAt: campaignBoardsTable.createdAt,
        updatedAt: campaignBoardsTable.updatedAt,
      })
      .from(campaignBoardsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignBoardsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .where(and(eq(campaignBoardsTable.archived, archived), cityScopeCondition(req.auth!)))
      .orderBy(asc(citiesTable.name), desc(campaignBoardsTable.updatedAt));
    res.json(boards);
  },
);

router.get(
  "/boards/:id",
  requirePermission("boards:view"),
  async (req, res): Promise<void> => {
    const board = await boardById(Number(req.params.id), req.auth!);
    if (!board) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    const [members, tasks] = await Promise.all([
      db.select({
        id: authUsersTable.id,
        fullName: authUsersTable.fullName,
        email: authUsersTable.email,
        role: authUsersTable.role,
      }).from(campaignBoardMembersTable)
        .innerJoin(authUsersTable, eq(authUsersTable.id, campaignBoardMembersTable.userId))
        .where(eq(campaignBoardMembersTable.boardId, board.id))
        .orderBy(asc(authUsersTable.fullName)),
      db.select({ id: campaignTasksTable.id })
        .from(campaignTasksTable)
        .where(eq(campaignTasksTable.boardId, board.id)),
    ]);
    res.json({ ...board, members, taskCount: tasks.length });
  },
);

router.post(
  "/boards",
  requirePermission("boards:create"),
  async (req, res): Promise<void> => {
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const title = stringValue(req.body.title, true);
    const cityId = numberValue(req.body.cityId);
    if (!title || !cityId) {
      res.status(400).json({ error: "Título e cidade são obrigatórios." });
      return;
    }
    const [allowedCity] = await db.select({ id: citiesTable.id })
      .from(citiesTable)
      .where(and(eq(citiesTable.id, cityId), cityScopeCondition(req.auth!)));
    if (!allowedCity) {
      res.status(403).json({ error: "O território está fora do seu escopo." });
      return;
    }
    const [created] = await db.transaction(async (tx) => {
      const [board] = await tx.insert(campaignBoardsTable).values({
        title,
        description: stringValue(req.body.description),
        cityId,
        createdByUserId: req.auth!.user.id,
      }).returning({ id: campaignBoardsTable.id });
      await tx.insert(campaignBoardMembersTable).values({
        boardId: board.id,
        userId: req.auth!.user.id,
        addedByUserId: req.auth!.user.id,
      }).onConflictDoNothing();
      return [board];
    });
    res.status(201).json(await boardById(created.id, req.auth!));
  },
);

router.patch(
  "/boards/:id",
  requirePermission("boards:update"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await boardById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const updates: Partial<typeof campaignBoardsTable.$inferInsert> = {};
    if (req.body.title !== undefined) {
      const title = stringValue(req.body.title, true);
      if (!title) {
        res.status(400).json({ error: "O título não pode ficar vazio." });
        return;
      }
      updates.title = title;
    }
    if (req.body.description !== undefined) updates.description = stringValue(req.body.description);
    if (Object.keys(updates).length) await db.update(campaignBoardsTable).set(updates).where(eq(campaignBoardsTable.id, id));
    res.json(await boardById(id, req.auth!));
  },
);

router.post(
  "/boards/:id/archive",
  requirePermission("boards:archive"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await boardById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    const archived = record(req.body) && typeof req.body.archived === "boolean" ? req.body.archived : !existing.archived;
    await db.update(campaignBoardsTable).set({ archived, updatedAt: new Date() }).where(eq(campaignBoardsTable.id, id));
    res.json(await boardById(id, req.auth!));
  },
);

router.post(
  "/boards/:id/members",
  requirePermission("boards:update"),
  async (req, res): Promise<void> => {
    const board = await boardById(Number(req.params.id), req.auth!);
    const userId = record(req.body) ? numberValue(req.body.userId) : undefined;
    if (!board) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    if (!userId) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const [user] = await db.select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(and(eq(authUsersTable.id, userId), eq(authUsersTable.cityId, board.cityId), eq(authUsersTable.isActive, true)));
    if (!user) {
      res.status(400).json({ error: "O usuário precisa estar ativo na cidade do quadro." });
      return;
    }
    await db.insert(campaignBoardMembersTable).values({
      boardId: board.id,
      userId,
      addedByUserId: req.auth!.user.id,
    }).onConflictDoNothing();
    res.status(201).json({ success: true });
  },
);

router.delete(
  "/boards/:id/members/:userId",
  requirePermission("boards:update"),
  async (req, res): Promise<void> => {
    const board = await boardById(Number(req.params.id), req.auth!);
    const userId = Number(req.params.userId);
    if (!board) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    await db.delete(campaignBoardMembersTable).where(and(
      eq(campaignBoardMembersTable.boardId, board.id),
      eq(campaignBoardMembersTable.userId, userId),
    ));
    res.status(204).send();
  },
);

router.get(
  "/tasks/:id",
  requirePermission("tasks:view"),
  async (req, res): Promise<void> => {
    const task = await taskDetailById(Number(req.params.id), req.auth!);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    res.json(task);
  },
);

router.get(
  "/tasks/:id/members/options",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    if (!task || !task.cityId) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const users = await db.select({
      id: authUsersTable.id,
      fullName: authUsersTable.fullName,
      email: authUsersTable.email,
      role: authUsersTable.role,
      phone: authUsersTable.phone,
    }).from(authUsersTable)
      .innerJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
      .where(and(eq(authUsersTable.cityId, task.cityId), eq(authUsersTable.isActive, true), cityScopeCondition(req.auth!)))
      .orderBy(asc(authUsersTable.fullName));
    res.json(users);
  },
);

router.post(
  "/tasks/:id/members",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const userId = record(req.body) ? numberValue(req.body.userId) : undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!userId || !task.cityId) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const [user] = await db.select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(and(eq(authUsersTable.id, userId), eq(authUsersTable.cityId, task.cityId), eq(authUsersTable.isActive, true)));
    if (!user) {
      res.status(400).json({ error: "O usuário precisa estar ativo na cidade da tarefa." });
      return;
    }
    await db.insert(campaignTaskMembersTable).values({
      taskId: task.id,
      userId,
      addedByUserId: req.auth!.user.id,
    }).onConflictDoNothing();
    await recordTaskActivity(task.id, req.auth!.user.id, "member_added", `Membro adicionado: ${userId}.`);
    res.status(201).json({ success: true });
  },
);

router.delete(
  "/tasks/:id/members/:userId",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const userId = Number(req.params.userId);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    await db.delete(campaignTaskMembersTable).where(and(
      eq(campaignTaskMembersTable.taskId, task.id),
      eq(campaignTaskMembersTable.userId, userId),
    ));
    await recordTaskActivity(task.id, req.auth!.user.id, "member_removed", `Membro removido: ${userId}.`);
    res.status(204).send();
  },
);

router.post(
  "/tasks/:id/checklist",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const title = record(req.body) ? stringValue(req.body.title, true) : null;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!title) {
      res.status(400).json({ error: "O item do checklist não pode ficar vazio." });
      return;
    }
    const [last] = await db.select({ position: campaignTaskChecklistItemsTable.position })
      .from(campaignTaskChecklistItemsTable)
      .where(eq(campaignTaskChecklistItemsTable.taskId, task.id))
      .orderBy(desc(campaignTaskChecklistItemsTable.position))
      .limit(1);
    const [item] = await db.insert(campaignTaskChecklistItemsTable).values({
      taskId: task.id,
      title,
      position: (last?.position ?? -1) + 1,
      createdByUserId: req.auth!.user.id,
    }).returning();
    await recordTaskActivity(task.id, req.auth!.user.id, "checklist_added", title);
    res.status(201).json(item);
  },
);

router.patch(
  "/tasks/:id/checklist/:itemId",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const itemId = Number(req.params.itemId);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const [item] = await db.select().from(campaignTaskChecklistItemsTable).where(and(
      eq(campaignTaskChecklistItemsTable.id, itemId),
      eq(campaignTaskChecklistItemsTable.taskId, task.id),
    ));
    if (!item) {
      res.status(404).json({ error: "Item do checklist não encontrado." });
      return;
    }
    const updates: Partial<typeof campaignTaskChecklistItemsTable.$inferInsert> = {};
    if (record(req.body) && typeof req.body.title === "string") {
      const title = stringValue(req.body.title, true);
      if (!title) {
        res.status(400).json({ error: "O item do checklist não pode ficar vazio." });
        return;
      }
      updates.title = title;
    }
    if (record(req.body) && typeof req.body.completed === "boolean") updates.completed = req.body.completed;
    if (Object.keys(updates).length) await db.update(campaignTaskChecklistItemsTable).set(updates).where(eq(campaignTaskChecklistItemsTable.id, item.id));
    await recordTaskActivity(task.id, req.auth!.user.id, "checklist_updated", updates.completed === undefined ? item.title : `${item.title}: ${updates.completed ? "concluído" : "reaberto"}`);
    const [updated] = await db.select().from(campaignTaskChecklistItemsTable).where(eq(campaignTaskChecklistItemsTable.id, item.id));
    res.json(updated);
  },
);

router.delete(
  "/tasks/:id/checklist/:itemId",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const itemId = Number(req.params.itemId);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const [item] = await db.select({ title: campaignTaskChecklistItemsTable.title })
      .from(campaignTaskChecklistItemsTable)
      .where(and(eq(campaignTaskChecklistItemsTable.id, itemId), eq(campaignTaskChecklistItemsTable.taskId, task.id)));
    if (!item) {
      res.status(404).json({ error: "Item do checklist não encontrado." });
      return;
    }
    await db.delete(campaignTaskChecklistItemsTable).where(eq(campaignTaskChecklistItemsTable.id, itemId));
    await recordTaskActivity(task.id, req.auth!.user.id, "checklist_removed", item.title);
    res.status(204).send();
  },
);

router.post(
  "/tasks/:id/comments",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const body = record(req.body) ? stringValue(req.body.body, true) : null;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!body) {
      res.status(400).json({ error: "O comentário não pode ficar vazio." });
      return;
    }
    const [comment] = await db.insert(campaignTaskCommentsTable).values({
      taskId: task.id,
      userId: req.auth!.user.id,
      body,
    }).returning();
    await recordTaskActivity(task.id, req.auth!.user.id, "commented", body.slice(0, 120));
    res.status(201).json(comment);
  },
);

router.get(
  "/tasks",
  requirePermission("tasks:view"),
  async (req, res): Promise<void> => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const conditions = [taskScope(req.auth!)];
    const requestedBoardId = numberValue(req.query.boardId);
    if (requestedBoardId) conditions.push(eq(campaignTasksTable.boardId, requestedBoardId));
    if (typeof req.query.status === "string" && ["todo", "in_progress", "blocked", "done"].includes(req.query.status)) {
      conditions.push(eq(campaignTasksTable.status, req.query.status));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(ilike(campaignTasksTable.title, pattern), ilike(campaignTasksTable.description, pattern), ilike(citiesTable.name, pattern)));
    }
    const rows = await db
      .select({
        id: campaignTasksTable.id,
        title: campaignTasksTable.title,
        description: campaignTasksTable.description,
        status: campaignTasksTable.status,
        priority: campaignTasksTable.priority,
        dueAt: campaignTasksTable.dueAt,
        boardId: campaignTasksTable.boardId,
        boardName: campaignBoardsTable.title,
        cityId: campaignTasksTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        leadershipId: campaignTasksTable.leadershipId,
        leadershipName: leadershipsTable.name,
        leadershipContact: leadershipsTable.leadershipContact,
        assigneeUserId: campaignTasksTable.assigneeUserId,
        assigneeName: authUsersTable.fullName,
        createdAt: campaignTasksTable.createdAt,
      })
      .from(campaignTasksTable)
      .leftJoin(campaignBoardsTable, eq(campaignBoardsTable.id, campaignTasksTable.boardId))
      .leftJoin(citiesTable, eq(citiesTable.id, campaignTasksTable.cityId))
      .leftJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .leftJoin(leadershipsTable, eq(leadershipsTable.id, campaignTasksTable.leadershipId))
      .leftJoin(authUsersTable, eq(authUsersTable.id, campaignTasksTable.assigneeUserId))
      .where(and(...conditions))
      .orderBy(desc(campaignTasksTable.priority), asc(campaignTasksTable.dueAt), desc(campaignTasksTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/tasks",
  requirePermission("tasks:create"),
  async (req, res): Promise<void> => {
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const title = stringValue(req.body.title, true);
    const cityId = numberValue(req.body.cityId);
    const leadershipId = numberValue(req.body.leadershipId);
    if (!title || !cityId || !leadershipId) {
      res.status(400).json({ error: "Título, cidade e liderança responsável são obrigatórios." });
      return;
    }
    const [leadership] = await db.select({
      cityId: leadershipsTable.cityId,
      leadershipContact: leadershipsTable.leadershipContact,
    }).from(leadershipsTable).where(eq(leadershipsTable.id, leadershipId));
    if (!leadership || leadership.cityId !== cityId) {
      res.status(400).json({ error: "A liderança selecionada não pertence à cidade informada." });
      return;
    }
    const [allowedCity] = await db.select({ id: citiesTable.id }).from(citiesTable).where(and(eq(citiesTable.id, cityId), cityScopeCondition(req.auth!)));
    if (!allowedCity) {
      res.status(403).json({ error: "O território está fora do seu escopo." });
      return;
    }
    const boardId = numberValue(req.body.boardId) ?? null;
    if (boardId) {
      const board = await boardById(boardId, req.auth!);
      if (!board || board.archived || board.cityId !== cityId) {
        res.status(400).json({ error: "O quadro selecionado não pertence à cidade ou está arquivado." });
        return;
      }
    }
    const dueAt = req.body.dueAt === null ? null : dateValue(req.body.dueAt);
    const leadershipPhone = stringValue(req.body.leadershipPhone);
    if (leadershipPhone && !normalizeWhatsAppPhone(leadershipPhone)) {
      res.status(400).json({ error: "Informe um telefone válido com DDD para a liderança." });
      return;
    }
    const assigneeUserId = numberValue(req.body.assigneeUserId) ?? null;
    if (assigneeUserId && !(await userInTaskCity(assigneeUserId, cityId, req.auth!))) {
      res.status(400).json({ error: "O responsável precisa estar ativo no território da tarefa." });
      return;
    }
    const [created] = await db.transaction(async (tx) => {
      if (leadershipPhone && !leadership.leadershipContact) {
        await tx.update(leadershipsTable)
          .set({ leadershipContact: leadershipPhone, updatedAt: new Date() })
          .where(eq(leadershipsTable.id, leadershipId));
      }
      return tx.insert(campaignTasksTable).values({
        title,
        description: stringValue(req.body.description),
        status: ["todo", "in_progress", "blocked", "done"].includes(String(req.body.status)) ? String(req.body.status) : "todo",
        priority: ["low", "normal", "high", "urgent"].includes(String(req.body.priority)) ? String(req.body.priority) : "normal",
        dueAt,
        boardId,
        cityId,
        leadershipId,
        assigneeUserId,
        createdByUserId: req.auth!.user.id,
      }).returning({ id: campaignTasksTable.id });
    });
    await recordTaskActivity(created.id, req.auth!.user.id, "created", "Tarefa criada.");
    res.status(201).json(await taskById(created.id, req.auth!));
  },
);

router.patch(
  "/tasks/:id",
  requirePermission("tasks:update"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const updates: Partial<typeof campaignTasksTable.$inferInsert> = {};
    if (req.body.title !== undefined) {
      const title = stringValue(req.body.title, true);
      if (!title) {
        res.status(400).json({ error: "O título não pode ficar vazio." });
        return;
      }
      updates.title = title;
    }
    if (req.body.description !== undefined) updates.description = stringValue(req.body.description);
    if (req.body.status !== undefined && ["todo", "in_progress", "blocked", "done"].includes(String(req.body.status))) updates.status = String(req.body.status);
    if (req.body.priority !== undefined && ["low", "normal", "high", "urgent"].includes(String(req.body.priority))) updates.priority = String(req.body.priority);
    if (req.body.dueAt !== undefined) updates.dueAt = req.body.dueAt === null ? null : dateValue(req.body.dueAt);
    if (req.body.assigneeUserId !== undefined) {
      const assigneeUserId = numberValue(req.body.assigneeUserId) ?? null;
      if (assigneeUserId && !(await userInTaskCity(assigneeUserId, existing.cityId, req.auth!))) {
        res.status(400).json({ error: "O responsável precisa estar ativo no território da tarefa." });
        return;
      }
      updates.assigneeUserId = assigneeUserId;
    }
    if (req.body.boardId !== undefined) {
      const boardId = numberValue(req.body.boardId) ?? null;
      if (boardId) {
        const board = await boardById(boardId, req.auth!);
        if (!board || board.archived || board.cityId !== existing.cityId) {
          res.status(400).json({ error: "O quadro selecionado não pertence à cidade ou está arquivado." });
          return;
        }
      }
      updates.boardId = boardId;
    }
    if (Object.keys(updates).length) await db.update(campaignTasksTable).set(updates).where(eq(campaignTasksTable.id, id));
    if (Object.keys(updates).length) {
      const changedFields = Object.keys(updates).join(", ");
      await recordTaskActivity(id, req.auth!.user.id, "updated", `Campos atualizados: ${changedFields}.`);
    }
    res.json(await taskById(id, req.auth!));
  },
);

router.delete(
  "/tasks/:id",
  requirePermission("tasks:delete"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    await db.delete(campaignTasksTable).where(eq(campaignTasksTable.id, id));
    res.status(204).send();
  },
);

router.get(
  "/tasks/:id/recipients",
  requirePermission("tasks:share"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const task = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const rows = await db
      .select({
        id: authUsersTable.id,
        name: authUsersTable.fullName,
        role: authUsersTable.role,
        phone: authUsersTable.phone,
        email: authUsersTable.email,
      })
      .from(authUsersTable)
      .where(and(eq(authUsersTable.isActive, true), sql`${authUsersTable.phone} is not null`, task.cityId ? eq(authUsersTable.cityId, task.cityId) : sql`false`));
  const campaignContacts = task.cityId && task.leadershipId
      ? await db.select({
          id: leadershipsTable.id,
          name: leadershipsTable.name,
          phone: leadershipsTable.leadershipContact,
          role: sql<string>`'LIDERANCA'`,
          email: sql<string>`null`,
        }).from(leadershipsTable).where(and(eq(leadershipsTable.id, task.leadershipId), sql`${leadershipsTable.leadershipContact} is not null`))
      : [];
    res.json(
      [...rows, ...campaignContacts].flatMap((recipient) => {
        const phone = normalizeWhatsAppPhone(recipient.phone);
        return phone ? [{ ...recipient, phone }] : [];
      }),
    );
  },
);

router.get(
  "/calendar/events",
  requirePermission("calendar:view"),
  async (req, res): Promise<void> => {
    const events = await db
      .select({
        id: campaignCalendarEventsTable.id,
        googleEventId: campaignCalendarEventsTable.googleEventId,
        googleHtmlLink: campaignCalendarEventsTable.googleHtmlLink,
        title: campaignCalendarEventsTable.title,
        description: campaignCalendarEventsTable.description,
        location: campaignCalendarEventsTable.location,
        startsAt: campaignCalendarEventsTable.startsAt,
        endsAt: campaignCalendarEventsTable.endsAt,
        cityId: campaignCalendarEventsTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        status: campaignCalendarEventsTable.status,
      })
      .from(campaignCalendarEventsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .where(cityScopeCondition(req.auth!))
      .orderBy(asc(campaignCalendarEventsTable.startsAt));
    res.json(events);
  },
);

router.post(
  "/calendar/shares",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    if (!record(req.body) || typeof req.body.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(req.body.weekStart)) {
      res.status(400).json({ error: "A semana da agenda é obrigatória." });
      return;
    }
    const token = randomBytes(24).toString("base64url");
    const [share] = await db.insert(campaignCalendarSharesTable).values({
      token,
      weekStart: req.body.weekStart,
      label: stringValue(req.body.label) ?? "Agenda semanal",
      createdByUserId: req.auth!.user.id,
    }).returning({
      token: campaignCalendarSharesTable.token,
      weekStart: campaignCalendarSharesTable.weekStart,
      label: campaignCalendarSharesTable.label,
    });
    res.status(201).json(share);
  },
);

router.post(
  "/calendar/events",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const title = stringValue(req.body.title, true);
    const startsAt = dateValue(req.body.startsAt);
    const endsAt = dateValue(req.body.endsAt);
    const cityId = numberValue(req.body.cityId);
    if (!title || !startsAt || !endsAt || !cityId || endsAt <= startsAt) {
      res.status(400).json({ error: "Título, cidade, início e fim válidos são obrigatórios." });
      return;
    }
    const [city] = await db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, cityId));
    if (!city) {
      res.status(400).json({ error: "Cidade não encontrada." });
      return;
    }
    const [allowedCity] = await db
      .select({ id: citiesTable.id })
      .from(citiesTable)
      .where(and(eq(citiesTable.id, cityId), cityScopeCondition(req.auth!)));
    if (!allowedCity) {
      res.status(403).json({ error: "O território está fora do seu escopo." });
      return;
    }
    const googleResponse = await googleCalendarRequest("/calendar/v3/calendars/primary/events?sendUpdates=all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: title,
        description: stringValue(req.body.description),
        location: stringValue(req.body.location),
        start: { dateTime: startsAt.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: endsAt.toISOString(), timeZone: "America/Sao_Paulo" },
        extendedProperties: { private: { eaCityId: String(cityId) } },
      }),
    });
    if (!googleResponse.ok) {
      res.status(502).json({ error: "O Google Calendar não aceitou o evento.", details: await googleResponse.text() });
      return;
    }
    const googleEvent = await googleResponse.json() as { id: string; htmlLink?: string };
    const [created] = await db.insert(campaignCalendarEventsTable).values({
      googleCalendarId: "primary",
      googleEventId: googleEvent.id,
      googleHtmlLink: googleEvent.htmlLink ?? null,
      title,
      description: stringValue(req.body.description),
      location: stringValue(req.body.location),
      startsAt,
      endsAt,
      cityId,
      status: "pending",
      createdByUserId: req.auth!.user.id,
    }).returning();
    res.status(201).json(created);
  },
);

router.post(
  "/calendar/sync",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 90);
    const query = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: "America/Sao_Paulo",
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const response = await googleCalendarRequest(`/calendar/v3/calendars/primary/events?${query.toString()}`);
    if (!response.ok) {
      res.status(502).json({ error: "Não foi possível sincronizar o Google Calendar.", details: await response.text() });
      return;
    }
    const payload = await response.json() as { items?: Array<Record<string, unknown>> };
    const visibleCities = await db
      .select({ id: citiesTable.id })
      .from(citiesTable)
      .where(cityScopeCondition(req.auth!));
    const visibleCityIds = new Set(visibleCities.map((city) => city.id));
    let imported = 0;
    for (const event of payload.items ?? []) {
      if (event.status === "cancelled" || typeof event.id !== "string") continue;
      const privateProps = record(event.extendedProperties) && record(event.extendedProperties.private) ? event.extendedProperties.private : {};
      const cityId = numberValue(privateProps.eaCityId);
      const start = record(event.start) && typeof event.start.dateTime === "string" ? dateValue(event.start.dateTime) : null;
      const end = record(event.end) && typeof event.end.dateTime === "string" ? dateValue(event.end.dateTime) : null;
      if (!cityId || !visibleCityIds.has(cityId) || !start || !end || typeof event.summary !== "string") continue;
      await db.insert(campaignCalendarEventsTable).values({
        googleCalendarId: "primary",
        googleEventId: event.id,
        googleHtmlLink: typeof event.htmlLink === "string" ? event.htmlLink : null,
        title: event.summary,
        description: typeof event.description === "string" ? event.description : null,
        location: typeof event.location === "string" ? event.location : null,
        startsAt: start,
        endsAt: end,
        cityId,
        status: "pending",
        createdByUserId: req.auth!.user.id,
      }).onConflictDoUpdate({
        target: [campaignCalendarEventsTable.googleCalendarId, campaignCalendarEventsTable.googleEventId],
        set: { title: event.summary, startsAt: start, endsAt: end, googleHtmlLink: typeof event.htmlLink === "string" ? event.htmlLink : null },
      });
      imported++;
    }
    res.json({ imported });
  },
);

router.post(
  "/calendar/events/:id/acknowledge",
  requireAnyPermission(["calendar:approve", "calendar:view"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const [event] = await db.select({ id: campaignCalendarEventsTable.id }).from(campaignCalendarEventsTable).innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId)).where(and(eq(campaignCalendarEventsTable.id, id), cityScopeCondition(req.auth!)));
    if (!event) {
      res.status(404).json({ error: "Evento não encontrado." });
      return;
    }
    await db.insert(campaignEventAcknowledgementsTable).values({ eventId: id, userId: req.auth!.user.id }).onConflictDoNothing();
    res.json({ success: true });
  },
);

export default router;

publicOperationsRouter.get("/calendar/shared/:token", async (req, res): Promise<void> => {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const [share] = await db.select({
    token: campaignCalendarSharesTable.token,
    weekStart: campaignCalendarSharesTable.weekStart,
    label: campaignCalendarSharesTable.label,
  }).from(campaignCalendarSharesTable).where(and(
    eq(campaignCalendarSharesTable.token, token),
    eq(campaignCalendarSharesTable.active, true),
  ));
  if (!share) {
    res.status(404).json({ error: "Link de agenda inválido ou desativado." });
    return;
  }
  const weekStart = new Date(`${share.weekStart}T00:00:00-03:00`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const events = await db.select({
    id: campaignCalendarEventsTable.id,
    title: campaignCalendarEventsTable.title,
    description: campaignCalendarEventsTable.description,
    location: campaignCalendarEventsTable.location,
    startsAt: campaignCalendarEventsTable.startsAt,
    endsAt: campaignCalendarEventsTable.endsAt,
    cityName: citiesTable.name,
    regionName: regionsTable.name,
  }).from(campaignCalendarEventsTable)
    .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .where(and(
      sql`${campaignCalendarEventsTable.startsAt} >= ${weekStart}`,
      sql`${campaignCalendarEventsTable.startsAt} < ${weekEnd}`,
    ))
    .orderBy(asc(campaignCalendarEventsTable.startsAt));
  res.json({ share, events });
});