import { useState, type ReactNode } from 'react';
import { BarChart3, ChevronRight, ClipboardCheck, Handshake, Map, Menu, Search, ShieldCheck, UsersRound, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';

const navItems = [
  { href: '/', label: 'Visão geral', icon: BarChart3 },
  { href: '/cobertura', label: 'Cobertura', icon: Map },
  { href: '/dobrados', label: 'Dobrados', icon: Handshake },
  { href: '/liderancas', label: 'Pessoas', icon: UsersRound },
  { href: '/revisao', label: 'Revisão', icon: ClipboardCheck },
  { href: '/acessos', label: 'Acessos', icon: ShieldCheck, permission: 'rbac:manage' },
];

export function OpsShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user, can, logout } = useAuth();
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  const visibleNavItems = navItems.filter((item) => !item.permission || can(item.permission));

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <aside className={`fixed inset-y-0 left-0 z-40 w-[268px] transform bg-sidebar text-sidebar-foreground transition-transform duration-300 md:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-full flex-col border-r border-sidebar-border">
          <div className="flex h-20 items-center justify-between px-6">
            <Link href="/" className="flex items-center gap-3" data-testid="link-brand">
              <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
                <Map size={18} strokeWidth={2.5} />
              </div>
              <div>
                <div className="text-[15px] font-extrabold tracking-tight">EA 2026</div>
                <div className="mono-label text-sidebar-foreground/55">sala de operações</div>
              </div>
            </Link>
            <button onClick={() => setOpen(false)} className="rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" aria-label="Fechar menu" data-testid="button-close-menu">
              <X size={18} />
            </button>
          </div>
          <div className="mx-5 mb-6 border-t border-sidebar-border" />
          <div className="px-4">
            <p className="mono-label mb-3 px-3 text-sidebar-foreground/45">Navegação</p>
            <nav className="space-y-1">
          {visibleNavItems.map(({ href, label, icon: Icon }) => (
                <Link key={href} href={href} onClick={() => setOpen(false)} className={`group flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold transition-colors ${active(href) ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
                  <Icon size={17} strokeWidth={active(href) ? 2.5 : 1.8} />
                  <span>{label}</span>
                  {active(href) && <ChevronRight size={14} className="ml-auto opacity-60" />}
                </Link>
              ))}
            </nav>
          </div>
          <div className="mt-auto p-5">
            <div className="rounded-xl border border-sidebar-border bg-sidebar-accent/45 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="mono-label text-sidebar-foreground/50">Ambiente</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <p className="text-xs font-semibold text-sidebar-foreground/80">Base territorial ativa</p>
              <p className="mt-1 text-[11px] text-sidebar-foreground/45">Atualização contínua</p>
            </div>
          </div>
        </div>
      </aside>
      {open && <button className="fixed inset-0 z-30 bg-sidebar/45 md:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu" data-testid="button-menu-overlay" />}
      <div className="md:pl-[268px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-7 lg:px-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setOpen(true)} className="rounded-lg p-2 hover:bg-muted md:hidden" aria-label="Abrir menu" data-testid="button-open-menu"><Menu size={21} /></button>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
              <ShieldCheck size={16} className="text-primary" />
              <span>Operações de campo</span>
              <span className="text-border">/</span>
              <span className="font-semibold text-foreground">{location === '/' ? 'Resumo da campanha' : location.startsWith('/cobertura') ? 'Cobertura territorial' : location.startsWith('/dobrados') ? 'Apoio federal' : location.startsWith('/acessos') ? 'Controle de acesso' : location.startsWith('/revisao') ? 'Fila de revisão' : 'Cadastro de pessoas'}</span>
            </div>
            <div className="sm:hidden">
              <div className="text-sm font-extrabold">EA 2026</div>
              <div className="mono-label text-muted-foreground">operações</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/liderancas" className="hidden items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground sm:flex" data-testid="link-quick-search">
              <Search size={14} /> Busca rápida
            </Link>
            <div className="hidden text-right sm:block"><p className="text-xs font-extrabold">{user?.fullName}</p><p className="mono-label text-muted-foreground">{user?.role.replaceAll('_', ' ')}</p></div>
            <button onClick={() => void logout()} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground transition hover:opacity-80" title="Sair" aria-label="Sair do sistema" data-testid="button-logout">{user?.fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</button>
          </div>
        </header>
        <main className="mx-auto max-w-[1440px] px-4 pb-24 pt-7 sm:px-7 lg:px-10 lg:pb-10">{children}</main>
      </div>
      <nav className="fixed bottom-0 left-0 right-0 z-20 flex border-t border-border bg-card/95 px-2 py-2 backdrop-blur-md md:hidden">
        {visibleNavItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`flex flex-1 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-bold ${active(href) ? 'text-primary' : 'text-muted-foreground'}`} data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`}>
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <p className="mono-label mb-2 text-primary">{eyebrow}</p>
        <h1 className="text-[clamp(1.75rem,4vw,2.65rem)] font-extrabold leading-[1.05] tracking-[-.045em]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function LoadingRows({ count = 5 }: { count?: number }) {
  return <div className="space-y-3" data-testid="loading-state">{Array.from({ length: count }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div>;
}

export function ErrorState({ onRetry, label = 'Não foi possível carregar os dados.' }: { onRetry: () => void; label?: string }) {
  return <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-7 text-center" data-testid="error-state"><p className="font-bold text-destructive">{label}</p><button onClick={onRetry} className="mt-4 rounded-lg bg-destructive px-4 py-2 text-xs font-bold text-destructive-foreground" data-testid="button-retry">Tentar novamente</button></div>;
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center" data-testid="empty-state"><div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-muted"><ClipboardCheck size={19} className="text-muted-foreground" /></div><p className="font-bold">{title}</p><p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">{detail}</p></div>;
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'success' | 'danger' }) {
  const styles = { neutral: 'bg-muted text-muted-foreground', warning: 'bg-amber-100 text-amber-800', success: 'bg-emerald-100 text-emerald-800', danger: 'bg-red-100 text-red-800' };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em] ${styles[tone]}`}>{children}</span>;
}