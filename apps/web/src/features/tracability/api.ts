import axios from '@/lib/axios';
import type { TracabilityQuery, CreateTracabilityDto, UpdateTracabilityDto } from '@haccp/shared-types';

const BASE = '/api/v1/tracabilities';

export const tracabilityApi = {
  list: (params?: Partial<TracabilityQuery>) =>
    axios.get(BASE, { params }).then((r) => r.data),

  get: (id: string) =>
    axios.get(`${BASE}/${id}`).then((r) => r.data),

  create: (dto: CreateTracabilityDto) =>
    axios.post(BASE, dto).then((r) => r.data),

  update: (id: string, dto: UpdateTracabilityDto) =>
    axios.patch(`${BASE}/${id}`, dto).then((r) => r.data),

  remove: (id: string) =>
    axios.delete(`${BASE}/${id}`).then((r) => r.data),

  uploadPhoto: (id: string, file: File, caption?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (caption) form.append('caption', caption);
    return axios.post(`${BASE}/${id}/photos`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  deletePhoto: (id: string, photoId: string) =>
    axios.delete(`${BASE}/${id}/photos/${photoId}`).then((r) => r.data),

  stats: () =>
    axios.get(`${BASE}/stats`).then((r) => r.data),
};
