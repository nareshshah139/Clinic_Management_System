'use client';

import { Suspense, useState } from 'react';
import Image from 'next/image';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog as Sheet,
  DialogContent as SheetContent,
  DialogTitle as SheetTitle,
  DialogTrigger as SheetTrigger,
} from '@/components/ui/dialog';
import { Sidebar } from './sidebar';

export function MobileNavigation() {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Open clinic navigation">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent
          aria-describedby={undefined}
          className="left-0 top-0 block h-dvh w-72 max-w-72 translate-x-0 translate-y-0 overflow-y-auto rounded-none p-0"
        >
          <SheetTitle className="sr-only">Clinic navigation</SheetTitle>
          <Suspense>
            <Sidebar onNavigate={() => setOpen(false)} />
          </Suspense>
        </SheetContent>
      </Sheet>
      <Image src="/linae-name.png" alt="Linaé" width={304} height={112} className="h-6 w-auto" />
    </div>
  );
}
