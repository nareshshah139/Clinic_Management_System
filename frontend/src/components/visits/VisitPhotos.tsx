'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Image as ImageIcon } from 'lucide-react';

interface Props {
  visitId: string;
  apiBase?: string; // optional override
  onVisitNeeded?: () => Promise<string>; // Callback to create visit if needed
  patientId?: string; // required for draft uploads when visitId is temp
}

interface PhotoItem { url: string; uploadedAt?: string | null }

export default function VisitPhotos({ visitId, apiBase, onVisitNeeded, patientId }: Props) {
  const [items, setItems] = useState<PhotoItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const baseUrl = apiBase || process.env.NEXT_PUBLIC_API_URL || '/api';

  const toAbsolute = (path: string) => {
    if (!path) return path;
    if (/^https?:\/\//i.test(path)) return path;
    // Files are served under /uploads/... from the backend, proxied by Next rewrites
    return path.startsWith('/uploads/') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  };

  const load = async () => {
    // Don't try to load if visitId is temp
    if (visitId === 'temp') {
      if (!patientId) { setItems([]); return; }
      try {
        const res = await fetch(`${baseUrl}/visits/photos/draft/${patientId}`, { credentials: 'include' });
        if (!res.ok) { setItems([]); return; }
        const data = await res.json();
        const incoming: PhotoItem[] = (data.items as PhotoItem[] | undefined) || [];
        setItems(incoming);
        setActiveIndex(0);
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
        .map((it) => ({ ...it, url: toAbsolute(it.url) }));
      // Sort by uploadedAt ascending, fallback to URL alphabetical if missing
      incoming.sort((a, b) => {
        const at = a.uploadedAt ? Date.parse(a.uploadedAt) : 0;
        const bt = b.uploadedAt ? Date.parse(b.uploadedAt) : 0;
        if (at === bt) return a.url.localeCompare(b.url);
        return at - bt;
      });
      setItems(incoming);
      setActiveIndex(0);
    } catch (error) {
      console.error('Error loading photos:', error);
    }
  };

  useEffect(() => { void load(); }, [visitId, patientId]);

  const onUpload = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const f = evt.target.files;
    if (!f || f.length === 0) return;
    
    let actualVisitId = visitId;
    
    // If visitId is temp, create a real visit first or upload to draft by patient
    if (visitId === 'temp') {
      if (!patientId) { alert('Patient is required to upload draft photos'); return; }
      const fd = new FormData();
      Array.from(f).forEach(file => fd.append('files', file));
      try {
        setUploading(true);
        const response = await fetch(`${baseUrl}/visits/photos/draft/${patientId}`, {
          method: 'POST',
          body: fd,
          credentials: 'include',
        });
        if (!response.ok) throw new Error(`Draft upload failed: ${response.status}`);
        await load();
        if (inputRef.current) inputRef.current.value = '';
        if (cameraRef.current) cameraRef.current.value = '';
      } catch (e) {
        console.error('Draft upload error:', e);
        alert('Failed to upload photos. Please try again.');
      } finally {
        setUploading(false);
      }
      return;
    }
    
    const fd = new FormData();
    Array.from(f).forEach(file => fd.append('files', file));
    try {
      setUploading(true);
      const response = await fetch(`${baseUrl}/visits/${actualVisitId}/photos`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`);
      }
      await load();
      if (inputRef.current) inputRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    } catch (e) {
      console.error('Upload error:', e);
      alert('Failed to upload photos. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const active = items[activeIndex] || null;
  const previous = useMemo(() => (activeIndex > 0 ? items[activeIndex - 1] : null), [items, activeIndex]);

  return (
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
            {items.length > 1 && (
              <Button variant={compareMode ? 'default' : 'outline'} size="sm" onClick={() => setCompareMode(v => !v)}>
                {compareMode ? 'Compare: On' : 'Compare: Off'}
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
              <div className="grid grid-cols-2 gap-3">
                <div className="w-full aspect-video bg-gray-100 rounded border flex items-center justify-center overflow-hidden">
                  {previous ? <img src={toAbsolute(previous.url)} alt="before" className="max-h-full max-w-full object-contain" /> : <div className="text-xs text-gray-500">No previous photo</div>}
                </div>
                <div className="w-full aspect-video bg-gray-100 rounded border flex items-center justify-center overflow-hidden">
                  {active ? <img src={toAbsolute(active.url)} alt="after" className="max-h-full max-w-full object-contain" /> : null}
                </div>
              </div>
            )}

            {/* Meta */}
            <div className="text-xs text-gray-500 flex items-center justify-between">
              <div>
                {active?.uploadedAt ? `Uploaded: ${new Date(active.uploadedAt).toLocaleString()}` : ''}
              </div>
              <div className="space-x-2">
                <Button size="sm" variant="outline" onClick={() => setActiveIndex(i => Math.max(0, i - 1))} disabled={items.length <= 1}>Prev</Button>
                <Button size="sm" variant="outline" onClick={() => setActiveIndex(i => Math.min(items.length - 1, i + 1))} disabled={items.length <= 1}>Next</Button>
              </div>
            </div>

            {/* Scrollable thumbnail strip */}
            <div className="w-full overflow-x-auto">
              <div className="flex gap-2 py-2">
                {items.map((it, idx) => (
                  <button
                    key={it.url}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`relative h-20 w-28 flex-shrink-0 rounded border overflow-hidden ${idx === activeIndex ? 'ring-2 ring-blue-500' : ''}`}
                    title={it.uploadedAt ? new Date(it.uploadedAt).toLocaleString() : it.url}
                  >
                    <img src={toAbsolute(it.url)} alt="thumb" className="h-full w-full object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-[10px] px-1 truncate">
                      {it.uploadedAt ? new Date(it.uploadedAt).toLocaleDateString() : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
} 