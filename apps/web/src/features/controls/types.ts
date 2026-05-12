export interface ControlTask {
  id: string;
  templateId: string;
  zoneId: string;
  assigneeId: string | null;
  groupId: string | null;
  tenantId: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'CANCELLED';
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  resultJson?: unknown;
  notes?: string;
  createdAt: string;
  template?: { id: string; name: string; type: string };
}

export interface ChecklistItem {
  id: string;
  label: string;
  type: 'BOOLEAN' | 'NUMBER' | 'TEXT' | 'TEMPERATURE';
  unit?: string;
  min?: number;
  max?: number;
  required: boolean;
}

export type ControlType =
  | 'RECEPTION'
  | 'TEMPERATURE_STOCK'
  | 'TEMPERATURE_DISPLAY'
  | 'TEMPERATURE_OIL'
  | 'EQUIPMENT'
  | 'SANITARY'
  | 'DAILY_PRODUCTION';

export interface ControlTemplate {
  id: string;
  name: string;
  type: ControlType;
  checklistJson: unknown;
  frequency?: string;
  tenantId?: string;
  createdAt: string;
}

export interface ControlStats {
  todayTotal: number;
  todayCompleted: number;
  openOverdue: number;
  complianceRate: number;
}

// Résultat d'un item de checklist stocké dans resultJson
export interface TaskResultItem {
  id:        string;
  label:     string;
  type:      ChecklistItem['type'];
  value:     boolean | number | string | null;
  unit?:     string;
  min?:      number;
  max?:      number;
  compliant: boolean;
  required:  boolean;
}

// Structure complète de resultJson stocké en base
export interface TaskResult {
  submittedAt:      string;  // ISO
  submittedBy:      string;  // userId
  overallCompliant: boolean;
  notes?:           string;
  items:            TaskResultItem[];
}

// Tâche complète retournée par GET /tasks/:id (inclut checklistJson)
export interface ControlTaskDetail extends Omit<ControlTask, 'template' | 'resultJson'> {
  template?: {
    id:            string;
    name:          string;
    type:          string;
    checklistJson: unknown;
    frequency?:    string;
  };
  resultJson?: TaskResult | null;
}
