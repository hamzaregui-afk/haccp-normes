/**
 * Jest mock for @/lib/api
 *
 * Replaces the real Axios instance (which uses import.meta.env.VITE_API_URL —
 * invalid in Jest's CommonJS environment) with a plain axios instance that
 * targets an empty baseURL. Tests that need specific responses should call
 * jest.spyOn(api, 'get') or jest.spyOn(api, 'post') directly.
 */
import axios from 'axios';

export const api = axios.create({ baseURL: '' });
