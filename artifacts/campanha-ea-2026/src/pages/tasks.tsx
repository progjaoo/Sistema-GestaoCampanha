import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ChevronRight, CircleAlert, MessageCircle, Plus, UserRound, X } from "lucide-react";
import { useListCities } from "@workspace/api-client-react";
import { authFetch, useAuth } from "@/lib/auth";
import { ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from "@/components/ops-shell";

type Task = {
  id: number; title: string; description: string | null; status: string; priority: string; dueAt: string | null;
  cityId: number | null; cityName: string | null; regionName: string | null; leadershipId: number | null;
  leadershipName: string | null; assigneeName: string | null;
};
type Recipient = { id: number; name: string | null; role: string; phone: string | null; email: string | null };
const columns = [
  { key: "todo", label: "A fazer", tone: "bg-secondary" },
  { key: "in_progress", label: "Em andamento", tone: "bg-blue-50" },
  { key: "blocked", label: "Bloqueadas", tone: "bg-amber-50" },
  { key: "done", label: "Concluídas", tone: "bg-emerald-50" },
] as const;

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  return body as T;
}

function whatsappUrl(phone: string, task: Task) {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  const message = [
    `EA 2026 — tarefa: ${task.title}`,
    task.description ? `Detalhes: ${task.description}` : "",
    task.cityName ? `Cidade: ${task.cityName}${task.regionName ? ` / ${task.regionName}` : ""}` : "",
    task.leadershipName ? `Liderança: ${task.leadershipName}` : "",
    task.dueAt ? `Prazo: ${new Date(task.dueAt).toLocaleString("pt-BR")}` : "",
    `Status: ${columns.find((column) => column.key === task.status)?.label ?? task.status}`,
  ].filter(Boolean).join("\n");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export default function TasksPage() {
  const { can } = useAuth();
  const cities = useListCities();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [shareTask, setShareTask] = useState<Task | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try { setTasks(await json<Task[]>(await authFetch("/api/tasks"))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar o Kanban."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function updateStatus(task: Task, status: string) {
    try {
      const updated = await json<Task>(await authFetch(`/api/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }));
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a tarefa."); }
  }

  if (loading) return <OpsShell><PageHeading eyebrow="Operações / kanban" title="Tarefas da campanha" description="Acompanhe pendências por território e compartilhe instruções pelo WhatsApp pessoal." /><LoadingRows count={4} /></OpsShell>;
  if (error && !tasks.length) return <OpsShell><PageHeading eyebrow="Operações / kanban" title="Tarefas da campanha" description="Acompanhe pendências por território e compartilhe instruções pelo WhatsApp pessoal." /><ErrorState label={error} onRetry={() => void load()} /></OpsShell>;

  return <OpsShell>
    <PageHeading eyebrow="Operações / kanban" title="Tarefas da campanha" description="Acompanhe pendências por território e compartilhe instruções pelo WhatsApp pessoal." action={can("tasks:create") ? <button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground"><Plus size={15} /> Nova tarefa</button> : undefined} />
    {error && <p className="mb-4 rounded-xl bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}
    <div className="grid gap-4 xl:grid-cols-4">{columns.map((column) => {
      const items = tasks.filter((task) => task.status === column.key);
      return <section key={column.key} className="min-h-[430px] rounded-2xl border border-border bg-muted/20 p-3" data-testid={`kanban-column-${column.key}`}>
        <div className="mb-3 flex items-center justify-between px-2"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${column.tone.replace("bg-", "bg-")}`} /><h2 className="text-sm font-extrabold">{column.label}</h2></div><span className="font-mono text-xs text-muted-foreground">{items.length}</span></div>
        <div className="space-y-3">{items.map((task) => <article key={task.id} className="rounded-xl border border-border bg-card p-4 shadow-sm" data-testid={`task-card-${task.id}`}><div className="flex items-start justify-between gap-2"><StatusPill tone={task.priority === "urgent" ? "danger" : task.priority === "high" ? "warning" : "neutral"}>{task.priority}</StatusPill><span className="font-mono text-[10px] text-muted-foreground">#{task.id}</span></div><h3 className="mt-3 text-sm font-extrabold leading-5">{task.title}</h3>{task.description && <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{task.description}</p>}<div className="mt-4 space-y-2 border-t border-border pt-3 text-[11px] text-muted-foreground">{task.cityName && <div className="flex items-center gap-2"><span className="font-bold text-foreground">{task.cityName}</span>{task.regionName && <span>· {task.regionName}</span>}</div>}{task.leadershipName && <div className="flex items-center gap-1.5"><UserRound size={12} />{task.leadershipName}</div>}{task.dueAt && <div className="flex items-center gap-1.5"><CalendarClock size={12} />{new Date(task.dueAt).toLocaleString("pt-BR")}</div>}</div><div className="mt-4 flex flex-wrap gap-2">{can("tasks:update") && <select value={task.status} onChange={(event) => void updateStatus(task, event.target.value)} className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-[10px] font-bold" aria-label={`Status da tarefa ${task.title}`}><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="done">Concluída</option></select>}{can("tasks:share") && <button onClick={() => setShareTask(task)} className="inline-flex h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-extrabold text-emerald-800" title="Enviar pelo WhatsApp pessoal"><MessageCircle size={13} /> Enviar</button>}</div></article>)}</div>
      </section>;
    })}</div>
    {showCreate && <CreateTaskDialog cities={cities.data ?? []} onClose={() => setShowCreate(false)} onCreated={(task) => { setTasks((current) => [task, ...current]); setShowCreate(false); }} />}
    {shareTask && <ShareTaskDialog task={shareTask} onClose={() => setShareTask(null)} />}
  </OpsShell>;
}

function CreateTaskDialog({ cities, onClose, onCreated }: { cities: Array<{ id: number; name: string; regionName: string }>; onClose: () => void; onCreated: (task: Task) => void }) {
  const [form, setForm] = useState({ title: "", description: "", cityId: "", priority: "normal", dueAt: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    try { onCreated(await json<Task>(await authFetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cityId: Number(form.cityId), dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null }) }))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar a tarefa."); }
    finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6"><form onSubmit={submit} className="w-full max-w-lg rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="mono-label text-primary">Nova operação</p><h2 className="mt-1 text-xl font-extrabold">Criar tarefa</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold">Título</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Detalhes</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-bold">Cidade</span><select required value={form.cityId} onChange={(event) => setForm({ ...form, cityId: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-xs font-bold"><option value="">Selecione</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></label><label><span className="mb-1.5 block text-xs font-bold">Prioridade</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-xs font-bold"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label></div><label className="block"><span className="mb-1.5 block text-xs font-bold">Prazo</span><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label></div>{error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}<button disabled={saving} className="mt-6 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60">{saving ? "Salvando…" : "Criar tarefa"}</button></form></div>;
}

function ShareTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { void (async () => { try { setRecipients(await json<Recipient[]>(await authFetch(`/api/tasks/${task.id}/recipients`))); } finally { setLoading(false); } })(); }, [task.id]);
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6"><section className="w-full max-w-lg rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl"><div className="mb-5 flex items-start justify-between"><div><p className="mono-label text-emerald-700">Compartilhamento manual</p><h2 className="mt-1 text-xl font-extrabold">Enviar tarefa</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">O WhatsApp abre no aparelho de Leonardo com a mensagem preenchida. O envio só acontece quando ele confirma no aplicativo.</p></div><button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div>{loading ? <LoadingRows count={2} /> : recipients.length ? <div className="space-y-2">{recipients.map((recipient) => <div key={`${recipient.role}-${recipient.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div className="min-w-0"><p className="truncate text-xs font-extrabold">{recipient.name}</p><p className="text-[10px] text-muted-foreground">{recipient.role.replaceAll("_", " ")} · {recipient.phone}</p></div>{recipient.phone && <a href={whatsappUrl(recipient.phone, task)} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-extrabold text-white"><MessageCircle size={13} /> WhatsApp</a>}</div>)}</div> : <div className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">Nenhum contato com telefone foi encontrado dentro do território da tarefa.</div>}<button onClick={onClose} className="mt-5 flex h-10 w-full items-center justify-center rounded-lg border border-border text-xs font-extrabold hover:bg-muted">Fechar</button></section></div>;
}