/**
 * ChecklistEditorPage — full CRUD for the checklist items of a ControlTemplate.
 *
 * Route: /controls/templates/:id
 *
 * The checklistJson column stores an array of ChecklistItem[].  We load the
 * template, let the user add/edit/remove items, then PATCH the template with
 * the updated array.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckSquare,
  GripVertical,
  Plus,
  Save,
  Thermometer,
  Trash2,
  Type,
  Hash,
  ToggleLeft,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router-dom';

import { PageWrapper } from '@/components/layout/AppLayout';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import type { ChecklistItem, ControlTemplate } from './types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

const ITEM_TYPE_OPTIONS = [
  { value: 'BOOLEAN',     label: 'Oui / Non' },
  { value: 'NUMBER',      label: 'Valeur numérique' },
  { value: 'TEMPERATURE', label: 'Température (°C)' },
  { value: 'TEXT',        label: 'Texte libre' },
];

const ITEM_TYPE_ICONS: Record<ChecklistItem['type'], React.ElementType> = {
  BOOLEAN:     ToggleLeft,
  NUMBER:      Hash,
  TEMPERATURE: Thermometer,
  TEXT:        Type,
};

const ITEM_TYPE_LABELS: Record<ChecklistItem['type'], string> = {
  BOOLEAN:     'Oui / Non',
  NUMBER:      'Numérique',
  TEMPERATURE: 'Température',
  TEXT:        'Texte',
};

// ─── Add / edit item form ─────────────────────────────────────────────────────

interface ItemFormValues {
  label:    string;
  type:     ChecklistItem['type'];
  unit:     string;
  min:      string;
  max:      string;
  required: boolean;
}

function ItemForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<ItemFormValues>;
  onSave:   (v: ItemFormValues) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit, watch } = useForm<ItemFormValues>({
    defaultValues: {
      label:    initial?.label    ?? '',
      type:     initial?.type     ?? 'BOOLEAN',
      unit:     initial?.unit     ?? '',
      min:      initial?.min      ?? '',
      max:      initial?.max      ?? '',
      required: initial?.required ?? true,
    },
  });
  const itemType = watch('type');
  const showLimits = itemType === 'NUMBER' || itemType === 'TEMPERATURE';

  return (
    <form onSubmit={(e) => void handleSubmit(onSave)(e)} className="space-y-4">
      <Input
        label="Libellé du point de contrôle"
        placeholder="Ex: Température à réception"
        required
        {...register('label')}
      />
      <Select
        label="Type de mesure"
        options={ITEM_TYPE_OPTIONS}
        required
        {...register('type')}
      />

      {showLimits && (
        <div className="grid grid-cols-3 gap-3">
          <Input
            label="Unité"
            placeholder="°C, %, ppm…"
            {...register('unit')}
          />
          <Input
            label="Limite min"
            type="number"
            step="any"
            placeholder="–18"
            {...register('min')}
          />
          <Input
            label="Limite max"
            type="number"
            step="any"
            placeholder="4"
            {...register('max')}
          />
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 accent-brand-medium"
          {...register('required')}
        />
        <span className="text-sm text-gray-700">Champ obligatoire</span>
      </label>

      <div className="flex justify-end gap-2 border-t border-surface-muted pt-3">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>Annuler</Button>
        <Button type="submit" size="sm">Enregistrer</Button>
      </div>
    </form>
  );
}

// ─── Checklist item row ────────────────────────────────────────────────────────

interface ItemRowProps {
  item:     ChecklistItem;
  index:    number;
  onEdit:   () => void;
  onDelete: () => void;
}

function ItemRow({ item, index, onEdit, onDelete }: ItemRowProps) {
  const TypeIcon = ITEM_TYPE_ICONS[item.type];

  const limits =
    item.type === 'NUMBER' || item.type === 'TEMPERATURE'
      ? [
          item.min !== undefined ? `min ${item.min}` : null,
          item.max !== undefined ? `max ${item.max}` : null,
          item.unit ?? null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null;

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-surface-muted bg-white px-4 py-3 shadow-sm">
      {/* Drag handle (visual only) */}
      <GripVertical className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-gray-400" />

      {/* Index */}
      <span className="w-5 shrink-0 text-right text-xs font-semibold text-gray-400">{index + 1}</span>

      {/* Type icon */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-lighter">
        <TypeIcon className="h-4 w-4 text-brand-dark" />
      </div>

      {/* Label + meta */}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium text-gray-900">{item.label}</p>
        <p className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          <span>{ITEM_TYPE_LABELS[item.type]}</span>
          {limits && <span className="text-gray-400">— {limits}</span>}
          {item.required && (
            <span className="rounded-full bg-brand-lighter px-1.5 py-0.5 text-brand-dark font-medium">
              Obligatoire
            </span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="rounded p-1 text-gray-400 hover:bg-surface-page hover:text-brand-medium"
          onClick={onEdit}
          title="Modifier"
        >
          <CheckSquare className="h-4 w-4" />
        </button>
        <button
          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
          onClick={onDelete}
          title="Supprimer"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ChecklistEditorPage() {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const queryClient  = useQueryClient();

  // Local checklist state (edited in-memory, saved on submit)
  const [items, setItems]           = useState<ChecklistItem[] | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editItem, setEditItem]     = useState<ChecklistItem | null>(null);
  const [dirty, setDirty]           = useState(false);

  // Fetch template
  const { data: templateData, isLoading } = useQuery({
    queryKey: ['controls.template', id],
    queryFn: async () => {
      const { data } = await api.get<{ data: ControlTemplate }>(`/api/v1/controls/templates/${id}`);
      return data.data;
    },
    enabled: !!id,
    // ARCH-DECISION: initialise local items from server data the first time only
    // (onSuccess is deprecated in TanStack Query v5 — we check if items===null)
  });

  // One-time initialisation of local checklist items from server data.
  // ARCH-DECISION: items===null is the "not yet initialised" sentinel so we can
  // distinguish "empty checklist" (items=[]) from "not loaded yet" (items=null).
  useEffect(() => {
    if (templateData && items === null) {
      const parsed: ChecklistItem[] = Array.isArray(templateData.checklistJson)
        ? (templateData.checklistJson as unknown[]).map((raw) => {
            const r = raw as Record<string, unknown>;
            return {
              id:       typeof r['id'] === 'string' ? r['id'] : generateId(),
              label:    typeof r['label'] === 'string' ? r['label'] : '',
              type:     (['BOOLEAN', 'NUMBER', 'TEXT', 'TEMPERATURE'].includes(r['type'] as string)
                ? r['type']
                : 'TEXT') as ChecklistItem['type'],
              unit:     typeof r['unit'] === 'string' ? r['unit'] : undefined,
              min:      typeof r['min'] === 'number' ? r['min'] : undefined,
              max:      typeof r['max'] === 'number' ? r['max'] : undefined,
              required: r['required'] !== false,
            };
          })
        : [];
      setItems(parsed);
    }
  // items is intentionally excluded from deps — we only want to init once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateData]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: (checklistJson: ChecklistItem[]) =>
      api.patch(`/api/v1/controls/templates/${id}`, { checklistJson }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['controls.template', id] });
      void queryClient.invalidateQueries({ queryKey: ['controls.templates'] });
      setDirty(false);
    },
  });

  // ─── Handlers ────────────────────────────────────────────────────────────

  const handleAdd = (v: ItemFormValues) => {
    const newItem: ChecklistItem = {
      id:       generateId(),
      label:    v.label,
      type:     v.type,
      unit:     v.unit || undefined,
      min:      v.min !== '' ? Number(v.min) : undefined,
      max:      v.max !== '' ? Number(v.max) : undefined,
      required: v.required,
    };
    setItems((prev) => [...(prev ?? []), newItem]);
    setDirty(true);
    setAddModalOpen(false);
  };

  const handleEdit = (v: ItemFormValues) => {
    if (!editItem) return;
    setItems((prev) =>
      (prev ?? []).map((item) =>
        item.id === editItem.id
          ? {
              ...item,
              label:    v.label,
              type:     v.type,
              unit:     v.unit || undefined,
              min:      v.min !== '' ? Number(v.min) : undefined,
              max:      v.max !== '' ? Number(v.max) : undefined,
              required: v.required,
            }
          : item,
      ),
    );
    setDirty(true);
    setEditItem(null);
  };

  const handleDelete = (itemId: string) => {
    setItems((prev) => (prev ?? []).filter((i) => i.id !== itemId));
    setDirty(true);
  };

  const handleSave = () => {
    if (items) void saveMutation.mutateAsync(items);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  const template = templateData;
  const currentItems = items ?? [];

  return (
    <>
      <Header
        title={template ? `Checklist — ${template.name}` : 'Checklist'}
        subtitle="Gérez les points de contrôle de ce modèle"
      />
      <PageWrapper>
        {/* Back + Save */}
        <div className="mb-5 flex items-center justify-between">
          <button
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-medium transition-colors"
            onClick={() => navigate('/controls')}
          >
            <ArrowLeft className="h-4 w-4" />
            Retour aux contrôles
          </button>

          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-amber-600 font-medium">Modifications non sauvegardées</span>
            )}
            <Button
              size="sm"
              onClick={handleSave}
              loading={saveMutation.isPending}
              disabled={!dirty || saveMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Sauvegarder
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-sm text-gray-400">Chargement du modèle…</div>
        ) : (
          <>
            {/* Template info banner */}
            {template && (
              <div className="mb-5 rounded-xl border border-brand-lighter bg-brand-lighter/30 px-5 py-3 flex items-center gap-4 text-sm">
                <div>
                  <span className="font-medium text-brand-dark">{template.name}</span>
                  {template.frequency && (
                    <span className="ml-2 text-gray-500">— {template.frequency}</span>
                  )}
                </div>
                <span className="text-gray-400">·</span>
                <span className="text-gray-600">{currentItems.length} point{currentItems.length !== 1 ? 's' : ''} de contrôle</span>
              </div>
            )}

            {/* Item list */}
            {currentItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-muted bg-white py-16 text-center">
                <CheckSquare className="mx-auto mb-3 h-10 w-10 text-gray-300" />
                <p className="font-medium text-gray-600">Aucun point de contrôle</p>
                <p className="mt-1 text-sm text-gray-400">Ajoutez des points pour définir ce qui doit être vérifié.</p>
                <Button size="sm" className="mt-4" onClick={() => setAddModalOpen(true)}>
                  <Plus className="h-4 w-4" /> Ajouter un point
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {currentItems.map((item, idx) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    index={idx}
                    onEdit={() => setEditItem(item)}
                    onDelete={() => handleDelete(item.id)}
                  />
                ))}
              </div>
            )}

            {/* Add button (bottom) */}
            {currentItems.length > 0 && (
              <button
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-surface-muted py-3 text-sm text-gray-400 hover:border-brand-medium hover:text-brand-medium transition-colors"
                onClick={() => setAddModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Ajouter un point de contrôle
              </button>
            )}
          </>
        )}
      </PageWrapper>

      {/* Add item modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Ajouter un point de contrôle"
        size="md"
      >
        <ItemForm onSave={handleAdd} onCancel={() => setAddModalOpen(false)} />
      </Modal>

      {/* Edit item modal */}
      <Modal
        open={editItem !== null}
        onClose={() => setEditItem(null)}
        title="Modifier le point de contrôle"
        size="md"
      >
        {editItem && (
          <ItemForm
            initial={{
              label:    editItem.label,
              type:     editItem.type,
              unit:     editItem.unit ?? '',
              min:      editItem.min !== undefined ? String(editItem.min) : '',
              max:      editItem.max !== undefined ? String(editItem.max) : '',
              required: editItem.required,
            }}
            onSave={handleEdit}
            onCancel={() => setEditItem(null)}
          />
        )}
      </Modal>
    </>
  );
}
