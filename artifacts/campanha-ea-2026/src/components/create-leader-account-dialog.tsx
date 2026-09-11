import { useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useListLeaderships } from "@workspace/api-client-react";
import { authFetch } from "@/lib/auth";

type City = { id: number; name: string; regionName: string };

export function CreateLeaderAccountDialog({ cities, onClose }: { cities: City[]; onClose: () => void }) {
  const [form, setForm] = useState({ fullName: "", email: "", password: "", cityId: "", leadershipId: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const leaderships = useListLeaderships({ cityId: form.cityId ? Number(form.cityId) : undefined, page: 1, pageSize: 100 });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const response = await authFetch("/api/auth/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          password: form.password,
          role: "LIDERANCA",
          cityId: Number(form.cityId),
          leadershipId: Number(form.leadershipId),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Não foi possível criar o acesso.");
      }
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar o acesso.");
    } finally {
      setSaving(false);
    }
  }

  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6">
    <form onSubmit={submit} className="w-full max-w-lg rounded-t-2xl bg-card p-6 shadow-2xl sm:rounded-2xl max-h-[90dvh] overflow-y-auto">
      <div className="mb-6 flex items-start justify-between"><div><p className="mono-label text-primary">Acesso restrito</p><h2 className="mt-1 text-xl font-extrabold">Criar usuário líder</h2><p className="mt-2 text-xs text-muted-foreground">O acesso ficará preso à cidade e à liderança selecionadas.</p></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar"><X size={18} /></button></div>
      <div className="space-y-4">
        <label className="block"><span className="mb-1.5 block text-xs font-bold">Nome completo</span><input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-bold">E-mail</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label><label><span className="mb-1.5 block text-xs font-bold">Senha inicial</span><input required minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label></div>
        <label className="block"><span className="mb-1.5 block text-xs font-bold">Cidade</span><select required value={form.cityId} onChange={(event) => setForm({ ...form, cityId: event.target.value, leadershipId: "" })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="">Selecione a cidade</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-xs font-bold">Liderança e deputado apoiado</span><select required disabled={!form.cityId || leaderships.isLoading} value={form.leadershipId} onChange={(event) => setForm({ ...form, leadershipId: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-ring"><option value="">{leaderships.isLoading ? "Carregando lideranças…" : "Selecione uma liderança"}</option>{(leaderships.data?.items ?? []).map((leadership) => <option key={leadership.id} value={leadership.id}>{leadership.name} · {leadership.federalDeputyName ?? "Sem deputado"}</option>)}</select></label>
      </div>
      {error && <p className="mt-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}
      <button disabled={saving || !form.leadershipId} className="mt-7 flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60">{saving ? "Salvando…" : "Criar acesso líder"}</button>
    </form>
  </div>;
}