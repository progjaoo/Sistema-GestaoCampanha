import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Archive,
  CalendarClock,
  Check,
  CheckSquare,
  CircleUserRound,
  GripVertical,
  History,
  MessageCircle,
  Plus,
  Search,
  RotateCcw,
  Send,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useListCities, useListLeaderships } from "@workspace/api-client-react";
import { authFetch, useAuth } from "@/lib/auth";
import { EmptyState, ErrorState, LoadingRows, OpsShell, PageHeading, StatusPill } from "@/components/ops-shell";
import { confirmWithToast } from "@/lib/confirm-toast";
import { StickyFormActions } from "@/components/mobile-form";
import { formatPhone } from "@/lib/form-utils";
import { useOfflineSnapshot } from "@/lib/connectivity";

type Board = {
  id: number;
  title: string;
  description: string | null;
  cityId: number;
  cityName: string;
  regionName: string;
  archived: boolean;
};

type Task = {
  id: number;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: string | null;
  boardId: number | null;
  boardName: string | null;
  cityId: number | null;
  cityName: string | null;
  regionName: string | null;
  leadershipId: number | null;
  leadershipName: string | null;
  leadershipContact: string | null;
  assigneeUserId: number | null;
  assigneeName: string | null;
};

type BoardDetail = Board & {
  members: Array<{ id: number; fullName: string; email: string; role: string }>;
  taskCount: number;
};

type Member = {
  id: number;
  fullName: string;
  email: string;
  role: string;
  phone: string | null;
};

type ChecklistItem = {
  id: number;
  title: string;
  completed: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
};

type Comment = {
  id: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  userId: number;
  userName: string;
};

type Activity = {
  id: number;
  action: string;
  detail: string | null;
  createdAt: string;
  actorUserId: number;
  actorName: string;
};

type TaskDetail = Task & {
  members: Member[];
  checklist: ChecklistItem[];
  comments: Comment[];
  activity: Activity[];
};

type Recipient = { id: number; name: string | null; role: string; phone: string | null; email: string | null };
type ShareMessage = { id: number; recipientType: "user" | "leadership"; recipientName: string; phone: string; message: string; whatsappUrl: string };
type ShareHistory = { id: number; createdAt: string; createdByName: string; messages: ShareMessage[] };

type MemberOption = Member;

const columns = [
  { key: "todo", label: "A fazer", tone: "bg-slate-400" },
  { key: "in_progress", label: "Em andamento", tone: "bg-sky-500" },
  { key: "blocked", label: "Bloqueadas", tone: "bg-amber-500" },
  { key: "done", label: "Concluídas", tone: "bg-emerald-500" },
] as const;

const statusLabels: Record<string, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  blocked: "Bloqueada",
  done: "Concluída",
};

const priorityLabels: Record<string, string> = {
  low: "Baixa",
  normal: "Normal",
  high: "Alta",
  urgent: "Urgente",
};

const dueLabels: Record<string, string> = {
  overdue: "Atrasadas",
  today: "Para hoje",
  next_7_days: "Próximos 7 dias",
  none: "Sem prazo",
};

type TaskFilters = {
  search: string;
  assignee: string;
  priority: string;
  due: string;
};

const emptyTaskFilters: TaskFilters = { search: "", assignee: "", priority: "", due: "" };

function readTaskFilters(): TaskFilters {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("search") ?? "",
    assignee: params.get("assignee") ?? "",
    priority: params.get("priority") ?? "",
    due: params.get("due") ?? "",
  };
}

function readBoardId(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get("boardId"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function readTaskId(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get("taskId"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

function syncTaskUrl(boardId: number | null, filters: TaskFilters): void {
  const params = new URLSearchParams(window.location.search);
  if (boardId) params.set("boardId", String(boardId));
  else params.delete("boardId");
  if (filters.search.trim()) params.set("search", filters.search.trim());
  else params.delete("search");
  if (filters.assignee) params.set("assignee", filters.assignee);
  else params.delete("assignee");
  if (filters.priority) params.set("priority", filters.priority);
  else params.delete("priority");
  if (filters.due) params.set("due", filters.due);
  else params.delete("due");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Não foi possível concluir a operação.");
  return body as T;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "Sem prazo";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data inválida" : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function dateTimeValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function whatsappUrl(phone: string, task: Task): string | null {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  if (!/^55\d{10,11}$/.test(normalized)) return null;
  const message = [
    `EA 2026 — tarefa: ${task.title}`,
    task.description ? `Detalhes: ${task.description}` : "",
    task.cityName ? `Cidade: ${task.cityName}${task.regionName ? ` / ${task.regionName}` : ""}` : "",
    task.leadershipName ? `Liderança: ${task.leadershipName}` : "",
    task.dueAt ? `Prazo: ${formatDate(task.dueAt)}` : "",
    `Status: ${statusLabels[task.status] ?? task.status}`,
  ].filter(Boolean).join("\n");
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function shareRecipientKey(recipient: Pick<Recipient, "id"> & { type: "user" | "leadership" }): string {
  return `${recipient.type}:${recipient.id}`;
}

function parseShareRecipientKey(value: string): { type: "user" | "leadership"; id: number } | null {
  const [type, rawId] = value.split(":");
  const id = Number(rawId);
  return (type === "user" || type === "leadership") && Number.isInteger(id) && id > 0 ? { type, id } : null;
}

function priorityTone(priority: string): "neutral" | "warning" | "success" | "danger" {
  if (priority === "urgent") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "success";
  return "neutral";
}

export default function TasksPage() {
  const { can, user } = useAuth();
  const cities = useListCities();
  const [showArchived, setShowArchived] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(readBoardId);
  const [filters, setFilters] = useState<TaskFilters>(readTaskFilters);
  const [boardDetail, setBoardDetail] = useState<BoardDetail | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const tasksRequestId = useRef(0);
  const [error, setError] = useState("");
  const [showBoardForm, setShowBoardForm] = useState(false);
  const [editingBoard, setEditingBoard] = useState<Board | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [shareTask, setShareTask] = useState<Task | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<number | null>(null);
  const boardSnapshot = useOfflineSnapshot<Board[]>("task-boards", { userId: user?.id ?? null, archived: showArchived });
  const taskSnapshot = useOfflineSnapshot<Task[]>("tasks", { userId: user?.id ?? null, boardId: selectedBoardId, filters });

  async function loadBoards(nextArchived = showArchived, preferredId?: number | null) {
    setLoadingBoards(true);
    setError("");
    try {
      const nextBoards = await json<Board[]>(await authFetch(`/api/boards?archived=${nextArchived}`));
      setBoards(nextBoards);
      boardSnapshot.saveSnapshot(nextBoards);
      setSelectedBoardId((current) => {
        const wanted = preferredId ?? current;
        return wanted && nextBoards.some((board) => board.id === wanted) ? wanted : (nextBoards[0]?.id ?? null);
      });
    } catch (reason) {
      if (boardSnapshot.data) setBoards(boardSnapshot.data);
      else setError(reason instanceof Error ? reason.message : "Não foi possível carregar os quadros.");
    } finally {
      setLoadingBoards(false);
    }
  }

  async function loadTasks(boardId: number | null, nextFilters = filters) {
    const requestId = ++tasksRequestId.current;
    if (!boardId) {
      setTasks([]);
      setLoadingTasks(false);
      return;
    }
    setLoadingTasks(true);
    try {
      const params = new URLSearchParams({ boardId: String(boardId) });
      if (nextFilters.search.trim()) params.set("search", nextFilters.search.trim());
      if (nextFilters.assignee) params.set("assignee", nextFilters.assignee);
      if (nextFilters.priority) params.set("priority", nextFilters.priority);
      if (nextFilters.due) params.set("due", nextFilters.due);
      const nextTasks = await json<Task[]>(await authFetch(`/api/tasks?${params.toString()}`));
      if (requestId === tasksRequestId.current) {
        setTasks(nextTasks);
        taskSnapshot.saveSnapshot(nextTasks);
        const deepLinkedTaskId = readTaskId();
        if (deepLinkedTaskId && nextTasks.some((task) => task.id === deepLinkedTaskId)) setSelectedTaskId(deepLinkedTaskId);
      }
    } catch (reason) {
      if (requestId === tasksRequestId.current) {
        if (taskSnapshot.data) setTasks(taskSnapshot.data);
        else setError(reason instanceof Error ? reason.message : "Não foi possível carregar as tarefas do quadro.");
      }
    } finally {
      if (requestId === tasksRequestId.current) setLoadingTasks(false);
    }
  }

  async function loadBoardDetail(boardId: number | null) {
    if (!boardId) {
      setBoardDetail(null);
      return;
    }
    try {
      setBoardDetail(await json<BoardDetail>(await authFetch(`/api/boards/${boardId}`)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os detalhes do quadro.");
    }
  }

  useEffect(() => {
    void loadBoards(showArchived);
  }, [showArchived]);

  useEffect(() => {
    void loadTasks(selectedBoardId, filters);
    void loadBoardDetail(selectedBoardId);
  }, [selectedBoardId, filters]);

  useEffect(() => {
    syncTaskUrl(selectedBoardId, filters);
  }, [selectedBoardId, filters]);

  function updateFilters(patch: Partial<TaskFilters>) {
    const nextFilters = { ...filters, ...patch };
    setFilters(nextFilters);
    syncTaskUrl(selectedBoardId, nextFilters);
  }

  function clearFilters() {
    setFilters(emptyTaskFilters);
    syncTaskUrl(selectedBoardId, emptyTaskFilters);
  }

  const assigneeOptions = useMemo(() => {
    const options = new Map<number, string>();
    boardDetail?.members.forEach((member) => options.set(member.id, member.fullName));
    tasks.forEach((task) => {
      if (task.assigneeUserId && task.assigneeName) options.set(task.assigneeUserId, task.assigneeName);
    });
    return Array.from(options, ([id, name]) => ({ id, name })).sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
  }, [boardDetail?.members, tasks]);

  async function updateStatus(task: Task, status: string) {
    if (!can("tasks:update")) return;
    try {
      await json<Task>(await authFetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }));
      await loadTasks(selectedBoardId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a tarefa.");
    }
  }

  async function dropTask(status: string) {
    if (!draggingTaskId) return;
    const task = tasks.find((item) => item.id === draggingTaskId);
    setDraggingTaskId(null);
    if (!task || task.status === status) return;
    await updateStatus(task, status);
  }

  function deleteTask(task: Pick<Task, "id" | "boardId">) {
    if (!can("tasks:delete")) return;
    confirmWithToast({
      title: "Excluir tarefa?",
      description: "Esta tarefa e todos os seus registros serão removidos permanentemente.",
      actionLabel: "Excluir",
      variant: "destructive",
      onConfirm: () => void executeDeleteTask(task),
    });
  }

  async function executeDeleteTask(task: Pick<Task, "id" | "boardId">) {
    try {
      await json(await authFetch(`/api/tasks/${task.id}`, { method: "DELETE" }));
      setSelectedTaskId((current) => current === task.id ? null : current);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      await loadTasks(selectedBoardId);
      await loadBoardDetail(task.boardId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir a tarefa.");
    }
  }

  async function toggleBoardArchived(board: Board) {
    if (!can("boards:archive")) return;
    const action = board.archived ? "restaurar" : "arquivar";
    confirmWithToast({
      title: `${action === "arquivar" ? "Arquivar" : "Restaurar"} quadro?`,
      description: `O quadro “${board.title}” será ${action}do.`,
      actionLabel: action === "arquivar" ? "Arquivar" : "Restaurar",
      onConfirm: async () => {
        try {
          const updated = await json<Board>(await authFetch(`/api/boards/${board.id}/archive`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ archived: !board.archived }),
          }));
          if (!updated.archived) {
            setShowArchived(false);
            await loadBoards(false, updated.id);
            setSelectedBoardId(updated.id);
          } else {
            await loadBoards(false, null);
            setSelectedBoardId(null);
            setTasks([]);
            setBoardDetail(null);
          }
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Não foi possível alterar o estado do quadro.");
        }
      },
    });
  }

  const selectedBoard = boards.find((board) => board.id === selectedBoardId) ?? null;
  const canCreateTask = can("tasks:create") && Boolean(selectedBoard && !selectedBoard.archived);

  useEffect(() => {
    if (canCreateTask && new URLSearchParams(window.location.search).get("create") === "1") {
      setShowTaskForm(true);
    }
  }, [canCreateTask]);

  if (loadingBoards && !boards.length && !boardSnapshot.data) {
    return <OpsShell><PageHeading eyebrow="Operações / kanban" title="Tarefas da campanha" description="Organize frentes de trabalho por território e acompanhe cada entrega." lastUpdatedAt={boardSnapshot.savedAt} /><LoadingRows count={5} /></OpsShell>;
  }

  if (error && !boards.length && !selectedBoardId && !boardSnapshot.data) {
    return <OpsShell><PageHeading eyebrow="Operações / kanban" title="Tarefas da campanha" description="Organize frentes de trabalho por território e acompanhe cada entrega." /><ErrorState label={error} onRetry={() => void loadBoards(showArchived)} /></OpsShell>;
  }

  return <OpsShell>
    <PageHeading
      eyebrow="Operações / kanban"
      title="Tarefas da campanha"
      description="Um quadro por território. Mova o trabalho, registre decisões e mantenha a liderança certa no circuito."
      lastUpdatedAt={taskSnapshot.savedAt ?? boardSnapshot.savedAt}
      stale={Boolean(taskSnapshot.data || boardSnapshot.data) && Boolean(error)}
      action={canCreateTask ? <button onClick={() => setShowTaskForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-xs font-extrabold text-primary-foreground" data-testid="button-create-task"><Plus size={15} /> Nova tarefa</button> : undefined}
    />

    {error && <p className="mb-4 rounded-xl bg-destructive/5 p-3 text-xs font-bold text-destructive" data-testid="status-error">{error}</p>}

    <div className="mb-6 grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between px-2">
          <div>
            <p className="mono-label text-primary">Territórios</p>
            <h2 className="mt-1 text-sm font-extrabold">{showArchived ? "Quadros arquivados" : "Quadros ativos"}</h2>
          </div>
          {can("boards:create") && !showArchived && <button onClick={() => { setEditingBoard(null); setShowBoardForm(true); }} className="rounded-lg bg-secondary p-2 text-primary hover:bg-muted" aria-label="Criar quadro" data-testid="button-create-board"><Plus size={16} /></button>}
        </div>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button onClick={() => setShowArchived(false)} className={`rounded-md px-2 py-2 text-[11px] font-extrabold transition ${!showArchived ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`} data-testid="button-show-active-boards">Ativos</button>
          <button onClick={() => setShowArchived(true)} className={`rounded-md px-2 py-2 text-[11px] font-extrabold transition ${showArchived ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`} data-testid="button-show-archived-boards">Arquivados</button>
        </div>
        {boards.length ? <div className="space-y-1" data-testid="board-list">
           {boards.map((board) => <button key={board.id} onClick={() => { setSelectedBoardId(board.id); syncTaskUrl(board.id, filters); }} className={`w-full rounded-xl border p-3 text-left transition ${selectedBoardId === board.id ? "border-primary/40 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/60"}`} data-testid={`board-item-${board.id}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold" data-testid={`board-title-${board.id}`}>{board.title}</p>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{board.cityName} · {board.regionName}</p>
              </div>
              {board.archived && <Archive size={14} className="shrink-0 text-muted-foreground" />}
            </div>
          </button>)}
        </div> : <div className="rounded-xl border border-dashed border-border p-5 text-center"><Archive size={18} className="mx-auto mb-2 text-muted-foreground" /><p className="text-xs font-bold">Nenhum quadro {showArchived ? "arquivado" : "ativo"}.</p><p className="mt-1 text-[11px] leading-4 text-muted-foreground">{showArchived ? "Quadros arquivados aparecerão aqui." : "Crie o primeiro quadro para começar."}</p></div>}
      </aside>

      <section className="min-w-0">
        {selectedBoard ? <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <StatusPill tone={selectedBoard.archived ? "warning" : "success"}>{selectedBoard.archived ? "Arquivado" : "Ativo"}</StatusPill>
              <span className="mono-label text-muted-foreground">{selectedBoard.cityName} · {selectedBoard.regionName}</span>
            </div>
            <h2 className="truncate text-xl font-extrabold tracking-tight" data-testid={`selected-board-title-${selectedBoard.id}`}>{selectedBoard.title}</h2>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{selectedBoard.description || "Sem descrição para este quadro."}</p>
            {boardDetail && <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><CheckSquare size={13} /> {boardDetail.taskCount} tarefa{boardDetail.taskCount === 1 ? "" : "s"}</span><span className="inline-flex items-center gap-1.5"><UsersRound size={13} /> {boardDetail.members.length} membro{boardDetail.members.length === 1 ? "" : "s"}</span></div>}
          </div>
           <div className="flex w-full flex-wrap gap-2 sm:w-auto">
             {can("boards:update") && !selectedBoard.archived && <button onClick={() => { setEditingBoard(selectedBoard); setShowBoardForm(true); }} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-extrabold hover:bg-muted sm:flex-none" data-testid={`button-edit-board-${selectedBoard.id}`}><SlidersHorizontal size={13} /> Editar</button>}
             {can("boards:archive") && <button onClick={() => void toggleBoardArchived(selectedBoard)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-extrabold hover:bg-muted sm:flex-none" data-testid={`button-toggle-board-${selectedBoard.id}`}>{selectedBoard.archived ? <RotateCcw size={13} /> : <Archive size={13} />}{selectedBoard.archived ? "Restaurar" : "Arquivar"}</button>}
          </div>
        </div> : <EmptyState title={showArchived ? "Escolha um quadro arquivado" : "Crie ou selecione um quadro"} detail={showArchived ? "Selecione um quadro para consultar suas tarefas." : "Os quadros separam a operação por cidade e região."} />}

        {selectedBoard && <div className="mb-4 rounded-2xl border border-border bg-card p-4 shadow-sm" data-testid="task-filters">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="mono-label text-primary">Encontrar tarefa</p>
              <p className="mt-1 text-xs text-muted-foreground">Combine os filtros para reduzir o quadro sem trocar de território.</p>
            </div>
            {(filters.search || filters.assignee || filters.priority || filters.due) && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[11px] font-extrabold hover:bg-muted" data-testid="button-clear-task-filters"><X size={13} /> Limpar filtros</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="relative block sm:col-span-2 xl:col-span-1">
              <span className="sr-only">Buscar tarefas</span>
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={filters.search} onChange={(event) => updateFilters({ search: event.target.value })} placeholder="Buscar por texto…" className="field pl-9" data-testid="input-task-search" />
            </label>
            <label>
              <span className="sr-only">Responsável</span>
              <select value={filters.assignee} onChange={(event) => updateFilters({ assignee: event.target.value })} className="field" data-testid="select-task-filter-assignee">
                <option value="">Todos os responsáveis</option>
                <option value="none">Sem responsável</option>
                {assigneeOptions.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Prioridade</span>
              <select value={filters.priority} onChange={(event) => updateFilters({ priority: event.target.value })} className="field" data-testid="select-task-filter-priority">
                <option value="">Todas as prioridades</option>
                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span className="sr-only">Prazo</span>
              <select value={filters.due} onChange={(event) => updateFilters({ due: event.target.value })} className="field" data-testid="select-task-filter-due">
                <option value="">Todos os prazos</option>
                {Object.entries(dueLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          {(filters.search || filters.assignee || filters.priority || filters.due) && <p className="mt-3 text-[11px] font-bold text-muted-foreground" data-testid="task-filter-summary">{tasks.length} tarefa{tasks.length === 1 ? "" : "s"} encontrada{tasks.length === 1 ? "" : "s"}</p>}
        </div>}

        {selectedBoard && <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory sm:grid sm:snap-none sm:grid-cols-2 xl:grid-cols-4">
          {columns.map((column) => {
            const items = tasks.filter((task) => task.status === column.key);
            return <section key={column.key} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropTask(column.key)} className={`min-h-[430px] w-[85vw] shrink-0 snap-center sm:w-auto rounded-2xl border border-border bg-muted/20 p-3 transition ${draggingTaskId ? "ring-1 ring-primary/20" : ""}`} data-testid={`kanban-column-${column.key}`}>
              <div className="mb-3 flex items-center justify-between px-2"><div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${column.tone}`} /><h2 className="text-sm font-extrabold">{column.label}</h2></div><span className="font-mono text-xs text-muted-foreground" data-testid={`column-count-${column.key}`}>{items.length}</span></div>
              <div className="min-h-[370px] space-y-3">
                 {loadingTasks ? <LoadingRows count={2} /> : items.length ? items.map((task) => <TaskCard key={task.id} task={task} canUpdate={can("tasks:update")} canDelete={can("tasks:delete")} canShare={can("tasks:share")} dragging={draggingTaskId === task.id} onOpen={() => setSelectedTaskId(task.id)} onDragStart={() => setDraggingTaskId(task.id)} onDragEnd={() => setDraggingTaskId(null)} onStatusChange={(status) => void updateStatus(task, status)} onDelete={() => void deleteTask(task)} onShare={() => setShareTask(task)} />) : <div className="flex min-h-[240px] items-center justify-center rounded-xl border border-dashed border-border/80 p-6 text-center text-xs text-muted-foreground">Nenhuma tarefa nesta etapa.</div>}
              </div>
            </section>;
          })}
        </div>}
      </section>
    </div>

    {showBoardForm && <BoardFormDialog board={editingBoard} cities={cities.data ?? []} onClose={() => setShowBoardForm(false)} onSaved={async (saved) => { setShowBoardForm(false); await loadBoards(false, saved.id); setShowArchived(false); setSelectedBoardId(saved.id); }} />}
    {showTaskForm && selectedBoard && <CreateTaskDialog board={selectedBoard} cities={cities.data ?? []} onClose={() => setShowTaskForm(false)} onCreated={async (task) => { setShowTaskForm(false); setSelectedTaskId(task.id); await loadTasks(selectedBoard.id); await loadBoardDetail(selectedBoard.id); }} />}
    {selectedTaskId && <TaskDetailDialog taskId={selectedTaskId} boards={boards} onClose={() => setSelectedTaskId(null)} onChanged={async (task) => { await loadTasks(task.boardId); await loadBoardDetail(task.boardId); if (task.boardId !== selectedBoardId) setSelectedBoardId(task.boardId); }} onDelete={(task) => void deleteTask(task)} onShare={(task) => setShareTask(task)} />}
    {shareTask && <ShareTaskDialog task={shareTask} onClose={() => setShareTask(null)} />}
  </OpsShell>;
}

function TaskCard({ task, canUpdate, canDelete, canShare, dragging, onOpen, onDragStart, onDragEnd, onStatusChange, onDelete, onShare }: { task: Task; canUpdate: boolean; canDelete: boolean; canShare: boolean; dragging: boolean; onOpen: () => void; onDragStart: () => void; onDragEnd: () => void; onStatusChange: (status: string) => void; onDelete: () => void; onShare: () => void }) {
  return <article draggable={canUpdate} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`cursor-grab rounded-xl border border-border bg-card p-4 shadow-sm transition active:cursor-grabbing ${dragging ? "rotate-1 opacity-50" : ""}`} data-testid={`task-card-${task.id}`}>
    <button onClick={onOpen} className="block w-full text-left" data-testid={`button-open-task-${task.id}`}>
      <div className="flex items-start justify-between gap-2"><div className="flex items-center gap-2"><GripVertical size={15} className="text-muted-foreground" /><StatusPill tone={priorityTone(task.priority)}>{priorityLabels[task.priority] ?? task.priority}</StatusPill></div><span className="font-mono text-[10px] text-muted-foreground">#{task.id}</span></div>
      <h3 className="mt-3 text-sm font-extrabold leading-5">{task.title}</h3>
      {task.description && <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">{task.description}</p>}
      <div className="mt-4 space-y-2 border-t border-border pt-3 text-[11px] text-muted-foreground">{task.cityName && <div className="font-bold text-foreground">{task.cityName}{task.regionName ? <span className="font-normal text-muted-foreground"> · {task.regionName}</span> : null}</div>}{task.leadershipName && <div className="flex items-center gap-1.5"><CircleUserRound size={12} />{task.leadershipName}{task.leadershipContact ? <span className="text-emerald-700">· {task.leadershipContact}</span> : <span className="text-amber-700">· sem telefone</span>}</div>}{task.assigneeName && <div className="flex items-center gap-1.5"><UsersRound size={12} />Responsável: {task.assigneeName}</div>}{task.dueAt && <div className="flex items-center gap-1.5"><CalendarClock size={12} />{formatDate(task.dueAt)}</div>}</div>
    </button>
      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">{canUpdate && <select value={task.status} onChange={(event) => onStatusChange(event.target.value)} onClick={(event) => event.stopPropagation()} className="h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-[10px] font-bold sm:h-8 sm:flex-1" aria-label={`Status da tarefa ${task.title}`} data-testid={`select-task-status-${task.id}`}><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="done">Concluída</option></select>}<div className="grid grid-cols-2 gap-2 sm:contents">{canShare && <button onClick={onShare} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-extrabold text-emerald-800 sm:h-8" title="Enviar pelo WhatsApp pessoal" data-testid={`button-share-task-${task.id}`}><MessageCircle size={13} /> Enviar</button>}{canDelete && <button onClick={onDelete} className="inline-flex h-9 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 text-[10px] font-extrabold text-red-700 sm:h-8" title="Excluir tarefa" data-testid={`button-delete-task-${task.id}`}><Trash2 size={13} /> Excluir</button>}</div></div>
  </article>;
}

function BoardFormDialog({ board, cities, onClose, onSaved }: { board: Board | null; cities: Array<{ id: number; name: string; regionName: string }>; onClose: () => void; onSaved: (board: Board) => Promise<void> }) {
  const [title, setTitle] = useState(board?.title ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [cityId, setCityId] = useState(String(board?.cityId ?? ""));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await authFetch(board ? `/api/boards/${board.id}` : "/api/boards", { method: board ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(board ? { title, description } : { title, description, cityId: Number(cityId) }) });
      await onSaved(await json<Board>(response));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar o quadro.");
    } finally {
      setSaving(false);
    }
  }
  return <ModalShell title={board ? "Editar quadro" : "Novo quadro"} eyebrow="Organização territorial" onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <FieldLabel label="Nome do quadro"><input required value={title} onChange={(event) => setTitle(event.target.value)} className="field" data-testid="input-board-title" /></FieldLabel>
      <FieldLabel label="Descrição"><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="input-board-description" /></FieldLabel>
      {!board && <FieldLabel label="Cidade"><select required value={cityId} onChange={(event) => setCityId(event.target.value)} className="field" data-testid="select-board-city"><option value="">Selecione uma cidade</option>{cities.map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></FieldLabel>}
      {error && <p className="rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive" data-testid="board-form-error">{error}</p>}
      <StickyFormActions><button disabled={saving || !title.trim() || (!board && !cityId)} className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60" data-testid="button-save-board">{saving ? "Salvando…" : board ? "Salvar alterações" : "Criar quadro"}</button></StickyFormActions>
    </form>
  </ModalShell>;
}

function CreateTaskDialog({ board, cities, onClose, onCreated }: { board: Board; cities: Array<{ id: number; name: string; regionName: string }>; onClose: () => void; onCreated: (task: Task) => Promise<void> }) {
  const [form, setForm] = useState({ title: "", description: "", cityId: String(board.cityId), leadershipId: "", leadershipPhone: "", priority: "normal", dueAt: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const leaderships = useListLeaderships({ cityId: form.cityId ? Number(form.cityId) : undefined, page: 1, pageSize: 100 });
  const selectedLeadership = leaderships.data?.items.find((leadership) => leadership.id === Number(form.leadershipId));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const task = await json<Task>(await authFetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: form.title, description: form.description, boardId: board.id, cityId: Number(form.cityId), leadershipId: Number(form.leadershipId), leadershipPhone: form.leadershipPhone || null, priority: form.priority, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null }) }));
      await onCreated(task);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a tarefa.");
    } finally {
      setSaving(false);
    }
  }
  return <ModalShell title="Criar tarefa" eyebrow={`Novo trabalho / ${board.title}`} onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <FieldLabel label="Título"><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="field" data-testid="input-task-title" /></FieldLabel>
      <FieldLabel label="Detalhes"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="input-task-description" /></FieldLabel>
      <div className="grid gap-4 sm:grid-cols-2"><FieldLabel label="Cidade"><select required value={form.cityId} onChange={(event) => setForm({ ...form, cityId: event.target.value, leadershipId: "", leadershipPhone: "" })} className="field" data-testid="select-task-city">{cities.filter((city) => city.id === board.cityId).map((city) => <option key={city.id} value={city.id}>{city.name} · {city.regionName}</option>)}</select></FieldLabel><FieldLabel label="Prioridade"><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="field" data-testid="select-task-priority"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></FieldLabel></div>
      <FieldLabel label="Liderança responsável"><select required disabled={!form.cityId || leaderships.isLoading} value={form.leadershipId} onChange={(event) => setForm({ ...form, leadershipId: event.target.value, leadershipPhone: "" })} className="field" data-testid="select-task-leadership"><option value="">{leaderships.isLoading ? "Carregando lideranças…" : "Selecione a liderança"}</option>{(leaderships.data?.items ?? []).map((leadership) => <option key={leadership.id} value={leadership.id}>{leadership.name} · {leadership.leadershipContact || "sem telefone"}</option>)}</select></FieldLabel>
       {selectedLeadership && !selectedLeadership.leadershipContact && <label className="block rounded-xl border border-amber-200 bg-amber-50 p-3"><span className="mb-1.5 block text-xs font-extrabold text-amber-900">Telefone do responsável</span><p className="mb-2 text-[11px] leading-4 text-amber-800">Cadastre um telefone com DDD para habilitar o envio manual pelo WhatsApp.</p><input required type="tel" inputMode="tel" value={form.leadershipPhone} onChange={(event) => setForm({ ...form, leadershipPhone: formatPhone(event.target.value) })} placeholder="(00) 00000-0000" className="h-10 w-full rounded-lg border border-amber-300 bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-amber-400" data-testid="input-task-leadership-phone" /></label>}
      <FieldLabel label="Prazo"><input type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className="field" data-testid="input-task-due-at" /></FieldLabel>
      {error && <p className="rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive" data-testid="task-form-error">{error}</p>}
       <StickyFormActions><button disabled={saving || !form.leadershipId} className="flex h-11 w-full items-center justify-center rounded-lg bg-primary text-sm font-extrabold text-primary-foreground disabled:opacity-60" data-testid="button-save-task">{saving ? "Salvando…" : "Criar tarefa"}</button></StickyFormActions>
    </form>
  </ModalShell>;
}

function TaskDetailDialog({ taskId, boards, onClose, onChanged, onDelete, onShare }: { taskId: number; boards: Board[]; onClose: () => void; onChanged: (task: Task) => Promise<void>; onDelete: (task: Pick<Task, "id" | "boardId">) => void; onShare: (task: Task) => void }) {
  const { can } = useAuth();
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [checklistTitle, setChecklistTitle] = useState("");
  const [comment, setComment] = useState("");
  const [memberId, setMemberId] = useState("");
  const [form, setForm] = useState({ title: "", description: "", status: "todo", priority: "normal", dueAt: "", assigneeUserId: "", boardId: "" });

  async function loadDetail() {
    setLoading(true);
    setError("");
    try {
      const next = await json<TaskDetail>(await authFetch(`/api/tasks/${taskId}`));
      setDetail(next);
      setForm({ title: next.title, description: next.description ?? "", status: next.status, priority: next.priority, dueAt: dateTimeValue(next.dueAt), assigneeUserId: next.assigneeUserId ? String(next.assigneeUserId) : "", boardId: next.boardId ? String(next.boardId) : "" });
      if (can("tasks:collaborate")) setMemberOptions(await json<MemberOption[]>(await authFetch(`/api/tasks/${taskId}/members/options`)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar a tarefa.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDetail();
  }, [taskId]);

  async function updateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !can("tasks:update")) return;
    setSaving(true);
    setError("");
    try {
      const currentBoardId = detail.boardId ? String(detail.boardId) : "";
      const updates = { title: form.title, description: form.description, status: form.status, priority: form.priority, dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null, assigneeUserId: form.assigneeUserId ? Number(form.assigneeUserId) : null, ...(form.boardId !== currentBoardId ? { boardId: form.boardId ? Number(form.boardId) : null } : {}) };
      const updated = await json<Task>(await authFetch(`/api/tasks/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) }));
      setDetail((current) => current ? { ...current, ...updated } : current);
      await onChanged(updated);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a tarefa.");
    } finally {
      setSaving(false);
    }
  }

  async function collaborate(path: string, init: RequestInit) {
    try {
      await json<unknown>(await authFetch(path, init));
      await loadDetail();
      if (detail) await onChanged(detail);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a colaboração.");
    }
  }

  async function addMember() {
    if (!memberId || !can("tasks:collaborate")) return;
    await collaborate(`/api/tasks/${taskId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: Number(memberId) }) });
    setMemberId("");
  }

  async function addChecklist(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!checklistTitle.trim() || !can("tasks:collaborate")) return;
    await collaborate(`/api/tasks/${taskId}/checklist`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: checklistTitle.trim() }) });
    setChecklistTitle("");
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!comment.trim() || !can("tasks:collaborate")) return;
    await collaborate(`/api/tasks/${taskId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: comment.trim() }) });
    setComment("");
  }

  const availableMembers = useMemo(() => memberOptions.filter((option) => !detail?.members.some((member) => member.id === option.id)), [detail?.members, memberOptions]);
  const assigneeOptions = useMemo(() => {
    if (!detail) return [];
    const options = memberOptions.length ? memberOptions : detail.members;
    if (detail.assigneeUserId && detail.assigneeName && !options.some((option) => option.id === detail.assigneeUserId)) {
      return [...options, { id: detail.assigneeUserId, fullName: detail.assigneeName, email: "", role: "responsável", phone: null }];
    }
    return options;
  }, [detail, memberOptions]);
  if (loading) return <ModalShell title="Detalhes da tarefa" eyebrow="Carregando" onClose={onClose}><LoadingRows count={5} /></ModalShell>;
  if (!detail) return <ModalShell title="Detalhes da tarefa" eyebrow="Erro" onClose={onClose}><ErrorState label={error || "Tarefa não encontrada."} onRetry={() => void loadDetail()} /></ModalShell>;

  return <ModalShell title={detail.title} eyebrow={`Tarefa #${detail.id} / ${detail.cityName ?? "Sem cidade"}`} onClose={onClose} wide>
    {error && <p className="mb-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive" data-testid="detail-error">{error}</p>}
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)]">
      <div className="space-y-5">
        <form onSubmit={updateTask} className="space-y-4 rounded-xl border border-border bg-background/50 p-4">
           <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="mono-label text-primary">Campos da operação</p><p className="mt-1 text-xs text-muted-foreground">Atualize a tarefa sem sair do quadro.</p></div><div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{can("tasks:share") && <button type="button" onClick={() => onShare(detail)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-extrabold text-emerald-800 sm:flex-none" data-testid={`button-detail-share-${detail.id}`}><Send size={13} /> Compartilhar</button>}{can("tasks:delete") && <button type="button" onClick={() => onDelete(detail)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-extrabold text-red-700 sm:flex-none" data-testid={`button-detail-delete-${detail.id}`}><Trash2 size={13} /> Excluir</button>}</div></div>
          <FieldLabel label="Título"><input disabled={!can("tasks:update")} required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="field" data-testid="input-detail-title" /></FieldLabel>
          <FieldLabel label="Descrição"><textarea disabled={!can("tasks:update")} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring" data-testid="input-detail-description" /></FieldLabel>
          <div className="grid gap-4 sm:grid-cols-2"><FieldLabel label="Status"><select disabled={!can("tasks:update")} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="field" data-testid="select-detail-status"><option value="todo">A fazer</option><option value="in_progress">Em andamento</option><option value="blocked">Bloqueada</option><option value="done">Concluída</option></select></FieldLabel><FieldLabel label="Prioridade"><select disabled={!can("tasks:update")} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="field" data-testid="select-detail-priority"><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></FieldLabel></div>
          <div className="grid gap-4 sm:grid-cols-2"><FieldLabel label="Quadro"><select disabled={!can("tasks:update")} value={form.boardId} onChange={(event) => setForm({ ...form, boardId: event.target.value })} className="field" data-testid="select-detail-board"><option value="">Sem quadro</option>{boards.filter((board) => board.cityId === detail.cityId).map((board) => <option key={board.id} value={board.id}>{board.title}{board.archived ? " · arquivado" : ""}</option>)}</select></FieldLabel><FieldLabel label="Prazo"><input disabled={!can("tasks:update")} type="datetime-local" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} className="field" data-testid="input-detail-due-at" /></FieldLabel></div>
          <FieldLabel label="Responsável"><select disabled={!can("tasks:update")} value={form.assigneeUserId} onChange={(event) => setForm({ ...form, assigneeUserId: event.target.value })} className="field" data-testid="select-detail-assignee"><option value="">Sem responsável</option>{assigneeOptions.map((member) => <option key={member.id} value={member.id}>{member.fullName} · {member.role.replaceAll("_", " ")}</option>)}</select></FieldLabel>
          {can("tasks:update") && <button disabled={saving} className="flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-xs font-extrabold text-primary-foreground disabled:opacity-60" data-testid="button-save-task-detail">{saving ? "Salvando…" : "Salvar campos"}</button>}
        </form>

        <section className="rounded-xl border border-border bg-background/50 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="mono-label text-primary">Checklist</p><p className="mt-1 text-xs text-muted-foreground">{detail.checklist.filter((item) => item.completed).length} de {detail.checklist.length} concluídos</p></div><CheckSquare size={17} className="text-primary" /></div>{detail.checklist.length ? <div className="space-y-2">{detail.checklist.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5" data-testid={`checklist-item-${item.id}`}><button disabled={!can("tasks:collaborate")} onClick={() => void collaborate(`/api/tasks/${taskId}/checklist/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completed: !item.completed }) })} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${item.completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-input bg-background"}`} aria-label={item.completed ? `Reabrir ${item.title}` : `Concluir ${item.title}`} data-testid={`button-toggle-checklist-${item.id}`}>{item.completed && <Check size={13} />}</button><span className={`min-w-0 flex-1 text-xs ${item.completed ? "text-muted-foreground line-through" : "font-semibold"}`}>{item.title}</span>{can("tasks:collaborate") && <button onClick={() => void collaborate(`/api/tasks/${taskId}/checklist/${item.id}`, { method: "DELETE" })} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Excluir ${item.title}`} data-testid={`button-delete-checklist-${item.id}`}><Trash2 size={13} /></button>}</div>)}</div> : <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Nenhum item adicionado.</p>}{can("tasks:collaborate") && <form onSubmit={addChecklist} className="mt-3 flex gap-2"><input value={checklistTitle} onChange={(event) => setChecklistTitle(event.target.value)} placeholder="Adicionar item" className="field" data-testid="input-checklist-title" /><button disabled={!checklistTitle.trim()} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-extrabold text-secondary-foreground disabled:opacity-50" data-testid="button-add-checklist"><Plus size={14} /> Adicionar</button></form>}</section>

        <section className="rounded-xl border border-border bg-background/50 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="mono-label text-primary">Comentários</p><p className="mt-1 text-xs text-muted-foreground">Registre decisões e próximos passos.</p></div><MessageCircle size={17} className="text-primary" /></div>{detail.comments.length ? <div className="space-y-3">{detail.comments.map((item) => <div key={item.id} className="rounded-lg border border-border p-3" data-testid={`comment-${item.id}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-extrabold">{item.userName}</span><span className="text-[10px] text-muted-foreground">{formatDate(item.createdAt)}</span></div><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{item.body}</p></div>)}</div> : <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Ainda não há comentários nesta tarefa.</p>}{can("tasks:collaborate") && <form onSubmit={addComment} className="mt-3 space-y-2"><textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Escreva uma atualização para a equipe…" className="min-h-20 w-full rounded-lg border border-input bg-background p-3 text-xs outline-none focus:ring-2 focus:ring-ring" data-testid="input-task-comment" /><button disabled={!comment.trim()} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-extrabold text-secondary-foreground disabled:opacity-50" data-testid="button-add-comment"><MessageCircle size={14} /> Comentar</button></form>}</section>
      </div>

      <div className="space-y-5">
        <section className="rounded-xl border border-border bg-background/50 p-4"><div className="mb-4 flex items-center justify-between"><div><p className="mono-label text-primary">Colaboração</p><p className="mt-1 text-xs text-muted-foreground">{detail.members.length} membro{detail.members.length === 1 ? "" : "s"} na tarefa</p></div><UsersRound size={17} className="text-primary" /></div>{detail.members.length ? <div className="space-y-2">{detail.members.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-lg border border-border p-2.5" data-testid={`task-member-${member.id}`}><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-extrabold text-primary">{member.fullName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-extrabold">{member.fullName}</p><p className="truncate text-[10px] text-muted-foreground">{member.role.replaceAll("_", " ")}</p></div>{can("tasks:collaborate") && <button onClick={() => void collaborate(`/api/tasks/${taskId}/members/${member.id}`, { method: "DELETE" })} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Remover ${member.fullName}`} data-testid={`button-remove-member-${member.id}`}><X size={14} /></button>}</div>)}</div> : <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Nenhum membro adicionado.</p>}{can("tasks:collaborate") && <div className="mt-3 flex gap-2"><select value={memberId} onChange={(event) => setMemberId(event.target.value)} className="field" data-testid="select-add-member"><option value="">Adicionar membro</option>{availableMembers.map((member) => <option key={member.id} value={member.id}>{member.fullName} · {member.role.replaceAll("_", " ")}</option>)}</select><button onClick={() => void addMember()} disabled={!memberId} className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-secondary px-3 text-xs font-extrabold text-secondary-foreground disabled:opacity-50" data-testid="button-add-member"><UserPlus size={14} /> Adicionar</button></div>}</section>

        <section className="rounded-xl border border-border bg-background/50 p-4"><div className="mb-4 flex items-center gap-2"><History size={17} className="text-primary" /><div><p className="mono-label text-primary">Histórico</p><p className="mt-1 text-xs text-muted-foreground">Atividade registrada no servidor.</p></div></div>{detail.activity.length ? <div className="space-y-3 border-l border-border pl-4">{detail.activity.map((item) => <div key={item.id} className="relative" data-testid={`activity-${item.id}`}><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" /><p className="text-xs font-bold">{item.actorName}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{item.detail || item.action.replaceAll("_", " ")} · {formatDate(item.createdAt)}</p></div>)}</div> : <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Nenhuma atividade registrada.</p>}</section>

        <section className="rounded-xl border border-border bg-primary/[.04] p-4 text-xs"><p className="mono-label text-primary">Contexto territorial</p><div className="mt-3 space-y-2 text-muted-foreground"><p><span className="font-bold text-foreground">Cidade:</span> {detail.cityName || "Não informada"}</p><p><span className="font-bold text-foreground">Liderança:</span> {detail.leadershipName || "Não informada"}</p><p><span className="font-bold text-foreground">Contato:</span> {detail.leadershipContact || "Sem telefone"}</p><p><span className="font-bold text-foreground">Prazo:</span> {formatDate(detail.dueAt)}</p></div></section>
      </div>
    </div>
  </ModalShell>;
}

function ShareTaskDialog({ task, onClose }: { task: Task; onClose: () => void }) {
  const [recipients, setRecipients] = useState<Array<Recipient & { type: "user" | "leadership" }>>([]);
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
      const [nextRecipients, nextHistory] = await Promise.all([
        json<Array<Recipient & { type: "user" | "leadership" }>>(await authFetch(`/api/tasks/${task.id}/recipients`)),
        json<ShareHistory[]>(await authFetch(`/api/tasks/${task.id}/share-preparations`)),
      ]);
      setRecipients(nextRecipients);
      setSelected(nextRecipients.map(shareRecipientKey));
      setHistory(nextHistory);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os destinatários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [task.id]);

  function toggleRecipient(key: string) {
    setSelected((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  async function prepareMessages() {
    const parsed = selected.map(parseShareRecipientKey).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (!parsed.length) return;
    setPreparing(true);
    setError("");
    try {
      const response = await json<{ messages: ShareMessage[] }>(await authFetch(`/api/tasks/${task.id}/share-preparations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients: parsed }),
      }));
      setPrepared(response.messages);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível preparar as mensagens.");
    } finally {
      setPreparing(false);
    }
  }

  return <ModalShell title="Enviar tarefa" eyebrow="Compartilhamento manual" onClose={onClose} wide>
    <p className="mb-5 text-xs leading-5 text-muted-foreground">Selecione os destinatários. O sistema registra a preparação e abre uma mensagem individual por pessoa; o envio só acontece quando você confirma no WhatsApp.</p>
    {error && <p className="mb-4 rounded-lg bg-destructive/5 p-3 text-xs font-bold text-destructive" data-testid="share-task-error">{error}</p>}
    {loading ? <LoadingRows count={3} /> : recipients.length ? <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.8fr)]">
      <div>
        <div className="mb-3 flex items-center justify-between gap-3"><div><p className="mono-label text-primary">Destinatários</p><p className="mt-1 text-xs text-muted-foreground">{selected.length} de {recipients.length} selecionados</p></div><button onClick={() => setSelected(selected.length === recipients.length ? [] : recipients.map(shareRecipientKey))} className="text-[11px] font-extrabold text-primary">{selected.length === recipients.length ? "Desmarcar todos" : "Selecionar todos"}</button></div>
        <div className="space-y-2" data-testid="recipient-list">{recipients.map((recipient) => { const key = shareRecipientKey(recipient); return <label key={key} className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 hover:bg-muted/50" data-testid={`recipient-${recipient.type}-${recipient.id}`}><input type="checkbox" checked={selected.includes(key)} onChange={() => toggleRecipient(key)} className="h-4 w-4 accent-primary" /><div className="min-w-0"><p className="truncate text-xs font-extrabold">{recipient.name}</p><p className="text-[10px] text-muted-foreground">{recipient.role.replaceAll("_", " ")} · {recipient.phone}</p></div></label>; })}</div>
        <button onClick={() => void prepareMessages()} disabled={preparing || !selected.length} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-xs font-extrabold text-white disabled:opacity-50" data-testid="button-prepare-task-share"><Send size={14} /> {preparing ? "Preparando mensagens…" : `Preparar ${selected.length} mensagem${selected.length === 1 ? "" : "s"}`}</button>
      </div>
      <div className="space-y-4">
        {prepared.length > 0 && <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="mono-label text-emerald-800">Mensagens preparadas</p><p className="mt-1 text-xs leading-5 text-emerald-900">Abra cada conversa e confirme o envio no WhatsApp.</p><div className="mt-3 space-y-2">{prepared.map((message) => <div key={message.id} className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-white p-2.5"><span className="truncate text-xs font-bold">{message.recipientName}</span><a href={message.whatsappUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-extrabold text-white" data-testid={`link-prepared-whatsapp-${message.id}`}><MessageCircle size={13} /> Abrir</a></div>)}</div></section>}
        <section className="rounded-xl border border-border bg-background/50 p-4"><div className="mb-3 flex items-center gap-2"><History size={16} className="text-primary" /><div><p className="mono-label text-primary">Histórico de preparações</p><p className="mt-1 text-[11px] text-muted-foreground">Quem iniciou e para quem a mensagem foi preparada.</p></div></div>{history.length ? <div className="space-y-3">{history.map((batch) => <div key={batch.id} className="rounded-lg border border-border p-3"><p className="text-[11px] font-extrabold">{batch.createdByName}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDate(batch.createdAt)} · {batch.messages.length} destinatário{batch.messages.length === 1 ? "" : "s"}</p><div className="mt-2 flex flex-wrap gap-1">{batch.messages.map((message) => <span key={message.id} className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{message.recipientName}</span>)}</div></div>)}</div> : <p className="rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">Nenhuma preparação registrada.</p>}</section>
      </div>
    </div> : <div className="rounded-xl bg-muted p-4 text-xs text-muted-foreground" data-testid="empty-recipients">Nenhum contato com telefone foi encontrado dentro do território da tarefa.</div>}
    <button onClick={onClose} className="mt-5 flex h-10 w-full items-center justify-center rounded-lg border border-border text-xs font-extrabold hover:bg-muted" data-testid="button-close-share">Fechar</button>
  </ModalShell>;
}

function ModalShell({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/35 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true"><section className={`max-h-[94dvh] w-full overflow-y-auto rounded-t-2xl bg-card p-4 shadow-2xl sm:rounded-2xl sm:p-6 ${wide ? "max-w-6xl" : "max-w-lg"}`}><div className="mb-5 flex items-start justify-between gap-3 sm:mb-6 sm:gap-4"><div className="min-w-0"><p className="mono-label text-primary">{eyebrow}</p><h2 className="mt-1 break-words text-lg font-extrabold tracking-tight sm:text-xl" data-testid="modal-title">{title}</h2></div><button type="button" onClick={onClose} className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Fechar" data-testid="button-close-modal"><X size={18} /></button></div>{children}</section></div>;
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-bold">{label}</span>{children}</label>;
}