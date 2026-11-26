import { Logger } from '@nestjs/common';

export interface DiarizedSegment {
  speaker: 'DOCTOR' | 'PATIENT';
  text: string;
  start_s?: number | null;
  end_s?: number | null;
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

const SPEAKER_TURNS_SCHEMA = {
  name: 'SpeakerTurns',
  schema: {
    type: 'object',
    required: ['turns'],
    additionalProperties: false,
    properties: {
      turns: {
        type: 'array',
        items: {
          type: 'object',
          required: ['from', 'speaker'],
          additionalProperties: false,
          properties: {
            from: { type: 'integer' },
            speaker: { type: 'string', enum: ['DOCTOR', 'PATIENT'] },
          },
        },
      },
    },
  },
  strict: true,
} as const;

const SYSTEM_PROMPT =
  'You are a medical scribe. The input is a clinical conversation as numbered lines. Mark where each speaker turn starts: DOCTOR or PATIENT. ' +
  'Cues: questions/instructions/orders/examination → DOCTOR; symptoms/history/concerns → PATIENT. ' +
  'Return one entry each time the speaker changes, in order, as {"turns": [{"from": <first line number of the turn>, "speaker": "DOCTOR" | "PATIENT"}]}. ' +
  'The first entry starts at line 0. Do not repeat the text.';

interface Line {
  text: string;
  start_s: number | null;
  end_s: number | null;
}

function linesOf(input: { text: string; segments?: unknown[] }): Line[] {
  const timed = (input.segments ?? []) as Array<{
    text?: unknown;
    start?: unknown;
    end?: unknown;
  }>;
  if (timed.length > 0) {
    return timed.map((s) => ({
      text: typeof s?.text === 'string' ? s.text.trim() : '',
      start_s: typeof s?.start === 'number' ? s.start : null,
      end_s: typeof s?.end === 'number' ? s.end : null,
    }));
  }
  return input.text
    .split(/(?<=[.?!\u0964])\s+/)
    .map((text) => ({ text: text.trim(), start_s: null, end_s: null }));
}

export async function splitSpeakers(input: {
  text: string;
  segments?: unknown[];
}): Promise<SpeakerSplit> {
  try {
    const lines = linesOf(input).filter((line) => line.text);
    if (lines.length === 0) return EMPTY_SPLIT;
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
            json_schema: SPEAKER_TURNS_SCHEMA,
          },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: lines.map((line, i) => `${i}: ${line.text}`).join('\n'),
            },
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
    const turns: Array<{ from: number; speaker: DiarizedSegment['speaker'] }> =
      (Array.isArray(parsed?.turns) ? parsed.turns : [])
        .filter(
          (turn: any) =>
            Number.isInteger(turn?.from) &&
            (turn.speaker === 'DOCTOR' || turn.speaker === 'PATIENT'),
        )
        .sort((a: { from: number }, b: { from: number }) => a.from - b.from);
    if (turns.length === 0) return EMPTY_SPLIT;
    const segments: DiarizedSegment[] = [];
    let next = 0;
    lines.forEach((line, i) => {
      while (next + 1 < turns.length && turns[next + 1].from <= i) next++;
      const { speaker } = turns[next];
      const previous = segments[segments.length - 1];
      if (previous?.speaker === speaker) {
        previous.text = `${previous.text} ${line.text}`;
        previous.end_s = line.end_s;
      } else {
        segments.push({
          speaker,
          text: line.text,
          start_s: line.start_s,
          end_s: line.end_s,
        });
      }
    });
    const joined = (speaker: DiarizedSegment['speaker']) =>
      segments
        .filter((s) => s.speaker === speaker)
        .map((s) => s.text)
        .join(' ');
    return {
      segments,
      doctorText: joined('DOCTOR'),
      patientText: joined('PATIENT'),
    };
  } catch (e: any) {
    logger.warn(`speaker split error: ${e?.name || 'Error'}`);
    return EMPTY_SPLIT;
  }
}
