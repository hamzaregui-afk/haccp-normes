import { api } from '@/lib/api';
import type { TracabilityQuery, CreateTracabilityDto, UpdateTracabilityDto } from '@haccp/shared-types';

const BASE = '/api/v1/tracabilities';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export const tracabilityApi = {
  list: (params?: Partial<TracabilityQuery>) =>
    api.get<Any>(BASE, { params }).then((r: { data: Any }) => r.data),

  get: (id: string) =>
    api.get<Any>(`${BASE}/${id}`).then((r: { data: Any }) => r.data),

  create: (dto: CreateTracabilityDto) =>
    api.post<Any>(BASE, dto).then((r: { data: Any }) => r.data),

  update: (id: string, dto: UpdateTracabilityDto) =>
    api.patch<Any>(`${BASE}/${id}`, dto).then((r: { data: Any }) => r.data),

  remove: (id: string) =>
    api.delete<Any>(`${BASE}/${id}`).then((r: { data: Any }) => r.data),

  uploadPhoto: (id: string, file: File, caption?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    return api.post<Any>(`${BASE}/${id}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r: { data: Any }) => r.data);
  },

  deletePhoto: (id: string, photoId: string) =>
    api.delete<Any>(`${BASE}/${id}/photos/${photoId}`).then((r: { data: Any }) => r.data),

  stats: () =>
    api.get<Any>(`${BASE}/stats`).then((r: { data: Any }) => r.data),
};
