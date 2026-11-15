import { Logger } from '@nestjs/common';

export interface DiarizedSegment {
  speaker: 'DOCTOR' | 'PATIENT';
  text: string;
  start_s?: number | null;
  end_s?: number | null;
  confidence?: number;
}

export interface SpeakerSplit {
  segments: DiarizedSegment[];
  doctorText: string;
  patientText: string;
}

const logger = new Logger('SpeakerSplit');

const EMPTY_SPLIT: SpeakerSplit = {
  segments: [],
  doctorText: '',
  patientText: '',
};

const DIARIZATION_JSON_SCHEMA = {
  name: 'DiarizationSchema',
  schema: {
    type: 'object',
    required: ['segments', 'speakers'],
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          required: ['speaker', 'text'],
          properties: {
            speaker: { type: 'string', enum: ['DOCTOR', 'PATIENT'] },
            text: { type: 'string' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            start_s: { type: ['number', 'null'] },
            end_s: { type: ['number', 'null'] },
          },
        },
      },
      speakers: {
        type: 'object',
        required: ['doctorText', 'patientText'],
        properties: {
          doctorText: { type: 'string' },
          patientText: { type: 'string' },
        },
      },
    },
  },
  strict: true,
} as const;

const SYSTEM_PROMPT =
  'You are a medical scribe. Given a clinical conversation (full transcript or segments), split into speaker turns labeled DOCTOR or PATIENT only. ' +
  'Cues: questions/instructions/orders/examination → DOCTOR; symptoms/history/concerns → PATIENT. ' +
  'Preserve medical terms, numbers, and units verbatim. ' +
  'Return STRICT JSON with keys: segments (array of {speaker, text, confidence, start_s, end_s}), and speakers ({doctorText, patientText}). ' +
  'Concatenate segments chronologically for doctorText and patientText. If timestamps are provided in input, propagate them; otherwise use null. No extra commentary.';

export async function splitSpeakers(input: {
  text: string;
  segments?: unknown[];
}): Promise<SpeakerSplit> {
  try {
    const rawSegments = (input.segments ?? []) as Array<{
      text?: unknown;
      start?: unknown;
      end?: unknown;
    }>;
    const payload =
      rawSegments.length > 0
        ? {
            segments: rawSegments.map((s) => ({
              text: typeof s?.text === 'string' ? s.text : '',
              start_s: typeof s?.start === 'number' ? s.start : null,
              end_s: typeof s?.end === 'number' ? s.end : null,
            })),
          }
        : { transcript: input.text };

    const resp = await fetch(
      process.env.OPENAI_CHAT_COMPLETIONS_URL ||
        'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_DIARIZATION_MODEL || 'gpt-4o',
          temperature: 0,
          response_format: {
            type: 'json_schema',
            json_schema: DIARIZATION_JSON_SCHEMA,
          },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: JSON.stringify(payload) },
          ],
        }),
      },
    );
    if (!resp.ok) {
      logger.warn(`speaker split failed: status=${resp.status}`);
      return EMPTY_SPLIT;
    }
    const body = await resp.json();
    const content = body?.choices?.[0]?.message?.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.warn('speaker split: failed to parse JSON content');
      return EMPTY_SPLIT;
    }
    const segs = Array.isArray(parsed?.segments)
      ? (parsed.segments as Array<any>)
      : [];
    const segments: DiarizedSegment[] = segs
      .map((s) => ({
        speaker:
          typeof s?.speaker === 'string' &&
          s.speaker.toUpperCase().includes('DOC')
            ? ('DOCTOR' as const)
            : ('PATIENT' as const),
        text: typeof s?.text === 'string' ? s.text : '',
        confidence:
          typeof s?.confidence === 'number' ? s.confidence : undefined,
        start_s:
          typeof s?.start_s === 'number' || s?.start_s === null
            ? s.start_s
            : undefined,
        end_s:
          typeof s?.end_s === 'number' || s?.end_s === null
            ? s.end_s
            : undefined,
      }))
      .filter((s) => s.text);
    const joined = (speaker: DiarizedSegment['speaker']) =>
      segments
        .filter((s) => s.speaker === speaker)
        .map((s) => s.text)
        .join(' ');
    const doctorText =
      parsed?.speakers?.doctorText &&
      typeof parsed.speakers.doctorText === 'string'
        ? parsed.speakers.doctorText
        : joined('DOCTOR');
    const patientText =
      parsed?.speakers?.patientText &&
      typeof parsed.speakers.patientText === 'string'
        ? parsed.speakers.patientText
        : joined('PATIENT');
    return { segments, doctorText, patientText };
  } catch (e: any) {
    logger.warn(`speaker split error: ${e?.name || 'Error'}`);
    return EMPTY_SPLIT;
  }
}
