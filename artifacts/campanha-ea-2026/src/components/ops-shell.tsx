import { useEffect, useState, type ReactNode } from 'react';
import { Archive, BarChart3, CalendarDays, ChevronRight, ClipboardCheck, FileSpreadsheet, Handshake, KanbanSquare, Map, Menu, MoreHorizontal, Search, ShieldCheck, UsersRound, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/lib/auth';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
  { href: '/', label: 'Visão geral', icon: BarChart3 },
  { href: '/cobertura', label: 'Cobertura', icon: Map },
  { href: '/dobrados', label: 'Dobrados', icon: Handshake },
  { href: '/liderancas', label: 'Pessoas', icon: UsersRound },
  { href: '/revisao', label: 'Revisão', icon: ClipboardCheck },
  { href: '/acessos', label: 'Acessos', icon: ShieldCheck, permission: 'rbac:manage' },
  { href: '/kanban', label: 'Kanban', icon: KanbanSquare, permission: 'tasks:view' },
  { href: '/agenda', label: 'Agenda', icon: CalendarDays, permission: 'calendar:view' },
  { href: '/materiais', label: 'Materiais', icon: Archive, permission: 'materials:view' },
  { href: '/planilha', label: 'Planilha', icon: FileSpreadsheet, permission: 'sheets:view' },
];

export function OpsShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('ea2026-sidebar-collapsed');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    localStorage.setItem('ea2026-sidebar-collapsed', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  const { user, can, logout } = useAuth();
  const active = (href: string) => href === '/' ? location === '/' : location.startsWith(href);
  const visibleNavItems = navItems.filter((item) => !item.permission || can(item.permission));
  const mobilePrimaryHrefs = ['/', '/cobertura', '/kanban', '/agenda'];
  const mobilePrimaryItems = [
    ...mobilePrimaryHrefs
      .map((href) => visibleNavItems.find((item) => item.href === href))
      .filter((item): item is (typeof visibleNavItems)[number] => Boolean(item)),
    ...visibleNavItems.filter((item) => !mobilePrimaryHrefs.includes(item.href)),
  ].slice(0, 4);
  const mobileMoreItems = visibleNavItems.filter((item) => !mobilePrimaryItems.some((primaryItem) => primaryItem.href === item.href));
  const mobileMoreActive = mobileMoreItems.some((item) => active(item.href));

  const compactSidebar = isCollapsed && !open;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex">
      {/* Sidebar Desktop & Mobile Drawer */}
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[268px] flex-col transform bg-sidebar text-sidebar-foreground transition-all duration-300 md:translate-x-0 ${isCollapsed ? 'md:w-[72px]' : 'md:w-[268px]'} ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-20 shrink-0 items-center justify-between px-4 border-b border-sidebar-border">
          {!compactSidebar ? (
            <Link href="/" className="flex items-center gap-3 overflow-hidden" data-testid="link-brand">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground">
                <Map size={18} strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-extrabold tracking-tight truncate">EA 2026</div>
                <div className="mono-label text-sidebar-foreground/55 truncate">sala de operações</div>
              </div>
            </Link>
          ) : (
            <Link href="/" className="flex h-9 w-9 mx-auto items-center justify-center rounded-[10px] bg-sidebar-primary text-sidebar-primary-foreground" data-testid="link-brand-collapsed">
              <Map size={18} strokeWidth={2.5} />
            </Link>
          )}
          <button onClick={() => setOpen(false)} className="rounded-md p-2 text-sidebar-foreground/60 hover:bg-sidebar-accent md:hidden" aria-label="Fechar menu" data-testid="button-close-menu">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 scrollbar-thin">
          {!compactSidebar && <p className="mono-label mb-3 hidden px-3 text-sidebar-foreground/45 md:block">Navegação</p>}
          <nav className="space-y-1">
            {visibleNavItems.map(({ href, label, icon: Icon }) => {
              const isActive = active(href);
              const linkContent = (
                <Link key={href} href={href} onClick={() => setOpen(false)} className={`group flex items-center ${compactSidebar ? 'justify-center px-0' : 'gap-3 px-3'} rounded-lg py-3 text-sm font-semibold transition-colors ${isActive ? 'bg-sidebar-primary text-sidebar-primary-foreground' : 'text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground'}`} data-testid={`link-nav-${label.toLowerCase().replaceAll(' ', '-')}`}>
                  <Icon size={17} strokeWidth={isActive ? 2.5 : 1.8} className="shrink-0" />
                  {!compactSidebar && <span className="truncate">{label}</span>}
                  {isActive && !compactSidebar && <ChevronRight size={14} className="ml-auto shrink-0 opacity-60" />}
                </Link>
              );

              if (compactSidebar) {
                return (
                  <Tooltip key={href} delayDuration={0}>
                    <TooltipTrigger asChild>
                      {linkContent}
                    </TooltipTrigger>
                    <TooltipContent side="right" className="font-bold">{label}</TooltipContent>
                  </Tooltip>
                );
              }
              return linkContent;
            })}
          </nav>
        </div>

        <div className="shrink-0 border-t border-sidebar-border p-4">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="mt-4 hidden w-full items-center justify-center rounded-lg border border-sidebar-border py-2 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground md:flex"
            aria-label={isCollapsed ? "Expandir menu" : "Recolher menu"}
            data-testid="button-toggle-sidebar"
          >
            <ChevronRight size={16} className={`transition-transform duration-300 ${isCollapsed ? '' : 'rotate-180'}`} />
          </button>
        </div>
      </aside>

      {open && <button className="fixed inset-0 z-40 bg-sidebar/45 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu" data-testid="button-menu-overlay" />}

      <div className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${isCollapsed ? 'md:pl-[72px]' : 'md:pl-[268px]'}`}>
        <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-7 lg:px-10">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setOpen(true)} className="shrink-0 rounded-lg p-2 hover:bg-muted md:hidden" aria-label="Abrir menu" data-testid="button-open-menu"><Menu size={21} /></button>
            <div className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex truncate">
              <ShieldCheck size={16} className="text-primary shrink-0" />
              <span className="truncate">Operações de campo</span>
              <span className="text-border shrink-0">/</span>
              <span className="font-semibold text-foreground truncate">{location === '/' ? 'Resumo da campanha' : location.startsWith('/cobertura') ? 'Cobertura territorial' : location.startsWith('/dobrados') ? 'Apoio federal' : location.startsWith('/acessos') ? 'Controle de acesso' : location.startsWith('/kanban') ? 'Tarefas da campanha' : location.startsWith('/agenda') ? 'Agenda da campanha' : location.startsWith('/materiais') ? 'Retirada de material' : location.startsWith('/revisao') ? 'Fila de revisão' : 'Cadastro de pessoas'}</span>
            </div>
            <div className="sm:hidden truncate">
              <div className="text-sm font-extrabold truncate">EA 2026</div>
              <div className="mono-label text-muted-foreground truncate">operações</div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Link href="/liderancas" className="hidden items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-bold text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground md:flex" data-testid="link-quick-search">
              <Search size={14} /> Busca rápida
            </Link>
            <Link href="/perfil" className="hidden text-right md:block hover:opacity-75"><p className="text-xs font-extrabold">{user?.fullName}</p><p className="mono-label text-muted-foreground">{user?.role.replaceAll('_', ' ')}</p></Link>
            <Link href="/perfil" className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground transition hover:opacity-80 shrink-0" title="Meu perfil" aria-label="Meu perfil" data-testid="link-profile">{user?.fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</Link>
            <button onClick={() => void logout()} className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-xs font-extrabold text-primary transition hover:bg-muted shrink-0" title="Sair" aria-label="Sair do sistema" data-testid="button-logout">
              <X size={14} />
            </button>
          </div>
        </header>
        <main className="flex-1 w-full mx-auto max-w-[1440px] px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-7 sm:px-7 lg:px-10 lg:py-10">{children}</main>
      </div>
      {mobileMoreOpen && (
        <button
          className="fixed inset-0 z-30 bg-sidebar/25 md:hidden"
          onClick={() => setMobileMoreOpen(false)}
          aria-label="Fechar mais opções"
          data-testid="button-close-mobile-more"
        />
      )}
      {mobileMoreOpen && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-border bg-card p-2 shadow-2xl md:hidden" role="menu" data-testid="mobile-more-menu">
          <p className="px-3 pb-2 pt-1 text-[10px] font-extrabold uppercase tracking-[.12em] text-muted-foreground">Mais opções</p>
          <div className="grid grid-cols-2 gap-1">
            {mobileMoreItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileMoreOpen(false)}
                className={`flex min-h-12 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ${active(href) ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
                role="menuitem"
                data-testid={`link-mobile-more-${label.toLowerCase().replaceAll(' ', '-')}`}
              >
                <Icon size={17} />
                <span className="truncate">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-border bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 backdrop-blur-md md:hidden" data-testid="mobile-tabbar">
        {mobilePrimaryItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileMoreOpen(false)}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-bold ${active(href) ? 'text-primary' : 'text-muted-foreground'}`}
            data-testid={`link-mobile-${label.toLowerCase().replaceAll(' ', '-')}`}
          >
            <Icon size={18} strokeWidth={active(href) ? 2.5 : 1.8} />
            <span className="max-w-full truncate px-1">{label}</span>
          </Link>
        ))}
        {mobileMoreItems.length > 0 && (
          <button
            onClick={() => setMobileMoreOpen((current) => !current)}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-bold ${mobileMoreActive || mobileMoreOpen ? 'text-primary' : 'text-muted-foreground'}`}
            aria-expanded={mobileMoreOpen}
            aria-label="Mais opções"
            data-testid="button-mobile-more"
          >
            <MoreHorizontal size={18} strokeWidth={mobileMoreActive || mobileMoreOpen ? 2.5 : 1.8} />
            <span>Mais</span>
          </button>
        )}
      </nav>
    </div>
  );
}

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="min-w-0">
        <p className="mono-label mb-2 text-primary">{eyebrow}</p>
        <h1 className="break-words text-[clamp(1.75rem,4vw,2.65rem)] font-extrabold leading-[1.05] tracking-[-.045em]">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action && <div className="w-full lg:w-auto">{action}</div>}
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