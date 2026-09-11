import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import OverviewPage from '@/pages/overview';
import LeadershipsPage from '@/pages/leaderships';
import LeadershipDetailPage from '@/pages/leadership-detail';
import ReviewPage from '@/pages/review';
import CoveragePage from '@/pages/coverage';
import DeputiesPage from '@/pages/deputies';
import LoginPage from '@/pages/login';
import AccessControlPage from '@/pages/access-control';
import TasksPage from '@/pages/tasks';
import AgendaPage from '@/pages/agenda';
import ProfilePage from '@/pages/profile';
import SharedAgendaPage from '@/pages/shared-agenda';
import SheetsPage from '@/pages/sheets';
import MaterialWithdrawalsPage from '@/pages/material-withdrawals';
import { AuthProvider, useAuth } from '@/lib/auth';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={OverviewPage} />
        <Route path="/cobertura" component={CoveragePage} />
        <Route path="/dobrados" component={DeputiesPage} />
        <Route path="/liderancas" component={LeadershipsPage} />
        <Route path="/liderancas/:id" component={LeadershipDetailPage} />
        <Route path="/revisao" component={ReviewPage} />
        <Route path="/acessos" component={AccessControlPage} />
        <Route path="/kanban" component={TasksPage} />
        <Route path="/agenda" component={AgendaPage} />
        <Route path="/materiais" component={MaterialWithdrawalsPage} />
        <Route path="/planilha" component={SheetsPage} />
        <Route path="/perfil" component={ProfilePage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  if (window.location.pathname.includes('/agenda/compartilhada/')) {
    return <SharedAgendaPage />;
  }
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <AuthenticatedApp />
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AuthenticatedApp() {
  const { isLoading, isAuthenticated } = useAuth();
  if (isLoading) {
    return <div className="flex min-h-[100dvh] items-center justify-center bg-background text-sm font-bold text-muted-foreground">Carregando acesso…</div>;
  }
  if (!isAuthenticated) return <LoginPage />;
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter>;
}

export default App;
