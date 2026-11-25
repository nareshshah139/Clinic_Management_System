'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookOpen, CircleHelp } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface GuideSection {
  title?: string;
  items: string[];
}

interface QuickGuideProps {
  title?: string;
  sections: GuideSection[];
}

export function QuickGuide({ title = 'Quick guide', sections }: QuickGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Quick guide" onClick={() => setOpen(true)}>
              <CircleHelp className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Quick guide</TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-info-text" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {sections.map((section, sectionIdx) => (
              <div key={sectionIdx} className="space-y-2">
                {section.title && (
                  <h4 className="font-medium text-foreground">{section.title}</h4>
                )}
                <ul className="text-sm text-foreground space-y-2 list-disc pl-5">
                  {section.items.map((item, itemIdx) => (
                    <li key={itemIdx}>{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
