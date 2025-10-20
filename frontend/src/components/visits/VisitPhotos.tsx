'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, LayoutGrid, Rows } from 'lucide-react';
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
  const [taggingMode, setTaggingMode] = useState<'GRID' | 'SINGLE'>('GRID');
  const [taggingIndex, setTaggingIndex] = useState<number>(0);
  const [batchState, setBatchState] = useState<{ current: number; total: number; percent?: number }>({ current: 0, total: 0, percent: 0 });
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

  // Keyboard navigation in single tagging mode
  useEffect(() => {
    if (!tagDialogOpen || taggingMode !== 'SINGLE') return;
    const handler = (e: KeyboardEvent) => {
      if (!pendingFiles || pendingFiles.length === 0) return;
      if (e.key === 'ArrowLeft') {
        setTaggingIndex(i => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        setTaggingIndex(i => Math.min((pendingFiles.length - 1), i + 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tagDialogOpen, taggingMode, pendingFiles]);

  const openTaggingForFiles = (files: File[]) => {
    setPendingFiles(files);
    setPendingPositions(inferPositions(files.length));
    setTaggingIndex(0);
    setTaggingMode('SINGLE');
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

      // Downscale friendly formats client-side to reduce upload and server CPU
      const shouldDownscale = (type: string) => {
        const t = (type || '').toLowerCase();
        if (!t.startsWith('image/')) return false;
        // Avoid client processing HEIC/HEIF; let server handle conversion
        if (t.includes('heic') || t.includes('heif')) return false;
        return t.includes('jpeg') || t.includes('jpg') || t.includes('png') || t.includes('webp');
      };

      const preferWebP = (() => {
        try {
          const c = document.createElement('canvas');
          // Some browsers may not implement toDataURL for webp; guard it
          const ok = typeof c.toDataURL === 'function' && c.toDataURL('image/webp').startsWith('data:image/webp');
          return ok;
        } catch {
          return false;
        }
      })();

      const downscaleImage = async (file: File, maxDim = 1600, quality = 0.75, outputType: 'image/jpeg' | 'image/webp' = 'image/jpeg'): Promise<File | Blob> => {
        try {
          if (!shouldDownscale(file.type)) return file;
          const url = URL.createObjectURL(file);
          const loadBitmap = async () => {
            try {
              // Prefer createImageBitmap for performance
              // @ts-ignore
              if (typeof createImageBitmap === 'function') {
                // @ts-ignore
                const bmp = await createImageBitmap(await fetch(url).then(r => r.blob()));
                return { width: bmp.width, height: bmp.height, bitmap: bmp } as any;
              }
            } catch {}
            // Fallback to HTMLImageElement
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const i = new Image();
              i.onload = () => resolve(i);
              i.onerror = reject;
              i.src = url;
            });
            return { width: img.naturalWidth || img.width, height: img.naturalHeight || img.height, image: img } as any;
          };

          const src = await loadBitmap();
          const { width, height } = src;
          if (!width || !height) {
            try { URL.revokeObjectURL(url); } catch {}
            return file;
          }
          const scale = Math.min(1, maxDim / Math.max(width, height));
          const targetW = Math.max(1, Math.floor(width * scale));
          const targetH = Math.max(1, Math.floor(height * scale));

          // Use OffscreenCanvas when available
          const hasOffscreen = typeof (globalThis as any).OffscreenCanvas === 'function';
          if (hasOffscreen) {
            const canvas = new (globalThis as any).OffscreenCanvas(targetW, targetH);
            const ctx = canvas.getContext('2d');
            if (!ctx) { try { URL.revokeObjectURL(url); } catch {}; return file; }
            if (src.bitmap) {
              ctx.drawImage(src.bitmap, 0, 0, targetW, targetH);
              try { (src.bitmap as any).close?.(); } catch {}
            } else {
              ctx.drawImage(src.image, 0, 0, targetW, targetH);
            }
            let blob: Blob | null = null;
            try {
              blob = await canvas.convertToBlob({ type: outputType, quality });
            } catch {
              try {
                blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: Math.max(0.6, quality) });
              } catch {}
            }
            try { URL.revokeObjectURL(url); } catch {}
            if (!blob) return file;
            const ext = outputType === 'image/webp' ? '.webp' : '.jpg';
            const type = outputType === 'image/webp' ? 'image/webp' : 'image/jpeg';
            return new File([blob], (file.name.replace(/\.[^.]+$/, '') || 'photo') + ext, { type });
          }

          // HTMLCanvas fallback
          const canvas = document.createElement('canvas');
          canvas.width = targetW; canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) { try { URL.revokeObjectURL(url); } catch {}; return file; }
          if (src.bitmap) {
            ctx.drawImage(src.bitmap, 0, 0, targetW, targetH);
            try { (src.bitmap as any).close?.(); } catch {}
          } else {
            ctx.drawImage(src.image, 0, 0, targetW, targetH);
          }
          let blob: Blob | null = null;
          await new Promise<void>((resolve) => {
            try {
              canvas.toBlob((b) => {
                blob = b;
                resolve();
              }, outputType, quality);
            } catch {
              canvas.toBlob((b) => {
                blob = b;
                resolve();
              }, 'image/jpeg', Math.max(0.6, quality));
            }
          });
          try { URL.revokeObjectURL(url); } catch {}
          if (!blob) return file;
          const ext = outputType === 'image/webp' ? '.webp' : '.jpg';
          const type = outputType === 'image/webp' ? 'image/webp' : 'image/jpeg';
          return new File([blob], (file.name.replace(/\.[^.]+$/, '') || 'photo') + ext, { type });
        } catch {
          return file;
        }
      };

      const xhrUpload = (url: string, formData: FormData, onProgress?: (pct: number) => void, timeoutMs = 90000) => {
        return new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', url, true);
          xhr.withCredentials = true;
          xhr.timeout = timeoutMs;
          if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (evt) => {
              if (!evt.lengthComputable) return;
              const pct = Math.max(0, Math.min(100, Math.round((evt.loaded / evt.total) * 100)));
              onProgress(pct);
            };
          }
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status >= 200 && xhr.status < 300) resolve();
              else reject(new Error(`HTTP ${xhr.status}`));
            }
          };
          xhr.ontimeout = () => reject(new Error('Timeout'));
          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(formData);
        });
      };

      const failures: string[] = [];

      const totalBatches = fileBatches.length;
      setBatchState({ current: 0, total: totalBatches, percent: 0 });

      const uploadOne = async (batchIndex: number) => {
        const group = fileBatches[batchIndex];
        const groupPositions = posBatches[batchIndex];
        // Downscale each file in this batch
        const processed = await Promise.all(group.map(f => downscaleImage(
          f,
          1600,
          preferWebP ? 0.7 : 0.75,
          preferWebP ? 'image/webp' : 'image/jpeg',
        )));
        const fd = new FormData();
        processed.forEach((f) => fd.append('files', f as any));
        fd.append('positions', JSON.stringify(groupPositions));

        const targetUrl = visitId === 'temp'
          ? `${baseUrl}/visits/photos/draft/${patientId}`
          : `${baseUrl}/visits/${actualVisitId}/photos`;

        try {
          await xhrUpload(targetUrl, fd, (pct) => {
            setBatchState(prev => ({ current: Math.min(prev.current, batchIndex) + 1, total: totalBatches, percent: pct }));
          }, 90000);
        } catch (e: any) {
          failures.push(`Batch ${batchIndex + 1}: ${e?.message || 'failed'}`);
        } finally {
          setBatchState(prev => ({ current: Math.min(batchIndex + 1, totalBatches), total: totalBatches, percent: 0 }));
        }
      };

      const threads = (typeof navigator !== 'undefined' && (navigator as any)?.hardwareConcurrency) ? (navigator as any).hardwareConcurrency : 2;
      const CONCURRENCY = Math.max(2, Math.min(4, Math.floor(threads / 2) || 2));
      const queue = Array.from({ length: totalBatches }, (_, i) => i);
      const workers: Promise<void>[] = [];
      for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i += 1) {
        workers.push((async function run() {
          while (queue.length) {
            const idx = queue.shift();
            if (idx === undefined) break;
            await uploadOne(idx);
          }
        })());
      }
      await Promise.all(workers);

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
      setBatchState({ current: 0, total: 0, percent: 0 });
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
      <DialogContent className="max-w-[95vw] sm:max-w-3xl md:max-w-5xl lg:max-w-[90vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tag photo positions</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-600">Mode</span>
              <Button size="sm" variant={taggingMode === 'GRID' ? 'default' : 'outline'} onClick={() => setTaggingMode('GRID')}>
                <LayoutGrid className="h-3 w-3 mr-1" /> Grid
              </Button>
              <Button size="sm" variant={taggingMode === 'SINGLE' ? 'default' : 'outline'} onClick={() => setTaggingMode('SINGLE')}>
                <Rows className="h-3 w-3 mr-1" /> Single
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPendingPositions(inferPositions(pendingFiles?.length || 0))}>Infer positions</Button>
          </div>

          {taggingMode === 'SINGLE' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-700">
                <div className="truncate" title={pendingFiles?.[taggingIndex]?.name || ''}>{pendingFiles?.[taggingIndex]?.name}</div>
                <div className="text-xs">{(taggingIndex + 1)} / {pendingFiles?.length || 0}</div>
              </div>
              <div className="relative w-full bg-gray-100 rounded border aspect-video flex items-center justify-center overflow-hidden">
                {previewUrls[taggingIndex] ? (
                  <img src={previewUrls[taggingIndex]} alt="preview" className="max-h-full max-w-full object-contain" />
                ) : null}
                <div className="absolute inset-y-0 left-0 flex items-center p-2">
                  <Button size="sm" variant="outline" onClick={() => setTaggingIndex(i => Math.max(0, i - 1))} disabled={!pendingFiles || taggingIndex <= 0}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="absolute inset-y-0 right-0 flex items-center p-2">
                  <Button size="sm" variant="outline" onClick={() => setTaggingIndex(i => Math.min(((pendingFiles?.length || 1) - 1), i + 1))} disabled={!pendingFiles || taggingIndex >= ((pendingFiles?.length || 1) - 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-56">
                  <Select
                    value={pendingPositions[taggingIndex]}
                    onValueChange={(val: PhotoPosition) => {
                      const next = [...pendingPositions];
                      next[taggingIndex] = val as PhotoPosition;
                      setPendingPositions(next);
                      if (pendingFiles && taggingIndex < pendingFiles.length - 1) {
                        setTaggingIndex(taggingIndex + 1);
                      }
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
                <div className="ml-auto space-x-2">
                  <Button size="sm" variant="outline" onClick={() => setTaggingIndex(i => Math.max(0, i - 1))} disabled={!pendingFiles || taggingIndex <= 0}><ChevronLeft className="h-4 w-4 mr-1" />Prev</Button>
                  <Button size="sm" variant="outline" onClick={() => setTaggingIndex(i => Math.min(((pendingFiles?.length || 1) - 1), i + 1))} disabled={!pendingFiles || taggingIndex >= ((pendingFiles?.length || 1) - 1)}>Next<ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </div>

              <div className="w-full overflow-x-auto">
                <div className="flex gap-2 py-2">
                  {pendingFiles?.map((f, i) => (
                    <button key={`${f.name}-${i}`} type="button" onClick={() => setTaggingIndex(i)} className={`relative h-20 w-20 flex-shrink-0 rounded border overflow-hidden ${i === taggingIndex ? 'ring-2 ring-blue-500' : ''}`} title={f.name}>
                      {previewUrls[i] ? (
                        <img src={previewUrls[i]} alt="thumb" className="h-full w-full object-cover" />
                      ) : null}
                      <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 truncate">
                        {pendingPositions[i] ? POSITION_LABEL[pendingPositions[i]] : ''}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {pendingFiles?.map((file, idx) => (
                <div key={`${file.name}-${idx}`} className="rounded border p-2">
                  <div className="aspect-square w-full rounded bg-gray-100 overflow-hidden">
                    {previewUrls[idx] ? (
                      <img src={previewUrls[idx]} alt="preview" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="mt-2">
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
                  <div className="mt-1 text-[10px] text-gray-500 truncate" title={file.name}>{file.name}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <div />
            <div className="space-x-2">
              <Button variant="outline" size="sm" onClick={() => { setTagDialogOpen(false); setPendingFiles(null); setPendingPositions([]); }}>Cancel</Button>
              <Button size="sm" onClick={uploadWithPositions} disabled={uploading}>
                {uploading ? (
                  batchState.total > 0
                    ? `Uploading (${Math.min(batchState.current + (batchState.percent ? 1 : 0), batchState.total)}/${batchState.total})${batchState.percent ? ` - ${batchState.percent}%` : ''}`
                    : 'Uploading...'
                ) : 'Upload'}
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
    </>
  );
} 