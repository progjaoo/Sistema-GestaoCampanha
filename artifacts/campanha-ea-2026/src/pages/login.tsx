import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useAuth } from "@/lib/auth";
import backgroundImage from "@assets/fundodegrade_1789097457989.png";
import campaignLogo from "@assets/logoherosection_1789097457990.svg";

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
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#013968] bg-cover bg-center px-4 py-8 text-white sm:px-6 sm:py-10" style={{ backgroundImage: `linear-gradient(135deg, rgba(1,63,113,.18), rgba(1,57,104,.35)), url(${backgroundImage})` }}>
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/20 bg-white/95 shadow-2xl backdrop-blur-sm md:grid-cols-[.9fr_1.1fr]">
        <div className="hidden min-h-[620px] flex-col justify-between bg-[#013968]/80 p-10 text-white md:flex">
          <div>
            <img src={campaignLogo} alt="EA 2026" className="w-full max-w-[310px]" />
            <div className="mt-24 max-w-sm"><p className="mono-label text-[#EAF2F8]">Acesso protegido</p><h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-[-.05em]">Coordene cada cidade com clareza.</h1></div>
          </div>
          <div className="h-px w-24 bg-white/35" />
        </div>
        <div className="p-7 text-[#013968] sm:p-12">
          <div className="mb-9 md:hidden"><img src={campaignLogo} alt="EA 2026" className="mx-auto w-full max-w-[260px] rounded-xl bg-[#013968] p-5" /></div>
          <div className="max-w-md"><p className="mono-label text-[#013F71]">Acesso da equipe</p><h2 className="mt-2 text-3xl font-extrabold tracking-[-.04em]">Entrar no sistema</h2><p className="mt-3 text-sm leading-6 text-slate-600">Use seu e-mail e senha para acessar a visão autorizada para você.</p></div>
          <form onSubmit={submit} className="mt-9 max-w-md space-y-5">
            <label className="block"><span className="mb-2 block text-xs font-extrabold">E-mail</span><input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:ring-2 focus:ring-[#013F71]" placeholder="voce@campanha.com" data-testid="input-login-email" /></label>
            <label className="block"><span className="mb-2 block text-xs font-extrabold">Senha</span><div className="relative"><LockKeyhole size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-11 pr-4 text-sm outline-none transition focus:ring-2 focus:ring-[#013F71]" placeholder="Digite sua senha" data-testid="input-login-password" /></div></label>
            {error && <p className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs font-bold text-destructive" role="alert" data-testid="login-error">{error}</p>}
            <button type="submit" disabled={isSubmitting} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#013F71] text-sm font-extrabold text-white shadow-lg transition hover:-translate-y-0.5 disabled:opacity-60" data-testid="button-login-submit">{isSubmitting ? "Entrando…" : "Entrar"} {!isSubmitting && <ArrowRight size={16} />}</button>
          </form>
        </div>
      </div>
    </main>
  );
}