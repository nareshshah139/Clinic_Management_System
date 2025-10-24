'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Info, BookOpen } from 'lucide-react';

export interface GuideSection {
  title?: string;
  items: string[];
}

interface QuickGuideProps {
  title?: string;
  sections: GuideSection[];
  triggerText?: string;
  triggerVariant?: 'default' | 'outline' | 'ghost';
  triggerClassName?: string;
}

/**
 * Reusable Quick Guide component for displaying help and instructions
 * 
 * @example
 * ```tsx
 * <QuickGuide
 *   title="Inventory Management Guide"
 *   sections={[
 *     {
 *       title: "Getting Started",
 *       items: [
 *         "Click 'Add Item' to create new inventory items",
 *         "Use filters to search by category or stock status"
 *       ]
 *     }
 *   ]}
 * />
 * ```
 */
export function QuickGuide({
  title = 'Quick Guide',
  sections,
  triggerText = 'Quick Guide',
  triggerVariant = 'outline',
  triggerClassName = ''
}: QuickGuideProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant={triggerVariant}
        className={`flex items-center gap-2 ${triggerClassName}`}
        onClick={() => setOpen(true)}
      >
        <Info className="h-4 w-4" />
        {triggerText}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-blue-600" />
              {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {sections.map((section, sectionIdx) => (
              <div key={sectionIdx} className="space-y-2">
                {section.title && (
                  <h4 className="font-medium text-gray-900">{section.title}</h4>
                )}
                <ul className="text-sm text-gray-700 space-y-2 list-disc pl-5">
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

/**
 * Inline tooltip helper for adding hover tooltips to any element
 * Wrap your element with this component to add a tooltip
 */
export function InfoTooltip({ 
  children, 
  content 
}: { 
  children: React.ReactNode; 
  content: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <div 
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="cursor-help"
      >
        {children}
      </div>
      {show && (
        <div className="absolute z-50 px-3 py-2 text-sm text-white bg-gray-900 rounded-lg shadow-lg -top-12 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
          {content}
          <div className="absolute w-2 h-2 bg-gray-900 transform rotate-45 left-1/2 -translate-x-1/2 -bottom-1"></div>
        </div>
      )}
    </div>
  );
}

