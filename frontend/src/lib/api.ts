const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string = API_BASE_URL) {
    this.baseURL = baseURL;
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('auth_token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
  }

  // Auth
  async login(email: string, password: string) {
    const res = await this.post<{ access_token: string }>(`/auth/login`, { email, password });
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

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Network error' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Generic CRUD operations
  async get<T>(endpoint: string, params?: Record<string, any>): Promise<T> {
    const url = params ? `${endpoint}?${new URLSearchParams(params)}` : endpoint;
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
    return this.get('/reports/statistics');
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
}

export const apiClient = new ApiClient();

export const apiClient = new ApiClient(); 