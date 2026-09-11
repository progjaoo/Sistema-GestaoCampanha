import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, KeyRound, Plus, ShieldCheck, UserRound, X } from "lucide-react";
import { useListCities, useListRegions } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth";
import { ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from "@/components/ops-shell";

type Permission = { id: number; key: string; label: string; description: string; category: string };
type Role = { key: string; label: string; description: string; userCount: number; permissionKeys: string[] };
type UserRow = { id: number; email: string; fullName: string; role: string; regionId: number | null; regionName: string | null; cityId: number | null; cityName: string | null; isActive: boolean; canCreateLeaderUsers: boolean; lastLoginAt: string | null };

async function readJson(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  return body;
}

export default function AccessControlPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [savingRole, setSavingRole] = useState(false);
  const regions = useListRegions();
  const cities = useListCities();

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [rbacResponse, usersResponse] = await Promise.all([authFetch("/api/auth/rbac/roles"), authFetch("/api/auth/users")]);
      const rbac = await readJson(rbacResponse) as { roles: Role[]; permissions: Permission[] };
      const userRows = await readJson(usersResponse) as UserRow[];
      setRoles(rbac.roles);
      setPermissions(rbac.permissions);
      setUsers(userRows);
      setSelectedRole((current) => current || rbac.roles[0]?.key || "");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os acessos.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const activeRole = roles.find((role) => role.key === selectedRole);
  const groupedPermissions = useMemo(() => permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
    (groups[permission.category] ??= []).push(permission);
    return groups;
  }, {}), [permissions]);

  async function togglePermission(key: string) {
    if (!activeRole) return;
    const nextKeys = activeRole.permissionKeys.includes(key)
      ? activeRole.permissionKeys.filter((current) => current !== key)
      : [...activeRole.permissionKeys, key];
    setSavingRole(true);
    try {
      await readJson(await authFetch(`/api/auth/rbac/roles/${activeRole.key}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissionKeys: nextKeys }) }));
      setRoles((current) => current.map((role) => role.key === activeRole.key ? { ...role, permissionKeys: nextKeys } : role));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a permissão.");
    } finally {
      setSavingRole(false);
    }
  }

  async function toggleLeaderCreation(user: UserRow) {
    try {
      await readJson(await authFetch(`/api/auth/users/${user.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canCreateLeaderUsers: !user.canCreateLeaderUsers }) }));
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, canCreateLeaderUsers: !item.canCreateLeaderUsers } : item));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o acesso.");
    }
  }

  if (isLoading) return <OpsShell><PageHeading eyebrow="Administração / acessos" title="RBAC" description="Papéis, permissões e usuários da campanha." /><LoadingRows count={5} /></OpsShell>;
  if (error && !roles.length) return <OpsShell><PageHeading eyebrow="Administração / acessos" title="RBAC" description="Papéis, permissões e usuários da campanha." /><ErrorState label={error} onRetry={() => void load()} /></OpsShell>;

  return <OpsShell>
    <PageHeading eyebrow="Administração / acessos" title="RBAC" description="Defina o que cada papel pode acessar e quem pode criar usuários líderes dentro da sua cidade." action={<button onClick={() => setShowCreate(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="button-create-user"><Plus size={15} /> Novo usuário</button>} />
    {error && <p className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-bold text-destructive">{error}</p>}
    <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
      <section className="h-fit rounded-2xl border border-border bg-card p-3">
        <div className="p-3"><p className="mono-label text-primary">Papéis do sistema</p><p className="mt-1 text-xs text-muted-foreground">A matriz é aplicada no servidor.</p></div>
        <div className="space-y-1">{roles.map((role) => <button key={role.key} onClick={() => setSelectedRole(role.key)} className={`w-full rounded-xl p-3 text-left transition ${selectedRole === role.key ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`} data-testid={`rbac-role-${role.key}`}><div className="flex items-center justify-between gap-2"><span className="text-sm font-extrabold">{role.label}</span><span className={`font-mono text-[10px] ${selectedRole === role.key ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{role.userCount} usuários</span></div><p className={`mt-1 text-[11px] leading-4 ${selectedRole === role.key ? "text-primary-foreground/65" : "text-muted-foreground"}`}>{role.description}</p></button>)}</div>
      </section>
      <section className="rounded-2xl border border-border bg-card p-5 sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-3"><div><p className="mono-label text-primary">Permissões do papel</p><h2 className="mt-1 text-xl font-extrabold">{activeRole?.label}</h2></div><StatusPill tone="success">{activeRole?.permissionKeys.length ?? 0} liberadas</StatusPill></div>
        <div className="space-y-6">{Object.entries(groupedPermissions).map(([category, categoryPermissions]) => <div key={category}><p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">{category}</p><div className="grid gap-2 md:grid-cols-2">{categoryPermissions.map((permission) => { const checked = activeRole?.permissionKeys.includes(permission.key) ?? false; return <button key={permission.key} disabled={savingRole} onClick={() => void togglePermission(permission.key)} className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${checked ? "border-primary/30 bg-primary/5" : "border-border hover:bg-muted"}`} data-testid={`permission-${permission.key}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{checked && <Check size={13} />}</span><span><span className="block text-xs font-extrabold">{permission.label}</span><span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{permission.description}</span></span></button>; })}</div></div>)}</div>
      </section>
    </div>
    <section className="mt-5 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col justify-between gap-3 border-b border-border p-5 sm:flex-row sm:items-center"><div><p className="mono-label text-primary">Usuários cadastrados</p><h2 className="mt-1 text-lg font-extrabold">{users.length} acessos</h2></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><KeyRound size={14} /> Admin pode bloquear ou reativar acessos</div></div>
      <div className="divide-y divide-border">{users.map((user) => <div key={user.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between" data-testid={`auth-user-row-${user.id}`}><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><UserRound size={17} /></div><div className="min-w-0"><p className="truncate text-sm font-extrabold">{user.fullName}</p><p className="truncate text-xs text-muted-foreground">{user.email}</p></div></div><div className="flex flex-wrap items-center gap-3"><StatusPill tone={user.isActive ? "success" : "danger"}>{user.isActive ? "Ativo" : "Bloqueado"}</StatusPill><span className="rounded-full bg-muted px-3 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-muted-foreground">{user.role.replaceAll("_", " ")}</span><span className="text-xs text-muted-foreground">{user.cityName ?? user.regionName ?? "Escopo nacional"}</span>{user.role === "COORDENADOR" && <button onClick={() => void toggleLeaderCreation(user)} className={`rounded-lg border px-3 py-2 text-[11px] font-extrabold ${user.canCreateLeaderUsers ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border text-muted-foreground"}`} data-testid={`toggle-leader-users-${user.id}`}>{user.canCreateLeaderUsers ? "Pode criar líderes" : "Criação de líderes bloqueada"}</button>}</div></div>)}</div>
    </section>
    {showCreate && <CreateUserDialog regions={regions.data ?? []} cities={cities.data ?? []} onClose={() => setShowCreate(false)} onCreated={(user) => { setUsers((current) => [...current, user].sort((a, b) => a.fullName.localeCompare(b.fullName))); setShowCreate(false); }} />}
  </OpsShell>;
}

function CreateUserDialog({ regions, cities, onClose, onCreated }: { regions: Array<{ id: number; name: string }>; cities: Array<{ id: number; name: string; regionName: string }>; onClose: () => void; onCreated: (user: UserRow) => void }) {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", role: "COORDENADOR", regionId: "", cityId: "", canCreateLeaderUsers: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const body = { ...form, regionId: form.regionId ? Number(form.regionId) : null, cityId: form.cityId ? Number(form.cityId) : null };
      const response = await authFetch("/api/auth/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await readJson(response) as { user: UserRow };
      onCreated({ ...data.user, regionName: regions.find((region) => region.id === Number(form.regionId))?.name ?? null, cityName: cities.find((city) => city.id === Number(form.cityId))?.name ?? null, lastLoginAt: null });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o usuário.");
    } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6"><form onSubmit={submit} className="w-full max-w-lg rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="mono-label text-primary">Novo acesso</p><h2 className="mt-1 text-xl font-extrabold">Cadastrar usuário</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold">Nome completo</span><input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label><span className="mb-1.5 block text-xs font-bold">E-mail</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label><span className="mb-1.5 block text-xs font-bold">Senha inicial</span><input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label><span className="mb-1.5 block text-xs font-bold">Papel</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="ARTICULADOR">Articulador</option><option value="COORDENADOR">Coordenador</option><option value="LIDERANCA">Liderança</option><option value="ADMIN_GERAL">Admin geral</option></select></label><label><span className="mb-1.5 block text-xs font-bold">Região</span><select value={form.regionId} onChange={(event) => setForm({ ...form, regionId: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="">Sem região específica</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label><label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold">Cidade</span><select value={form.cityId} onChange={(event) => setForm({ ...form, cityId: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="">Sem cidade específica</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></label></div>{form.role === "COORDENADOR" && <label className="mt-4 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.canCreateLeaderUsers} onChange={(event) => setForm({ ...form, canCreateLeaderUsers: event.target.checked })} /> Permitir criação de usuários líderes</label>}{error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}<button disabled={saving} className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60">{saving ? "Salvando…" : "Criar usuário"}</button></form></div>;
}