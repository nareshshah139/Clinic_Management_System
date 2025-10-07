'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Image as ImageIcon, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Props {
  visitId: string;
  apiBase?: string; // optional override
  onVisitNeeded?: () => Promise<string>; // Callback to create visit if needed
  patientId?: string; // required for draft uploads when visitId is temp
  allowDelete?: boolean; // doctor-only delete control
  onChangeCount?: (count: number) => void; // notify parent of photo count changes
}

type PhotoPosition = 'FRONT' | 'LEFT_PROFILE' | 'RIGHT_PROFILE' | 'BACK' | 'CLOSE_UP' | 'OTHER';

interface PhotoItem { url: string; uploadedAt?: string | null; position?: PhotoPosition; displayOrder?: number }

export default function VisitPhotos({ visitId, apiBase, onVisitNeeded, patientId, allowDelete, onChangeCount }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<PhotoItem[]>([]);
  // Patient history and compare data
  const [patientVisits, setPatientVisits] = useState<Array<{ id: string; createdAt?: string; ordinal: number }>>([]);
  const [visitOrdinalMap, setVisitOrdinalMap] = useState<Record<string, number>>({});
  const [selectedCompareVisitId, setSelectedCompareVisitId] = useState<string | null>(null);
  const [compareItems, setCompareItems] = useState<PhotoItem[]>([]);
  const [pairIndex, setPairIndex] = useState<number>(0);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [pendingPositions, setPendingPositions] = useState<PhotoPosition[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const baseUrl = apiBase || '/api';

  const POSITION_LABEL: Record<PhotoPosition, string> = {
    FRONT: 'Front',
    LEFT_PROFILE: 'Left',
    RIGHT_PROFILE: 'Right',
    BACK: 'Back',
    CLOSE_UP: 'Close-up',
    OTHER: 'Other',
  };

  const RECOMMENDED_ORDER: PhotoPosition[] = ['FRONT','LEFT_PROFILE','RIGHT_PROFILE','BACK','CLOSE_UP','OTHER'];

  const inferPositions = (count: number): PhotoPosition[] => {
    const out: PhotoPosition[] = [];
    for (let i = 0; i < count; i += 1) {
      out.push(RECOMMENDED_ORDER[i] ?? 'OTHER');
    }
    return out;
  };

  const toAbsolute = (path: string) => {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    // Normalize any accidental api prefix and ensure /uploads/* is served from app root
    const cleaned = path.replace(/^\/?api\/+/, '/');
    if (/^\/?uploads\//i.test(cleaned) || /\/uploads\//i.test(cleaned)) {
      const startIdx = cleaned.toLowerCase().indexOf('/uploads/');
      const suffix = startIdx >= 0 ? cleaned.slice(startIdx) : `/${cleaned.replace(/^\/?/, '')}`;
      return suffix.startsWith('/uploads/') ? suffix : `/uploads/${suffix.replace(/^\/?uploads\//i, '')}`;
    }
    // Fall back to calling API endpoints via /api
    return `${baseUrl}${cleaned.startsWith('/') ? cleaned : `/${cleaned}`}`;
  };

  const load = async () => {
    // Don't try to load if visitId is temp
    if (visitId === 'temp') {
      if (!patientId) { setItems([]); try { onChangeCount?.(0); } catch {} return; }
      try {
        const res = await fetch(`${baseUrl}/visits/photos/draft/${patientId}`, { credentials: 'include' });
        if (!res.ok) { setItems([]); return; }
        const data = await res.json();
        const incoming: PhotoItem[] = ((data.items as PhotoItem[] | undefined) || []).map((it: PhotoItem) => ({
          ...it,
          url: toAbsolute(it.url),
        }));
        setItems(incoming);
        setActiveIndex(0);
        try { onChangeCount?.(incoming.length); } catch {}
      } catch { setItems([]); }
      return;
    }
    
    try {
      const res = await fetch(`${baseUrl}/visits/${visitId}/photos`, {
        credentials: 'include',
      });
      if (!res.ok) {
        console.error('Failed to load photos:', res.status);
        return;
      }
      const data = await res.json();
      const incoming: PhotoItem[] = ((data.items as PhotoItem[] | undefined) || (data.attachments || []).map((u: string) => ({ url: u })))
        .map((it: PhotoItem) => ({ ...it, url: toAbsolute(it.url) }));
      // Preserve backend ordering; as a safety, sort by displayOrder then time
      incoming.sort((a, b) => {
        const ao = typeof a.displayOrder === 'number' ? a.displayOrder : 999;
        const bo = typeof b.displayOrder === 'number' ? b.displayOrder : 999;
        if (ao !== bo) return ao - bo;
        const at = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
        const bt = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
        if (at === bt) return a.url.localeCompare(b.url);
        return at - bt;
      });
      setItems(incoming);
      setActiveIndex(0);
      try { onChangeCount?.(incoming.length); } catch {}
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  useEffect(() => { void load(); }, [visitId, patientId]);

  // Load patient visit history and compute ordinals, choose default compare visit
  useEffect(() => {
    const loadHistory = async () => {
      if (!patientId) { setPatientVisits([]); setVisitOrdinalMap({}); setSelectedCompareVisitId(null); return; }
      try {
        const resp = await fetch(`${baseUrl}/visits/patient/${patientId}/history?limit=50`, { credentials: 'include' });
        if (!resp.ok) { setPatientVisits([]); setVisitOrdinalMap({}); setSelectedCompareVisitId(null); return; }
        const data = await resp.json();
        const visits = Array.isArray((data as any)?.visits) ? (data as any).visits as any[] : [];
        // Sort ascending by createdAt for ordinal numbering
        const asc = [...visits].sort((a, b) => {
          const at = a?.createdAt ? Date.parse(a.createdAt as string) : 0;
          const bt = b?.createdAt ? Date.parse(b.createdAt as string) : 0;
          return at - bt;
        });
        const withOrd = asc.map((v, i) => ({ id: v?.id as string, createdAt: (v?.createdAt as string) || undefined, ordinal: i + 1 }));
        const idToOrd: Record<string, number> = {};
        withOrd.forEach(v => { if (v.id) idToOrd[v.id] = v.ordinal; });
        setPatientVisits(withOrd);
        setVisitOrdinalMap(idToOrd);

        // Pick default compare visit: previous ordinal if possible; else last older
        let defCompare: string | null = null;
        if (visitId && visitId !== 'temp' && idToOrd[visitId]) {
          const curOrd = idToOrd[visitId];
          defCompare = withOrd.find(v => v.ordinal === curOrd - 1)?.id || null;
        } else {
          // No current in history (temp): choose the latest visit if exists
          defCompare = withOrd.length > 0 ? withOrd[withOrd.length - 1].id : null;
        }
        setSelectedCompareVisitId(defCompare);
      } catch (e) {
        console.error('Failed to load visit history', e);
        setPatientVisits([]);
        setVisitOrdinalMap({});
        setSelectedCompareVisitId(null);
      }
    };
    void loadHistory();
  }, [patientId, visitId]);

  // Load selected compare visit's photos
  useEffect(() => {
    const loadComparePhotos = async () => {
      if (!selectedCompareVisitId) { setCompareItems([]); return; }
      try {
        const res = await fetch(`${baseUrl}/visits/${selectedCompareVisitId}/photos`, { credentials: 'include' });
        if (!res.ok) { setCompareItems([]); return; }
        const data = await res.json();
        const incoming: PhotoItem[] = ((data.items as PhotoItem[] | undefined) || (data.attachments || []).map((u: string) => ({ url: u })))
          .map((it: PhotoItem) => ({ ...it, url: toAbsolute(it.url) }));
        incoming.sort((a, b) => {
          const ao = typeof a.displayOrder === 'number' ? a.displayOrder : 999;
          const bo = typeof b.displayOrder === 'number' ? b.displayOrder : 999;
          if (ao !== bo) return ao - bo;
          const at = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
          const bt = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
          if (at === bt) return a.url.localeCompare(b.url);
          return at - bt;
        });
        setCompareItems(incoming);
        setPairIndex(0);
      } catch (e) {
        console.error('Failed to load compare visit photos', e);
        setCompareItems([]);
      }
    };
    void loadComparePhotos();
  }, [selectedCompareVisitId, baseUrl]);

  // Build previews for pending files and clean up object URLs
  useEffect(() => {
    if (!pendingFiles || pendingFiles.length === 0) {
      setPreviewUrls([]);
      return;
    }
    const urls = pendingFiles.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => {
      urls.forEach((u) => {
        try { URL.revokeObjectURL(u); } catch {}
      });
    };
  }, [pendingFiles]);

  const openTaggingForFiles = (files: File[]) => {
    setPendingFiles(files);
    setPendingPositions(inferPositions(files.length));
    setTagDialogOpen(true);
  };

  const onUpload = (evt: React.ChangeEvent<HTMLInputElement>) => {
    const f = evt.target.files;
    if (!f || f.length === 0) return;
    openTaggingForFiles(Array.from(f));
  };

  const uploadWithPositions = async () => {
    if (!pendingFiles || pendingFiles.length === 0) return;
    const positions = pendingPositions;
    if (positions.length !== pendingFiles.length || positions.some(p => !p)) {
      toast({ variant: 'warning', title: 'Tag positions', description: 'Please select a position for each photo.' });
      return;
    }

    let actualVisitId = visitId;
    try {
      setUploading(true);

      // Soft validation to avoid known failures
      const MAX_FILE_BYTES = 25 * 1024 * 1024; // mirror backend default
      const invalids: string[] = [];
      const validFiles: File[] = [];
      const validPositions: typeof positions = [] as any;
      for (let i = 0; i < pendingFiles.length; i += 1) {
        const f = pendingFiles[i];
        const p = positions[i];
        if (!f || f.size <= 0) {
          invalids.push(`${f?.name || 'unnamed'}: empty file`);
          continue;
        }
        if (!String(f.type || '').toLowerCase().startsWith('image/')) {
          invalids.push(`${f.name}: not an image`);
          continue;
        }
        if (f.size > MAX_FILE_BYTES) {
          // Backend downscales but enforces size limit; warn but still attempt upload
          invalids.push(`${f.name}: larger than ${Math.round(MAX_FILE_BYTES / (1024*1024))}MB (may fail, attempting anyway)`);
        }
        validFiles.push(f);
        validPositions.push(p);
      }
      if (validFiles.length === 0) {
        toast({ variant: 'warning', title: 'No valid images', description: invalids.join('\n') });
        return;
      }

      const chunk = <T,>(arr: T[], size: number): T[][] => {
        const out: T[][] = [];
        for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
        return out;
      };

      const fileBatches = chunk(validFiles, 6);
      const posBatches = chunk(validPositions, 6);

      const fetchWithRetry = async (url: string, body: FormData, attempts = 2, timeoutMs = 30000) => {
        let lastErr: any = null;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort(), timeoutMs);
          try {
            const resp = await fetch(url, { method: 'POST', body, credentials: 'include', signal: controller.signal });
            clearTimeout(t);
            if (resp.ok) return resp;
            lastErr = new Error(`${resp.status}`);
          } catch (e) {
            clearTimeout(t);
            lastErr = e;
          }
          // Backoff before retrying
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
        throw lastErr || new Error('Upload failed');
      };

      const failures: string[] = [];

      if (visitId === 'temp') {
        if (!patientId) { toast({ variant: 'destructive', title: 'Missing patient', description: 'Patient is required to upload draft photos.' }); return; }
        for (let b = 0; b < fileBatches.length; b += 1) {
          const group = fileBatches[b];
          const groupPositions = posBatches[b];
          const fd = new FormData();
          group.forEach(f => fd.append('files', f));
          fd.append('positions', JSON.stringify(groupPositions));
          try {
            await fetchWithRetry(`${baseUrl}/visits/photos/draft/${patientId}`, fd);
          } catch (e: any) {
            failures.push(`Batch ${b + 1}: ${e?.message || 'failed'}`);
          }
        }
      } else {
        for (let b = 0; b < fileBatches.length; b += 1) {
          const group = fileBatches[b];
          const groupPositions = posBatches[b];
          const fd = new FormData();
          group.forEach(f => fd.append('files', f));
          fd.append('positions', JSON.stringify(groupPositions));
          try {
            await fetchWithRetry(`${baseUrl}/visits/${actualVisitId}/photos`, fd);
          } catch (e: any) {
            failures.push(`Batch ${b + 1}: ${e?.message || 'failed'}`);
          }
        }
      }

      setTagDialogOpen(false);
      setPendingFiles(null);
      setPendingPositions([]);
      await load();
      if (invalids.length || failures.length) {
        const msgs = [] as string[];
        if (invalids.length) msgs.push(`Skipped: ${invalids.length} (\n- ${invalids.join('\n- ')}\n)`);
        if (failures.length) msgs.push(`Failed: ${failures.length} batch(es) (\n- ${failures.join('\n- ')}\n)`);
        toast({ variant: 'warning', title: 'Upload completed with warnings', description: msgs.join('\n') });
      } else {
        toast({ variant: 'success', title: 'Photos uploaded', description: `${validFiles.length} image(s) uploaded.` });
      }
    } catch (e) {
      console.error('Upload error:', e);
      toast({ variant: 'destructive', title: 'Upload failed', description: 'Failed to upload photos. Please try again.' });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
      setUploading(false);
    }
  };

  const active = items[activeIndex] || null;
  const previous = useMemo(() => (activeIndex > 0 ? items[activeIndex - 1] : null), [items, activeIndex]);

  // Build position-based pairs for compare mode
  const positionPairs = useMemo(() => {
    const byPos = (arr: PhotoItem[]) => {
      const map: Partial<Record<PhotoPosition, PhotoItem>> = {};
      for (const it of arr) {
        const p = (it.position as PhotoPosition) || 'OTHER';
        if (!map[p]) map[p] = it;
      }
      return map;
    };
    const curBy = byPos(items);
    const cmpBy = byPos(compareItems);
    const available = RECOMMENDED_ORDER.filter(p => curBy[p] || cmpBy[p]);
    return { available, curBy, cmpBy } as { available: PhotoPosition[]; curBy: Partial<Record<PhotoPosition, PhotoItem>>; cmpBy: Partial<Record<PhotoPosition, PhotoItem>> };
  }, [items, compareItems]);

  useEffect(() => {
    if (pairIndex >= positionPairs.available.length) {
      setPairIndex(positionPairs.available.length > 0 ? positionPairs.available.length - 1 : 0);
    }
  }, [positionPairs.available.length, pairIndex]);

  const currentPairPosition = positionPairs.available[pairIndex] || null;
  const leftItem = currentPairPosition ? positionPairs.cmpBy[currentPairPosition] || null : null;
  const rightItem = currentPairPosition ? positionPairs.curBy[currentPairPosition] || null : null;

  const formatVisitLabel = (vid: string | null, fallback: string) => {
    if (!vid) return fallback;
    const ord = visitOrdinalMap[vid];
    if (!ord) return fallback;
    return `Visit ${ord}`;
  };

  const applyResponseList = (data: any) => {
    const incoming: PhotoItem[] = ((data?.items as PhotoItem[] | undefined) || (data?.attachments || []).map((u: string) => ({ url: u })))
      .map((it: PhotoItem) => ({ ...it, url: toAbsolute(it.url) }));
    incoming.sort((a, b) => {
      const ao = typeof a.displayOrder === 'number' ? a.displayOrder : 999;
      const bo = typeof b.displayOrder === 'number' ? b.displayOrder : 999;
      if (ao !== bo) return ao - bo;
      const at = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
      const bt = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
      if (at === bt) return a.url.localeCompare(b.url);
      return at - bt;
    });
    setItems(incoming);
    setActiveIndex(0);
    try { onChangeCount?.(incoming.length); } catch {}
  };

  const deleteActive = async () => {
    if (!active) return;
    const confirmed = window.confirm('Delete this photo? This cannot be undone.');
    if (!confirmed) return;
    if (deleting) return;
    try {
      setDeleting(true);
      const isDraft = visitId === 'temp' || /\/visits\/photos\/draft\//i.test(active.url);
      if (isDraft) {
        // Draft mode deletion
        const draftUrl = active.url.startsWith('/visits/photos/draft/') ? `${baseUrl}${active.url}` : active.url;
        const resp = await fetch(draftUrl, { method: 'DELETE', credentials: 'include' });
        if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
        try { const data = await resp.json(); applyResponseList(data); }
        catch { await load(); }
      } else {
        // If the image URL points to API route, delete that resource; else treat as legacy
        if (/\/visits\//i.test(active.url) && !/\/uploads\//i.test(active.url)) {
          const target = active.url.startsWith('http') ? active.url : `${baseUrl}${active.url}`;
          const resp = await fetch(target, { method: 'DELETE', credentials: 'include' });
          if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
          try { const data = await resp.json(); applyResponseList(data); }
          catch { await load(); }
        } else if (/\/uploads\//i.test(active.url)) {
          const resp = await fetch(`${baseUrl}/visits/${visitId}/photos/legacy`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: active.url }),
            credentials: 'include',
          });
          if (!resp.ok) throw new Error(`Delete failed: ${resp.status}`);
          try { const data = await resp.json(); applyResponseList(data); }
          catch { await load(); }
        } else {
          throw new Error('Unsupported photo URL');
        }
      }
    } catch (e) {
      console.error('Delete error:', e);
      toast({ variant: 'destructive', title: 'Delete failed', description: 'Failed to delete photo.' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Before / After Photos ({items.length})</CardTitle>
          <div className="space-x-2">
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {uploading ? 'Uploading...' : 'Upload'}
            </Button>
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => cameraRef.current?.click()}>
              <Camera className="h-4 w-4 mr-2" />
              Camera
            </Button>
            {items.length > 0 && (
              <Button variant={compareMode ? 'default' : 'outline'} size="sm" onClick={() => setCompareMode(v => !v)}>
                {compareMode ? 'Compare: On' : 'Compare: Off'}
              </Button>
            )}
            {allowDelete && active && (
              <Button variant="destructive" size="sm" onClick={deleteActive} disabled={deleting}>
                <Trash2 className="h-4 w-4 mr-2" /> Delete
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onUpload} className="hidden" />

        {items.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
            <ImageIcon className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No photos uploaded yet</h3>
            <p className="text-sm text-gray-500 mb-6">Upload before/after photos to document treatment progress</p>
            <div className="flex justify-center space-x-3">
              <Button onClick={() => inputRef.current?.click()} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" />
                Choose Files
              </Button>
              <Button variant="outline" onClick={() => cameraRef.current?.click()} disabled={uploading}>
                <Camera className="h-4 w-4 mr-2" />
                Take Photo
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Main viewer */}
            {!compareMode ? (
              <div className="w-full aspect-video bg-gray-100 rounded border flex items-center justify-center overflow-hidden">
                {active ? (
                  <img src={toAbsolute(active.url)} alt="visit" className="max-h-full max-w-full object-contain" />
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {/* Compare visit selector */}
                <div className="flex items-center gap-2">
                  <div className="text-xs text-gray-600">Compare against:</div>
                  <Select
                    value={selectedCompareVisitId || ''}
                    onValueChange={(val: string) => { setSelectedCompareVisitId(val || null); setPairIndex(0); }}
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Select visit" />
                    </SelectTrigger>
                    <SelectContent>
                      {patientVisits
                        .filter(v => (visitId ? v.id !== visitId : true))
                        .map(v => (
                          <SelectItem key={v.id} value={v.id}>{`Visit ${v.ordinal}${v.createdAt ? ` - ${new Date(v.createdAt).toLocaleDateString()}` : ''}`}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Paired compare viewer */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="w-full aspect-video bg-gray-100 rounded border flex items-center justify-center overflow-hidden relative">
                    {leftItem ? (
                      <>
                        <img src={toAbsolute(leftItem.url)} alt="before" className="max-h-full max-w-full object-contain" />
                        <div className="absolute top-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1">
                          {`${formatVisitLabel(selectedCompareVisitId, 'Visit ?')} - ${currentPairPosition ? POSITION_LABEL[currentPairPosition] : ''}`}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500">No photo</div>
                    )}
                  </div>
                  <div className="w-full aspect-video bg-gray-100 rounded border flex items-center justify-center overflow-hidden relative">
                    {rightItem ? (
                      <>
                        <img src={toAbsolute(rightItem.url)} alt="after" className="max-h-full max-w-full object-contain" />
                        <div className="absolute top-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1">
                          {`${visitId && visitId !== 'temp' ? formatVisitLabel(visitId, 'This Visit') : 'This Visit'} - ${currentPairPosition ? POSITION_LABEL[currentPairPosition] : ''}`}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-500">No photo</div>
                    )}
                  </div>
                </div>

                {/* Pair navigation */}
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <div>
                    {currentPairPosition ? `Position: ${POSITION_LABEL[currentPairPosition]}` : 'No positions to compare'}
                    {positionPairs.available.length > 0 ? ` • ${pairIndex + 1} / ${positionPairs.available.length}` : ''}
                  </div>
                  <div className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => setPairIndex(i => Math.max(0, i - 1))} disabled={positionPairs.available.length <= 1}>Prev</Button>
                    <Button size="sm" variant="outline" onClick={() => setPairIndex(i => Math.min(positionPairs.available.length - 1, i + 1))} disabled={positionPairs.available.length <= 1}>Next</Button>
                  </div>
                </div>
              </div>
            )}

            {/* Meta */}
            <div className="text-xs text-gray-500 flex items-center justify-between">
              <div>
                {active?.uploadedAt ? `Uploaded: ${new Date(active.uploadedAt).toLocaleString()}` : ''}
                {active?.position ? ` • ${POSITION_LABEL[active.position]}` : ''}
              </div>
              <div className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => setActiveIndex(i => Math.max(0, i - 1))} disabled={items.length <= 1}>Prev</Button>
                <Button size="sm" variant="outline" onClick={() => setActiveIndex(i => Math.min(items.length - 1, i + 1))} disabled={items.length <= 1}>Next</Button>
                {allowDelete && active && (
                  <Button size="sm" variant="destructive" onClick={deleteActive}>
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                )}
              </div>
            </div>

            {/* Scrollable thumbnail strip */}
            <div className="w-full overflow-x-auto">
              <div className="flex gap-2 py-2">
                {items.map((it, idx) => (
                  <div key={it.url} className={`relative h-20 w-28 flex-shrink-0 rounded border overflow-hidden ${idx === activeIndex ? 'ring-2 ring-blue-500' : ''}`}>
                    <button
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      title={it.uploadedAt ? new Date(it.uploadedAt).toLocaleString() : it.url}
                      className="absolute inset-0"
                    >
                      <img src={toAbsolute(it.url)} alt="thumb" className="h-full w-full object-cover" />
                    </button>
                    <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 truncate">
                      {it.position ? POSITION_LABEL[it.position] : ''}
                    </span>
                    {allowDelete && (
                      <button
                        type="button"
                        aria-label="Delete photo"
                        onClick={async (e) => {
                          e.stopPropagation();
                          setActiveIndex(idx);
                          await deleteActive();
                        }}
                        className="absolute top-1 right-1 bg-red-600/90 hover:bg-red-700 text-white rounded p-1"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Tagging dialog */}
    <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tag photo positions</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {pendingFiles?.map((file, idx) => (
            <div key={`${file.name}-${idx}`} className="flex items-center gap-3">
              <div className="h-14 w-14 flex-shrink-0 rounded border overflow-hidden bg-gray-100">
                {previewUrls[idx] ? (
                  <img src={previewUrls[idx]} alt="preview" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 truncate text-sm" title={file.name}>{file.name}</div>
              <div className="w-44">
                <Select
                  value={pendingPositions[idx]}
                  onValueChange={(val: PhotoPosition) => {
                    const next = [...pendingPositions];
                    next[idx] = val as PhotoPosition;
                    setPendingPositions(next);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECOMMENDED_ORDER.map(p => (
                      <SelectItem key={p} value={p}>{POSITION_LABEL[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <Button variant="outline" size="sm" onClick={() => setPendingPositions(inferPositions(pendingFiles?.length || 0))}>Infer positions</Button>
            <div className="space-x-2">
              <Button variant="outline" size="sm" onClick={() => { setTagDialogOpen(false); setPendingFiles(null); setPendingPositions([]); }}>Cancel</Button>
              <Button size="sm" onClick={uploadWithPositions} disabled={uploading}>{uploading ? 'Uploading...' : 'Upload'}</Button>
            </div>
          </div>
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
    </>
  );
} 