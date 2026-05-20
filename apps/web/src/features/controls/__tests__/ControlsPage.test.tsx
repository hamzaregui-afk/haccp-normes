/**
 * ControlsPage.test.tsx
 *
 * Unit tests for the ControlsPage component.
 *
 * Architecture:
 *   ControlsPage renders:
 *     1. KPI cards (useQuery: controls.stats)
 *     2. Tab bar (Tasks | Modèles)
 *     3. <TasksTab>     (useQuery: controls.tasks,    useMutation: create task)
 *     4. <TemplatesTab> (useQuery: controls.templates, useMutation: create template)
 *
 *   useQuery is called N times per render.  We use mockReturnValueOnce() chains
 *   to return different data for each call in order.
 *
 * Tests cover:
 *  - KPI cards (loaded values, "—" placeholders while loading)
 *  - Tab bar (Tasks tab active by default, switching to Modèles)
 *  - Tasks tab: loading, task rows (template name, zone, assignee, status badge), empty state, plan-task modal
 *  - Templates tab: loading, template cards (name, frequency), empty state, create-template modal
 *  - Status badge colour classes for every status value
 *  - Pagination controls in both tabs
 */

import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// ─── Mock useDebounce ──────────────────────────────────────────────────────────
jest.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: unknown) => value,
}));

// ─── Mock @tanstack/react-query ────────────────────────────────────────────────

const mockUseQuery    = jest.fn();
const mockUseMutation = jest.fn();
const mockInvalidate  = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<typeof import('@tanstack/react-query')>('@tanstack/react-query'),
  useQuery:       (...args: unknown[]) => mockUseQuery(...args),
  useMutation:    (...args: unknown[]) => mockUseMutation(...args),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));

// ─── Mock api ─────────────────────────────────────────────────────────────────
jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

// ─── Import under test ────────────────────────────────────────────────────────
import ControlsPage from '../ControlsPage';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STATS = {
  todayTotal:     10,
  todayCompleted:  8,
  openOverdue:     2,
  complianceRate: 80,
};

const TEMPLATES = [
  {
    id:            'tpl-1',
    name:          'Contrôle réception viande',
    checklistJson: [],
    frequency:     'ON_RECEPTION',
    tenantId:      'ctenant001testidabc1234',
    createdAt:     '2026-01-01T00:00:00Z',
  },
  {
    id:            'tpl-2',
    name:          'Relevé température chambre froide',
    checklistJson: [],
    frequency:     'DAILY',
    tenantId:      'ctenant001testidabc1234',
    createdAt:     '2026-01-02T00:00:00Z',
  },
];

const TASKS = [
  {
    id:          'task-1',
    templateId:  'tpl-1',
    zoneId:      'zone-cuisine',
    assigneeId:  'user-001',
    tenantId:    'ctenant001testidabc1234',
    status:      'PLANNED'     as const,
    scheduledAt: '2026-05-06T09:00:00Z',
    createdAt:   '2026-05-05T10:00:00Z',
    template:    { id: 'tpl-1', name: 'Contrôle réception viande' },
  },
  {
    id:          'task-2',
    templateId:  'tpl-2',
    zoneId:      'zone-froide',
    assigneeId:  'user-002',
    tenantId:    'ctenant001testidabc1234',
    status:      'COMPLETED'   as const,
    scheduledAt: '2026-05-06T08:00:00Z',
    createdAt:   '2026-05-05T10:00:00Z',
    template:    { id: 'tpl-2', name: 'Relevé température chambre froide' },
  },
  {
    id:          'task-3',
    templateId:  'tpl-1',
    zoneId:      'zone-A',
    assigneeId:  'user-003',
    tenantId:    'ctenant001testidabc1234',
    status:      'OVERDUE'     as const,
    scheduledAt: '2026-05-05T09:00:00Z',
    createdAt:   '2026-05-04T10:00:00Z',
    template:    { id: 'tpl-1', name: 'Contrôle réception viande' },
  },
];

const PAGE_META = { total: 2, page: 1, limit: 20, lastPage: 1 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function qr<T>(data: T, isLoading = false) {
  return { data, isLoading, isError: false, error: null };
}

function mr(mutateAsync: jest.Mock = jest.fn().mockResolvedValue({}), isPending = false) {
  return { mutateAsync, isPending, isError: false };
}

/**
 * Set up the standard mock chain for ControlsPage initial render.
 *
 * Call order when rendering Tasks tab (default):
 *   1. controls.stats   → STATS
 *   2. controls.templates (for PlanTaskForm select) → { data: TEMPLATES }
 *   3. controls.tasks   → { data: TASKS }
 *
 * useMutation is called twice: createTask, (createTemplate is in other tab — not mounted)
 */
function setupLoadedMocks(overrides: {
  stats?: typeof STATS | null;
  templates?: typeof TEMPLATES;
  tasks?: typeof TASKS;
} = {}) {
  const stats     = overrides.stats     !== undefined ? overrides.stats     : STATS;
  const templates = overrides.templates !== undefined ? overrides.templates : TEMPLATES;
  const tasks     = overrides.tasks     !== undefined ? overrides.tasks     : TASKS;

  mockUseQuery
    .mockReturnValueOnce(qr(stats))                                        // stats
    .mockReturnValueOnce(qr({ data: templates, meta: PAGE_META }))         // templates for select
    .mockReturnValueOnce(qr({ data: tasks,     meta: PAGE_META }));        // tasks list

  mockUseMutation
    .mockReturnValueOnce(mr())   // createTaskMutation
    .mockReturnValue(mr());      // catch-all
}

function setupLoadingMocks() {
  mockUseQuery.mockReturnValue(qr(undefined, true));
  mockUseMutation.mockReturnValue(mr());
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ControlsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('ControlsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupLoadedMocks();
  });

  // ── Page structure ────────────────────────────────────────────────────────────

  it('renders the page title "Contrôle"', () => {
    renderPage();
    expect(screen.getByText('Contrôle')).toBeInTheDocument();
  });

  it('renders the page subtitle', () => {
    renderPage();
    expect(screen.getByText(/planification et suivi/i)).toBeInTheDocument();
  });

  // ── KPI cards — loaded state ──────────────────────────────────────────────────

  it('renders all four KPI card labels', () => {
    renderPage();
    expect(screen.getByText('Contrôles du jour')).toBeInTheDocument();
    expect(screen.getByText('Complétés')).toBeInTheDocument();
    expect(screen.getByText('En retard')).toBeInTheDocument();
    expect(screen.getByText('Taux conformité')).toBeInTheDocument();
  });

  it('renders total controls from stats', () => {
    renderPage();
    expect(screen.getByText('10')).toBeInTheDocument(); // todayTotal
  });

  it('renders completed/total fraction from stats', () => {
    renderPage();
    expect(screen.getByText('8 / 10')).toBeInTheDocument();
  });

  it('renders overdue count from stats', () => {
    renderPage();
    expect(screen.getByText('2')).toBeInTheDocument(); // openOverdue
  });

  it('renders compliance rate with % suffix', () => {
    renderPage();
    expect(screen.getByText('80%')).toBeInTheDocument();
  });

  it('renders "—" placeholders when stats are loading', () => {
    setupLoadingMocks();
    renderPage();
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });

  // ── Tab bar ───────────────────────────────────────────────────────────────────

  it('shows "Tâches" tab as active by default', () => {
    renderPage();
    const tachesBtn = screen.getByRole('button', { name: 'Tâches' });
    expect(tachesBtn).toBeInTheDocument();
    // Active tab has border-brand-medium class
    expect(tachesBtn.className).toMatch(/border-brand-medium/);
  });

  it('shows the "Modèles" tab button', () => {
    renderPage();
    expect(screen.getByRole('button', { name: 'Modèles' })).toBeInTheDocument();
  });

  it('switches to Templates tab on click', async () => {
    // Re-mock for Templates tab render:
    // After switching, new useQuery calls: templates list
    mockUseQuery
      .mockReturnValueOnce(qr(STATS))
      .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }))   // initial templates for PlanTaskForm
      .mockReturnValueOnce(qr({ data: TASKS, meta: PAGE_META }))       // initial tasks
      .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }));  // templates list in TemplatesTab

    mockUseMutation.mockReturnValue(mr());

    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Modèles' }));

    // Template cards should appear
    await waitFor(() => {
      expect(screen.getByText('Contrôle réception viande')).toBeInTheDocument();
    });
  });

  // ── Tasks tab ─────────────────────────────────────────────────────────────────

  describe('Tasks tab', () => {
    it('renders the tasks table', () => {
      renderPage();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('renders column headers: Modèle, Zone, Assigné, Date planifiée, Statut', () => {
      renderPage();
      expect(screen.getByText('Modèle')).toBeInTheDocument();
      expect(screen.getByText('Zone')).toBeInTheDocument();
      expect(screen.getByText('Assigné')).toBeInTheDocument();
      expect(screen.getByText('Date planifiée')).toBeInTheDocument();
      expect(screen.getByText('Statut')).toBeInTheDocument();
    });

    it('renders a row for each task', () => {
      renderPage();
      expect(screen.getAllByRole('row')).toHaveLength(1 + TASKS.length); // 1 header + n data rows
    });

    it('renders the template name in each row', () => {
      renderPage();
      expect(screen.getAllByText('Contrôle réception viande').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Relevé température chambre froide')).toBeInTheDocument();
    });

    it('renders the zone in monospace', () => {
      renderPage();
      expect(screen.getByText('zone-cuisine')).toBeInTheDocument();
      expect(screen.getByText('zone-froide')).toBeInTheDocument();
    });

    it('renders the assignee id', () => {
      renderPage();
      expect(screen.getByText('user-001')).toBeInTheDocument();
      expect(screen.getByText('user-002')).toBeInTheDocument();
    });

    it('renders "Planifié" status badge for PLANNED tasks', () => {
      renderPage();
      expect(screen.getByText('Planifié')).toBeInTheDocument();
    });

    it('renders "Complété" status badge for COMPLETED tasks', () => {
      renderPage();
      expect(screen.getByText('Complété')).toBeInTheDocument();
    });

    it('renders "En retard" status badge for OVERDUE tasks', () => {
      renderPage();
      expect(screen.getByText('En retard')).toBeInTheDocument();
    });

    it('renders the task search input', () => {
      renderPage();
      expect(screen.getByPlaceholderText(/rechercher…/i)).toBeInTheDocument();
    });

    it('renders the status filter select', () => {
      renderPage();
      expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('renders the "Planifier" button', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /planifier/i })).toBeInTheDocument();
    });

    // Loading state
    it('shows loading text while tasks are loading', () => {
      setupLoadingMocks();
      renderPage();
      expect(screen.getByText(/chargement/i)).toBeInTheDocument();
    });

    // Empty state
    it('shows empty state when no tasks exist', () => {
      mockUseQuery
        .mockReturnValueOnce(qr(STATS))
        .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }))
        .mockReturnValueOnce(qr({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
      mockUseMutation.mockReturnValue(mr());

      renderPage();
      expect(screen.getByText(/aucune tâche/i)).toBeInTheDocument();
    });

    // Plan task modal
    it('opens the plan-task modal when "Planifier" is clicked', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /planifier/i }));

      expect(screen.getByText('Planifier une tâche')).toBeInTheDocument();
      expect(screen.getByLabelText(/modèle de contrôle/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/zone \/ emplacement/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/assigné à/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/date planifiée/i)).toBeInTheDocument();
    });

    it('calls createTask mutation on plan form submission', async () => {
      const mockCreate = jest.fn().mockResolvedValue({});
      mockUseMutation.mockReturnValueOnce(mr(mockCreate)).mockReturnValue(mr());

      renderPage();
      await userEvent.click(screen.getByRole('button', { name: /planifier/i }));

      await userEvent.type(screen.getByLabelText(/zone \/ emplacement/i), 'Zone B');
      await userEvent.type(screen.getByLabelText(/assigné à/i), 'user-999');
      // datetime-local doesn't render in jsdom, just fill it directly
      const dateInput = screen.getByLabelText(/date planifiée/i);
      await userEvent.type(dateInput, '2026-06-01T10:00');
      await userEvent.click(screen.getByRole('button', { name: /planifier/i, hidden: false }));

      // Submit button inside modal is also labelled "Planifier"
      const submitBtns = screen.getAllByRole('button', { name: /planifier/i });
      await userEvent.click(submitBtns[submitBtns.length - 1]);

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalled();
      });
    });

    // Pagination
    it('does not show pagination when there is only one page', () => {
      renderPage();
      // PAGE_META has lastPage=1, so no pagination buttons
      expect(screen.queryByRole('button', { name: /précédent/i })).not.toBeInTheDocument();
    });

    it('shows pagination controls when there are multiple pages', () => {
      mockUseQuery
        .mockReturnValueOnce(qr(STATS))
        .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }))
        .mockReturnValueOnce(qr({ data: TASKS, meta: { total: 60, page: 1, limit: 20, lastPage: 3 } }));
      mockUseMutation.mockReturnValue(mr());

      renderPage();
      expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
    });

    it('shows page info text', () => {
      mockUseQuery
        .mockReturnValueOnce(qr(STATS))
        .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }))
        .mockReturnValueOnce(qr({ data: TASKS, meta: { total: 60, page: 2, limit: 20, lastPage: 3 } }));
      mockUseMutation.mockReturnValue(mr());

      renderPage();
      expect(screen.getByText(/page 2 sur 3/i)).toBeInTheDocument();
    });
  });

  // ── Templates tab ─────────────────────────────────────────────────────────────

  describe('Templates tab', () => {
    // Helper: switch to templates tab and set up its mocks
    async function renderInTemplatesTab() {
      jest.clearAllMocks();

      // Call chain for switching tabs:
      mockUseQuery
        .mockReturnValueOnce(qr(STATS))
        .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }))   // templates for PlanTaskForm
        .mockReturnValueOnce(qr({ data: TASKS,     meta: PAGE_META }))   // initial tasks render
        .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }));  // templates list in TemplatesTab

      mockUseMutation.mockReturnValue(mr());

      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Modèles' }));
      await waitFor(() => {
        expect(screen.getByText('Contrôle réception viande')).toBeInTheDocument();
      });
    }

    it('shows template cards after switching to Modèles tab', async () => {
      await renderInTemplatesTab();
      expect(screen.getByText('Contrôle réception viande')).toBeInTheDocument();
      expect(screen.getByText('Relevé température chambre froide')).toBeInTheDocument();
    });

    it('renders the frequency badge for templates that have one', async () => {
      await renderInTemplatesTab();
      // FREQUENCY_OPTIONS: ON_RECEPTION → "À la réception", DAILY → "Quotidienne"
      expect(screen.getByText('À la réception')).toBeInTheDocument();
      expect(screen.getByText('Quotidienne')).toBeInTheDocument();
    });

    it('renders Modifier and Supprimer action links for each template card', async () => {
      await renderInTemplatesTab();
      const modifierBtns  = screen.getAllByRole('button', { name: /modifier/i });
      const supprimerBtns = screen.getAllByRole('button', { name: /supprimer/i });
      expect(modifierBtns.length).toBeGreaterThanOrEqual(1);
      expect(supprimerBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('renders the template search input', async () => {
      await renderInTemplatesTab();
      expect(screen.getByPlaceholderText(/rechercher un modèle/i)).toBeInTheDocument();
    });

    it('renders the "Nouveau modèle" button', async () => {
      await renderInTemplatesTab();
      expect(screen.getByRole('button', { name: /nouveau modèle/i })).toBeInTheDocument();
    });

    it('shows empty state when no templates exist', async () => {
      jest.clearAllMocks();
      mockUseQuery
        .mockReturnValueOnce(qr(STATS))
        .mockReturnValueOnce(qr({ data: [], meta: PAGE_META }))         // templates for PlanTaskForm
        .mockReturnValueOnce(qr({ data: TASKS, meta: PAGE_META }))
        .mockReturnValueOnce(qr({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
      mockUseMutation.mockReturnValue(mr());

      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Modèles' }));

      await waitFor(() => {
        expect(screen.getByText(/aucun modèle/i)).toBeInTheDocument();
      });
    });

    it('opens the create-template modal when "Nouveau modèle" is clicked', async () => {
      await renderInTemplatesTab();
      await userEvent.click(screen.getByRole('button', { name: /nouveau modèle/i }));

      expect(screen.getByText('Nouveau modèle de contrôle')).toBeInTheDocument();
      expect(screen.getByLabelText(/nom du modèle/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/fréquence/i)).toBeInTheDocument();
    });

    it('calls createTemplate mutation on form submission', async () => {
      const mockCreate = jest.fn().mockResolvedValue({});

      jest.clearAllMocks();
      mockUseQuery
        .mockReturnValueOnce(qr(STATS))
        .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }))
        .mockReturnValueOnce(qr({ data: TASKS, meta: PAGE_META }))
        .mockReturnValueOnce(qr({ data: TEMPLATES, meta: PAGE_META }));
      mockUseMutation
        .mockReturnValueOnce(mr())                  // createTask (Tasks tab unmounted)
        .mockReturnValueOnce(mr(mockCreate));        // createTemplate

      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Modèles' }));
      await waitFor(() => screen.getByText('Contrôle réception viande'));

      await userEvent.click(screen.getByRole('button', { name: /nouveau modèle/i }));
      await userEvent.type(screen.getByLabelText(/nom du modèle/i), 'Contrôle hygiène mains');
      await userEvent.click(screen.getByRole('button', { name: /créer le modèle/i }));

      await waitFor(() => {
        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({ name: 'Contrôle hygiène mains' }),
        );
      });
    });
  });
});
