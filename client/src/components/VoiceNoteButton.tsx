import { useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { cn } from '@/lib/utils';

/**
 * Microphone button paired with a textarea — when tapped, opens the
 * SpeechRecognition API and appends the transcript to the existing text.
 *
 * The contract is dead simple: caller passes the current note `value`
 * and an `onChange(next)`; we read the dictation, splice it in, and call
 * `onChange` with the merged string. Surveyors can tap to start, tap to
 * stop, and edit by hand whenever they want.
 *
 * If the browser doesn't support SpeechRecognition (Firefox, older
 * desktop Edge), the button hides itself rather than throw or render a
 * disabled stub. The textarea continues to work normally.
 */
export interface VoiceNoteButtonProps {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  /** Hide entirely on completed/read-only surveys. */
  disabled?: boolean;
  /** Optional test id for e2e. */
  testId?: string;
}

export function VoiceNoteButton({
  value,
  onChange,
  className,
  disabled = false,
  testId = 'button-voice-note',
}: VoiceNoteButtonProps) {
  const { supported, listening, transcript, start, stop, reset, error } =
    useSpeechRecognition();

  // Cache the value at start-of-dictation so we can compute the delta to
  // append. Avoids stomping on edits the user makes mid-dictation.
  const baselineRef = useRef<string>('');
  const lastTranscriptRef = useRef<string>('');

  useEffect(() => {
    if (!listening) return;
    if (!transcript) return;
    if (transcript === lastTranscriptRef.current) return;
    lastTranscriptRef.current = transcript;
    const baseline = baselineRef.current;
    const merged = baseline
      ? `${baseline.trimEnd()} ${transcript.trim()}`
      : transcript.trim();
    onChange(merged);
    // We deliberately depend only on `transcript` — the consumer's `value`
    // would create a feedback loop, since each onChange re-renders us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, listening]);

  if (!supported || disabled) return null;

  const handleClick = () => {
    if (listening) {
      stop();
      return;
    }
    baselineRef.current = value || '';
    lastTranscriptRef.current = '';
    reset();
    start();
  };

  return (
    <Button
      type="button"
      variant={listening ? 'destructive' : 'outline'}
      size="sm"
      className={cn(
        'min-h-[44px] min-w-[44px] gap-2',
        listening && 'animate-pulse',
        className,
      )}
      onClick={handleClick}
      aria-label={listening ? 'Stop dictation' : 'Dictate note'}
      aria-pressed={listening}
      data-testid={testId}
    >
      {listening ? (
        <>
          <MicOff className="h-4 w-4" />
          <span className="hidden sm:inline">Stop</span>
        </>
      ) : (
        <>
          <Mic className="h-4 w-4" />
          <span className="hidden sm:inline">Dictate</span>
        </>
      )}
      {error && (
        <span className="sr-only" role="alert">
          Speech recognition error: {error}
        </span>
      )}
    </Button>
  );
}

export default VoiceNoteButton;
