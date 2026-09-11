import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, asc, eq, inArray } from "drizzle-orm";
import app from "../src/app";
import {
  authPermissionsTable,
  authRolePermissionsTable,
  authUsersTable,
  campaignCalendarEventsTable,
  campaignCalendarSharesTable,
  campaignEventAcknowledgementsTable,
  campaignTasksTable,
  citiesTable,
  db,
  leadershipsTable,
  regionsTable,
} from "@workspace/db";
import {
  ensureAuthBootstrap,
  signAccessToken,
} from "../src/lib/auth";
import { setGoogleCalendarRequestForTests } from "../src/lib/google-calendar";

type FixtureUser = typeof authUsersTable.$inferSelect;
type TestResponse = {
  status: number;
  body: any;
};

let server: Server;
let baseUrl = "";
let fixtureUsers: FixtureUser[] = [];
let fixtureTaskIds: number[] = [];
let fixtureEventIds: number[] = [];
let fixtureShareIds: number[] = [];
let updatedLeadershipId = 0;
let originalLeadershipName: string | null = null;
const calendarCalls: Array<{ path: string; init?: { method?: string; body?: unknown } }> = [];

function tokenFor(user: FixtureUser): string {
  return signAccessToken(user);
}

async function request(
  path: string,
  user: FixtureUser,
  init: RequestInit = {},
): Promise<TestResponse> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${tokenFor(user)}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

async function createFixtureUser(
  values: Partial<typeof authUsersTable.$inferInsert>,
): Promise<FixtureUser> {
  const [user] = await db
    .insert(authUsersTable)
    .values({
      email: `task9-${randomUUID()}@example.test`,
      passwordHash: "test-only-hash",
      fullName: "Usuário de teste",
      role: "COORDENADOR",
      isActive: true,
      ...values,
    })
    .returning();
  fixtureUsers.push(user);
  return user;
}

before(async () => {
  await ensureAuthBootstrap();
  const [regionA, regionB] = await db
    .select()
    .from(regionsTable)
    .orderBy(asc(regionsTable.id))
    .limit(2);
  const [cityA] = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.regionId, regionA.id))
    .orderBy(asc(citiesTable.id))
    .limit(1);
  const [cityB] = await db
    .select()
    .from(citiesTable)
    .where(eq(citiesTable.regionId, regionB.id))
    .orderBy(asc(citiesTable.id))
    .limit(1);
  const [leadership] = await db
    .select()
    .from(leadershipsTable)
    .where(eq(leadershipsTable.cityId, cityA.id))
    .orderBy(asc(leadershipsTable.id))
    .limit(1);
  assert.ok(regionA && regionB && cityA && cityB && leadership);

  const admin = await createFixtureUser({
    fullName: "Admin de teste",
    role: "ADMIN_GERAL",
  });
  const articulator = await createFixtureUser({
    fullName: "Articulador de teste",
    role: "ARTICULADOR",
    regionId: regionA.id,
  });
  const coordinator = await createFixtureUser({
    fullName: "Coordenador de teste",
    role: "COORDENADOR",
    cityId: cityA.id,
    regionId: regionA.id,
    phone: "+55 (24) 99999-0000",
  });
  const leader = await createFixtureUser({
    fullName: "Liderança de teste",
    role: "LIDERANCA",
    cityId: cityA.id,
    regionId: regionA.id,
    leadershipId: leadership.id,
  });
  const outsider = await createFixtureUser({
    fullName: "Coordenador fora do escopo",
    role: "COORDENADOR",
    cityId: cityB.id,
    regionId: regionB.id,
  });
  await createFixtureUser({
    fullName: "Telefone inválido",
    role: "LIDERANCA",
    cityId: cityA.id,
    regionId: regionA.id,
    phone: "telefone sem números",
  });
  await createFixtureUser({
    fullName: "Telefone ausente",
    role: "LIDERANCA",
    cityId: cityA.id,
    regionId: regionA.id,
    phone: null,
  });

  updatedLeadershipId = leadership.id;
  originalLeadershipName = leadership.name;

  setGoogleCalendarRequestForTests(async (path, init) => {
    calendarCalls.push({ path, init: { method: init?.method, body: init?.body } });
    if (init?.method === "POST") {
      return Response.json({
        id: "google-created-task-9",
        htmlLink: "https://calendar.google.com/event/task-9",
      });
    }
    return Response.json({
      items: [
        {
          id: "google-sync-task-9",
          summary: "Evento sincronizado",
          description: "Aviso sincronizado",
          location: "Centro",
          htmlLink: "https://calendar.google.com/event/sync-task-9",
          extendedProperties: { private: { eaCityId: String(cityA.id) } },
          start: { dateTime: "2030-01-02T12:00:00.000Z" },
          end: { dateTime: "2030-01-02T13:00:00.000Z" },
        },
        {
          id: "google-outside-task-9",
          summary: "Evento fora do escopo",
          extendedProperties: { private: { eaCityId: String(cityB.id) } },
          start: { dateTime: "2030-01-03T12:00:00.000Z" },
          end: { dateTime: "2030-01-03T13:00:00.000Z" },
        },
        { id: "google-cancelled-task-9", status: "cancelled" },
      ],
    });
  });

  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;

  // Keep these references available to the assertions without coupling them to IDs in seed data.
  void admin;
  void articulator;
  void coordinator;
  void leader;
  void outsider;
});

after(async () => {
  setGoogleCalendarRequestForTests(null);
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
  if (fixtureEventIds.length) {
    await db
      .delete(campaignEventAcknowledgementsTable)
      .where(inArray(campaignEventAcknowledgementsTable.eventId, fixtureEventIds));
    await db
      .delete(campaignCalendarEventsTable)
      .where(inArray(campaignCalendarEventsTable.id, fixtureEventIds));
  }
  if (fixtureShareIds.length) {
    await db
      .delete(campaignCalendarSharesTable)
      .where(inArray(campaignCalendarSharesTable.id, fixtureShareIds));
  }
  if (fixtureTaskIds.length) {
    await db
      .delete(campaignTasksTable)
      .where(inArray(campaignTasksTable.id, fixtureTaskIds));
  }
  if (updatedLeadershipId) {
    await db
      .update(leadershipsTable)
      .set({ name: originalLeadershipName })
      .where(eq(leadershipsTable.id, updatedLeadershipId));
  }
  if (fixtureUsers.length) {
    await db
      .delete(authUsersTable)
      .where(inArray(authUsersTable.id, fixtureUsers.map((user) => user.id)));
  }
});

test("confirma RBAC, agenda, aviso, compartilhamento e escopo operacional", async () => {
  const [admin, articulator, coordinator, leader, outsider] = fixtureUsers;
  assert.ok(admin && articulator && coordinator && leader && outsider);

  const regionResponse = await request("/api/regions", articulator);
  assert.equal(regionResponse.status, 200);
  assert.ok(regionResponse.body.every((region: { id: number }) => region.id === articulator.regionId));

  const cityResponse = await request("/api/cities", coordinator);
  assert.equal(cityResponse.status, 200);
  assert.deepEqual(
    cityResponse.body.map((city: { id: number }) => city.id),
    [coordinator.cityId],
  );

  const leadershipResponse = await request("/api/leaderships", leader);
  assert.equal(leadershipResponse.status, 200);
  assert.equal(leadershipResponse.body.total, 1);
  assert.equal(leadershipResponse.body.items[0].id, leader.leadershipId);

  const outsideLeadership = await request(
    `/api/leaderships/${leader.leadershipId}`,
    outsider,
  );
  assert.equal(outsideLeadership.status, 404);

  const partialLeadership = await request(
    `/api/leaderships/${leader.leadershipId}`,
    coordinator,
    {
      method: "PATCH",
      body: JSON.stringify({ name: "Nome atualizado no teste" }),
    },
  );
  assert.equal(partialLeadership.status, 200);
  assert.equal(partialLeadership.body.cityId, coordinator.cityId);
  assert.equal(partialLeadership.body.name, "Nome atualizado no teste");

  const deniedCalendarCreate = await request("/api/calendar/events", coordinator, {
    method: "POST",
    body: JSON.stringify({
      title: "Evento sem permissão",
      cityId: coordinator.cityId,
      startsAt: "2030-01-04T12:00:00.000Z",
      endsAt: "2030-01-04T13:00:00.000Z",
    }),
  });
  assert.equal(deniedCalendarCreate.status, 403);

  const createdEvent = await request("/api/calendar/events", admin, {
    method: "POST",
    body: JSON.stringify({
      title: "Agenda criada no teste",
      description: "Levar material",
      location: "Sede",
      cityId: coordinator.cityId,
      startsAt: "2030-01-05T12:00:00.000Z",
      endsAt: "2030-01-05T13:00:00.000Z",
    }),
  });
  assert.equal(createdEvent.status, 201);
  fixtureEventIds.push(createdEvent.body.id);
  assert.equal(createdEvent.body.googleEventId, "google-created-task-9");
  assert.equal(calendarCalls[0]?.path, "/calendar/v3/calendars/primary/events?sendUpdates=all");
  assert.match(String(calendarCalls[0]?.init?.body), /Agenda criada no teste/);

  const synced = await request("/api/calendar/sync", admin, { method: "POST" });
  assert.equal(synced.status, 200);
  assert.equal(synced.body.imported, 2);
  const syncedRows = await request("/api/calendar/events", admin);
  assert.equal(syncedRows.status, 200);
  const syncRow = syncedRows.body.find(
    (event: { googleEventId: string }) => event.googleEventId === "google-sync-task-9",
  );
  const outsideSyncRow = syncedRows.body.find(
    (event: { googleEventId: string }) => event.googleEventId === "google-outside-task-9",
  );
  assert.ok(syncRow);
  assert.ok(outsideSyncRow);
  fixtureEventIds.push(syncRow.id, outsideSyncRow.id);

  const visibleToLeader = await request("/api/calendar/events", leader);
  assert.equal(visibleToLeader.status, 200);
  assert.ok(visibleToLeader.body.some((event: { id: number }) => event.id === createdEvent.body.id));
  const noticeEvent = visibleToLeader.body.find(
    (event: { id: number }) => event.id === createdEvent.body.id,
  );
  const acknowledged = await request(
    `/api/calendar/events/${noticeEvent.id}/acknowledge`,
    leader,
    { method: "POST" },
  );
  assert.equal(acknowledged.status, 200);
  const [acknowledgement] = await db
    .select()
    .from(campaignEventAcknowledgementsTable)
    .where(
      and(
        eq(campaignEventAcknowledgementsTable.eventId, noticeEvent.id),
        eq(campaignEventAcknowledgementsTable.userId, leader.id),
      ),
    );
  assert.ok(acknowledgement);

  const createdTask = await request("/api/tasks", coordinator, {
    method: "POST",
    body: JSON.stringify({
      title: "Tarefa dentro do escopo",
      description: "Compartilhar instruções",
      cityId: coordinator.cityId,
      leadershipId: updatedLeadershipId,
    }),
  });
  assert.equal(createdTask.status, 201);
  fixtureTaskIds.push(createdTask.body.id);
  const outsiderTasks = await request("/api/tasks", outsider);
  assert.equal(outsiderTasks.status, 200);
  assert.ok(
    outsiderTasks.body.every((task: { id: number }) => task.id !== createdTask.body.id),
  );
  const outsiderPatch = await request(`/api/tasks/${createdTask.body.id}`, outsider, {
    method: "PATCH",
    body: JSON.stringify({ status: "done" }),
  });
  assert.equal(outsiderPatch.status, 404);
  const outsiderRecipients = await request(
    `/api/tasks/${createdTask.body.id}/recipients`,
    outsider,
  );
  assert.equal(outsiderRecipients.status, 404);

  const recipients = await request(
    `/api/tasks/${createdTask.body.id}/recipients`,
    coordinator,
  );
  assert.equal(recipients.status, 200);
  assert.ok(recipients.body.some((recipient: { id: number }) => recipient.id === coordinator.id));
  assert.ok(
    recipients.body.every(
      (recipient: { name: string }) =>
        recipient.name !== "Telefone inválido" && recipient.name !== "Telefone ausente",
    ),
  );
  assert.ok(
    recipients.body
      .filter((recipient: { id: number }) => recipient.id === coordinator.id)
      .every((recipient: { phone: string }) => recipient.phone === "5524999990000"),
  );

  const [calendarManagePermission] = await db
    .select({ id: authPermissionsTable.id })
    .from(authPermissionsTable)
    .where(eq(authPermissionsTable.key, "calendar:manage"));
  assert.ok(calendarManagePermission);
  const [existingCoordinatorPermission] = await db
    .select({ permissionId: authRolePermissionsTable.permissionId })
    .from(authRolePermissionsTable)
    .where(and(
      eq(authRolePermissionsTable.role, "COORDENADOR"),
      eq(authRolePermissionsTable.permissionId, calendarManagePermission.id),
    ));
  await db.insert(authRolePermissionsTable).values({
    role: "COORDENADOR",
    permissionId: calendarManagePermission.id,
  }).onConflictDoNothing();
  try {
    const adminShare = await request("/api/calendar/shares", admin, {
      method: "POST",
      body: JSON.stringify({ weekStart: "2029-12-31", label: "Agenda nacional" }),
    });
    assert.equal(adminShare.status, 201);
    fixtureShareIds.push(adminShare.body.id);

    const coordinatorShare = await request("/api/calendar/shares", coordinator, {
      method: "POST",
      body: JSON.stringify({ weekStart: "2029-12-31", label: "Agenda municipal" }),
    });
    assert.equal(coordinatorShare.status, 201);
    fixtureShareIds.push(coordinatorShare.body.id);

    const crossUserPreparation = await request(
      `/api/calendar/shares/${adminShare.body.id}/share-preparations`,
      coordinator,
      {
        method: "POST",
        body: JSON.stringify({
          recipients: [{ type: "user", id: coordinator.id }],
        }),
      },
    );
    assert.equal(crossUserPreparation.status, 404);

    const publicResponse = await fetch(
      `${baseUrl}/api/calendar/shared/${coordinatorShare.body.token}`,
    );
    assert.equal(publicResponse.status, 200);
    const publicBody = await publicResponse.json() as {
      events: Array<{ id: number }>;
    };
    assert.ok(publicBody.events.some((event) => event.id === createdEvent.body.id));
    assert.ok(publicBody.events.some((event) => event.id === syncRow.id));
    assert.ok(publicBody.events.every((event) => event.id !== outsideSyncRow.id));
  } finally {
    if (!existingCoordinatorPermission) {
      await db
        .delete(authRolePermissionsTable)
        .where(and(
          eq(authRolePermissionsTable.role, "COORDENADOR"),
          eq(authRolePermissionsTable.permissionId, calendarManagePermission.id),
        ));
    }
  }
});