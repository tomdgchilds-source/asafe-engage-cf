import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Thin wrapper around the browser Web Speech API for surveyors who'd rather
 * dictate notes into a phone propped on a forklift than tap with gloves on.
 *
 * Browser support — iOS Safari 14.5+ and Chrome on Android both ship it as
 * `webkitSpeechRecognition` with continuous + interim results. Firefox and
 * desktop Edge stragglers don't, so this hook reports `supported: false` and
 * the UI can degrade gracefully (we just hide the mic button).
 *
 * Continuous mode keeps listening until the user explicitly stops, which
 * matches the "walk-and-talk" workflow. We append finalized transcripts to
 * whatever the current `transcript` state holds — caller decides how to merge
 * that back into their notes textarea.
 */

type SpeechRecognitionAPI = any;

interface UseSpeechRecognitionResult {
  supported: boolean;
  listening: boolean;
  transcript: string;
  interim: string;
  start: () => void;
  stop: () => void;
  reset: () => void;
  error: string | null;
}

export function useSpeechRecognition(opts: { lang?: string } = {}): UseSpeechRecognitionResult {
  const { lang = 'en-GB' } = opts;
  const recognitionRef = useRef<SpeechRecognitionAPI | null>(null);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Ctor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Ctor) {
      setSupported(false);
      return;
    }
    setSupported(true);
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let finalChunk = '';
      let interimChunk = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interimChunk += r[0].transcript;
      }
      if (finalChunk) {
        setTranscript((prev) =>
          prev ? `${prev.trimEnd()} ${finalChunk.trim()}` : finalChunk.trim()
        );
      }
      setInterim(interimChunk);
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' fires constantly on a quiet warehouse mic — treat it as
      // benign and keep listening.
      if (event?.error === 'no-speech' || event?.error === 'aborted') return;
      setError(event?.error || 'speech-recognition-error');
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setInterim('');
    };

    recognitionRef.current = recognition;
    return () => {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      setError(null);
      r.start();
      setListening(true);
    } catch {
      // Already started — ignore.
    }
  }, []);

  const stop = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
  }, []);

  return { supported, listening, transcript, interim, start, stop, reset, error };
}

export default useSpeechRecognition;
