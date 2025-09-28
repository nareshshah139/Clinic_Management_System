const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export interface ApiError extends Error {
  status?: number;
  body?: { message?: string } | null;
}

import type { InventoryItem, RescheduleAppointmentPayload } from './types';

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
    // Do not read tokens from localStorage or document.cookie; rely on HttpOnly cookie set by server
    this.token = null;
  }

  // Legacy method retained as no-op for compatibility
  setToken(_token: string) {
    // Intentionally not storing tokens on client to reduce XSS/CSRF risk
    this.token = null;
  }

  async logout() {
    try {
      await this.post('/auth/logout', {});
    } catch {}
    this.clearToken();
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem('auth_token'); } catch {}
      // Clear any legacy non-HttpOnly cookie that may exist
      try { document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'; } catch {}
    }
  }

  // Auth
  async login(identifier: string, password: string) {
    // Server sets HttpOnly cookie via Set-Cookie. Do not persist token client-side.
    return this.post<{ access_token?: string; user: any }>(`/auth/login`, { identifier, password });
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers: Record<string, string> = {
      ...((options.headers as Record<string, string>) || {}),
    };
    if (options.body !== undefined && !(options.body instanceof FormData)) {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    }

    // Do not attach Authorization header; rely on HttpOnly cookie

    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      let body: { message?: string } | null = null;
      try {
        body = (await response.json()) as { message?: string };
      } catch {
        try {
          const text = await response.text();
          body = { message: text || 'Network error' };
        } catch {
          body = { message: 'Network error' };
        }
      }
      const apiErr: ApiError = new Error((body && body.message) || `HTTP ${response.status}`);
      apiErr.status = response.status;
      apiErr.body = body;
      throw apiErr;
    }

    if (response.status === 204) {
      return undefined as T;
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  // Generic CRUD operations
  async get<T>(endpoint: string, params?: Record<string, unknown>): Promise<T> {
    let url = endpoint;
    if (params) {
      const sp = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          sp.append(key, String(value));
        }
      }
      const qs = sp.toString();
      if (qs) {
        url = `${endpoint}?${qs}`;
      }
    }
    return this.request<T>(url);
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'DELETE',
    });
  }

  // Specific API methods
  // Patients
  async getPatients(params?: Record<string, unknown>) {
    return this.get<import('./types').GetPatientsResponse>('/patients', params);
  }

  async createPatient(data: Record<string, unknown>) {
    return this.post('/patients', data);
  }

  async getPatient(id: string) {
    return this.get(`/patients/${id}`);
  }

  async updatePatient(id: string, data: Record<string, unknown>) {
    return this.patch(`/patients/${id}`, data);
  }

  // Appointments
  async getAppointments(params?: Record<string, unknown>) {
    return this.get('/appointments', params);
  }

  async createAppointment(data: Record<string, unknown>) {
    return this.post<import('./types').Appointment>('/appointments', data);
  }

  async getAppointment<T = unknown>(id: string): Promise<T> {
    return this.get<T>(`/appointments/${id}`);
  }

  async updateAppointment(id: string, data: Record<string, unknown>) {
    return this.patch(`/appointments/${id}`, data);
  }

  async deleteAppointment(id: string) {
    return this.delete(`/appointments/${id}`);
  }

  async getAvailableSlots(params: Record<string, unknown>) {
    return this.get<import('./types').GetAvailableSlotsResponse>('/appointments/available-slots', params);
  }

  async rescheduleAppointment(id: string, data: RescheduleAppointmentPayload) {
    return this.post<import('./types').Appointment>(`/appointments/${id}/reschedule`, data);
  }

  async getDoctorSchedule(doctorId: string, date: string) {
    return this.get<import('./types').GetDoctorScheduleResponse>(`/appointments/doctor/${doctorId}/schedule`, { date });
  }

  async getRooms() {
    return this.get<import('./types').GetRoomsResponse>('/appointments/rooms');
  }

  async getAllRooms() {
    return this.get<import('./types').GetRoomsResponse>('/appointments/rooms/all');
  }

  async createRoom(roomData: { name: string; type: string; capacity: number; isActive: boolean }) {
    return this.post('/appointments/rooms', roomData);
  }

  async updateRoom(roomId: string, roomData: { name: string; type: string; capacity: number; isActive: boolean }) {
    return this.patch(`/appointments/rooms/${roomId}`, roomData);
  }

  async deleteRoom(roomId: string) {
    return this.delete(`/appointments/rooms/${roomId}`);
  }

  async getRoomSchedule(roomId: string, date: string) {
    return this.get<import('./types').RoomSchedule>(`/appointments/room/${roomId}/schedule`, { date });
  }

  // Visits
  async getVisits(params?: Record<string, unknown>) {
    return this.get('/visits', params);
  }

  async createVisit(data: Record<string, unknown>) {
    return this.post('/visits', data);
  }

  async updateVisit(id: string, data: Record<string, unknown>) {
    return this.patch(`/visits/${id}`, data);
  }

  async completeVisit(id: string, data: Record<string, unknown>) {
    return this.post(`/visits/${id}/complete`, data);
  }

  async getPatientVisitHistory<T = unknown>(patientId: string, params?: { limit?: number; offset?: number }): Promise<T> {
    return this.get<T>(`/visits/patient/${patientId}/history`, params || {});
  }

  // Billing
  async getInvoices(params?: Record<string, unknown>) {
    return this.get('/billing/invoices', params);
  }

  async getInvoiceById(id: string) {
    return this.get(`/billing/invoices/${id}`);
  }

  async createInvoice(data: Record<string, unknown>) {
    return this.post('/billing/invoices', data);
  }

  async getPharmacyInvoices(params?: Record<string, unknown>) {
    return this.get<import('./types').PharmacyInvoiceListResponse>('/pharmacy/invoices', params);
  }

  async getPharmacyInvoiceById(id: string) {
    return this.get<import('./types').PharmacyInvoiceSummary>(`/pharmacy/invoices/${id}`);
  }

  async processPayment(data: Record<string, unknown>) {
    return this.post('/billing/payments', data);
  }

  async generateSampleInvoices(payload?: { maxPatients?: number; perPatient?: number }) {
    return this.post('/billing/invoices/generate-samples', payload || {});
  }

  // Inventory
  async getInventoryItems(
    params?: Record<string, unknown>
  ): Promise<{ items: InventoryItem[]; total?: number } | InventoryItem[]> {
    return this.get<{ items: InventoryItem[]; total?: number } | InventoryItem[]>('/inventory/items', params);
  }

  async createInventoryItem(data: Record<string, unknown>) {
    return this.post('/inventory/items', data);
  }

  async getInventoryStatistics() {
    return this.get('/inventory/statistics');
  }

  // Reports
  async getRevenueReport(params: Record<string, unknown>) {
    return this.get('/reports/revenue', params);
  }

  async getPatientReport(params: Record<string, unknown>) {
    return this.get('/reports/patients', params);
  }

  async getDoctorReport(params: Record<string, unknown>) {
    return this.get('/reports/doctors', params);
  }

  async getSystemStatistics() {
    return this.get('/auth/statistics');
  }

  async getSystemAlerts<T = unknown>() {
    return this.get<T>('/reports/alerts');
  }

  // Users
  async getUsers(params?: Record<string, unknown>) {
    return this.get<import('./types').GetUsersResponse>('/users', params);
  }

  async createUser(data: Record<string, unknown>) {
    return this.post('/users', data);
  }

  async updateUser(id: string, data: Record<string, unknown>) {
    return this.patch(`/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.delete(`/users/${id}`);
  }

  async getRoles(params?: Record<string, unknown>) {
    return this.get('/users/roles', params || {});
  }

  async getPermissions(params?: Record<string, unknown>) {
    return this.get('/users/permissions', params || {});
  }

  async assignRole(userId: string, payload: { role: string; permissions?: string[] }) {
    return this.patch(`/users/${userId}/role`, payload);
  }

  async updateUserPermissions(userId: string, permissions: string[]) {
    return this.patch(`/users/${userId}/permissions`, { permissions });
  }

  async getUserStatistics() {
    return this.get('/users/statistics');
  }

  // Prescriptions
  async createPrescription(data: Record<string, unknown>) {
    return this.post('/prescriptions', data);
  }

  async createQuickPrescription(data: Record<string, unknown>) {
    return this.post('/prescriptions/pad', data);
  }

  async getPrescription<T = unknown>(id: string): Promise<T> {
    return this.get<T>(`/prescriptions/${id}`);
  }

  async getPatientPrescriptionHistory<T = unknown>(patientId: string, params?: { limit?: number; drugName?: string }): Promise<T> {
    return this.get<T>('/prescriptions/history', { patientId, ...(params || {}) });
  }

  async searchDrugs(params: Record<string, unknown>) {
    return this.get('/prescriptions/drugs/autocomplete', params);
  }

  async getPrescriptionTemplates(params?: Record<string, unknown>) {
    return this.get('/prescriptions/templates', params || {});
  }

  async createPrescriptionTemplate(data: Record<string, unknown>) {
    return this.post('/prescriptions/templates', data);
  }

  async autocompletePrescriptionField(params: { field: string; patientId: string; visitId?: string; q?: string; limit?: number }) {
    return this.get('/prescriptions/fields/autocomplete', params);
  }

  // 1MG proxy endpoints
  async oneMgSearch(query: string, limit = 10) {
    return this.get('/pharmacy/1mg/search', { q: query, limit });
  }
  async oneMgProduct(sku: string) {
    return this.get(`/pharmacy/1mg/products/${sku}`);
  }
  async oneMgCheckInventory(payload: Record<string, unknown>) {
    return this.post('/pharmacy/1mg/check-inventory', payload);
  }
  async oneMgCreateOrder(payload: Record<string, unknown>) {
    return this.post('/pharmacy/1mg/orders', payload);
  }

  // Admin operations
  async createDatabaseBackup() {
    return this.post('/auth/backup', {});
  }

  // Utilities
  async translateTexts(target: 'HI' | 'TE', texts: string[]): Promise<{ translations: string[] }> {
    return this.post<{ translations: string[] }>('/visits/translate', { target, texts });
  }
}

export const apiClient = new ApiClient();
