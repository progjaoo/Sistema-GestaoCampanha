import { useEffect, useMemo, useState } from "react";
import { CalendarDays, MapPin } from "lucide-react";

type SharedEvent = { id: number; title: string; description: string | null; location: string | null; startsAt: string; endsAt: string; cityName: string; regionName: string };
type SharedResponse = { share: { label: string; weekStart: string }; events: SharedEvent[] };

function dateFromKey(key: string) { return new Date(`${key}T12:00:00-03:00`); }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }

export default function SharedAgendaPage() {
  const [data, setData] = useState<SharedResponse | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const token = window.location.pathname.split("/").filter(Boolean).at(-1);
    if (!token) { setError("Link de agenda inválido."); return; }
    void fetch(`/api/calendar/shared/${encodeURIComponent(token)}`).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível carregar a agenda.");
      setData(body as SharedResponse);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar a agenda."));
  }, []);
  const days = useMemo(() => data ? Array.from({ length: 7 }, (_, index) => { const day = dateFromKey(data.share.weekStart); day.setDate(day.getDate() + index); return day; }) : [], [data]);
  if (error) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#eaf2f8] p-6"><section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-xl"><p className="text-sm font-extrabold text-[#013968]">{error}</p></section></main>;
  if (!data) return <main className="flex min-h-[100dvh] items-center justify-center bg-[#eaf2f8] p-6"><p className="text-sm font-bold text-[#013968]">Carregando agenda…</p></main>;
  return <main className="min-h-[100dvh] bg-[#eaf2f8] px-4 py-8 text-[#013968] sm:px-8"><div className="mx-auto max-w-7xl"><header className="mb-8 flex flex-col gap-4 rounded-3xl bg-[#013968] p-6 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-white/70">EA 2026 · agenda compartilhada</p><h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Compromissos da semana</h1><p className="mt-2 text-sm text-white/75">{data.share.label}</p></div><CalendarDays size={42} className="text-white/80" /></header><div className="grid gap-3 overflow-x-auto pb-3 md:grid-cols-7">{days.map((day) => { const events = data.events.filter((event) => dateKey(new Date(event.startsAt)) === dateKey(day)); return <section key={dateKey(day)} className="min-h-[360px] min-w-[245px] rounded-2xl border border-[#c8dce9] bg-white p-3 shadow-sm md:min-w-0"><header className="border-b border-[#eaf2f8] px-2 pb-3"><p className="text-[10px] font-extrabold uppercase text-slate-500">{day.toLocaleDateString("pt-BR", { weekday: "long" })}</p><p className="mt-1 text-xl font-extrabold">{day.getDate()} <span className="text-xs font-bold text-slate-500">{day.toLocaleDateString("pt-BR", { month: "long" })}</span></p></header><div className="space-y-2 pt-3">{events.length ? events.map((event) => <article key={event.id} className="rounded-xl border border-[#d8e7f0] bg-[#f8fbfd] p-3"><p className="text-xs font-extrabold text-[#013f71]">{new Date(event.startsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} — {new Date(event.endsAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p><h2 className="mt-2 text-sm font-extrabold leading-5">{event.title}</h2><p className="mt-1 text-xs text-slate-600">{event.cityName} · {event.regionName}</p>{event.location && <p className="mt-2 flex items-center gap-1 text-xs text-slate-500"><MapPin size={12} /> {event.location}</p>}{event.description && <p className="mt-2 text-xs leading-5 text-slate-600">{event.description}</p>}</article>) : <p className="px-2 py-4 text-xs text-slate-400">Sem compromissos.</p>}</div></section>; })}</div><p className="mt-6 text-center text-xs text-slate-500">Este link apresenta somente os compromissos da semana compartilhada.</p></div></main>;
}