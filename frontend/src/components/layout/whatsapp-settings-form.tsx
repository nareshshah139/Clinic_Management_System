'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api';
import { getErrorMessage } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardUser } from './dashboard-user-context';
import {
  buildTemplateSelectionValue,
  getSelectableWhatsAppTemplates,
  parseTemplateSelectionValue,
  parseWhatsAppSettings,
  parseMetadataObject,
  validateWhatsAppTemplateChoice,
  type WhatsAppTemplateOption,
} from '@/lib/whatsapp-settings';

type Draft = { autoConfirm: boolean; useTemplate: boolean; templateName: string; templateLanguage: string };

const meaningful = (draft: Draft): Draft => ({
  autoConfirm: draft.autoConfirm,
  useTemplate: draft.useTemplate,
  templateName: draft.useTemplate ? draft.templateName.trim() : '',
  templateLanguage: draft.useTemplate ? draft.templateLanguage.trim() : '',
});

const sameDraft = (a: Draft, b: Draft) => JSON.stringify(meaningful(a)) === JSON.stringify(meaningful(b));

export function WhatsAppSettingsForm({ onDirtyChange }: { onDirtyChange: (dirty: boolean) => void }) {
  const { user, refresh } = useDashboardUser();
  const { toast } = useToast();
  const [saved, setSaved] = useState<Draft>(() => {
    const { autoConfirm, useTemplate, templateName, templateLanguage } = parseWhatsAppSettings(user?.metadata);
    return { autoConfirm, useTemplate, templateName, templateLanguage };
  });
  const [draft, setDraft] = useState<Draft>(saved);
  const [saving, setSaving] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppTemplateOption[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const dirty = !sameDraft(draft, saved);

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  useEffect(() => {
    let cancelled = false;
    setTemplatesLoading(true);
    apiClient
      .getWhatsAppTemplates({ touchpoint: 'appointment_confirmation' })
      .then((result) => { if (!cancelled) setTemplates(getSelectableWhatsAppTemplates(result)); })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setTemplatesLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const selectedTemplateValue = buildTemplateSelectionValue(draft.templateName, draft.templateLanguage);
  const selectedSavedTemplateValue = templates.some((template) => template.value === selectedTemplateValue)
    ? selectedTemplateValue
    : undefined;

  const save = async () => {
    if (!user?.id) return;
    const validationMessage = validateWhatsAppTemplateChoice(draft);
    if (validationMessage) {
      toast({ variant: 'warning', title: 'WhatsApp settings incomplete', description: validationMessage });
      return;
    }
    try {
      setSaving(true);
      const metadata = {
        ...parseMetadataObject(user.metadata),
        whatsappAutoConfirmAppointments: draft.autoConfirm,
        whatsappUseTemplate: draft.useTemplate,
        whatsappTemplateName: draft.useTemplate ? draft.templateName.trim() || undefined : undefined,
        whatsappTemplateLanguage: draft.useTemplate ? draft.templateLanguage.trim() || undefined : undefined,
      };
      await apiClient.updateUserProfile(user.id, { metadata });
      setSaved(draft);
      await refresh();
      toast({ variant: 'success', title: 'WhatsApp settings saved', description: 'WhatsApp preferences updated.' });
    } catch (error) {
      toast({
        variant: 'warning',
        title: 'Save failed',
        description: getErrorMessage(error) || 'Could not save WhatsApp settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-md p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Send WhatsApp on appointment creation</div>
            <div className="text-xs text-muted-foreground">Enable automatic WhatsApp confirmation to patients when you are the doctor.</div>
          </div>
          <Switch aria-label="Send WhatsApp on appointment creation" checked={draft.autoConfirm} onCheckedChange={(value: boolean) => update({ autoConfirm: value })} />
        </div>
        <div className="text-xs text-muted-foreground">Requires backend WhatsApp credentials. Uses text messages by default.</div>
      </div>

      <div className="border rounded-md p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium">Use WhatsApp Template</div>
            <div className="text-xs text-muted-foreground">Recommended for sending messages outside the 24h window.</div>
          </div>
          <Switch aria-label="Use WhatsApp template" checked={draft.useTemplate} onCheckedChange={(value: boolean) => update({ useTemplate: value })} />
        </div>
        {draft.useTemplate && (
          <div className="space-y-3">
            {templatesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Spinner className="h-3.5 w-3.5 " />
                Loading approved templates…
              </div>
            ) : templates.length > 0 ? (
              <div>
                <label htmlFor="settings-wa-template" className="text-sm">Approved Templates</label>
                <Select
                  value={selectedSavedTemplateValue}
                  onValueChange={(value: string) => {
                    const next = parseTemplateSelectionValue(value);
                    update({ templateName: next.templateName, templateLanguage: next.templateLanguage });
                  }}
                >
                  <SelectTrigger id="settings-wa-template">
                    <SelectValue placeholder="Select a saved appointment template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.value} value={template.value}>
                        {template.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground mt-1">
                  Selecting from saved templates avoids name and language mismatches.
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No active appointment templates were found. You can still enter the template name and language manually.
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="settings-wa-template-name" className="text-sm">Template Name</label>
                <Input id="settings-wa-template-name"
                  value={draft.templateName}
                  onChange={(event) => update({ templateName: event.target.value })}
                  placeholder="e.g., appointment_confirm"
                />
              </div>
              <div>
                <label htmlFor="settings-wa-template-language" className="text-sm">Language Code</label>
                <Input id="settings-wa-template-language"
                  value={draft.templateLanguage}
                  onChange={(event) => update({ templateLanguage: event.target.value })}
                  placeholder="e.g., en, en_US, hi"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border rounded-md p-3 bg-muted">
        <div className="font-medium mb-2">How to enable WhatsApp (Doctor steps)</div>
        <ol className="list-decimal ml-5 space-y-1 text-muted-foreground text-sm">
          <li>Ask the admin to configure WhatsApp Cloud API credentials on the server.</li>
          <li>Toggle &quot;Send WhatsApp on appointment creation&quot; to enable automatic messages.</li>
          <li>Optional: Toggle &quot;Use WhatsApp Template&quot;, then enter your approved template name and language.</li>
          <li>Book or receive a new appointment to test delivery.</li>
        </ol>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? (
            <>
              <Spinner className="h-4 w-4 " />
              Saving…
            </>
          ) : (
            'Save WhatsApp settings'
          )}
        </Button>
        {!dirty && !saving && <p role="status" className="text-sm text-muted-foreground">No unsaved changes.</p>}
      </div>
    </div>
  );
}
