import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import type { ApiResponse, Supplier } from '@haccp/shared-types';

interface ProductFormValues {
  code: string;
  name: string;
  category: string;
  packaging: string;
  dlcDays: string;
  tempStorage: string;
  supplierId: string;
}

interface ProductFormProps {
  onSubmit: (data: ProductFormValues) => Promise<unknown>;
  loading?: boolean;
  defaultValues?: Partial<ProductFormValues>;
}

export function ProductForm({ onSubmit, loading, defaultValues }: ProductFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<ProductFormValues>({
    defaultValues: { code: '', name: '', category: '', ...defaultValues },
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-select'],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Supplier[]>>('/api/v1/suppliers?limit=100');
      return data.data;
    },
  });

  const supplierOptions = (suppliersData ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` }));

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Code produit"
          placeholder="EX-001"
          required
          error={errors.code?.message}
          {...register('code', { required: 'Code obligatoire' })}
        />
        <Input
          label="Nom du produit"
          placeholder="Filet de bœuf"
          required
          error={errors.name?.message}
          {...register('name', { required: 'Nom obligatoire' })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Catégorie"
          placeholder="Viande, Produits laitiers…"
          required
          error={errors.category?.message}
          {...register('category', { required: 'Catégorie obligatoire' })}
        />
        <Input
          label="Conditionnement"
          placeholder="Vrac, 1kg, 5L…"
          {...register('packaging')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="DLC (jours)"
          type="number"
          placeholder="3"
          {...register('dlcDays')}
        />
        <Input
          label="Température de stockage (°C)"
          type="number"
          placeholder="4"
          {...register('tempStorage')}
        />
      </div>

      <Select
        label="Fournisseur"
        placeholder="— Sélectionner un fournisseur —"
        options={supplierOptions}
        {...register('supplierId')}
      />

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>
          Enregistrer
        </Button>
      </div>
    </form>
  );
}
