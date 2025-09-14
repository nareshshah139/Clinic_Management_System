'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  visitId: string;
  apiBase?: string; // optional override
}

export default function VisitPhotos({ visitId, apiBase }: Props) {
  const [files, setFiles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);

  const baseUrl = apiBase || process.env.NEXT_PUBLIC_API_URL || '';

  const load = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const res = await fetch(`${baseUrl}/visits/${visitId}/photos`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      credentials: 'include',
    });
    const data = await res.json();
    setFiles(data.attachments || []);
  };

  useEffect(() => { void load(); }, [visitId]);

  const onUpload = async (evt: React.ChangeEvent<HTMLInputElement>) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    const f = evt.target.files;
    if (!f || f.length === 0) return;
    const fd = new FormData();
    Array.from(f).forEach(file => fd.append('files', file));
    try {
      setUploading(true);
      await fetch(`${baseUrl}/visits/${visitId}/photos`, {
        method: 'POST',
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } as any : undefined,
        credentials: 'include',
      });
      await load();
      if (inputRef.current) inputRef.current.value = '';
      if (cameraRef.current) cameraRef.current.value = '';
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert('Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Before / After Photos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={onUpload} className="hidden" />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={onUpload} className="hidden" />
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>Upload from device</Button>
          <Button className="ml-2" size="sm" disabled={uploading} onClick={() => cameraRef.current?.click()}>Take photo</Button>
        </div>
        {files.length === 0 ? (
          <div className="text-sm text-gray-500">No photos uploaded yet</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {files.map((p) => (
              <a key={p} href={p} target="_blank" rel="noreferrer">
                <div className="relative w-full h-48 bg-gray-100 rounded border flex items-center justify-center overflow-hidden">
                  <img src={p} alt="visit" className="max-h-full max-w-full object-contain" />
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
} 