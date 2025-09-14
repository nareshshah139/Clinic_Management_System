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
    if ((res as any)?.access_token) {
      this.setToken((res as any).access_token);
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
      let body: any = null;
      try {
        body = await response.json();
      } catch {
        try {
          const text = await response.text();
          body = { message: text || 'Network error' };
        } catch {
          body = { message: 'Network error' };
        }
      }
      const err: any = new Error((body && body.message) || `HTTP ${response.status}`);
      err.status = response.status;
      err.body = body;
      throw err;
    }

    return response.json();
  }

  // Generic CRUD operations
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
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

  async post<T>(endpoint: string, data?: any): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data: any): Promise<T> {
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
  async getPatients(params?: any) {
    return this.get('/patients', params);
  }

  async createPatient(data: any) {
    return this.post('/patients', data);
  }

  async getPatient(id: string) {
    return this.get(`/patients/${id}`);
  }

  async updatePatient(id: string, data: any) {
    return this.patch(`/patients/${id}`, data);
  }

  // Appointments
  async getAppointments(params?: any) {
    return this.get('/appointments', params);
  }

  async createAppointment(data: any) {
    return this.post('/appointments', data);
  }

  async getAvailableSlots(params: any) {
    return this.get('/appointments/available-slots', params);
  }

  async rescheduleAppointment(id: string, data: any) {
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
  async getVisits(params?: any) {
    return this.get('/visits', params);
  }

  async createVisit(data: any) {
    return this.post('/visits', data);
  }

  async completeVisit(id: string, data: any) {
    return this.post(`/visits/${id}/complete`, data);
  }

  async getPatientVisitHistory(patientId: string, params?: { limit?: number; offset?: number }) {
    return this.get(`/visits/patient/${patientId}/history`, params as any);
  }

  // Billing
  async getInvoices(params?: any) {
    return this.get('/billing/invoices', params);
  }

  async createInvoice(data: any) {
    return this.post('/billing/invoices', data);
  }

  async processPayment(data: any) {
    return this.post('/billing/payments', data);
  }

  // Inventory
  async getInventoryItems(params?: any) {
    return this.get('/inventory/items', params);
  }

  async createInventoryItem(data: any) {
    return this.post('/inventory/items', data);
  }

  async getInventoryStatistics() {
    return this.get('/inventory/statistics');
  }

  // Reports
  async getRevenueReport(params: any) {
    return this.get('/reports/revenue', params);
  }

  async getPatientReport(params: any) {
    return this.get('/reports/patients', params);
  }

  async getDoctorReport(params: any) {
    return this.get('/reports/doctors', params);
  }

  async getSystemStatistics() {
    return this.get('/auth/statistics');
  }

  async getSystemAlerts() {
    return this.get('/reports/alerts');
  }

  // Users
  async getUsers(params?: any) {
    return this.get('/users', params);
  }

  async createUser(data: any) {
    return this.post('/users', data);
  }

  async updateUser(id: string, data: any) {
    return this.patch(`/users/${id}`, data);
  }

  async deleteUser(id: string) {
    return this.delete(`/users/${id}`);
  }

  async getUserStatistics() {
    return this.get('/users/statistics');
  }

  // Prescriptions
  async createPrescription(data: any) {
    return this.post('/prescriptions', data);
  }

  async searchDrugs(params: any) {
    return this.get('/prescriptions/drugs/autocomplete', params);
  }

  async getPrescriptionTemplates(params?: any) {
    return this.get('/prescriptions/templates', params || {});
  }

  async createPrescriptionTemplate(data: any) {
    return this.post('/prescriptions/templates', data);
  }

  async autocompletePrescriptionField(params: { field: string; patientId: string; visitId?: string; q?: string; limit?: number }) {
    return this.get('/prescriptions/fields/autocomplete', params as any);
  }
}

export const apiClient = new ApiClient();
