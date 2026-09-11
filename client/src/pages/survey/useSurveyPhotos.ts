// ─────────────────────────────────────────────────────────
// React Query access to a survey's photos (Phase 3, Tasks S2/S3).
//
//   useSurveyPhotos(surveyId, { poll })  GET /api/site-surveys/:id/photos
//   useReanalysePhoto(surveyId)          POST /api/survey-photos/:id/reanalyse
//   usePatchSurveyPhoto(surveyId)        PATCH /api/survey-photos/:id
//
// Cache key is ["survey-photos", surveyId]; the upload queue writes into
// the same key so a freshly uploaded shot appears without a refetch.
// Polls every 4 s while any photo is still `pending` analysis.
// ─────────────────────────────────────────────────────────
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { SurveyPhoto } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";

export type AnalysisStatus = "pending" | "done" | "failed" | "skipped";

/** Server row as it arrives over JSON (timestamps are ISO strings) plus the served URL. */
export type SurveyPhotoView = Omit<SurveyPhoto, "takenAt" | "createdAt" | "analysisStatus"> & {
  takenAt: string | null;
  createdAt: string | null;
  analysisStatus: AnalysisStatus | string;
  objectUrl: string;
};

export const POLL_INTERVAL_MS = 4_000;

export const surveyPhotosKey = (surveyId: string) => ["survey-photos", surveyId] as const;

export function hasPendingAnalysis(photos: readonly SurveyPhotoView[] | undefined): boolean {
  return !!photos?.some((p) => p.analysisStatus === "pending");
}

/** Insert or replace a photo at the head of the cached list. */
export function upsertPhotoInCache(qc: QueryClient, surveyId: string, photo: SurveyPhotoView): void {
  qc.setQueryData<SurveyPhotoView[]>(surveyPhotosKey(surveyId), (prev) => {
    const rest = (prev ?? []).filter((p) => p.id !== photo.id);
    return [photo, ...rest];
  });
}

export function removePhotoFromCache(qc: QueryClient, surveyId: string, photoId: string): void {
  qc.setQueryData<SurveyPhotoView[]>(surveyPhotosKey(surveyId), (prev) => (prev ?? []).filter((p) => p.id !== photoId));
}

export async function fetchSurveyPhotos(surveyId: string): Promise<SurveyPhotoView[]> {
  const res = await apiRequest(`/api/site-surveys/${encodeURIComponent(surveyId)}/photos`, "GET");
  return (await res.json()) as SurveyPhotoView[];
}

export function useSurveyPhotos(surveyId: string | undefined, opts: { poll?: boolean } = {}) {
  const poll = opts.poll ?? true;
  return useQuery<SurveyPhotoView[]>({
    queryKey: surveyPhotosKey(surveyId ?? ""),
    enabled: !!surveyId,
    queryFn: () => fetchSurveyPhotos(surveyId as string),
    staleTime: 0,
    refetchInterval: (query) => (poll && hasPendingAnalysis(query.state.data) ? POLL_INTERVAL_MS : false),
    refetchIntervalInBackground: false,
  });
}

export function useReanalysePhoto(surveyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      const res = await apiRequest(`/api/survey-photos/${encodeURIComponent(photoId)}/reanalyse`, "POST");
      return (await res.json()) as SurveyPhotoView;
    },
    onSuccess: (photo) => {
      if (surveyId) upsertPhotoInCache(qc, surveyId, photo);
    },
  });
}

export type SurveyPhotoPatch = { zoneName?: string | null; areaId?: string | null; voiceNote?: string | null };

export function usePatchSurveyPhoto(surveyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ photoId, patch }: { photoId: string; patch: SurveyPhotoPatch }) => {
      const res = await apiRequest(`/api/survey-photos/${encodeURIComponent(photoId)}`, "PATCH", patch);
      return (await res.json()) as SurveyPhotoView;
    },
    onSuccess: (photo) => {
      if (surveyId) upsertPhotoInCache(qc, surveyId, photo);
    },
  });
}

export function useDeleteSurveyPhoto(surveyId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string) => {
      await apiRequest(`/api/survey-photos/${encodeURIComponent(photoId)}`, "DELETE");
      return photoId;
    },
    onSuccess: (photoId) => {
      if (surveyId) removePhotoFromCache(qc, surveyId, photoId);
    },
  });
}
