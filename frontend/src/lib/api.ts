const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
      if (!this.token && typeof document !== 'undefined') {
        const match = document.cookie.match(/(?:^|; )auth_token=([^;]+)/);
        this.token = match ? decodeURIComponent(match[1]) : null;
      }
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
      // Also set cookie for middleware
      document.cookie = `auth_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax`;
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
      // Clear cookie
      document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  }

  // Auth
  async login(phone: string, password: string) {
    const res = await this.post<{ access_token: string }>(`/auth/login`, { phone, password });
    if (res?.access_token) {
      this.setToken(res.access_token);
    }
    return res;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    // Ensure Authorization header is set from memory or cookie
    let activeToken = this.token;
    if (!activeToken && typeof document !== 'undefined') {
      const match = document.cookie.match(/(?:^|; )auth_token=([^;]+)/);
      activeToken = match ? decodeURIComponent(match[1]) : null;
      if (activeToken) {
        this.token = activeToken;
      }
    }

    if (activeToken) {
      headers.Authorization = `Bearer ${activeToken}`;
    }

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
      const err = new Error((body && body.message) || `HTTP ${response.status}`);
      (err as any).status = response.status;
      (err as any).body = body;
      throw err;
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
    return this.get('/patients', params);
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
    return this.post('/appointments', data);
  }

  async getAppointment(id: string) {
    return this.get(`/appointments/${id}`);
  }

  async updateAppointment(id: string, data: Record<string, unknown>) {
    return this.patch(`/appointments/${id}`, data);
  }

  async deleteAppointment(id: string) {
    return this.delete(`/appointments/${id}`);
  }

  async getAvailableSlots(params: Record<string, unknown>) {
    return this.get('/appointments/available-slots', params);
  }

  async rescheduleAppointment(id: string, data: Record<string, unknown>) {
    return this.post(`/appointments/${id}/reschedule`, data);
  }

  async getDoctorSchedule(doctorId: string, date: string) {
    return this.get(`/appointments/doctor/${doctorId}/schedule`, { date });
  }

  async getRooms() {
    return this.get('/appointments/rooms');
  }

  async getAllRooms() {
    return this.get('/appointments/rooms/all');
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
    return this.get(`/appointments/room/${roomId}/schedule`, { date });
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

  async getPatientVisitHistory(patientId: string, params?: { limit?: number; offset?: number }) {
    return this.get(`/visits/patient/${patientId}/history`, params || {});
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

  async processPayment(data: Record<string, unknown>) {
    return this.post('/billing/payments', data);
  }

  async generateSampleInvoices(payload?: { maxPatients?: number; perPatient?: number }) {
    return this.post('/billing/invoices/generate-samples', payload || {});
  }

  // Inventory
  async getInventoryItems(params?: Record<string, unknown>) {
    return this.get('/inventory/items', params);
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

  async getSystemAlerts() {
    return this.get('/reports/alerts');
  }

  // Users
  async getUsers(params?: Record<string, unknown>) {
    return this.get('/users', params);
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

  async getPrescription(id: string) {
    return this.get(`/prescriptions/${id}`);
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
}

export const apiClient = new ApiClient();
