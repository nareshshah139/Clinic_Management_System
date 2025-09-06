'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  BarChart3,
  Download,
  Calendar,
  Users,
  DollarSign,
  TrendingUp,
  FileText,
  Activity,
  PieChart,
  LineChart,
} from 'lucide-react';
import { apiClient } from '@/lib/api';

type ReportType = 'revenue' | 'patients' | 'doctors' | 'appointments' | 'inventory' | 'payments';
type ExportFormat = 'JSON' | 'CSV' | 'PDF' | 'EXCEL';

export default function ReportsPage() {
  const [loading, setLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportType>('revenue');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
    endDate: new Date().toISOString().split('T')[0], // today
  });
  const [reportData, setReportData] = useState<any>(null);

  const reportTypes = [
    {
      id: 'revenue' as ReportType,
      name: 'Revenue Report',
      description: 'Financial performance and revenue analysis',
      icon: DollarSign,
      color: 'text-green-600',
    },
    {
      id: 'patients' as ReportType,
      name: 'Patient Analytics',
      description: 'Patient demographics and statistics',
      icon: Users,
      color: 'text-blue-600',
    },
    {
      id: 'doctors' as ReportType,
      name: 'Doctor Performance',
      description: 'Doctor productivity and patient metrics',
      icon: Activity,
      color: 'text-purple-600',
    },
    {
      id: 'appointments' as ReportType,
      name: 'Appointment Analytics',
      description: 'Scheduling patterns and appointment data',
      icon: Calendar,
      color: 'text-orange-600',
    },
    {
      id: 'inventory' as ReportType,
      name: 'Inventory Report',
      description: 'Stock levels and inventory movements',
      icon: BarChart3,
      color: 'text-indigo-600',
    },
    {
      id: 'payments' as ReportType,
      name: 'Payment Analytics',
      description: 'Payment methods and transaction analysis',
      icon: TrendingUp,
      color: 'text-teal-600',
    },
  ];

  useEffect(() => {
    generateReport();
  }, [selectedReport, dateRange]);

  const generateReport = async () => {
    try {
      setLoading(true);
      let response;
      
      const params = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };

      switch (selectedReport) {
        case 'revenue':
          response = await apiClient.getRevenueReport(params);
          break;
        case 'patients':
          response = await apiClient.getPatientReport(params);
          break;
        case 'doctors':
          response = await apiClient.getDoctorReport(params);
          break;
        case 'appointments':
          response = await apiClient.get('/reports/appointments', params);
          break;
        case 'inventory':
          response = await apiClient.get('/reports/inventory', params);
          break;
        case 'payments':
          response = await apiClient.get('/reports/payments', params);
          break;
        default:
          response = null;
      }

      setReportData(response);
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async (format: ExportFormat) => {
    try {
      const params = {
        type: selectedReport,
        format: format,
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };

      const response = await apiClient.get('/reports/export', params);
      
      // Handle the data URL response
      if (response.dataUrl) {
        const link = document.createElement('a');
        link.href = response.dataUrl;
        link.download = `${selectedReport}_report_${dateRange.startDate}_to_${dateRange.endDate}.${format.toLowerCase()}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
    }).format(amount);
  };

  const renderReportContent = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      );
    }

    if (!reportData) {
      return (
        <div className="text-center py-8">
          <BarChart3 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No data available for the selected period</p>
        </div>
      );
    }

    // Render different content based on report type
    switch (selectedReport) {
      case 'revenue':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Total Revenue</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(reportData.totalRevenue || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">GST Amount</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatCurrency(reportData.totalGst || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Net Revenue</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {formatCurrency(reportData.netRevenue || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'patients':
        return (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Total Patients</p>
                    <p className="text-2xl font-bold text-blue-600">
                      {reportData.totalPatients || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">New Patients</p>
                    <p className="text-2xl font-bold text-green-600">
                      {reportData.newPatients || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Returning Patients</p>
                    <p className="text-2xl font-bold text-orange-600">
                      {reportData.returningPatients || 0}
                    </p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-center">
                    <p className="text-sm text-gray-600">Avg Age</p>
                    <p className="text-2xl font-bold text-purple-600">
                      {Math.round(reportData.averageAge || 0)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      default:
        return (
          <div className="text-center py-8">
            <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Report data will be displayed here</p>
          </div>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-gray-600">Generate comprehensive reports and analyze your clinic's performance</p>
      </div>

      {/* Report Type Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map((report) => (
          <Card
            key={report.id}
            className={`cursor-pointer transition-all ${
              selectedReport === report.id
                ? 'ring-2 ring-blue-500 bg-blue-50'
                : 'hover:shadow-md'
            }`}
            onClick={() => setSelectedReport(report.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg bg-gray-100`}>
                  <report.icon className={`h-6 w-6 ${report.color}`} />
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{report.name}</h3>
                  <p className="text-sm text-gray-500">{report.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Date Range
              </label>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={dateRange.startDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                />
                <Input
                  type="date"
                  value={dateRange.endDate}
                  onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={generateReport} disabled={loading}>
                {loading ? 'Generating...' : 'Generate Report'}
              </Button>
              <Select onValueChange={(format) => exportReport(format as ExportFormat)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Export" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="JSON">JSON</SelectItem>
                  <SelectItem value="CSV">CSV</SelectItem>
                  <SelectItem value="PDF">PDF</SelectItem>
                  <SelectItem value="EXCEL">Excel</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            {(() => { const Icon = reportTypes.find(r => r.id === selectedReport)?.icon; return Icon ? <Icon className="h-5 w-5 mr-2" /> : null; })()}
            {reportTypes.find(r => r.id === selectedReport)?.name}
          </CardTitle>
          <CardDescription>
            Report for {dateRange.startDate} to {dateRange.endDate}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {renderReportContent()}
        </CardContent>
      </Card>
    </div>
  );
} 