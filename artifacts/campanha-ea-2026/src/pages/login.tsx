import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, Map, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await login(email, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível entrar.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-sidebar px-4 py-10 text-sidebar-foreground">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl border border-sidebar-border bg-background shadow-2xl md:grid-cols-[.9fr_1.1fr]">
        <div className="hidden flex-col justify-between bg-sidebar p-10 text-sidebar-foreground md:flex">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground"><Map size={22} /></div>
              <div><p className="font-extrabold tracking-tight">EA 2026</p><p className="mono-label text-sidebar-foreground/55">sala de operações</p></div>
            </div>
            <div className="mt-24 max-w-sm"><p className="mono-label text-sidebar-primary">Acesso protegido</p><h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-[-.05em]">Coordene cada cidade com clareza.</h1><p className="mt-5 text-sm leading-6 text-sidebar-foreground/65">O acesso é definido pelo papel e pelo território de cada pessoa da campanha.</p></div>
          </div>
          <div className="flex items-center gap-2 text-xs text-sidebar-foreground/55"><ShieldCheck size={15} /> Permissões aplicadas no servidor</div>
        </div>
        <div className="p-7 text-foreground sm:p-12">
          <div className="mb-9 md:hidden"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Map size={19} /></div><div><p className="font-extrabold">EA 2026</p><p className="mono-label text-muted-foreground">sala de operações</p></div></div></div>
          <div className="max-w-md"><p className="mono-label text-primary">Acesso da equipe</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-.04em]">Entrar no sistema</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Use seu e-mail e senha para acessar a visão autorizada para você.</p></div>
          <form onSubmit={submit} className="mt-9 max-w-md space-y-5">
            <label className="block"><span className="mb-2 block text-xs font-extrabold">E-mail</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border border-input bg-background px-4 text-sm outline-none transition focus:ring-2 focus:ring-ring" placeholder="voce@campanha.com" data-testid="input-login-email" /></label>
            <label className="block"><span className="mb-2 block text-xs font-extrabold">Senha</span><div className="relative"><LockKeyhole size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" /><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-input bg-background pl-11 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-ring" placeholder="Digite sua senha" data-testid="input-login-password" /></div></label>
            {error && <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-bold text-destructive" role="alert" data-testid="login-error">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-extrabold text-primary-foreground shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-login-submit">{isSubmitting ? "Entrando…" : "Entrar"} {!isSubmitting && <ArrowRight size={16} />}</button>
          </form>
        </div>
      </div>
    </main>
  );
}