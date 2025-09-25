'use client';

import { Bell, Search, Settings, User, Calendar, Users, Phone, Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useDashboardUser } from './dashboard-user-context';

interface SearchResult {
  id: string;
  type: 'patient' | 'appointment' | 'user';
  title: string;
  subtitle?: string;
  description?: string;
  icon: any;
  href: string;
}

export function Header() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user, loading } = useDashboardUser();

  // Close search results when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounced search
  useEffect(() => {
    const delayedSearch = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch(searchQuery.trim());
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayedSearch);
  }, [searchQuery]);

  const performSearch = async (query: string) => {
    try {
      setIsSearching(true);
      const results: SearchResult[] = [];

      // Search patients
      try {
        const patientRes: any = await apiClient.getPatients({ search: query, limit: 5 });
        const patients = patientRes.data || patientRes.patients || [];
        patients.forEach((patient: any) => {
          results.push({
            id: patient.id,
            type: 'patient',
            title: `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || patient.name || 'Unknown Patient',
            subtitle: patient.phone || patient.email,
            description: `Patient • ${patient.gender || 'Unknown'} • ${patient.dob ? new Date(patient.dob).toLocaleDateString() : 'Unknown DOB'}`,
            icon: Users,
            href: `/dashboard/patients?search=${encodeURIComponent(patient.id)}`,
          });
        });
      } catch (e) {
        console.error('Failed to search patients', e);
      }

      // Search appointments (recent ones)
      try {
        const appointmentRes: any = await apiClient.getAppointments({ 
          search: query, 
          limit: 5,
          sortBy: 'date',
          sortOrder: 'desc'
        });
        const appointments = appointmentRes.appointments || appointmentRes.data || [];
        appointments.forEach((appointment: any) => {
          const patientName = appointment.patient?.name || `${appointment.patient?.firstName || ''} ${appointment.patient?.lastName || ''}`.trim() || 'Unknown Patient';
          const doctorName = appointment.doctor ? `${appointment.doctor.firstName || ''} ${appointment.doctor.lastName || ''}`.trim() : 'Unknown Doctor';
          results.push({
            id: appointment.id,
            type: 'appointment',
            title: `${patientName} - ${appointment.slot}`,
            subtitle: `Dr. ${doctorName}`,
            description: `Appointment • ${new Date(appointment.date).toLocaleDateString()} • ${appointment.visitType || 'OPD'}`,
            icon: Calendar,
            href: `/dashboard/appointments`,
          });
        });
      } catch (e) {
        console.error('Failed to search appointments', e);
      }

      // Search users/doctors
      try {
        const userRes: any = await apiClient.getUsers({ search: query, limit: 3 });
        const users = userRes.users || userRes.data || [];
        users.forEach((user: any) => {
          results.push({
            id: user.id,
            type: 'user',
            title: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.name || 'Unknown User',
            subtitle: user.email,
            description: `${user.role || 'User'} • ${user.specialization || 'General'}`,
            icon: User,
            href: `/dashboard/users?search=${encodeURIComponent(user.id)}`,
          });
        });
      } catch (e) {
        console.error('Failed to search users', e);
      }

      setSearchResults(results);
      setShowResults(results.length > 0);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
      setShowResults(false);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    router.push(result.href);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchResults.length > 0) {
      handleResultClick(searchResults[0]);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex-1 max-w-md relative" ref={searchRef}>
        <form onSubmit={handleSearchSubmit}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search patients, appointments, doctors..."
              className="pl-10 pr-4 py-2 w-full"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                if (searchResults.length > 0) {
                  setShowResults(true);
                }
              }}
            />
            {isSearching && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              </div>
            )}
          </div>
        </form>

        {/* Search Results Dropdown */}
        {showResults && searchResults.length > 0 && (
          <Card className="absolute top-full left-0 right-0 mt-1 z-50 max-h-96 overflow-y-auto shadow-lg">
            <CardContent className="p-0">
              {searchResults.map((result, index) => {
                const IconComponent = result.icon;
                return (
                  <div
                    key={`${result.type}-${result.id}-${index}`}
                    className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                    onClick={() => handleResultClick(result)}
                  >
                    <div className="flex-shrink-0">
                      <div className={`p-2 rounded-lg ${
                        result.type === 'patient' ? 'bg-blue-100 text-blue-600' :
                        result.type === 'appointment' ? 'bg-green-100 text-green-600' :
                        'bg-purple-100 text-purple-600'
                      }`}>
                        <IconComponent className="h-4 w-4" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {result.title}
                      </p>
                      {result.subtitle && (
                        <p className="text-xs text-gray-600 truncate">
                          {result.subtitle}
                        </p>
                      )}
                      {result.description && (
                        <p className="text-xs text-gray-500 truncate">
                          {result.description}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0">
                      <Badge variant="outline" className="text-xs">
                        {result.type === 'patient' ? 'Patient' : 
                         result.type === 'appointment' ? 'Appointment' : 'Staff'}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {searchQuery.length >= 2 && (
                <div className="p-3 bg-gray-50 border-t">
                  <p className="text-xs text-gray-500 text-center">
                    Press Enter to go to first result • Type more to refine search
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* No Results */}
        {showResults && searchResults.length === 0 && searchQuery.length >= 2 && !isSearching && (
          <Card className="absolute top-full left-0 right-0 mt-1 z-50 shadow-lg">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-gray-500">No results found for "{searchQuery}"</p>
              <p className="text-xs text-gray-400 mt-1">Try searching for patient names, phone numbers, or doctor names</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right section */}
      <div className="flex items-center space-x-4">
        {/* Notifications */}
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="h-5 w-5" />
          <Badge
            variant="destructive"
            className="absolute -top-1 -right-1 h-5 w-5 rounded-full p-0 flex items-center justify-center text-xs"
          >
            3
          </Badge>
        </Button>

        {/* Settings */}
        <Button variant="ghost" size="sm">
          <Settings className="h-5 w-5" />
        </Button>

        {/* User menu */}
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
            <User className="h-4 w-4 text-blue-600" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-gray-900">
              {loading ? 'Loading…' : `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'Unknown User'}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
} 