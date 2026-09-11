import { useEffect, useState } from "react";
import { Check, KeyRound, Save, UserRound } from "lucide-react";
import { authFetch, useAuth } from "@/lib/auth";
import { OpsShell, PageHeading } from "@/components/ops-shell";

type ProfileResponse = { user: Parameters<ReturnType<typeof useAuth>["updateUser"]>[0] };

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", password: "", passwordConfirmation: "" });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) setForm({ fullName: user.fullName, email: user.email, phone: user.phone ?? "", password: "", passwordConfirmation: "" });
  }, [user]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (form.password && form.password !== form.passwordConfirmation) {
      setError("A confirmação da nova senha não confere.");
      return;
    }
    setSaving(true);
    try {
      const response = await authFetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.fullName, email: form.email, phone: form.phone || null, password: form.password || undefined }),
      });
      const body = await response.json().catch(() => ({})) as ProfileResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Não foi possível salvar o perfil.");
      updateUser(body.user);
      setForm((current) => ({ ...current, password: "", passwordConfirmation: "" }));
      setMessage("Perfil atualizado.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  return <OpsShell>
    <PageHeading eyebrow="Conta / perfil" title="Meu perfil" description="Atualize seus dados de acesso e o telefone usado para contatos operacionais." />
    <form onSubmit={save} className="max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
      <div className="mb-7 flex items-center gap-3 border-b border-border pb-5"><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-primary"><UserRound size={19} /></div><div><p className="text-sm font-extrabold">{user?.role.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">Dados visíveis no seu acesso</p></div></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-1.5 block text-xs font-bold">Nome completo</span><input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 block text-xs font-bold">E-mail</span><input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 block text-xs font-bold">Telefone</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="(00) 00000-0000" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 flex items-center gap-2 text-xs font-bold"><KeyRound size={13} /> Nova senha</span><input minLength={8} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="Deixe vazio para manter" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
        <label><span className="mb-1.5 block text-xs font-bold">Confirmar nova senha</span><input minLength={8} type="password" value={form.passwordConfirmation} onChange={(event) => setForm({ ...form, passwordConfirmation: event.target.value })} className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" /></label>
      </div>
      {message && <p className="mt-5 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs font-bold text-emerald-800"><Check size={14} /> {message}</p>}
      {error && <p className="mt-5 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive">{error}</p>}
      <button disabled={saving} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-5 text-xs font-extrabold text-primary-foreground disabled:opacity-60"><Save size={14} /> {saving ? "Salvando…" : "Salvar alterações"}</button>
    </form>
  </OpsShell>;
}