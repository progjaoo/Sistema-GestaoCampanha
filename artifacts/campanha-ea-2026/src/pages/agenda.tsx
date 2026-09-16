import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, ExternalLink, History, LayoutList, Link2, MapPin, MessageCircle, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useListCities } from "@workspace/api-client-react";
import { authFetch, useAuth } from "@/lib/auth";
import { ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from "@/components/ops-shell";
import { confirmWithToast } from "@/lib/confirm-toast";
import { useOfflineSnapshot } from "@/lib/connectivity";
import { toast } from "@/hooks/use-toast";

type EventRow = { id: number; source: "google"; googleHtmlLink: string | null; title: string; description: string | null; location: string | null; startsAt: string; endsAt: string; cityId: number; cityName: string; regionName: string; status: string; syncStatus: string; lastSyncedAt: string | null; lastSyncError: string | null };
type SyncStatus = { provider: string; status: string; lastAttemptedAt: string | null; lastSyncedAt: string | null; lastError: string | null };
type ShareRecipient = { id: number; type: "user" | "leadership"; name: string | null; role: string; phone: string; email: string | null };
type ShareMessage = { id: number; recipientType: "user" | "leadership" | "group_member"; recipientName: string; phone: string; message: string; whatsappUrl: string; status?: string; openedAt?: string | null };
type ShareHistory = { id: number; createdAt: string; createdByName: string; messages: ShareMessage[] };
type AutomaticNotification = {
  id: number;
  triggerType: string;
  createdAt: string;
  calendarShareId: number | null;
  shareToken: string | null;
  weekStart: string | null;
  label: string | null;
  eventId: number | null;
  eventTitle: string | null;
  eventCityName?: string | null;
  messages: ShareMessage[];
};
type CreateEventResponse = EventRow & { notification?: AutomaticNotification | null; share?: { token: string; id: number; weekStart: string; label: string } };
type CalendarView = "list" | "week";
async function read<T>(response: Response): Promise<T> { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação."); return body as T; }

function startOfWeek(date: Date) { const result = new Date(date); result.setHours(0, 0, 0, 0); const day = result.getDay(); result.setDate(result.getDate() - (day === 0 ? 6 : day - 1)); return result; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function weekLabel(date: Date) { const end = new Date(date); end.setDate(end.getDate() + 6); return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${end.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`; }
function eventDateKey(event: EventRow) { return dateKey(new Date(event.startsAt)); }
function shareRecipientKey(recipient: Pick<ShareRecipient, "id" | "type">) { return `${recipient.type}:${recipient.id}`; }
function parseShareRecipientKey(value: string): { type: "user" | "leadership"; id: number } | null { const [type, rawId] = value.split(":"); const id = Number(rawId); return (type === "user" || type === "leadership") && Number.isInteger(id) && id > 0 ? { type, id } : null; }

export default function AgendaPage() {
  const { can, user } = useAuth();
  const cities = useListCities();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<EventRow | null>(null);
  const [view, setView] = useState<CalendarView>("list");
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [shareLink, setShareLink] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [syncStates, setSyncStates] = useState<SyncStatus[]>([]);
  const [showWhatsAppShare, setShowWhatsAppShare] = useState(false);
  const [automaticNotification, setAutomaticNotification] = useState<AutomaticNotification | null>(null);
  const [pendingNotification, setPendingNotification] = useState<AutomaticNotification | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<number | null>(null);
  const snapshot = useOfflineSnapshot<{ events: EventRow[]; syncStates: SyncStatus[] }>("agenda", { userId: user?.id ?? null });
  const cached = snapshot.data;
  const [networkResolved, setNetworkResolved] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const [rows, notifications] = await Promise.all([
        read<EventRow[]>(await authFetch("/api/calendar/events")),
        can("calendar:manage") ? read<AutomaticNotification[]>(await authFetch("/api/calendar/notifications")) : Promise.resolve([]),
      ]);
      setEvents(rows);
      const sync = await read<{ states: SyncStatus[] }>(await authFetch("/api/calendar/sync-status"));
      setSyncStates(sync.states);
      snapshot.saveSnapshot({ events: rows, syncStates: sync.states });
      const pending = rows.find((event) => event.status === "pending" && !localStorage.getItem(`ea-event-seen-${event.id}`));
      const pendingNotification = notifications.find((item) => item.messages.some((message) => message.status === "prepared"));
      setPendingNotification(pendingNotification ?? null);
      if (pending) {
        setNotice(pending);
      }
    } catch (reason) {
      if (cached) { setEvents(cached.events); setSyncStates(cached.syncStates); }
      else setError(reason instanceof Error ? reason.message : "Não foi possível carregar a agenda.");
    }
    finally { setNetworkResolved(true); setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (!networkResolved && cached && !loading) {
      setEvents(cached.events);
      setSyncStates(cached.syncStates);
    }
  }, [cached, loading, networkResolved]);
  async function sync() { try { await read(await authFetch("/api/calendar/sync", { method: "POST" })); toast({ title: "Agenda sincronizada", description: "Os eventos foram atualizados." }); await load(); } catch (reason) { const message = reason instanceof Error ? reason.message : "Não foi possível sincronizar."; setError(message); toast({ title: "Não foi possível sincronizar", description: message, variant: "destructive" }); } }
  async function acknowledge(event: EventRow) { localStorage.setItem(`ea-event-seen-${event.id}`, "1"); await authFetch(`/api/calendar/events/${event.id}/acknowledge`, { method: "POST" }).catch(() => undefined); setNotice(null); toast({ title: "Aviso dispensado", description: `O evento “${event.title}” foi reconhecido.` }); }
  function deleteEvent(event: EventRow) {
    if (!can("calendar:manage")) return;
    confirmWithToast({
      title: "Excluir evento da agenda?",
      description: `O evento “${event.title}” será removido do Google Calendar e da Agenda.`,
      actionLabel: "Excluir",
      variant: "destructive",
      onConfirm: () => void executeDeleteEvent(event),
    });
  }
  async function executeDeleteEvent(event: EventRow) {
    setDeletingEventId(event.id);
    setError("");
    try {
      await read(await authFetch(`/api/calendar/events/${event.id}`, { method: "DELETE" }));
      setEvents((current) => current.filter((item) => item.id !== event.id));
      setNotice((current) => current?.id === event.id ? null : current);
      toast({ title: "Evento excluído", description: `“${event.title}” foi removido da agenda.` });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir o evento.");
    } finally {
      setDeletingEventId(null);
    }
  }
  async function createShareLink() {
    setShareMessage("");
    try {
      const share = await read<{ token: string; notification?: AutomaticNotification | null }>(await authFetch("/api/calendar/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weekStart: dateKey(weekStart), label: `Agenda de ${weekLabel(weekStart)}` }) }));
      const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      setShareLink(`${window.location.origin}${base}agenda/compartilhada/${share.token}`);
      setShareMessage("Link criado. Copie e envie para o Edson.");
      toast({ title: "Link da agenda criado", description: "O link está pronto para ser copiado e enviado." });
       if (share.notification) {
         setPendingNotification(null);
         setAutomaticNotification(share.notification);
       }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar o link da agenda."); }
  }
  async function copyShareLink() {
    if (!shareLink) return;
    await navigator.clipboard?.writeText(shareLink);
    setShareMessage("Link copiado.");
  }
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return date; }), [weekStart]);
  const weekEvents = events.filter((event) => { const key = eventDateKey(event); return key >= dateKey(weekStart) && key <= dateKey(days[6]); });

  if (loading && !events.length && !cached) return <OpsShell><PageHeading eyebrow="Agenda / território" title="Agenda da campanha" description="Eventos criados pelo Edson Albertassi ou pelo administrador aparecem aqui por cidade." lastUpdatedAt={snapshot.savedAt} /><LoadingRows count={4} /></OpsShell>;
  if (error && !events.length && !cached) return <OpsShell><PageHeading eyebrow="Agenda / território" title="Agenda da campanha" description="Eventos criados pelo Edson Albertassi ou pelo administrador aparecem aqui por cidade." /><ErrorState label={error} onRetry={() => void load()} /></OpsShell>;
  return <OpsShell>
     <PageHeading eyebrow="Agenda / território" title="Agenda da campanha" description="Consulte a lista completa ou organize os compromissos em uma visão semanal." lastUpdatedAt={snapshot.savedAt} stale={Boolean(cached && !networkResolved)} action={<div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">{can("calendar:manage") && <><button onClick={() => void sync()} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-3 text-xs font-extrabold sm:flex-none"><RefreshCw size={14} /> Sincronizar</button><button onClick={() => setShowCreate(true)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground sm:flex-none">Novo evento</button></>}</div>} />
    {error && <p className="mb-4 rounded-xl bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}
     {pendingNotification && can("calendar:manage") && <section className="mb-5 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="flex items-center gap-2 text-sm font-extrabold text-emerald-950"><MessageCircle size={16} className="shrink-0 text-emerald-700" /> Há mensagens de agenda preparadas</p><p className="mt-1 text-xs leading-5 text-emerald-800">Revise cada mensagem e confirme o envio diretamente no WhatsApp{pendingNotification.eventTitle ? ` para o evento “${pendingNotification.eventTitle}”` : "."}</p></div><div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row"><button onClick={() => { setAutomaticNotification(pendingNotification); setPendingNotification(null); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-xs font-extrabold text-white hover:bg-emerald-700"><MessageCircle size={14} /> Continuar preparação</button><button onClick={() => setPendingNotification(null)} className="inline-flex h-10 items-center justify-center rounded-lg border border-emerald-300 bg-white px-4 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100">Agora não</button></div></section>}
    {can("calendar:view") && <section className="mb-5 rounded-2xl border border-border bg-card p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-extrabold">Saúde da sincronização</p><p className="mt-1 text-xs text-muted-foreground">Google Calendar alimenta a Agenda e continua como fonte única dos eventos.</p></div><div className="flex flex-wrap gap-2">{syncStates.map((state) => <span key={state.provider} className="rounded-full border border-border px-3 py-1.5 text-[11px] font-bold">Google: {state.status === "ok" ? "OK" : state.status === "error" ? "erro" : "aguardando"}{state.lastSyncedAt ? ` · ${new Date(state.lastSyncedAt).toLocaleString("pt-BR")}` : ""}</span>)}</div></div>{syncStates.some((state) => state.lastError) && <p className="mt-3 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{syncStates.find((state) => state.lastError)?.lastError}</p>}</section>}
     <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
       <div className="grid w-full grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:flex sm:w-auto sm:items-center sm:gap-2 sm:bg-transparent sm:p-0"><button onClick={() => setView("list")} className={`inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-[11px] font-extrabold sm:px-3 sm:text-xs ${view === "list" ? "bg-card text-primary shadow-sm sm:bg-secondary sm:shadow-none" : "text-muted-foreground hover:bg-card sm:hover:bg-muted"}`}><LayoutList size={14} /> Lista</button><button onClick={() => setView("week")} className={`inline-flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-[11px] font-extrabold sm:px-3 sm:text-xs ${view === "week" ? "bg-card text-primary shadow-sm sm:bg-secondary sm:shadow-none" : "text-muted-foreground hover:bg-card sm:hover:bg-muted"}`}><CalendarDays size={14} /> Calendário semanal</button></div>
       {view === "week" && <div className="flex w-full items-center justify-between gap-2 sm:w-auto"><button onClick={() => setWeekStart((date) => { const next = new Date(date); next.setDate(next.getDate() - 7); return next; })} className="rounded-lg border border-border p-2 hover:bg-muted" aria-label="Semana anterior"><ChevronLeft size={15} /></button><span className="min-w-0 flex-1 text-center text-xs font-extrabold capitalize">{weekLabel(weekStart)}</span><button onClick={() => setWeekStart((date) => { const next = new Date(date); next.setDate(next.getDate() + 7); return next; })} className="rounded-lg border border-border p-2 hover:bg-muted" aria-label="Próxima semana"><ChevronRight size={15} /></button></div>}
    </div>
     {view === "week" ? (
       <div className="overflow-x-auto rounded-2xl border border-border bg-card p-3">
         <div className="grid min-w-[760px] grid-cols-7 gap-2 sm:min-w-[840px] xl:min-w-0">
           {days.map((day) => {
             const key = dateKey(day);
             const dayEvents = weekEvents.filter((event) => eventDateKey(event) === key);
             return <section key={key} className="min-h-[430px] rounded-xl bg-muted/35 p-2">
               <header className="border-b border-border px-2 pb-3"><p className="text-[10px] font-extrabold uppercase text-muted-foreground">{day.toLocaleDateString("pt-BR", { weekday: "short" })}</p><p className="mt-1 text-lg font-extrabold">{day.getDate()}</p></header>
               <div className="space-y-2 pt-2">{dayEvents.map((event) => <article key={event.id} className="rounded-lg border border-border bg-card p-2 shadow-sm">
                 <div className="flex items-start justify-between gap-2">
                   <div><p className="text-[10px] font-extrabold text-primary">{new Date(event.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 text-xs font-extrabold leading-4">{event.title}</p></div>
                   {can("calendar:manage") && <button onClick={() => void deleteEvent(event)} disabled={deletingEventId === event.id} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50" aria-label={`Excluir ${event.title}`} data-testid={`button-delete-event-${event.id}`}><Trash2 size={13} /></button>}
                 </div>
                 <p className="mt-1 text-[10px] text-muted-foreground">{event.cityName}</p>{event.location && <p className="mt-1 truncate text-[10px] text-muted-foreground">{event.location}</p>}
               </article>)}</div>
             </section>;
           })}
         </div>
       </div>
     ) : <div className="space-y-3">{events.length ? events.map((event) => <article key={event.id} className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary"><CalendarDays size={18} /></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="break-words text-base font-extrabold">{event.title}</h2><StatusPill tone={event.status === "pending" ? "warning" : "success"}>{event.status === "pending" ? "Pendente" : event.status}</StatusPill></div><p className="mt-2 text-xs font-bold">{new Date(event.startsAt).toLocaleString("pt-BR")} — {new Date(event.endsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><MapPin size={13} /> {event.cityName} · {event.regionName}{event.location ? ` · ${event.location}` : ""}</p>{event.description && <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-muted-foreground">{event.description}</p>}</div></div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">{event.googleHtmlLink && <a href={event.googleHtmlLink} target="_blank" rel="noreferrer" className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-extrabold hover:bg-muted sm:flex-none">Abrir Google Calendar <ExternalLink size={13} /></a>}{can("calendar:manage") && <button onClick={() => deleteEvent(event)} disabled={deletingEventId === event.id} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-extrabold text-red-700 hover:bg-red-50 disabled:opacity-50 sm:flex-none" data-testid={`button-delete-event-${event.id}`}><Trash2 size={13} /> {deletingEventId === event.id ? "Excluindo…" : "Excluir"}</button>}</div>
       </div>
     </article>) : <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Nenhum evento da agenda foi encontrado para o seu território.</div>}</div>}
     {can("calendar:manage") && <section className="mt-5 rounded-2xl border border-[#b8d6e8] bg-[#eaf2f8] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-extrabold text-primary"><Link2 size={16} /> Compartilhar semana com Edson Albertassi</p><p className="mt-1 text-xs text-slate-600">Crie um link somente para a semana selecionada na visão de calendário.</p></div><div className="grid gap-2 sm:flex sm:flex-wrap"><button onClick={() => void createShareLink()} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-xs font-extrabold text-primary-foreground sm:w-auto">Gerar link da semana</button><button onClick={() => setShowWhatsAppShare(true)} className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2.5 text-xs font-extrabold text-emerald-800 sm:w-auto"><MessageCircle size={14} /> Enviar agenda da semana</button></div></div>{shareLink && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input readOnly value={shareLink} className="h-10 min-w-0 flex-1 rounded-lg border border-[#b8d6e8] bg-white px-3 text-xs text-slate-600" /><button onClick={() => void copyShareLink()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-white px-4 text-xs font-extrabold text-primary"><Copy size={14} /> Copiar link</button></div>}{shareMessage && <p className="mt-2 text-xs font-bold text-primary">{shareMessage}</p>}</section>}
      {showCreate && <CreateEventDialog cities={cities.data ?? []} onClose={() => setShowCreate(false)} onCreated={(payload) => { setEvents((current) => [...current, payload].sort((a, b) => a.startsAt.localeCompare(b.startsAt))); setShowCreate(false); setNotice(null); toast({ title: "Evento criado", description: `“${payload.title}” foi adicionado à agenda.` }); if (payload.notification) { setPendingNotification(null); setAutomaticNotification(payload.notification); } }} />}
      {showWhatsAppShare && <ShareAgendaDialog weekStart={weekStart} weekLabel={weekLabel(weekStart)} onClose={() => setShowWhatsAppShare(false)} onAutomaticNotification={setAutomaticNotification} />}
      {automaticNotification && <AutomaticNotificationDialog notification={automaticNotification} onClose={() => setAutomaticNotification(null)} />}
    {notice && <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/35 p-4"><section className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"><div className="flex items-start justify-between"><div><p className="mono-label text-primary">Aviso da sua cidade</p><h2 className="mt-1 text-xl font-extrabold">{notice.title}</h2></div><button onClick={() => void acknowledge(notice)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar aviso"><X size={18} /></button></div><p className="mt-4 text-sm leading-6 text-muted-foreground">Haverá uma agenda de campanha em <strong className="text-foreground">{notice.cityName}</strong> em {new Date(notice.startsAt).toLocaleString("pt-BR")}{notice.location ? `, no local ${notice.location}` : ""}.</p>{notice.description && <p className="mt-3 rounded-xl bg-muted p-3 text-xs leading-5">{notice.description}</p>}<button onClick={() => void acknowledge(notice)} className="mt-6 h-11 w-full rounded-lg bg-primary text-sm font-extrabold text-primary-foreground">Entendi</button></section></div>}
  </OpsShell>;
}

function CreateEventDialog({ cities, onClose, onCreated }: { cities: Array<{ id: number; name: string; regionName: string }>; onClose: () => void; onCreated: (event: CreateEventResponse) => void }) {
  const [form, setForm] = useState({ title: "", description: "", location: "", cityId: "", startsAt: "", endsAt: "" });
  const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setError(""); try { onCreated(await read<CreateEventResponse>(await authFetch("/api/calendar/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, cityId: Number(form.cityId), startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString() }) }))); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível criar o evento."); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6"><form onSubmit={submit} className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl"><div className="mb-6 flex items-start justify-between"><div><p className="mono-label text-primary">Google Calendar / EA 2026</p><h2 className="mt-1 text-xl font-extrabold">Novo evento</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div><div className="space-y-4"><label className="block"><span className="mb-1.5 block text-xs font-bold">Título</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Deputado estará em..." className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Cidade</span><select required value={form.cityId} onChange={(event) => setForm({ ...form, cityId: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-xs font-bold"><option value="">Selecione</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-bold">Início</span><input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-2 text-xs" /></label><label><span className="mb-1.5 block text-xs font-bold">Fim</span><input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-2 text-xs" /></label></div><label className="block"><span className="mb-1.5 block text-xs font-bold">Local</span><input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold">Descrição / orientação</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm" /></label></div>{error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}<button disabled={saving} className="mt-6 h-11 w-full rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60">{saving ? "Criando no Google Calendar…" : "Criar evento e avisar a cidade"}</button></form></div>;
}

function ShareAgendaDialog({ weekStart, weekLabel: selectedWeekLabel, onClose, onAutomaticNotification }: { weekStart: Date; weekLabel: string; onClose: () => void; onAutomaticNotification: (notification: AutomaticNotification) => void }) {
  const [recipients, setRecipients] = useState<ShareRecipient[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<ShareHistory[]>([]);
  const [prepared, setPrepared] = useState<ShareMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const week = dateKey(weekStart);
      const [nextRecipients, nextHistory] = await Promise.all([
        read<ShareRecipient[]>(await authFetch(`/api/calendar/share-recipients?weekStart=${encodeURIComponent(week)}`)),
        read<ShareHistory[]>(await authFetch(`/api/calendar/share-history?weekStart=${encodeURIComponent(week)}`)),
      ]);
      setRecipients(nextRecipients);
      setSelected(nextRecipients.map(shareRecipientKey));
      setHistory(nextHistory);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os destinatários da agenda.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [weekStart]);

  function toggleRecipient(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function prepareMessages() {
    const parsed = selected.map(parseShareRecipientKey).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!parsed.length) return;
    setPreparing(true);
    setError("");
    try {
      const week = dateKey(weekStart);
       const share = await read<{ id: number; notification?: AutomaticNotification | null }>(await authFetch("/api/calendar/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: week, label: `Agenda de ${selectedWeekLabel}` }),
      }));
       if (share.notification) onAutomaticNotification(share.notification);
      const response = await read<{ messages: ShareMessage[] }>(await authFetch(`/api/calendar/shares/${share.id}/share-preparations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parsed }),
      }));
      setPrepared(response.messages);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível preparar as mensagens da agenda.");
    } finally {
      setPreparing(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6"><section className="max-h-[90dvh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl">
    <div className="mb-6 flex items-start justify-between gap-4"><div><p className="mono-label text-primary">WhatsApp / agenda semanal</p><h2 className="mt-1 text-xl font-extrabold">Enviar agenda da semana</h2><p className="mt-1 text-xs text-muted-foreground">{selectedWeekLabel}</p></div><button onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div>
    <p className="mb-5 text-xs leading-5 text-muted-foreground">Selecione os destinatários. O sistema criará um link público para esta semana e registrará quem iniciou cada preparação. O envio final continua confirmado por você no WhatsApp.</p>
    {error && <p className="mb-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive" data-testid="share-agenda-error">{error}</p>}
    {loading ? <LoadingRows count={3} /> : recipients.length ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3"><div><p className="mono-label text-primary">Destinatários</p><p className="mt-1 text-xs text-muted-foreground">{selected.length} de {recipients.length} selecionados</p></div><button onClick={() => setSelected(selected.length === recipients.length ? [] : recipients.map(shareRecipientKey))} className="text-[11px] font-extrabold text-primary">{selected.length === recipients.length ? "Desmarcar todos" : "Selecionar todos"}</button></div>
        <div className="max-h-80 space-y-2 overflow-y-auto" data-testid="agenda-recipient-list">{recipients.map((recipient) => { const key = shareRecipientKey(recipient); return <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/50" data-testid={`agenda-recipient-${recipient.type}-${recipient.id}`}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggleRecipient(key)} className="h-4 w-4 accent-primary" /><div className="min-w-0"><p className="truncate text-xs font-extrabold">{recipient.name}</p><p className="text-[10px] text-muted-foreground">{recipient.role.replaceAll("_", " ")} · {recipient.phone}</p></div></label>; })}</div>
        <button onClick={() => void prepareMessages()} disabled={preparing || !selected.length} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-extrabold text-white disabled:opacity-50" data-testid="button-prepare-agenda-share"><Send size={14} /> {preparing ? "Preparando mensagens…" : `Preparar ${selected.length} mensagem${selected.length === 1 ? "" : "s"}`}</button>
      </div>
      <div className="space-y-4">
         {prepared.length > 0 && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="mono-label text-emerald-800">Mensagens preparadas</p><p className="mt-1 text-xs leading-5 text-emerald-900">Abra cada conversa e confirme o envio no WhatsApp.</p><div className="mt-3 space-y-2">{prepared.map((message) => <div key={message.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white p-2.5"><span className="truncate text-xs font-bold">{message.recipientName}</span><a href={message.whatsappUrl} target="_blank" rel="noreferrer" onClick={() => { void authFetch(`/api/calendar/notification-messages/${message.id}/opened`, { method: "POST" }); }} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-extrabold text-white" data-testid={`link-agenda-whatsapp-${message.id}`}><MessageCircle size={13} /> Abrir</a></div>)}</div></section>}
        <section className="rounded-xl border border-border bg-background/50 p-4"><div className="mb-3 flex items-center gap-2"><History size={16} className="text-primary" /><div><p className="mono-label text-primary">Histórico de preparações</p><p className="mt-1 text-[11px] text-muted-foreground">Quem iniciou e para quem a agenda foi preparada.</p></div></div>{history.length ? <div className="space-y-3">{history.map((batch) => <div key={batch.id} className="rounded-lg border border-border p-3"><p className="text-[11px] font-extrabold">{batch.createdByName}</p><p className="mt-1 text-[10px] text-muted-foreground">{new Date(batch.createdAt).toLocaleString("pt-BR")} · {batch.messages.length} destinatário{batch.messages.length === 1 ? "" : "s"}</p><div className="mt-2 flex flex-wrap gap-1">{batch.messages.map((message) => <span key={message.id} className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{message.recipientName}</span>)}</div></div>)}</div> : <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Nenhuma preparação registrada para esta semana.</p>}</section>
      </div>
    </div> : <div className="rounded-xl bg-muted p-4 text-xs text-muted-foreground">Não há contatos disponíveis ou eventos nesta semana dentro do seu território.</div>}
    <button onClick={onClose} className="mt-5 flex h-10 w-full items-center justify-center rounded-lg border border-border text-xs font-extrabold hover:bg-muted">Fechar</button>
  </section></div>;
}

function AutomaticNotificationDialog({ notification, onClose }: { notification: AutomaticNotification; onClose: () => void }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const current = notification.messages[activeIndex];

  async function copyMessage() {
    if (!current) return;
    await navigator.clipboard?.writeText(current.message);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function markOpened(message: ShareMessage) {
    void authFetch(`/api/calendar/notification-messages/${message.id}/opened`, { method: "POST" });
  }

  if (!current) {
    return null;
  }

  return <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-primary/40 p-3 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="automatic-notification-title">
    <section className="my-auto max-h-[calc(100dvh-1.5rem)] min-w-0 w-full max-w-xl overflow-y-auto rounded-2xl bg-card p-4 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="mono-label text-primary">Agenda / preparação automática</p>
          <h2 id="automatic-notification-title" className="mt-1 break-words text-xl font-extrabold">Preparar aviso no WhatsApp</h2>
          <p className="mt-1 text-xs text-muted-foreground">{notification.eventTitle ? `Evento: ${notification.eventTitle}` : notification.label ?? "Agenda semanal"} · {notification.messages.length} destinatários</p>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar preparação"><X size={18} /></button>
      </div>
      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs leading-5 text-emerald-950">As mensagens foram preparadas individualmente. Abra cada conversa, revise o texto e confirme o envio dentro do WhatsApp.</p>
        <p className="mt-2 text-[11px] font-bold text-emerald-800">O sistema registra a preparação e a abertura, mas não afirma que a mensagem foi enviada.</p>
      </div>
      <div className="mt-5 space-y-2">
        {notification.messages.map((message, index) => <button key={message.id} type="button" onClick={() => setActiveIndex(index)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition-colors ${index === activeIndex ? "border-primary bg-secondary/50" : "border-border hover:bg-muted/50"}`}>
          <span className="min-w-0"><span className="block truncate text-xs font-extrabold">{message.recipientName}</span><span className="mt-1 block text-[10px] text-muted-foreground">{message.status === "opened" ? "Mensagem aberta" : "Aguardando abertura"}</span></span>
          <span className="shrink-0 text-[10px] font-extrabold text-primary">{index + 1}/{notification.messages.length}</span>
        </button>)}
      </div>
      <div className="mt-5 rounded-xl border border-border bg-background/50 p-4">
        <p className="mono-label text-primary">Mensagem para {current.recipientName}</p>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-foreground [overflow-wrap:anywhere]">{current.message}</pre>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        <a href={current.whatsappUrl} target="_blank" rel="noreferrer" onClick={() => markOpened(current)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-extrabold text-white"><MessageCircle size={14} /> Abrir WhatsApp</a>
        <button type="button" onClick={() => void copyMessage()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs font-extrabold hover:bg-muted"><Copy size={14} /> {copied ? "Copiada" : "Copiar"}</button>
        <button type="button" onClick={() => setActiveIndex((index) => (index + 1) % notification.messages.length)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 text-xs font-extrabold text-primary hover:bg-primary/10">Abrir próximo</button>
      </div>
      <button onClick={onClose} className="mt-4 h-10 w-full rounded-lg border border-border text-xs font-extrabold hover:bg-muted">Concluir depois</button>
    </section>
  </div>;
}