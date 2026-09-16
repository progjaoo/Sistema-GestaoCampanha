import { useEffect, useMemo, useState } from "react";
import { Archive, Check, ChevronDown, Edit3, MapPin, Package, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { authFetch, useAuth } from "@/lib/auth";
import { EmptyState, ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from "@/components/ops-shell";
import { confirmWithToast } from "@/lib/confirm-toast";
import { formatPostalCode } from "@/lib/form-utils";
import { useOfflineSnapshot } from "@/lib/connectivity";
import { toast } from "@/hooks/use-toast";

type Material = { id: number; name: string; description: string | null; unit: string; isActive: boolean };
type City = { id: number; name: string; regionName: string };
type UserOption = { id: number; name: string; role: string; cityId: number | null; cityName: string | null };
type Item = { id?: number; materialId: number; materialName: string; unit: string; quantity: number | null };
type Withdrawal = {
  id: number; cityId: number; cityName: string; regionName: string; responsibleUserId: number; responsibleName: string;
  status: string; postalCode: string; street: string; number: string; complement: string | null; neighborhood: string;
  addressCity: string; state: string; notes: string | null; createdAt: string; updatedAt: string; itemCount?: number; items?: Item[];
};
type Options = { cities: City[]; users: UserOption[]; materials: Material[] };
type FormState = {
  cityId: string; responsibleUserId: string; postalCode: string; street: string; number: string; complement: string;
  neighborhood: string; addressCity: string; state: string; notes: string; items: Record<number, { selected: boolean; quantity: string }>;
};

const statusLabels: Record<string, string> = { requested: "Solicitada", separated: "Separada", delivered: "Entregue", cancelled: "Cancelada" };
const statusTone = (status: string) => status === "delivered" ? "success" : status === "cancelled" ? "danger" : status === "separated" ? "warning" : "neutral";
async function read<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  return body as T;
}
const blankForm = (): FormState => ({ cityId: "", responsibleUserId: "", postalCode: "", street: "", number: "", complement: "", neighborhood: "", addressCity: "", state: "", notes: "", items: {} });

export default function MaterialWithdrawalsPage() {
  const { can, user } = useAuth();
  const [rows, setRows] = useState<Withdrawal[]>([]);
  const [options, setOptions] = useState<Options>({ cities: [], users: [], materials: [] });
  const [form, setForm] = useState<FormState>(blankForm());
  const [editing, setEditing] = useState<Withdrawal | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [catalogForm, setCatalogForm] = useState({ id: 0, name: "", description: "", unit: "unidade" });
  const snapshot = useOfflineSnapshot<{ rows: Withdrawal[]; options: Options }>("materials", { userId: user?.id ?? null, search, statusFilter });
  const cached = snapshot.data;
  const [networkResolved, setNetworkResolved] = useState(false);

  useEffect(() => {
    if (can("materials:create") && new URLSearchParams(window.location.search).get("create") === "1") {
      setShowForm(true);
    }
  }, [can]);

  async function load() {
    setLoading(true); setError(""); setNetworkResolved(false);
    try {
      const [withdrawals, initialOptions] = await Promise.all([
        read<Withdrawal[]>(await authFetch(`/api/material-withdrawals?${new URLSearchParams({ ...(search ? { search } : {}), ...(statusFilter ? { status: statusFilter } : {}) })}`)),
        read<Options>(await authFetch("/api/material-withdrawals/options")),
      ]);
      setRows(withdrawals); setOptions(initialOptions); snapshot.saveSnapshot({ rows: withdrawals, options: initialOptions });
    } catch (reason) { if (cached) { setRows(cached.rows); setOptions(cached.options); } else setError(reason instanceof Error ? reason.message : "Não foi possível carregar as retiradas."); }
    finally { setNetworkResolved(true); setLoading(false); }
  }
  useEffect(() => { void load(); }, [search, statusFilter]);
  useEffect(() => {
    if (!networkResolved && cached && !loading) {
      setRows(cached.rows);
      setOptions(cached.options);
    }
  }, [cached, loading, networkResolved]);

  async function loadOptions(cityId: string) {
    try {
      const params = cityId ? `?cityId=${cityId}` : "";
      const next = await read<Options>(await authFetch(`/api/material-withdrawals/options${params}`));
      setOptions(next);
      setForm((current) => ({ ...current, responsibleUserId: next.users[0] ? String(next.users[0].id) : "" }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os responsáveis."); }
  }
  function setField<K extends keyof FormState>(key: K, value: FormState[K]) { const normalized = key === "postalCode" ? formatPostalCode(String(value)) : key === "number" ? String(value).replace(/\D/g, "") : value; setForm((current) => ({ ...current, [key]: normalized as FormState[K] })); }
  function selectCity(value: string) { setField("cityId", value); setField("responsibleUserId", ""); void loadOptions(value); }
  function toggleMaterial(id: number, selected: boolean) {
    setForm((current) => ({ ...current, items: { ...current.items, [id]: { selected, quantity: current.items[id]?.quantity ?? "" } } }));
  }
  function selectAll(selected: boolean) {
    setForm((current) => ({ ...current, items: Object.fromEntries(options.materials.map((material) => [material.id, { selected, quantity: current.items[material.id]?.quantity ?? "" }])) }));
  }
  function openNew() { setEditing(null); setForm(blankForm()); setShowForm(true); }
  async function openEdit(row: Withdrawal) {
    try {
      const detail = await read<Withdrawal>(await authFetch(`/api/material-withdrawals/${row.id}`));
      const items = Object.fromEntries((detail.items ?? []).map((item) => [item.materialId, { selected: true, quantity: item.quantity ? String(item.quantity) : "" }]));
      setEditing(detail); setForm({ cityId: String(detail.cityId), responsibleUserId: String(detail.responsibleUserId), postalCode: detail.postalCode, street: detail.street, number: detail.number, complement: detail.complement ?? "", neighborhood: detail.neighborhood, addressCity: detail.addressCity, state: detail.state, notes: detail.notes ?? "", items }); setShowForm(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar a retirada."); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    const selectedItems = Object.entries(form.items).filter(([, item]) => item.selected).map(([materialId, item]) => ({ materialId: Number(materialId), quantity: item.quantity ? Number(item.quantity) : null }));
    try {
      const body = { ...form, cityId: Number(form.cityId), responsibleUserId: Number(form.responsibleUserId), items: selectedItems };
      const response = await authFetch(editing ? `/api/material-withdrawals/${editing.id}` : "/api/material-withdrawals", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await read(response); setShowForm(false); setNotice(editing ? "Retirada atualizada." : "Retirada registrada."); toast({ title: editing ? "Retirada atualizada" : "Retirada registrada", description: "A operação foi salva com sucesso." }); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a retirada."); }
    finally { setSaving(false); }
  }
  async function changeStatus(row: Withdrawal, status: string) {
    try { const updated = await read<Withdrawal>(await authFetch(`/api/material-withdrawals/${row.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) })); setRows((current) => current.map((item) => item.id === updated.id ? { ...item, status: updated.status } : item)); setNotice("Status atualizado."); toast({ title: "Status atualizado", description: `A retirada de ${row.cityName} foi atualizada.` }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o status."); }
  }
  async function deleteRow(row: Withdrawal) {
    confirmWithToast({
      title: "Excluir retirada?",
      description: `A retirada de ${row.cityName} será removida permanentemente.`,
      actionLabel: "Excluir",
      variant: "destructive",
      onConfirm: async () => {
        try { await read(await authFetch(`/api/material-withdrawals/${row.id}`, { method: "DELETE" })); setRows((current) => current.filter((item) => item.id !== row.id)); setNotice("Retirada excluída."); toast({ title: "Retirada excluída", description: "O registro foi removido." }); }
        catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível excluir a retirada."); }
      },
    });
  }
  async function saveCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true);
    try {
      const method = catalogForm.id ? "PATCH" : "POST";
      const url = catalogForm.id ? `/api/materials/${catalogForm.id}` : "/api/materials";
      await read(await authFetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(catalogForm) }));
      setCatalogForm({ id: 0, name: "", description: "", unit: "unidade" }); setNotice("Catálogo atualizado."); toast({ title: catalogForm.id ? "Material atualizado" : "Material adicionado", description: "O catálogo foi atualizado." }); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o material."); }
    finally { setSaving(false); }
  }
  async function toggleCatalog(material: Material) {
    try { await read(await authFetch(`/api/materials/${material.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !material.isActive }) })); toast({ title: material.isActive ? "Material desativado" : "Material ativado", description: `${material.name} foi atualizado.` }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o material."); }
  }

  const selectedCount = useMemo(() => Object.values(form.items).filter((item) => item.selected).length, [form.items]);
  return <OpsShell>
     <PageHeading eyebrow="Operações / materiais" title="Retirada de material" description="Controle materiais separados por cidade, endereço de entrega e responsável, com histórico de status." lastUpdatedAt={snapshot.savedAt} stale={Boolean(cached && !networkResolved)} action={can("materials:create") ? <button onClick={openNew} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-primary-foreground"><Plus size={16} /> Nova retirada</button> : undefined} />
    {error && <div className="mb-5"><ErrorState label={error} onRetry={() => { setError(""); void load(); }} /></div>}
    {notice && <div className="mb-5 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800"><span>{notice}</span><button onClick={() => setNotice("")}><X size={14} /></button></div>}
    <div className="mb-6 grid gap-3 sm:grid-cols-[1fr_190px_auto]">
      <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por cidade ou responsável" className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm" /></div>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 rounded-lg border border-input bg-card px-3 text-xs font-bold"><option value="">Todos os status</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button onClick={() => void load()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-extrabold"><RefreshCw size={14} /> Atualizar</button>
    </div>
    {loading ? <LoadingRows count={4} /> : rows.length === 0 ? <EmptyState title="Nenhuma retirada encontrada" detail="Registre a primeira retirada ou ajuste os filtros de consulta." /> : <div className="space-y-3">{rows.map((row) => <article key={row.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-2"><StatusPill tone={statusTone(row.status)}>{statusLabels[row.status] ?? row.status}</StatusPill><span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Retirada #{row.id}</span></div><h2 className="text-base font-extrabold">{row.cityName} <span className="font-medium text-muted-foreground">· {row.regionName}</span></h2><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={13} /> {row.street}, {row.number}{row.complement ? ` · ${row.complement}` : ""} · {row.addressCity}/{row.state}</p><p className="mt-2 text-xs font-bold text-foreground/70">{row.responsibleName} <span className="font-normal text-muted-foreground">· {row.itemCount ?? 0} material(is) · {new Date(row.createdAt).toLocaleDateString("pt-BR")}</span></p></div><div className="flex flex-wrap items-center gap-2">{can("materials:update") && <select value={row.status} onChange={(event) => void changeStatus(row, event.target.value)} className="h-9 rounded-lg border border-input bg-background px-2 text-[11px] font-bold">{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>}{can("materials:update") && <button onClick={() => void openEdit(row)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted"><Edit3 size={13} /> Editar</button>}{can("materials:delete") && <button onClick={() => void deleteRow(row)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50"><Trash2 size={13} /> Excluir</button>}</div></div></article>)}</div>}
    {can("materials:catalog") && <section className="mt-8 rounded-2xl border border-border bg-card p-5"><div className="mb-4 flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary text-primary"><Package size={17} /></div><div><h2 className="font-extrabold">Catálogo de materiais</h2><p className="text-xs text-muted-foreground">Itens disponíveis para seleção nas retiradas.</p></div></div><form onSubmit={saveCatalog} className="mb-5 grid gap-2 sm:grid-cols-[1fr_1.3fr_150px_auto]"><input required value={catalogForm.name} onChange={(event) => setCatalogForm({ ...catalogForm, name: event.target.value })} placeholder="Nome do material" className="h-10 rounded-lg border border-input bg-background px-3 text-xs" /><input value={catalogForm.description} onChange={(event) => setCatalogForm({ ...catalogForm, description: event.target.value })} placeholder="Descrição (opcional)" className="h-10 rounded-lg border border-input bg-background px-3 text-xs" /><input value={catalogForm.unit} onChange={(event) => setCatalogForm({ ...catalogForm, unit: event.target.value })} placeholder="Unidade" className="h-10 rounded-lg border border-input bg-background px-3 text-xs" /><button disabled={saving} className="h-10 rounded-lg bg-primary px-4 text-xs font-extrabold text-primary-foreground">{catalogForm.id ? "Salvar" : "Adicionar"}</button></form><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{options.materials.map((material) => <div key={material.id} className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${material.isActive ? "border-border" : "border-dashed border-border opacity-60"}`}><div className="min-w-0"><p className="truncate text-xs font-extrabold">{material.name}</p><p className="text-[10px] text-muted-foreground">{material.description || material.unit}</p></div><div className="flex shrink-0 gap-1"><button onClick={() => setCatalogForm({ id: material.id, name: material.name, description: material.description ?? "", unit: material.unit })} className="rounded-md p-2 text-muted-foreground hover:bg-muted" title="Editar"><Edit3 size={13} /></button><button onClick={() => void toggleCatalog(material)} className="rounded-md p-2 text-muted-foreground hover:bg-muted" title={material.isActive ? "Desativar" : "Ativar"}>{material.isActive ? <Check size={13} /> : <Archive size={13} />}</button></div></div>)}</div></section>}
    {showForm && <WithdrawalForm form={form} setField={setField} options={options} editing={editing} saving={saving} selectedCount={selectedCount} onClose={() => setShowForm(false)} onSubmit={submit} onCityChange={selectCity} onToggleMaterial={toggleMaterial} onSelectAll={selectAll} />}
  </OpsShell>;
}

function WithdrawalForm({ form, setField, options, editing, saving, selectedCount, onClose, onSubmit, onCityChange, onToggleMaterial, onSelectAll }: { form: FormState; setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void; options: Options; editing: Withdrawal | null; saving: boolean; selectedCount: number; onClose: () => void; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; onCityChange: (value: string) => void; onToggleMaterial: (id: number, selected: boolean) => void; onSelectAll: (selected: boolean) => void }) {
  const selectableMaterials = options.materials.filter((material) => material.isActive);
  const selectedAll = selectableMaterials.length > 0 && selectedCount === selectableMaterials.length;
  useEffect(() => {
    if (!form.postalCode.replace(/\D/g, "").match(/^\d{8}$/)) return;
    const controller = new AbortController();
    void fetch(`https://viacep.com.br/ws/${form.postalCode.replace(/\D/g, "")}/json/`, { signal: controller.signal }).then((response) => response.json()).then((data: { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string }) => {
      if (!data.erro) {
        setField("street", data.logradouro ?? ""); setField("neighborhood", data.bairro ?? ""); setField("addressCity", data.localidade ?? ""); setField("state", data.uf ?? "");
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [form.postalCode]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-5"><form onSubmit={onSubmit} className="max-h-[95dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-card p-5 shadow-2xl sm:rounded-2xl sm:p-7"><div className="mb-6 flex items-start justify-between"><div><p className="mono-label text-primary">Operações / materiais</p><h2 className="mt-1 text-xl font-extrabold">{editing ? `Editar retirada #${editing.id}` : "Nova retirada"}</h2><p className="mt-1 text-xs text-muted-foreground">O CEP preenche o endereço. Número e complemento continuam manuais.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Cidade</span><select required value={form.cityId} onChange={(event) => onCityChange(event.target.value)} className="field"><option value="">Selecione a cidade</option>{options.cities.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></label><label><span className="label">Responsável cadastrado</span><select required value={form.responsibleUserId} onChange={(event) => setField("responsibleUserId", event.target.value)} className="field"><option value="">Selecione o responsável</option>{options.users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.cityName ?? "sem cidade"} ({user.role.replaceAll("_", " ")})</option>)}</select></label></div><div className="mt-4 grid gap-4 sm:grid-cols-[150px_1fr_120px]"><label><span className="label">CEP</span><input required value={form.postalCode} onChange={(event) => setField("postalCode", event.target.value)} placeholder="00000-000" className="field" /></label><label><span className="label">Logradouro</span><input required value={form.street} onChange={(event) => setField("street", event.target.value)} className="field" /></label><label><span className="label">Número</span><input required value={form.number} onChange={(event) => setField("number", event.target.value)} className="field" /></label></div><div className="mt-4 grid gap-4 sm:grid-cols-3"><label><span className="label">Complemento</span><input value={form.complement} onChange={(event) => setField("complement", event.target.value)} className="field" /></label><label><span className="label">Bairro</span><input required value={form.neighborhood} onChange={(event) => setField("neighborhood", event.target.value)} className="field" /></label><label><span className="label">Cidade do endereço</span><input required value={form.addressCity} onChange={(event) => setField("addressCity", event.target.value)} className="field" /></label></div><div className="mt-4 grid gap-4 sm:grid-cols-2"><label><span className="label">Estado</span><input required maxLength={2} value={form.state} onChange={(event) => setField("state", event.target.value.toUpperCase())} className="field" /></label><label><span className="label">Observações</span><input value={form.notes} onChange={(event) => setField("notes", event.target.value)} className="field" /></label></div><div className="mt-6 rounded-xl border border-border p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-extrabold">Materiais</p><p className="text-xs text-muted-foreground">Selecione itens individuais ou todos. A quantidade é opcional.</p></div><label className="flex items-center gap-2 text-xs font-bold"><input type="checkbox" checked={selectedAll} onChange={(event) => onSelectAll(event.target.checked)} /> Selecionar todos</label></div><div className="grid gap-2 sm:grid-cols-2">{selectableMaterials.map((material) => { const item = form.items[material.id] ?? { selected: false, quantity: "" }; return <label key={material.id} className={`flex items-center gap-3 rounded-lg border p-3 ${item.selected ? "border-primary bg-primary/5" : "border-border"}`}><input type="checkbox" checked={item.selected} onChange={(event) => onToggleMaterial(material.id, event.target.checked)} /><span className="min-w-0 flex-1"><span className="block text-xs font-extrabold">{material.name}</span><span className="text-[10px] text-muted-foreground">{material.unit}</span></span>{item.selected && <input type="number" min="1" value={item.quantity} onChange={(event) => setField("items", { ...form.items, [material.id]: { ...item, quantity: event.target.value } })} placeholder="Qtd." className="h-8 w-20 rounded border border-input bg-background px-2 text-xs" />}</label>; })}</div></div><button disabled={saving || !selectedCount} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-50"><Check size={16} /> {saving ? "Salvando…" : editing ? "Salvar alterações" : "Registrar retirada"}</button></form></div>;
}