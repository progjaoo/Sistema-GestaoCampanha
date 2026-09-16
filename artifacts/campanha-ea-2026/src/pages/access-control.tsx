import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Edit3, KeyRound, Plus, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { useListLeaderships, useListCities, useListRegions } from "@workspace/api-client-react";
import { authFetch, useAuth } from "@/lib/auth";
import { ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from "@/components/ops-shell";
import { confirmWithToast } from "@/lib/confirm-toast";
import { toast } from "@/hooks/use-toast";

type Permission = { id: number; key: string; label: string; description: string; category: string };
type Role = { key: string; label: string; description: string; userCount: number; permissionKeys: string[] };
type City = { id: number; name: string; regionName: string; regionId?: number };
type Region = { id: number; name: string };
type UserRow = {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: string;
  regionId: number | null;
  regionName: string | null;
  cityId: number | null;
  cityName: string | null;
  leadershipId: number | null;
  isActive: boolean;
  canCreateLeaderUsers: boolean;
  lastLoginAt: string | null;
};
type ApiUser = Omit<UserRow, "regionName" | "cityName"> & { permissions?: string[] };
type UserFormState = {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  role: string;
  regionId: string;
  cityId: string;
  leadershipId: string;
  isActive: boolean;
  canCreateLeaderUsers: boolean;
};

const roleOptions = [
  { value: "ARTICULADOR", label: "Articulador" },
  { value: "COORDENADOR", label: "Coordenador" },
  { value: "LIDERANCA", label: "Liderança" },
  { value: "ADMIN_GERAL", label: "Admin geral" },
];

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  return body as T;
}

function emptyUserForm(): UserFormState {
  return {
    fullName: "",
    email: "",
    phone: "",
    password: "",
    role: "COORDENADOR",
    regionId: "",
    cityId: "",
    leadershipId: "",
    isActive: true,
    canCreateLeaderUsers: false,
  };
}

function formFromUser(user: UserRow): UserFormState {
  return {
    fullName: user.fullName,
    email: user.email,
    phone: user.phone ?? "",
    password: "",
    role: user.role,
    regionId: user.regionId ? String(user.regionId) : "",
    cityId: user.cityId ? String(user.cityId) : "",
    leadershipId: user.leadershipId ? String(user.leadershipId) : "",
    isActive: user.isActive,
    canCreateLeaderUsers: user.canCreateLeaderUsers,
  };
}

function withDisplayNames(
  user: ApiUser,
  form: UserFormState,
  regions: Region[],
  cities: City[],
  previous?: UserRow,
): UserRow {
  const regionId = user.regionId ?? (form.regionId ? Number(form.regionId) : null);
  const cityId = user.cityId ?? (form.cityId ? Number(form.cityId) : null);
  return {
    ...(previous ?? { lastLoginAt: null }),
    ...user,
    regionId,
    cityId,
    regionName: regions.find((region) => region.id === regionId)?.name ?? null,
    cityName: cities.find((city) => city.id === cityId)?.name ?? null,
  };
}

export default function AccessControlPage() {
  const { can, user: currentUser } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedRole, setSelectedRole] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogUser, setDialogUser] = useState<UserRow | null | undefined>(undefined);
  const [savingRole, setSavingRole] = useState(false);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);
  const regions = useListRegions();
  const cities = useListCities();
  const regionRows = (regions.data ?? []) as Region[];
  const cityRows = (cities.data ?? []) as City[];

  async function load() {
    setIsLoading(true);
    setError("");
    try {
      const [rbacResponse, usersResponse] = await Promise.all([
        authFetch("/api/auth/rbac/roles"),
        authFetch("/api/auth/users"),
      ]);
      const rbac = await readJson<{ roles: Role[]; permissions: Permission[] }>(rbacResponse);
      const userRows = await readJson<UserRow[]>(usersResponse);
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
  const groupedPermissions = useMemo(
    () => permissions.reduce<Record<string, Permission[]>>((groups, permission) => {
      (groups[permission.category] ??= []).push(permission);
      return groups;
    }, {}),
    [permissions],
  );

  async function togglePermission(key: string) {
    if (!activeRole) return;
    const nextKeys = activeRole.permissionKeys.includes(key)
      ? activeRole.permissionKeys.filter((current) => current !== key)
      : [...activeRole.permissionKeys, key];
    setSavingRole(true);
    try {
      await readJson(await authFetch(`/api/auth/rbac/roles/${activeRole.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionKeys: nextKeys }),
      }));
      setRoles((current) => current.map((role) => role.key === activeRole.key ? { ...role, permissionKeys: nextKeys } : role));
      toast({ title: "Permissões atualizadas", description: `O papel ${activeRole.label} foi atualizado.` });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível salvar a permissão.";
      setError(message);
      toast({ title: "Não foi possível atualizar", description: message, variant: "destructive" });
    } finally {
      setSavingRole(false);
    }
  }

  async function toggleLeaderCreation(target: UserRow) {
    setBusyUserId(target.id);
    try {
      await readJson(await authFetch(`/api/auth/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ canCreateLeaderUsers: !target.canCreateLeaderUsers }),
      }));
      setUsers((current) => current.map((item) => item.id === target.id ? { ...item, canCreateLeaderUsers: !item.canCreateLeaderUsers } : item));
      toast({ title: "Acesso atualizado", description: `${target.fullName} agora ${target.canCreateLeaderUsers ? "não pode" : "pode"} criar usuários líderes.` });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível atualizar o acesso.";
      setError(message);
      toast({ title: "Não foi possível atualizar", description: message, variant: "destructive" });
    } finally {
      setBusyUserId(null);
    }
  }

  function saveUser(apiUser: ApiUser, form: UserFormState, mode: "create" | "edit", previous?: UserRow) {
    const nextUser = withDisplayNames(apiUser, form, regionRows, cityRows, previous);
    setUsers((current) => mode === "create"
      ? [...current, nextUser].sort((a, b) => a.fullName.localeCompare(b.fullName))
      : current.map((item) => item.id === nextUser.id ? nextUser : item));
    setDialogUser(undefined);
    toast({
      title: mode === "create" ? "Usuário criado" : "Usuário atualizado",
      description: `${nextUser.fullName} foi ${mode === "create" ? "adicionado aos acessos" : "atualizado com sucesso"}.`,
    });
  }

  async function deleteUser(target: UserRow) {
    confirmWithToast({
      title: "Excluir usuário?",
      description: `O acesso de ${target.fullName} será excluído permanentemente. Essa ação não pode ser desfeita.`,
      actionLabel: "Excluir",
      variant: "destructive",
      onConfirm: async () => {
        setBusyUserId(target.id);
        try {
          await readJson(await authFetch(`/api/auth/users/${target.id}`, { method: "DELETE" }));
          setUsers((current) => current.filter((item) => item.id !== target.id));
          toast({ title: "Usuário excluído", description: `${target.fullName} foi removido dos acessos.` });
        } catch (reason) {
          const message = reason instanceof Error ? reason.message : "Não foi possível excluir o usuário.";
          setError(message);
          toast({ title: "Não foi possível excluir", description: message, variant: "destructive" });
        } finally {
          setBusyUserId(null);
        }
      },
    });
  }

  async function toggleActive(target: UserRow) {
    setBusyUserId(target.id);
    try {
      const data = await readJson<{ user: ApiUser }>(await authFetch(`/api/auth/users/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !target.isActive }),
      }));
      const nextUser = withDisplayNames(data.user, { ...formFromUser(target), isActive: !target.isActive }, regionRows, cityRows, target);
      setUsers((current) => current.map((item) => item.id === target.id ? nextUser : item));
      toast({ title: target.isActive ? "Usuário bloqueado" : "Usuário reativado", description: `${target.fullName} ${target.isActive ? "não poderá mais entrar" : "pode voltar a entrar"} no sistema.` });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível alterar o status.";
      setError(message);
      toast({ title: "Não foi possível alterar o status", description: message, variant: "destructive" });
    } finally {
      setBusyUserId(null);
    }
  }

  if (isLoading) return <OpsShell><PageHeading eyebrow="Administração / acessos" title="RBAC" description="Papéis, permissões e usuários da campanha." /><LoadingRows count={5} /></OpsShell>;
  if (error && !roles.length) return <OpsShell><PageHeading eyebrow="Administração / acessos" title="RBAC" description="Papéis, permissões e usuários da campanha." /><ErrorState label={error} onRetry={() => void load()} /></OpsShell>;

  return <OpsShell>
    <PageHeading
      eyebrow="Administração / acessos"
      title="RBAC"
      description="Defina o que cada papel pode acessar e mantenha os usuários da campanha atualizados."
      action={<button onClick={() => setDialogUser(null)} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-extrabold text-primary-foreground shadow-sm" data-testid="button-create-user"><Plus size={15} /> Novo usuário</button>}
    />
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
      <div className="flex flex-col justify-between gap-3 border-b border-border p-5 sm:flex-row sm:items-center"><div><p className="mono-label text-primary">Usuários cadastrados</p><h2 className="mt-1 text-lg font-extrabold">{users.length} acessos</h2></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><KeyRound size={14} /> Edite, bloqueie, reative ou exclua acessos</div></div>
      <div className="divide-y divide-border">{users.map((target) => {
        const isCurrentUser = target.id === currentUser?.id;
        const isBusy = busyUserId === target.id;
        return <div key={target.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between" data-testid={`auth-user-row-${target.id}`}>
          <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary"><UserRound size={17} /></div><div className="min-w-0"><p className="truncate text-sm font-extrabold">{target.fullName}{isCurrentUser && <span className="ml-2 text-[10px] font-bold text-primary">(você)</span>}</p><p className="truncate text-xs text-muted-foreground">{target.email}{target.phone ? ` · ${target.phone}` : ""}</p><p className="truncate text-[11px] text-muted-foreground">{target.cityName ?? target.regionName ?? "Escopo nacional"}</p></div></div>
          <div className="flex flex-wrap items-center gap-2"><StatusPill tone={target.isActive ? "success" : "danger"}>{target.isActive ? "Ativo" : "Bloqueado"}</StatusPill><span className="rounded-full bg-muted px-3 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] text-muted-foreground">{target.role.replaceAll("_", " ")}</span>{target.role === "COORDENADOR" && <button disabled={isBusy} onClick={() => void toggleLeaderCreation(target)} className={`rounded-lg border px-3 py-2 text-[11px] font-extrabold disabled:opacity-50 ${target.canCreateLeaderUsers ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-border text-muted-foreground"}`} data-testid={`toggle-leader-users-${target.id}`}>{target.canCreateLeaderUsers ? "Pode criar líderes" : "Criação de líderes bloqueada"}</button>}<button disabled={isBusy} onClick={() => setDialogUser(target)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-50" data-testid={`button-edit-user-${target.id}`}><Edit3 size={13} /> Editar</button><button disabled={isBusy || isCurrentUser} onClick={() => void toggleActive(target)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted disabled:opacity-50" title={isCurrentUser ? "Você não pode bloquear o próprio acesso" : undefined} data-testid={`button-toggle-user-${target.id}`}>{target.isActive ? "Bloquear" : "Reativar"}</button><button disabled={isBusy || isCurrentUser} onClick={() => void deleteUser(target)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50" title={isCurrentUser ? "Você não pode excluir o próprio acesso" : undefined} data-testid={`button-delete-user-${target.id}`}><Trash2 size={13} /> Excluir</button></div>
        </div>;
      })}</div>
    </section>
    {dialogUser !== undefined && <UserFormDialog user={dialogUser} regions={regionRows} cities={cityRows} onClose={() => setDialogUser(undefined)} onSaved={(apiUser, form) => saveUser(apiUser, form, dialogUser ? "edit" : "create", dialogUser ?? undefined)} />}
  </OpsShell>;
}

function UserFormDialog({ user, regions, cities, onClose, onSaved }: { user: UserRow | null; regions: Region[]; cities: City[]; onClose: () => void; onSaved: (user: ApiUser, form: UserFormState) => void }) {
  const [form, setForm] = useState<UserFormState>(() => user ? formFromUser(user) : emptyUserForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const leaderships = useListLeaderships({ cityId: form.cityId ? Number(form.cityId) : undefined, page: 1, pageSize: 100 });
  const availableCities = form.regionId ? cities.filter((city) => !city.regionId || city.regionId === Number(form.regionId)) : cities;
  const editing = Boolean(user);

  function setField<K extends keyof UserFormState>(field: K, value: UserFormState[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      if (form.role === "LIDERANCA" && !form.leadershipId) throw new Error("Selecione a liderança vinculada ao acesso.");
      if (!editing && form.password.length < 8) throw new Error("A senha inicial precisa ter pelo menos 8 caracteres.");
      const body = {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim() || null,
        role: form.role,
        regionId: form.regionId ? Number(form.regionId) : null,
        cityId: form.cityId ? Number(form.cityId) : null,
        leadershipId: form.role === "LIDERANCA" ? Number(form.leadershipId) : null,
        canCreateLeaderUsers: form.role === "COORDENADOR" ? form.canCreateLeaderUsers : false,
        ...(editing ? { isActive: form.isActive, ...(form.password ? { password: form.password } : {}) } : { password: form.password }),
      };
      const response = await authFetch(editing ? `/api/auth/users/${user!.id}` : "/api/auth/users", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await readJson<{ user: ApiUser }>(response);
      onSaved(data.user, form);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o usuário.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="user-dialog-title">
    <form onSubmit={submit} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl">
      <div className="mb-6 flex items-start justify-between gap-3"><div><p className="mono-label text-primary">Administração / acessos</p><h2 id="user-dialog-title" className="mt-1 text-xl font-extrabold">{editing ? "Editar usuário" : "Cadastrar usuário"}</h2><p className="mt-1 text-xs text-muted-foreground">{editing ? "Atualize dados, escopo, papel, status e senha sem criar outro acesso." : "Crie um acesso individual com o papel e o território corretos."}</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold">Nome completo</span><input required value={form.fullName} onChange={(event) => setField("fullName", event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 block text-xs font-bold">E-mail</span><input required type="email" value={form.email} onChange={(event) => setField("email", event.target.value)} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 block text-xs font-bold">Telefone</span><input type="tel" inputMode="tel" value={form.phone} onChange={(event) => setField("phone", event.target.value)} placeholder="(00) 00000-0000" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 block text-xs font-bold">Papel</span><select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value, leadershipId: "" }))} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring">{roleOptions.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>
        <label><span className="mb-1.5 block text-xs font-bold">{editing ? "Nova senha (opcional)" : "Senha inicial"}</span><input required={!editing} minLength={8} type="password" value={form.password} onChange={(event) => setField("password", event.target.value)} placeholder={editing ? "Deixe vazio para manter" : "Mínimo de 8 caracteres"} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 block text-xs font-bold">Região</span><select value={form.regionId} onChange={(event) => setForm((current) => ({ ...current, regionId: event.target.value, cityId: "", leadershipId: "" }))} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="">Sem região específica</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold">Cidade</span><select value={form.cityId} onChange={(event) => setForm((current) => ({ ...current, cityId: event.target.value, leadershipId: "" }))} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="">Sem cidade específica</option>{availableCities.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></label>
        {form.role === "LIDERANCA" && <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold">Liderança vinculada</span><select required value={form.leadershipId} onChange={(event) => setField("leadershipId", event.target.value)} disabled={!form.cityId || leaderships.isLoading} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="">{leaderships.isLoading ? "Carregando lideranças…" : "Selecione uma liderança"}</option>{(leaderships.data?.items ?? []).map((leadership) => <option key={leadership.id} value={leadership.id}>{leadership.name} · {leadership.cityName} · {leadership.federalDeputyName ?? "Sem deputado"}</option>)}</select></label>}
      </div>
      {form.role === "COORDENADOR" && <label className="mt-4 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.canCreateLeaderUsers} onChange={(event) => setField("canCreateLeaderUsers", event.target.checked)} className="h-4 w-4 accent-primary" /> Permitir criação de usuários líderes</label>}
      {editing && <label className="mt-4 flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={form.isActive} onChange={(event) => setField("isActive", event.target.checked)} className="h-4 w-4 accent-primary" /> Usuário ativo e autorizado a entrar</label>}
      {error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive" role="alert">{error}</p>}
      <button disabled={saving} className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60">{saving ? "Salvando…" : editing ? "Salvar alterações" : "Criar usuário"}</button>
    </form>
  </div>;
}