'use client';

import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface PharmacyInventoryStarterImportProps {
  className?: string;
  compact?: boolean;
}

interface InventoryImportSummary {
  totalRows: number;
  created: number;
  updated: number;
  skipped: number;
  drugsCreated: number;
  stockAdjusted: number;
  errors: Array<{ row: number; message: string }>;
}

const requiredColumns = [
  'Drug name',
  'Manufacturer',
  'Composition',
  'Category',
  'Dosage form',
  'Strength',
  'Pack size',
  'Selling price',
  'Current stock',
];

const optionalColumns = [
  'Cost price',
  'MRP',
  'SKU',
  'Batch number',
  'Expiry date',
  'GST %',
  'Supplier',
];

export function PharmacyInventoryStarterImport({
  className = '',
  compact = false,
}: PharmacyInventoryStarterImportProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [summary, setSummary] = useState<InventoryImportSummary | null>(null);

  const selectFile = (file: File | undefined) => {
    if (!file) return;
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (!isExcel) {
      toast({
        variant: 'destructive',
        title: 'Unsupported file',
        description: 'Upload an .xlsx or .xls Excel file.',
      });
      return;
    }
    setSelectedFile(file);
    setSummary(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Choose an Excel file before importing.',
      });
      return;
    }

    try {
      setIsUploading(true);
      const response =
        await apiClient.importInventoryStarterExcel<InventoryImportSummary>(
          selectedFile,
        );
      setSummary(response);
      window.dispatchEvent(new CustomEvent('pharmacy-dashboard-refresh'));
      toast({
        title: 'Inventory import finished',
        description: `${response.created} created, ${response.updated} updated, ${response.skipped} skipped.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Import failed',
        description: getErrorMessage(error),
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  if (compact) {
    return (
      <Card className={`overflow-hidden rounded-[8px] border-slate-200 bg-white shadow-sm ${className}`}>
        <CardHeader className="space-y-2 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                Start Inventory From Excel
              </CardTitle>
              <CardDescription>
                Upload opening stock without leaving the pharmacy desk.
              </CardDescription>
            </div>
            <Badge variant="outline">Setup</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            className="hidden"
            onChange={(event) => selectFile(event.target.files?.[0])}
          />

          <div
            className={`group flex min-h-28 items-center gap-3 rounded-[8px] border border-dashed bg-slate-50 p-4 transition ${
              isDragging
                ? 'border-emerald-500 ring-2 ring-emerald-100'
                : 'border-slate-300'
            }`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              selectFile(event.dataTransfer.files?.[0]);
            }}
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-emerald-50 text-emerald-700 transition-transform duration-300 group-hover:scale-105">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            {selectedFile ? (
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-950">{selectedFile.name}</p>
                <p className="text-sm text-slate-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB selected
                </p>
              </div>
            ) : (
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-950">Drop an Excel file here</p>
                <p className="text-sm text-slate-500">.xlsx or .xls, up to 5 MB</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose
            </Button>
            <Button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Import
            </Button>
          </div>

          {selectedFile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={clearFile}
              disabled={isUploading}
            >
              <X className="mr-2 h-4 w-4" />
              Remove selected file
            </Button>
          )}

          {summary && (
            <div className="rounded-[8px] border bg-slate-50 p-3">
              <div className="grid grid-cols-3 gap-2">
                <ImportMetric label="Created" value={summary.created} />
                <ImportMetric label="Updated" value={summary.updated} />
                <ImportMetric label="Skipped" value={summary.skipped} />
              </div>
              {summary.errors.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
                  {summary.errors.length} row{summary.errors.length === 1 ? '' : 's'} need review.
                </div>
              )}
            </div>
          )}

          <details className="rounded-[8px] border bg-slate-50 p-3">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Accepted columns
            </summary>
            <div className="mt-3 flex flex-wrap gap-2">
              {requiredColumns.map((column) => (
                <Badge key={column} variant="default">
                  {column}
                </Badge>
              ))}
              {optionalColumns.map((column) => (
                <Badge key={column} variant="outline">
                  {column}
                </Badge>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`overflow-hidden rounded-[8px] border-slate-200 bg-white shadow-sm transition-shadow duration-700 hover:shadow-xl ${className}`}>
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
              Start Pharmacy Inventory From Excel
            </CardTitle>
            <CardDescription>
              Import opening stock into the drug catalog and inventory in one
              pass.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              Choose Excel
            </Button>
            <Button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="mr-2 h-4 w-4" />
              )}
              Import Inventory
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          className="hidden"
          onChange={(event) => selectFile(event.target.files?.[0])}
        />

        <div
          className={`group flex min-h-44 flex-col items-center justify-center overflow-hidden rounded-[8px] border border-dashed bg-slate-50 p-5 text-center transition ${
            isDragging
              ? 'border-emerald-500 ring-2 ring-emerald-100'
              : 'border-slate-300'
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            selectFile(event.dataTransfer.files?.[0]);
          }}
        >
          <FileSpreadsheet className="mb-3 h-10 w-10 text-emerald-700 transition-transform duration-700 ease-out group-hover:scale-105" />
          {selectedFile ? (
            <div className="space-y-3">
              <div>
                <p className="font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-sm text-gray-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB selected
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFile}
                disabled={isUploading}
              >
                <X className="mr-2 h-4 w-4" />
                Remove
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="font-medium text-gray-900">
                Drop an Excel file here
              </p>
              <p className="text-sm text-gray-500">
                Supports .xlsx and .xls files up to 5 MB
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[8px] border bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-700" />
              <p className="text-sm font-semibold text-gray-900">
                Starter Columns
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {requiredColumns.map((column) => (
                <Badge key={column} variant="default">
                  {column}
                </Badge>
              ))}
              {optionalColumns.map((column) => (
                <Badge key={column} variant="outline">
                  {column}
                </Badge>
              ))}
            </div>
          </div>

          {summary && (
            <div className="rounded-[8px] border bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <ImportMetric label="Rows" value={summary.totalRows} />
                <ImportMetric label="Created" value={summary.created} />
                <ImportMetric label="Updated" value={summary.updated} />
                <ImportMetric label="Drugs" value={summary.drugsCreated} />
                <ImportMetric label="Stock" value={summary.stockAdjusted} />
                <ImportMetric label="Skipped" value={summary.skipped} />
              </div>

              {summary.errors.length > 0 && (
                <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
                    <AlertTriangle className="h-4 w-4" />
                    Rows needing review
                  </div>
                  <div className="max-h-28 space-y-1 overflow-y-auto text-sm text-amber-900">
                    {summary.errors.slice(0, 5).map((error) => (
                      <p key={`${error.row}-${error.message}`}>
                        Row {error.row}: {error.message}
                      </p>
                    ))}
                    {summary.errors.length > 5 && (
                      <p>{summary.errors.length - 5} more rows skipped.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ImportMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}
