import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import { useTenantId } from '@/hooks/useTenantId';
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
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { errors } } = useForm<ProductFormValues>({
    defaultValues: { code: '', name: '', category: '', ...defaultValues },
  });
  const tenantId = useTenantId();

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-select', tenantId],
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
          label={t('products.form.code')}
          placeholder={t('products.form.codePlaceholder')}
          required
          error={errors.code?.message}
          {...register('code', { required: t('products.form.errors.code') })}
        />
        <Input
          label={t('products.form.name')}
          placeholder={t('products.form.namePlaceholder')}
          required
          error={errors.name?.message}
          {...register('name', { required: t('products.form.errors.name') })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('products.form.category')}
          placeholder={t('products.form.categoryPlaceholder')}
          required
          error={errors.category?.message}
          {...register('category', { required: t('products.form.errors.category') })}
        />
        <Input
          label={t('products.form.packaging')}
          placeholder={t('products.form.packagingPlaceholder')}
          {...register('packaging')}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t('products.form.dlcDays')}
          type="number"
          placeholder={t('products.form.dlcPlaceholder')}
          {...register('dlcDays')}
        />
        <Input
          label={t('products.form.tempStorage')}
          type="number"
          placeholder={t('products.form.tempPlaceholder')}
          {...register('tempStorage')}
        />
      </div>

      <Select
        label={t('products.form.supplier')}
        placeholder={t('products.form.supplierPlaceholder')}
        options={supplierOptions}
        {...register('supplierId')}
      />

      <div className="flex justify-end gap-3 border-t border-surface-muted pt-4">
        <Button type="submit" loading={loading}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
