import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ClipboardCheck, MapPin, Camera, AlertTriangle, FileText, Plus, Edit, Trash2, Upload, ShoppingCart, Download, Shield, AlertCircle, History, Search, Clock, ChevronDown, CheckCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Pas13ChatPanel } from '@/components/Pas13ChatPanel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { InfoPopover } from '@/components/ui/info-popover';
import { generateSiteSurveyPdf } from '@/utils/siteSurveyPdfGenerator';
import { useToast } from '@/hooks/use-toast';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { ObjectUploader } from '@/components/ObjectUploader';
import { AddToCartModal } from '@/components/AddToCartModal';
import { BarrierRecommendationsBlock } from '@/components/BarrierRecommendationsBlock';
import { LogoSuggestions } from '@/components/LogoSuggestions';
import { MatterportViewer, parseMatterportUrl } from '@/components/MatterportViewer';
import { useOfflineSurvey } from '@/hooks/useOfflineSurvey';
import { useActiveProject } from '@/hooks/useActiveProject';
import type { UploadResult } from '@uppy/core';
import { OfflineBanner } from '@/components/OfflineBanner';
import { SavedAgoIndicator } from '@/components/SavedAgoIndicator';
import { CameraPhotoCapture } from '@/components/CameraPhotoCapture';
import { VoiceNoteButton } from '@/components/VoiceNoteButton';
import { QuoteDraftDrawer, type QuoteDraftPayload } from '@/components/QuoteDraftDrawer';

// Shape of the draft carried by useOfflineSurvey — mirrors the in-dialog
// `newSurvey` form state so an offline user can resume creation on reconnect.
type NewSurveyDraft = {
  title: string;
  facilityName: string;
  facilityLocation: string;
  description: string;
  requestedByName: string;
  requestedByPosition: string;
  requestedByEmail: string;
  requestedByMobile: string;
  companyLogoUrl: string;
};

const EMPTY_SURVEY_DRAFT: NewSurveyDraft = {
  title: '',
  facilityName: '',
  facilityLocation: '',
  description: '',
  requestedByName: '',
  requestedByPosition: '',
  requestedByEmail: '',
  requestedByMobile: '',
  companyLogoUrl: '',
};

// Application areas from the impact calculator with risk & benefit data
const APPLICATION_AREAS = [
  'WorkStation(s)',
  'Pedestrian Walkways', 
  'Crossing Points / Entry & Exits',
  'Racking',
  'Shutter Doors',
  'Cold Store Walls',
  'Fire Hose Cabinets',
  'Columns (Structural / Mezzanine)',
  'Overhead Pipework / Cables',
  'Loading Docks',
  'Processing Machines',
  'Electrical DBs'
];

// Risk & Benefit data for each application area.
//
// `defaultRiskLevel` and `suggestedVehicles` are surveyor-on-tablet
// quality-of-life additions: when the user picks an area type, we pre-fill
// these fields per PAS 13 risk-zone norms so they don't have to re-enter
// the same conservative defaults on every area card. Surveyors can still
// override either value (the dropdown isn't locked).
//
// Risk-level defaults follow PAS 13 §6 risk-zone categorisation: anywhere
// people share floor space with MHE is high; pure asset-protection (cold
// store, racking) defaults to medium; structural assets default to high.
const applicationAreaData = {
  "WorkStation(s)": {
    risk: "Employees seated close to vehicle routes remain exposed while distracted. Basic, non-tested barriers are easily damaged and ineffective against real impacts.",
    benefit: "Impact-rated barriers shield staff, reduce repeat maintenance, and prevent costly downtime from accidents.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck", "Tugger / Tow Tractor"],
  },
  "Pedestrian Walkways": {
    risk: "Painted lines alone offer no protection. Pedestrians are exposed to vehicles, blocked routes, and poor driver visibility.",
    benefit: "Physical barriers safely segregate pedestrians, maintain evacuation routes, and improve MHE efficiency with fewer obstacles.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Reach Truck", "Pallet Truck"],
  },
  "Crossing Points / Entry & Exits": {
    risk: "Staff crossing high-traffic or blind spots are vulnerable. Painted markings fail to stop vehicles or distracted pedestrians.",
    benefit: "Guided crossings and barriers provide safe, visible, and controlled movement across vehicle zones.",
    defaultRiskLevel: "critical",
    suggestedVehicles: ["Counterbalance Forklift (5T+)", "Reach Truck", "Tugger / Tow Tractor"],
  },
  "Racking": {
    risk: "Vehicle impacts compromise racking integrity, risking collapse, product loss, and costly replacement.",
    benefit: "Barriers preserve racking stability, prevent collapse, and protect both staff and stored goods.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Reach Truck", "VNA Truck", "Counterbalance Forklift (3-5T)"],
  },
  "Shutter Doors": {
    risk: "Vehicle damage disrupts workflows, reduces loading capacity, and compromises environmental control.",
    benefit: "Robust barriers protect doors, maintain security, efficiency, and climate control, while avoiding repair downtime.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
  "Cold Store Walls": {
    risk: "Insulated panels are easily damaged, causing temperature loss, product spoilage, and high repair costs.",
    benefit: "Barriers prevent panel damage, preserve goods, reduce energy waste, and avoid operational disruption.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Reach Truck", "Pallet Truck", "Pump Truck"],
  },
  "Fire Hose Cabinets": {
    risk: "Impact damage can render firefighting equipment unusable, delaying emergency response.",
    benefit: "Barriers ensure cabinets remain accessible and operational, protecting staff, assets, and compliance.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
  "Columns (Structural / Mezzanine)": {
    risk: "Impacts from vehicles can damage structural or mezzanine columns, threatening building integrity.",
    benefit: "Impact-rated barriers absorb collisions, protect structures, and prevent costly facility repairs.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (5T+)", "Reach Truck", "VNA Truck"],
  },
  "Overhead Pipework / Cables": {
    risk: "Overhead utilities are often overlooked. Impacts can disrupt power, processing, or CCTV, causing downtime.",
    benefit: "Barriers protect critical infrastructure, ensuring uninterrupted power and operations.",
    defaultRiskLevel: "medium",
    suggestedVehicles: ["Reach Truck (mast extended)", "VNA Truck"],
  },
  "Loading Docks": {
    risk: "Forklifts risk falling 1–2m from raised docks, endangering operators and damaging equipment.",
    benefit: "Barriers eliminate fall hazards, safeguard operators, and maintain safe, continuous loading operations.",
    defaultRiskLevel: "critical",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
  "Processing Machines": {
    risk: "Vehicle collisions can cause severe equipment damage, downtime, and injury or fatalities.",
    benefit: "Barriers protect machinery, prevent production halts, and safeguard employees from life-threatening risks.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Tugger / Tow Tractor"],
  },
  "Electrical DBs": {
    risk: "Impact damage risks short circuits, outages, fires, and prolonged downtime from complex repairs.",
    benefit: "Barriers maintain power continuity, reduce outage risks, and mitigate fire hazards.",
    defaultRiskLevel: "high",
    suggestedVehicles: ["Counterbalance Forklift (3-5T)", "Pallet Truck"],
  },
} as const;

const RISK_LEVELS = [
  { value: 'low', label: 'Low Risk', color: 'bg-green-100 text-green-800' },
  { value: 'medium', label: 'Medium Risk', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'high', label: 'High Risk', color: 'bg-orange-100 text-orange-800' },
  { value: 'critical', label: 'Critical Risk', color: 'bg-red-100 text-red-800' },
];

const CONDITION_OPTIONS = [
  { value: 'good', label: 'Good - No issues identified' },
  { value: 'damaged', label: 'Damaged - Requires repair/replacement' },
  { value: 'critical', label: 'Critical - Immediate action required' },
  { value: 'unprotected', label: 'Unprotected - No safety barriers present' }
];

// Component to handle product cart button with full product data fetching
function SurveyProductCartButton({ product, area }: { product: any; area: any }) {
  const [fullProduct, setFullProduct] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleAddToCart = async () => {
    if (!fullProduct) {
      setIsLoading(true);
      try {
        // Fetch the full product with variants
        const response = await fetch(`/api/products/${product.productId}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const productData = await response.json();
          setFullProduct(productData);
        }
      } catch (error) {
        console.error('Failed to fetch product details:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };
  
  // If we have the full product data, render the AddToCartModal
  if (fullProduct) {
    return (
      <AddToCartModal
        product={fullProduct}
        showVariantSelector={true}
        variants={fullProduct.productVariants || fullProduct.variants}
        calculationContext={area.calculatedJoules ? {
          operatingZone: area.areaType || '',
          vehicleMass: area.vehicleWeight || '',
          loadMass: 0,
          speed: area.vehicleSpeed || '',
          speedUnit: 'km/h',
          impactAngle: area.impactAngle || 90,
          kineticEnergy: area.calculatedJoules,
          riskLevel: area.riskLevel || '',
          totalMass: area.vehicleWeight || 0,
          speedMs: (parseFloat(area.vehicleSpeed || '0') * 1000) / 3600
        } : undefined}
      >
        <Button
          size="sm"
          variant="default"
          className="bg-[#FFC72C] hover:bg-[#FFB300] text-black text-xs px-2 py-1"
          data-testid={`button-add-to-cart-${product.productId}`}
        >
          <ShoppingCart className="h-3 w-3 mr-1" />
          Add To Cart
        </Button>
      </AddToCartModal>
    );
  }
  
  // Initial button that fetches product data on click
  return (
    <Button
      size="sm"
      variant="default"
      className="bg-[#FFC72C] hover:bg-[#FFB300] text-black text-xs px-2 py-1"
      onClick={handleAddToCart}
      disabled={isLoading}
      data-testid={`button-add-to-cart-${product.productId}`}
    >
      <ShoppingCart className="h-3 w-3 mr-1" />
      {isLoading ? 'Loading...' : 'Add To Cart'}
    </Button>
  );
}

// Inline PAS-13-aligned barrier recommendations for a survey area. Auto-fires
// the deterministic engine via POST /api/recommend-barriers when the area
// carries vehicle metadata + an area type — typically right after the rep
// has filled in those fields.
function AreaBarrierRecommendations({
  area,
}: {
  area: any;
  surveyId?: string | undefined;
}) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Stable inputs — ensures we only refetch when something material changed.
  const fingerprint = useMemo(() => {
    return JSON.stringify({
      a: area.areaType,
      r: area.riskLevel,
      vw: area.vehicleWeight,
      vs: area.vehicleSpeed,
      ang: area.impactAngle,
    });
  }, [area.areaType, area.riskLevel, area.vehicleWeight, area.vehicleSpeed, area.impactAngle]);

  useEffect(() => {
    let cancelled = false;
    if (!area.areaType || !area.vehicleWeight || !area.vehicleSpeed) {
      setData(null);
      return;
    }
    const run = async () => {
      setIsLoading(true);
      try {
        const massKg = parseFloat(String(area.vehicleWeight));
        const speedKmh = parseFloat(String(area.vehicleSpeed));
        if (!Number.isFinite(massKg) || !Number.isFinite(speedKmh)) return;
        const body = {
          vehicleTypes: [
            {
              id: area.zoneName || 'site-survey-vehicle',
              massKg,
              speedKmh,
              dbVehicleTypeName: area.suggestedVehicle || undefined,
            },
          ],
          zones: [
            {
              name: area.areaName || area.zoneName || 'Survey Area',
              areaApplicationType: area.areaType,
              riskLevel: (area.riskLevel || 'medium') as
                | 'low'
                | 'medium'
                | 'high'
                | 'critical',
              approachAngleDeg: area.impactAngle
                ? parseFloat(String(area.impactAngle))
                : 90,
            },
          ],
          environment: {
            internal: true,
            external: false,
            coldStorage: /cold/i.test(area.areaType || ''),
            atex: false,
          },
        };
        const response = await fetch('/api/recommend-barriers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        });
        if (response.ok && !cancelled) {
          setData(await response.json());
        }
      } catch (e) {
        console.error('Site Survey barrier recommender error:', e);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fingerprint]);

  if (!data && !isLoading) return null;
  return (
    <div className="mt-4">
      <BarrierRecommendationsBlock
        data={data}
        isLoading={isLoading}
        cartContext={{
          source: 'site-survey',
          sourceTitle:
            area.areaName || area.zoneName || 'Survey Area',
        }}
      />
    </div>
  );
}

export default function SiteSurvey() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const [selectedSurvey, setSelectedSurvey] = useState<any>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showAreaDialog, setShowAreaDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLoadSurveyDropdown, setShowLoadSurveyDropdown] = useState(false);
  const [newSurvey, setNewSurvey] = useState<NewSurveyDraft>({ ...EMPTY_SURVEY_DRAFT });

  // PWA shortcut handler — the manifest's "New Site Survey" shortcut deep
  // links to /site-survey?new=1. When the surveyor taps it from the iOS
  // home screen, jump straight into the create-dialog flow.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') === '1') {
        setShowCreateDialog(true);
      }
    } catch {
      /* ignore parse errors — non-blocking */
    }
  }, []);

  // Offline-first draft store — buffers the in-progress "new survey" form in
  // localStorage so edits survive network drops / refreshes. Autosaves every
  // 500ms; flushes the draft to the API on reconnect when there's something
  // pending. The real create request still runs via createSurveyMutation on
  // explicit submit (online behaviour unchanged).
  const offlineSurvey = useOfflineSurvey<NewSurveyDraft>({
    surveyId: 'new-survey-draft',
    autosaveMs: 500,
    onOnlineFlush: async (draft) => {
      // Only auto-flush if the user has meaningful content. Avoid creating
      // empty surveys when the tab just regains connectivity.
      if (!draft?.title && !draft?.facilityName) return;
      await apiRequest('/api/site-surveys', 'POST', draft);
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys'] });
    },
  });

  // On mount, if there's a persisted draft, restore it into the visible form
  // so the user sees their pending changes. Runs once per mount — subsequent
  // edits are driven via setNewSurveyAndDraft below.
  useEffect(() => {
    if (offlineSurvey.draft) {
      setNewSurvey({ ...EMPTY_SURVEY_DRAFT, ...offlineSurvey.draft });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep local form state + offline draft in lockstep. All existing callers
  // go through this helper instead of setNewSurvey directly.
  const setNewSurveyAndDraft = (
    next: NewSurveyDraft | ((prev: NewSurveyDraft) => NewSurveyDraft)
  ) => {
    setNewSurvey((prev) => {
      const resolved = typeof next === 'function' ? (next as any)(prev) : next;
      offlineSurvey.replaceDraft(resolved);
      return resolved;
    });
  };

  // Prefill the "Create New Site Survey" dialog with Project Information
  // from the rep's active project (header chip) whenever a field is still
  // empty. Never clobbers user input or a persisted offline draft — the
  // per-field `trim()` guard below means once a value is in place, this
  // effect is a no-op for that field.
  const { activeProject } = useActiveProject();
  useEffect(() => {
    if (!activeProject) return;
    setNewSurvey((prev) => {
      const companyFallback =
        activeProject.customerCompany?.name || activeProject.name || '';
      const next: NewSurveyDraft = { ...prev };
      if (!prev.facilityName?.trim() && companyFallback) {
        next.facilityName = companyFallback;
      }
      if (!prev.facilityLocation?.trim() && activeProject.location) {
        next.facilityLocation = activeProject.location;
      }
      if (!prev.description?.trim() && activeProject.description) {
        next.description = activeProject.description;
      }
      if (
        !prev.companyLogoUrl?.trim() &&
        activeProject.customerCompany?.logoUrl
      ) {
        next.companyLogoUrl = activeProject.customerCompany.logoUrl;
      }
      // Only persist to the offline draft if we actually changed something;
      // this avoids writing identical content on every active-project render.
      const changed =
        next.facilityName !== prev.facilityName ||
        next.facilityLocation !== prev.facilityLocation ||
        next.description !== prev.description ||
        next.companyLogoUrl !== prev.companyLogoUrl;
      if (changed) {
        offlineSurvey.replaceDraft(next);
      }
      return changed ? next : prev;
    });
    // Only re-run when the active project identity changes, not on
    // every keystroke. Deliberately ignoring offlineSurvey (stable ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);
  const [newArea, setNewArea] = useState({
    zoneName: '',
    areaName: '',
    areaType: '',
    customApplicationArea: '',
    issueDescription: '',
    currentCondition: '',
    riskLevel: '',
    vehicleWeight: '',
    vehicleSpeed: '',
    impactAngle: '90',
    matterportUrl: '',
    suggestedVehicles: [] as string[],
  });
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [editingArea, setEditingArea] = useState<any>(null);
  const [selectedProducts, setSelectedProducts] = useState<{[areaId: string]: string[]}>({});
  const [showProductSelection, setShowProductSelection] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [selectedCalculation, setSelectedCalculation] = useState<string>('');
  const [showBuildProjectModal, setShowBuildProjectModal] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);

  // Quote-draft drawer state — wired to POST /api/quote/draft.
  const [quoteDrawerOpen, setQuoteDrawerOpen] = useState(false);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraftPayload | null>(null);
  const [quoteGenerating, setQuoteGenerating] = useState(false);
  const handleGenerateQuote = async (surveyId: string | undefined) => {
    if (!surveyId) {
      toast({ variant: 'destructive', title: 'Save the survey first' });
      return;
    }
    setQuoteGenerating(true);
    setQuoteDraft(null);
    setQuoteDrawerOpen(true);
    try {
      const res = await fetch('/api/quote/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ surveyId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.message || `quote ${res.status}`);
      }
      setQuoteDraft((await res.json()) as QuoteDraftPayload);
    } catch (e: any) {
      toast({
        variant: 'destructive',
        title: 'Quote draft failed',
        description: e?.message || 'Could not compose quote draft.',
      });
      setQuoteDrawerOpen(false);
    } finally {
      setQuoteGenerating(false);
    }
  };

  // Mutation to complete a survey
  const completeSurveyMutation = useMutation({
    mutationFn: async (surveyId: string) => {
      return await apiRequest(`/api/site-surveys/${surveyId}/complete`, 'POST');
    },
    onSuccess: (completedSurvey) => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys'] });
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys', selectedSurvey?.id, 'areas'] });
      setSelectedSurvey(completedSurvey);
      haptic.success();
      toast({
        title: 'Survey Completed',
        description: 'The site survey has been marked as completed successfully.'
      });
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to complete the site survey.',
        variant: 'destructive'
      });
    }
  });

  // Mutation to fetch specific survey and update lastViewed
  const fetchSurveyMutation = useMutation({
    mutationFn: async (surveyId: string) => {
      const response = await fetch(`/api/site-surveys/${surveyId}`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch survey');
      }
      return response.json();
    },
    onSuccess: (survey) => {
      setSelectedSurvey(survey);
      // Invalidate the surveys list to refresh the lastViewed timestamps
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys'] });
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to load survey details.',
        variant: 'destructive'
      });
    }
  });

  // Handle survey selection
  const handleSelectSurvey = (survey: any) => {
    haptic.select();
    // Fetch the survey to trigger lastViewed update
    fetchSurveyMutation.mutate(survey.id);
  };

  // Handle PDF download
  const handleDownloadPdf = async (survey: any) => {
    if (!survey) return;
    
    setGeneratingPdf(true);
    try {
      // Fetch the areas for this survey if not already loaded
      const areasResponse = await fetch(`/api/site-surveys/${survey.id}/areas`, {
        credentials: 'include'
      });
      
      // Fetch user profile data for the Assessment Conducted By section
      const profileResponse = await fetch('/api/auth/profile', {
        credentials: 'include'
      });
      
      if (areasResponse.ok && profileResponse.ok) {
        const areas = await areasResponse.json();
        const userProfile = await profileResponse.json();
        await generateSiteSurveyPdf(survey, areas, userProfile);
        haptic.success();
        toast({
          title: 'PDF Generated',
          description: 'Your site survey report has been downloaded successfully.'
        });
      } else {
        throw new Error('Failed to fetch survey data');
      }
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      haptic.error();
      toast({
        title: 'PDF Generation Failed',
        description: 'There was an error generating the PDF report. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setGeneratingPdf(false);
    }
  };
  
  // Fetch previous impact calculations
  const { data: previousCalculations } = useQuery({
    queryKey: ['/api/calculations'],
    retry: false
  });

  // Image upload handlers
  const handleImageUpload = async () => {
    const key = `uploads/${crypto.randomUUID()}`;
    const accessPath = `/api/objects/${key}`;
    return {
      method: 'PUT' as const,
      url: accessPath
    };
  };

  const handleImageUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const newImageUrls = result.successful.map(file => {
        // The uploadURL is now our worker's PUT endpoint path (e.g. /api/objects/uploads/uuid)
        const url = file.uploadURL;
        if (url) {
          return url;
        }
        return undefined;
      }).filter(url => url !== undefined) as string[];
      setUploadedImages(prev => [...prev, ...newImageUrls]);
      haptic.upload();
      toast({
        title: 'Images Uploaded',
        description: `${result.successful.length} reference image(s) added successfully.`
      });
    }
  };

  // Remove uploaded image
  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Impact calculation mutation
  const calculateImpactMutation = useMutation({
    mutationFn: async ({ areaId, vehicleWeight, vehicleSpeed, impactAngle }: { areaId: string, vehicleWeight: number, vehicleSpeed: number, impactAngle?: number }) => {
      return await apiRequest(`/api/site-survey-areas/${areaId}/calculate-impact`, 'POST', {
        vehicleWeight,
        vehicleSpeed,
        impactAngle: impactAngle || 90
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys', selectedSurvey?.id, 'areas'] });
      haptic.success();
      toast({
        title: 'Impact Calculated',
        description: 'Impact energy calculated and product recommendations generated.'
      });
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to calculate impact energy.',
        variant: 'destructive'
      });
    }
  });

  // Handle area creation with proper form validation

  // Fetch user's site surveys
  const { data: surveys, isLoading } = useQuery({
    queryKey: ['/api/site-surveys'],
  });

  // Fetch areas for selected survey
  const { data: surveyAreas = [] } = useQuery<any[]>({
    queryKey: ['/api/site-surveys', selectedSurvey?.id, 'areas'],
    enabled: !!selectedSurvey
  });

  // Create survey mutation
  const createSurveyMutation = useMutation({
    mutationFn: async (surveyData: any) => {
      return await apiRequest('/api/site-surveys', 'POST', surveyData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys'] });
      setShowCreateDialog(false);
      setNewSurvey({ ...EMPTY_SURVEY_DRAFT });
      // Wipe the offline draft — this survey was successfully created upstream.
      offlineSurvey.replaceDraft({ ...EMPTY_SURVEY_DRAFT });
      try {
        localStorage.removeItem('survey-draft-new-survey-draft');
        localStorage.removeItem('survey-draft-new-survey-draft-meta');
      } catch {
        /* ignore */
      }
      haptic.success();
      toast({
        title: 'Survey Created',
        description: 'Your site survey has been created successfully.'
      });
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to create site survey.',
        variant: 'destructive'
      });
    }
  });

  // Create area mutation
  const createAreaMutation = useMutation({
    mutationFn: async (areaData: any) => {
      // Include uploaded images in the area data
      const areaWithImages = {
        ...areaData,
        photosUrls: uploadedImages
      };
      return await apiRequest(`/api/site-surveys/${selectedSurvey.id}/areas`, 'POST', areaWithImages);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys', selectedSurvey?.id, 'areas'] });
      setShowAreaDialog(false);
      setNewArea({
        zoneName: '',
        areaName: '',
        areaType: '',
        customApplicationArea: '',
        issueDescription: '',
        currentCondition: '',
        riskLevel: '',
        vehicleWeight: '',
        vehicleSpeed: '',
        impactAngle: '90',
        matterportUrl: '',
        suggestedVehicles: [],
      });
      setUploadedImages([]);
      setEditingArea(null);
      haptic.success();
      toast({
        title: editingArea ? 'Area Updated' : 'Area Added',
        description: editingArea ? 'Area of concern has been updated.' : 'Area of concern has been added to the survey with reference images.'
      });
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: editingArea ? 'Failed to update area of concern.' : 'Failed to add area of concern.',
        variant: 'destructive'
      });
    }
  });

  const updateAreaMutation = useMutation({
    mutationFn: async (areaData: any) => {
      const areaWithImages = {
        ...areaData,
        photosUrls: uploadedImages
      };
      return await apiRequest(`/api/site-survey-areas/${editingArea.id}`, 'PUT', areaWithImages);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys', selectedSurvey?.id, 'areas'] });
      setShowAreaDialog(false);
      setNewArea({
        zoneName: '',
        areaName: '',
        areaType: '',
        customApplicationArea: '',
        issueDescription: '',
        currentCondition: '',
        riskLevel: '',
        vehicleWeight: '',
        vehicleSpeed: '',
        impactAngle: '90',
        matterportUrl: '',
        suggestedVehicles: [],
      });
      setUploadedImages([]);
      setEditingArea(null);
      haptic.success();
      toast({
        title: 'Area Updated',
        description: 'Area of concern has been updated successfully.'
      });
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to update area of concern.',
        variant: 'destructive'
      });
    }
  });

  const deleteAreaMutation = useMutation({
    mutationFn: async (areaId: string) => {
      return await apiRequest(`/api/site-survey-areas/${areaId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/site-surveys', selectedSurvey?.id, 'areas'] });
      haptic.success();
      toast({
        title: 'Area Deleted',
        description: 'Area of concern has been removed from the survey.'
      });
    },
    onError: () => {
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to delete area of concern.',
        variant: 'destructive'
      });
    }
  });


  const handleCreateSurvey = () => {
    haptic.formSubmit();
    // Include all fields including the requested by information
    createSurveyMutation.mutate(newSurvey);
  };

  const handleEditArea = (area: any) => {
    haptic.modalOpen();
    setEditingArea(area);
    setNewArea({
      zoneName: area.zoneName || '',
      areaName: area.areaName || '',
      areaType: area.areaType || '',
      customApplicationArea: '',
      issueDescription: area.issueDescription || '',
      currentCondition: area.currentCondition || '',
      riskLevel: area.riskLevel || '',
      vehicleWeight: area.vehicleWeight?.toString() || '',
      vehicleSpeed: area.vehicleSpeed?.toString() || '',
      impactAngle: area.impactAngle?.toString() || '90',
      matterportUrl: area.matterportUrl || '',
      suggestedVehicles: Array.isArray(area.suggestedVehicles) ? area.suggestedVehicles : [],
    });
    setUploadedImages(area.photosUrls || []);
    setSelectedCalculation(''); // Reset calculation selection when editing
    setShowAreaDialog(true);
  };

  const handleDeleteArea = (areaId: string) => {
    if (confirm('Are you sure you want to delete this area of concern?')) {
      haptic.deleteAction();
      deleteAreaMutation.mutate(areaId);
    }
  };

  const handleSubmitArea = () => {
    if (!newArea.zoneName || !newArea.areaName || !newArea.areaType || !newArea.issueDescription || !newArea.currentCondition || !newArea.riskLevel) {
      haptic.warning();
      toast({
        title: 'Missing Information',
        description: 'Please fill in all required fields.',
        variant: 'destructive'
      });
      return;
    }

    haptic.formSubmit();

    // suggestedVehicles is a client-side scratchpad — surveyor adjusts the
    // PAS-13-derived defaults inline, then we fold them into the issue
    // description so the existing schema remains untouched. (Hard rule:
    // don't change the backend shape.)
    const { suggestedVehicles, ...rest } = newArea;
    const baseDescription = (rest.issueDescription || '').replace(
      /\s*Suggested vehicles?:\s.*$/m,
      ''
    );
    const issueDescriptionWithVehicles =
      suggestedVehicles && suggestedVehicles.length > 0
        ? `${baseDescription.trim()}\n\nSuggested vehicles: ${suggestedVehicles.join(', ')}`
        : baseDescription;

    const areaData = {
      ...rest,
      issueDescription: issueDescriptionWithVehicles,
      vehicleWeight: rest.vehicleWeight ? parseFloat(rest.vehicleWeight) : null,
      vehicleSpeed: rest.vehicleSpeed ? parseFloat(rest.vehicleSpeed) : null,
      impactAngle: rest.impactAngle ? parseFloat(rest.impactAngle) : 90,
      matterportUrl: rest.matterportUrl || null,
      matterportModelId: parseMatterportUrl(rest.matterportUrl || "") || null,
      // Include current photos so edits don't wipe the gallery
      photosUrls: uploadedImages,
    };

    if (editingArea) {
      updateAreaMutation.mutate(areaData);
    } else {
      createAreaMutation.mutate(areaData);
    }
  };


  const getRiskBadgeClass = (riskLevel: string) => {
    const risk = RISK_LEVELS.find(r => r.value === riskLevel);
    return risk?.color || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600 mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading site surveys...</p>
        </div>
      </div>
    );
  }

  // Filter surveys based on search query
  const filteredSurveys = (surveys as any[])?.filter((survey: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      survey.title?.toLowerCase().includes(query) ||
      survey.facilityName?.toLowerCase().includes(query) ||
      survey.facilityLocation?.toLowerCase().includes(query) ||
      survey.description?.toLowerCase().includes(query)
    );
  });

  // Get recently viewed surveys for quick load dropdown
  const recentSurveys = (surveys as any[])
    ?.filter((survey: any) => survey.lastViewed)
    ?.sort((a, b) => new Date(b.lastViewed).getTime() - new Date(a.lastViewed).getTime())
    ?.slice(0, 5);

  // Label for the offline-draft status pill shown in the page header.
  const syncPillLabel = (() => {
    if (!offlineSurvey.online) return 'Offline';
    if (offlineSurvey.status === 'syncing') return 'Syncing…';
    if (offlineSurvey.status === 'error') return 'Sync error';
    if (offlineSurvey.pendingPushCount > 0) {
      return `Saved locally · ${offlineSurvey.pendingPushCount} change${offlineSurvey.pendingPushCount === 1 ? '' : 's'} pending sync`;
    }
    if (offlineSurvey.status === 'saving-local') return 'Saving locally…';
    if (offlineSurvey.status === 'synced') return 'Synced';
    return null;
  })();
  const syncPillTone = !offlineSurvey.online
    ? 'bg-gray-100 text-gray-700 border-gray-300'
    : offlineSurvey.status === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : offlineSurvey.pendingPushCount > 0 || offlineSurvey.status === 'saving-local'
        ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
        : 'bg-green-50 text-green-700 border-green-200';

  return (
    <div className="site-survey-page container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Yellow offline / blue syncing / green reconnected banner — pinned
          to the top so a surveyor in a steel-clad warehouse always sees
          their connection state without having to look at the address bar. */}
      <OfflineBanner
        online={offlineSurvey.online}
        syncing={offlineSurvey.status === 'syncing'}
        pendingPushCount={offlineSurvey.pendingPushCount}
        onSyncNow={() => offlineSurvey.forceSync()}
      />

      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">Site Survey</h1>
            {/* Compact "Saved 3s ago" pill — the surveyor sees their work
                is safe before they navigate away. Replaces the older
                multi-state syncPillLabel — same data, calmer UI. */}
            <SavedAgoIndicator
              status={offlineSurvey.status}
              online={offlineSurvey.online}
              lastSavedAt={offlineSurvey.lastSavedAt}
            />
            {syncPillLabel && offlineSurvey.pendingPushCount > 0 && (
              <span
                className={`inline-flex items-center text-xs px-2 py-1 rounded-full border ${syncPillTone}`}
                data-testid="pill-offline-status"
                aria-live="polite"
              >
                {syncPillLabel}
              </span>
            )}
          </div>
          <p className="text-gray-600 dark:text-gray-300 mt-2 text-sm sm:text-base">
            Conduct facility walkthroughs and identify areas requiring safety protection
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Pas13ChatPanel buttonLabel="Ask PAS 13" />
          {/* Quick Load Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="flex items-center gap-2" data-testid="button-load-survey">
                <History className="h-4 w-4" />
                Load Saved Survey
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel>Recent Surveys</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {recentSurveys && recentSurveys.length > 0 ? (
                recentSurveys.map((survey: any) => (
                  <DropdownMenuItem
                    key={survey.id}
                    onClick={() => handleSelectSurvey(survey)}
                    className="cursor-pointer"
                    data-testid={`dropdown-item-survey-${survey.id}`}
                  >
                    <div className="flex flex-col gap-1 w-full">
                      <div className="font-medium">{survey.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {survey.facilityName} • Last viewed {formatDistanceToNow(new Date(survey.lastViewed), { addSuffix: true })}
                      </div>
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No recent surveys</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* New Survey Button */}
          <Dialog open={showCreateDialog} onOpenChange={(open) => {
            if (open) haptic.modalOpen();
            setShowCreateDialog(open);
          }}>
            <DialogTrigger asChild>
              <Button className="bg-yellow-600 hover:bg-yellow-700 text-white" data-testid="button-new-survey">
                <Plus className="h-4 w-4 mr-2" />
                New Survey
              </Button>
            </DialogTrigger>
          <DialogContent className="site-survey-page sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Site Survey</DialogTitle>
              <DialogDescription>
                Start a new facility assessment to identify safety concerns
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="title">Survey Title</Label>
                <Input
                  id="title"
                  value={newSurvey.title}
                  onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, title: e.target.value })}
                  placeholder="e.g., Monthly Safety Assessment"
                  data-testid="input-survey-title"
                />
              </div>
              <div>
                <Label htmlFor="facilityName">Company Facility Name</Label>
                <Input
                  id="facilityName"
                  value={newSurvey.facilityName}
                  onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, facilityName: e.target.value })}
                  placeholder="e.g., DHL, Amazon, Coca-Cola, Emirates"
                  data-testid="input-facility-name"
                />
              </div>

              {/* Company logo picker — same inline grid-of-suggestions
                  component used by NewProjectDialog. The old
                  CompanyLogoFinder only surfaced a single "possible
                  match" and was hard to see in dark mode. */}
              <LogoSuggestions
                query={newSurvey.facilityName || ''}
                value={newSurvey.companyLogoUrl || null}
                onChange={(logoUrl) =>
                  setNewSurveyAndDraft({ ...newSurvey, companyLogoUrl: logoUrl ?? '' })
                }
                label="Company Logo"
                className="mt-2"
              />

              <div>
                <Label htmlFor="facilityLocation">Location</Label>
                <Input
                  id="facilityLocation"
                  value={newSurvey.facilityLocation}
                  onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, facilityLocation: e.target.value })}
                  placeholder="e.g., Dubai, UAE"
                  data-testid="input-facility-location"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newSurvey.description}
                  onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, description: e.target.value })}
                  placeholder="Brief description of this survey..."
                  rows={3}
                  data-testid="textarea-survey-description"
                />
              </div>

              <div className="border-t pt-4 mt-4">
                <h4 className="font-medium mb-3">Requested By</h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="requestedByName">Name</Label>
                    <Input
                      id="requestedByName"
                      value={newSurvey.requestedByName}
                      onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, requestedByName: e.target.value })}
                      placeholder="Customer name"
                      data-testid="input-requested-by-name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="requestedByPosition">Position</Label>
                    <Input
                      id="requestedByPosition"
                      value={newSurvey.requestedByPosition}
                      onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, requestedByPosition: e.target.value })}
                      placeholder="Job role"
                      data-testid="input-requested-by-position"
                    />
                  </div>
                  <div>
                    <Label htmlFor="requestedByEmail">Email Address</Label>
                    <Input
                      id="requestedByEmail"
                      type="email"
                      value={newSurvey.requestedByEmail}
                      onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, requestedByEmail: e.target.value })}
                      placeholder="Email address"
                      data-testid="input-requested-by-email"
                    />
                  </div>
                  <div>
                    <Label htmlFor="requestedByMobile">Mobile Number</Label>
                    <Input
                      id="requestedByMobile"
                      value={newSurvey.requestedByMobile}
                      onChange={(e) => setNewSurveyAndDraft({ ...newSurvey, requestedByMobile: e.target.value })}
                      placeholder="Mobile number"
                      data-testid="input-requested-by-mobile"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 sticky bottom-0 bg-background border-t pt-3 -mx-6 px-6 pb-2 sm:static sm:mx-0 sm:px-0 sm:pb-0 sm:border-0">
                <Button variant="outline" onClick={() => setShowCreateDialog(false)} className="min-h-[44px]">
                  Cancel
                </Button>
                <Button
                  onClick={handleCreateSurvey}
                  disabled={createSurveyMutation.isPending}
                  className="min-h-[44px]"
                  data-testid="button-create-survey"
                >
                  {createSurveyMutation.isPending ? 'Creating...' : 'Create Survey'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2 max-w-2xl">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search surveys..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 min-h-[44px] text-base sm:text-sm"
            data-testid="input-search-surveys"
          />
        </div>
        {/* Refresh — vaul-style pull-to-refresh would be ideal, but a
            tap target is the lowest-friction option that works on every
            tablet. Re-fetches the surveys list and triggers a forceSync
            for any pending offline draft. */}
        <Button
          variant="outline"
          className="min-h-[44px] min-w-[44px]"
          onClick={() => {
            haptic.select();
            queryClient.invalidateQueries({ queryKey: ['/api/site-surveys'] });
            void offlineSurvey.forceSync();
          }}
          aria-label="Refresh surveys"
          data-testid="button-refresh-surveys"
        >
          <Clock className="h-4 w-4" />
          <span className="sr-only sm:not-sr-only sm:ml-2">Refresh</span>
        </Button>
      </div>

      {/* Surveys List — 1 column on phones, 2 on tablets (md ≥768),
          3 on iPad Pro / desktop (lg ≥1024). */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filteredSurveys?.map((survey: any) => (
          <Card key={survey.id} className="cursor-pointer hover:shadow-lg active:shadow-md transition-shadow touch-manipulation" data-testid={`card-survey-${survey.id}`}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg">{survey.title}</CardTitle>
                  <CardDescription>{survey.facilityName}</CardDescription>
                </div>
                <Badge variant={survey.status === 'completed' ? 'default' : 'secondary'}>
                  {survey.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4 mr-1" />
                  {survey.facilityLocation}
                </div>
                
                {/* Timestamps */}
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {survey.lastViewed && (
                    <span className="flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      Last viewed {formatDistanceToNow(new Date(survey.lastViewed), { addSuffix: true })}
                    </span>
                  )}
                  <span>
                    Created {format(new Date(survey.createdAt), 'MMM d, yyyy')}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center text-muted-foreground">
                      <ClipboardCheck className="h-4 w-4 mr-1" />
                      {survey.totalAreasReviewed || 0} areas reviewed
                    </span>
                    {survey.totalImpactCalculations > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {survey.totalImpactCalculations} impact analysis
                      </Badge>
                    )}
                  </div>
                  
                  {/* Risk Breakdown */}
                  {survey.riskBreakdown && (survey.riskBreakdown.critical > 0 || survey.riskBreakdown.high > 0) && (
                    <div className="flex gap-2 flex-wrap">
                      {survey.riskBreakdown.critical > 0 && (
                        <Badge className="bg-red-100 text-red-800 text-xs">
                          {survey.riskBreakdown.critical} Critical
                        </Badge>
                      )}
                      {survey.riskBreakdown.high > 0 && (
                        <Badge className="bg-orange-100 text-orange-800 text-xs">
                          {survey.riskBreakdown.high} High Risk
                        </Badge>
                      )}
                      {survey.riskBreakdown.medium > 0 && (
                        <Badge className="bg-yellow-100 text-yellow-800 text-xs">
                          {survey.riskBreakdown.medium} Medium
                        </Badge>
                      )}
                    </div>
                  )}
                  
                  {/* Condition Breakdown */}
                  {survey.conditionBreakdown && survey.conditionBreakdown.critical > 0 && (
                    <div className="text-xs text-red-600 font-medium">
                      ⚠️ {survey.conditionBreakdown.critical} critical condition{survey.conditionBreakdown.critical > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                {survey.overallRiskLevel && (
                  <Badge className={getRiskBadgeClass(survey.overallRiskLevel)}>
                    {survey.overallRiskLevel.charAt(0).toUpperCase() + survey.overallRiskLevel.slice(1)} Risk
                  </Badge>
                )}
              </div>
              <div className="mt-4 flex space-x-2">
                <Button
                  onClick={() => handleSelectSurvey(survey)}
                  className="min-h-[44px] w-full sm:w-auto"
                  data-testid={`button-view-survey-${survey.id}`}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  View Details
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {(!surveys || (surveys as any[]).length === 0) && (
          <Card className="col-span-full">
            <CardContent className="text-center py-8">
              <ClipboardCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No site surveys yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first site survey to start identifying safety concerns in your facility.
              </p>
              <Button onClick={() => {
                haptic.modalOpen();
                setShowCreateDialog(true);
              }} data-testid="button-create-first-survey">
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Survey
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Survey Details Modal */}
      <Dialog open={!!selectedSurvey} onOpenChange={() => setSelectedSurvey(null)}>
        <DialogContent className="site-survey-page max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedSurvey?.title}</DialogTitle>
            <DialogDescription>
              {selectedSurvey?.facilityName} - {selectedSurvey?.facilityLocation}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Survey Info */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
              <div className="space-y-3 w-full">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <Badge className={getRiskBadgeClass(selectedSurvey?.overallRiskLevel || 'low')}>
                    Overall {selectedSurvey?.overallRiskLevel || 'No'} Risk
                  </Badge>
                  {selectedSurvey?.status === 'completed' && (
                    <Badge className="bg-green-100 text-green-800 border-green-300">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Completed
                    </Badge>
                  )}
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => handleDownloadPdf(selectedSurvey)}
                      disabled={generatingPdf}
                      data-testid="button-download-survey-pdf"
                    >
                      {generatingPdf ? (
                        <>Generating PDF...</>
                      ) : (
                        <>
                          <Download className="h-4 w-4 mr-1" />
                          Download PDF Report
                        </>
                      )}
                    </Button>
                    {surveyAreas && Array.isArray(surveyAreas) && surveyAreas.some((area: any) => area.recommendedProducts?.length > 0) && (
                      <Button
                        size="sm"
                        className="bg-[#FFC72C] hover:bg-[#F0B800] text-black w-full sm:w-auto"
                        onClick={() => {
                          haptic.modalOpen();
                          setShowBuildProjectModal(true);
                        }}
                        data-testid="button-build-project"
                      >
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        Build Project
                      </Button>
                    )}
                    {/* Quoting AI assistant — composes a complete quote PDF
                        from this survey via POST /api/quote/draft. */}
                    {selectedSurvey?.id && surveyAreas && Array.isArray(surveyAreas) && surveyAreas.length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto border-[#FFC72C] text-black hover:bg-[#FFF7DC]"
                        onClick={() => {
                          haptic.modalOpen();
                          handleGenerateQuote(selectedSurvey.id);
                        }}
                        disabled={quoteGenerating}
                        data-testid="button-generate-quote-draft-survey"
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        {quoteGenerating ? 'Generating…' : 'Generate Quote Draft'}
                      </Button>
                    )}
                    {selectedSurvey?.status === 'draft' && surveyAreas && Array.isArray(surveyAreas) && surveyAreas.length > 0 && (
                      <Button
                        size="sm"
                        variant="default"
                        className="bg-green-600 hover:bg-green-700 text-white w-full sm:w-auto"
                        onClick={() => {
                          haptic.modalOpen();
                          setShowCompleteConfirm(true);
                        }}
                        disabled={completeSurveyMutation.isPending}
                        data-testid="button-complete-survey"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        {completeSurveyMutation.isPending ? 'Completing...' : 'Complete Survey'}
                      </Button>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Areas Reviewed</p>
                    <p className="text-2xl font-bold">{selectedSurvey?.totalAreasReviewed || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Impact Analysis</p>
                    <p className="text-2xl font-bold">{selectedSurvey?.totalImpactCalculations || 0}</p>
                  </div>
                </div>
                
                {/* Risk Level Breakdown */}
                {selectedSurvey?.riskBreakdown && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Impact Risk Analysis</p>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedSurvey.riskBreakdown.critical > 0 && (
                        <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                          <span className="text-xs font-medium text-red-800">Critical</span>
                          <Badge className="bg-red-100 text-red-800">{selectedSurvey.riskBreakdown.critical}</Badge>
                        </div>
                      )}
                      {selectedSurvey.riskBreakdown.high > 0 && (
                        <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
                          <span className="text-xs font-medium text-orange-800">High</span>
                          <Badge className="bg-orange-100 text-orange-800">{selectedSurvey.riskBreakdown.high}</Badge>
                        </div>
                      )}
                      {selectedSurvey.riskBreakdown.medium > 0 && (
                        <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                          <span className="text-xs font-medium text-yellow-800">Medium</span>
                          <Badge className="bg-yellow-100 text-yellow-800">{selectedSurvey.riskBreakdown.medium}</Badge>
                        </div>
                      )}
                      {selectedSurvey.riskBreakdown.low > 0 && (
                        <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                          <span className="text-xs font-medium text-green-800">Low</span>
                          <Badge className="bg-green-100 text-green-800">{selectedSurvey.riskBreakdown.low}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Condition Breakdown */}
                {selectedSurvey?.conditionBreakdown && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Condition Analysis</p>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedSurvey.conditionBreakdown.critical > 0 && (
                        <div className="flex items-center justify-between p-2 bg-red-50 rounded">
                          <span className="text-xs font-medium text-red-800">Critical</span>
                          <Badge className="bg-red-100 text-red-800">{selectedSurvey.conditionBreakdown.critical}</Badge>
                        </div>
                      )}
                      {selectedSurvey.conditionBreakdown.damaged > 0 && (
                        <div className="flex items-center justify-between p-2 bg-orange-50 rounded">
                          <span className="text-xs font-medium text-orange-800">Damaged</span>
                          <Badge className="bg-orange-100 text-orange-800">{selectedSurvey.conditionBreakdown.damaged}</Badge>
                        </div>
                      )}
                      {selectedSurvey.conditionBreakdown.unprotected > 0 && (
                        <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                          <span className="text-xs font-medium text-yellow-800">Unprotected</span>
                          <Badge className="bg-yellow-100 text-yellow-800">{selectedSurvey.conditionBreakdown.unprotected}</Badge>
                        </div>
                      )}
                      {selectedSurvey.conditionBreakdown.good > 0 && (
                        <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                          <span className="text-xs font-medium text-green-800">Good</span>
                          <Badge className="bg-green-100 text-green-800">{selectedSurvey.conditionBreakdown.good}</Badge>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              {selectedSurvey?.status !== 'completed' && (
                <Dialog open={showAreaDialog} onOpenChange={(open) => {
                  if (open) haptic.modalOpen();
                  setShowAreaDialog(open);
                }}>
                  <DialogTrigger asChild>
                    <Button className="min-h-[44px] w-full sm:w-auto" data-testid="button-add-area">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Area of Concern
                    </Button>
                  </DialogTrigger>
                </Dialog>
              )}
              {selectedSurvey?.status === 'completed' && (
                <p className="text-sm text-muted-foreground italic">This survey has been completed and is read-only.</p>
              )}
            </div>

            {/* Areas of Concern */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Areas of Concern</h3>
              <div className="space-y-4">
                {(surveyAreas as any[])?.map((area: any) => (
                  <Card
                    key={area.id}
                    data-testid={`card-area-${area.id}`}
                    className="border-l-4"
                    style={{
                      borderLeftColor: area.riskLevel === 'critical'
                        ? '#dc2626'
                        : area.riskLevel === 'high'
                          ? '#ea580c'
                          : area.riskLevel === 'medium'
                            ? '#ca8a04'
                            : '#16a34a',
                    }}
                  >
                    <CardContent className="pt-4 sm:pt-6">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-4">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium break-words">{area.areaName}</h4>
                          <p className="text-sm text-muted-foreground break-words">
                            Zone: {area.zoneName} | Type: {area.areaType}
                          </p>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                          <Badge className={getRiskBadgeClass(area.riskLevel)}>
                            {area.riskLevel}
                          </Badge>
                          <Badge variant="outline">
                            {area.currentCondition}
                          </Badge>
                          {selectedSurvey?.status !== 'completed' && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleEditArea(area)}
                                aria-label="Edit area"
                                className="min-h-[44px] min-w-[44px]"
                                data-testid={`button-edit-area-${area.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleDeleteArea(area.id)}
                                aria-label="Delete area"
                                className="min-h-[44px] min-w-[44px]"
                                data-testid={`button-delete-area-${area.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
                        {area.issueDescription}
                      </p>

                      {area.calculatedJoules && (
                        <div className="bg-blue-50 p-3 rounded-lg mb-4">
                          <div className="flex items-center mb-2">
                            <AlertTriangle className="h-4 w-4 text-blue-600 mr-2" />
                            <span className="font-medium text-blue-900">Impact Analysis</span>
                          </div>
                          <div className="text-sm text-blue-800">
                            <p>Vehicle: {area.vehicleWeight}kg at {area.vehicleSpeed}km/h</p>
                            <p>Impact Angle: {area.impactAngle || 90}° ({area.impactAngle === 90 ? 'head-on' : 'glancing'})</p>
                            <p>Calculated Energy: {Math.round(area.calculatedJoules)} Joules</p>
                          </div>
                        </div>
                      )}

                      {/* Reference Images */}
                      {area.photosUrls && area.photosUrls.length > 0 && (
                        <div className="mb-4">
                          <div className="flex items-center mb-2">
                            <Camera className="h-4 w-4 text-gray-600 mr-2" />
                            <span className="font-medium text-gray-900 dark:text-white">Reference Images</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {area.photosUrls.slice(0, 4).map((imageUrl: string, idx: number) => {
                              // Ensure the URL is properly formatted for display
                              const displayUrl = imageUrl.startsWith('/objects/') ? imageUrl : imageUrl;
                              return (
                                <div 
                                  key={idx}
                                  className="aspect-square border rounded cursor-pointer hover:opacity-75 bg-gray-50 dark:bg-gray-800 flex items-center justify-center p-1"
                                  onClick={() => window.open(displayUrl, '_blank')}
                                >
                                  <img 
                                    src={displayUrl} 
                                    alt={`Reference ${idx + 1}`}
                                    className="max-w-full max-h-full object-contain"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matterport 3D Scan */}
                      {area.matterportModelId && (
                        <div className="mt-4">
                          <div className="flex items-center gap-2 mb-2">
                            <svg className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                            <span className="text-sm font-medium">3D Scan</span>
                          </div>
                          <MatterportViewer modelId={area.matterportModelId} className="h-[400px]" />
                        </div>
                      )}

                      {/* Recommended Products with Selection */}
                      {area.recommendedProducts && area.recommendedProducts.length > 0 && (
                        <div className="bg-green-50 p-3 rounded-lg">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <ShoppingCart className="h-4 w-4 text-green-600 mr-2" />
                              <span className="font-medium text-green-900">Recommended Safety Solutions</span>
                            </div>
                            {showProductSelection !== area.id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setShowProductSelection(area.id);
                                  // Initialize selected products for this area if not already done
                                  if (!selectedProducts[area.id]) {
                                    setSelectedProducts({...selectedProducts, [area.id]: []});
                                  }
                                }}
                                className="text-xs"
                              >
                                Select Solutions
                              </Button>
                            )}
                          </div>
                          
                          {showProductSelection === area.id && (
                            <div className="bg-yellow-50 border border-yellow-200 p-2 rounded mb-3">
                              <p className="text-xs text-yellow-800 mb-2">
                                Click on the products below to select your preferred safety solutions. You can select multiple products. 
                                <strong> Only selected items will remain after saving.</strong>
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    // Save selected products
                                    const selected = selectedProducts[area.id] || [];
                                    if (selected.length > 0) {
                                      // Update area with only selected products
                                      const filteredProducts = area.recommendedProducts.filter((p: any) => 
                                        selected.includes(p.productId)
                                      );
                                      
                                      // Use the API to update only the recommended products
                                      try {
                                        await apiRequest(`/api/site-survey-areas/${area.id}`, 'PUT', {
                                          recommendedProducts: filteredProducts
                                        });
                                        
                                        // Refresh the survey areas
                                        queryClient.invalidateQueries({ queryKey: ['/api/site-surveys', selectedSurvey?.id, 'areas'] });
                                        
                                        haptic.save();
                                        toast({
                                          title: 'Solutions Saved',
                                          description: `${selected.length} safety solution(s) selected for this area.`
                                        });
                                      } catch (error) {
                                        haptic.error();
                                        toast({
                                          title: 'Error',
                                          description: 'Failed to save selected solutions.',
                                          variant: 'destructive'
                                        });
                                      }
                                    }
                                    setShowProductSelection(null);
                                    setSelectedProducts({...selectedProducts, [area.id]: []});
                                  }}
                                  className="bg-green-600 hover:bg-green-700 text-white text-xs"
                                >
                                  Save Selected ({selectedProducts[area.id]?.length || 0})
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setShowProductSelection(null);
                                    setSelectedProducts({...selectedProducts, [area.id]: []});
                                  }}
                                  className="text-xs"
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          )}
                          
                          <div className="max-h-64 overflow-y-auto">
                            <div className="grid grid-cols-1 gap-2">
                              {area.recommendedProducts.map((product: any, idx: number) => {
                                const isSelected = selectedProducts[area.id]?.includes(product.productId);
                                return (
                                  <div 
                                    key={idx} 
                                    className={`bg-white p-3 rounded border flex items-center space-x-3 cursor-pointer transition-all ${
                                      showProductSelection === area.id
                                        ? isSelected 
                                          ? 'border-green-500 bg-green-50' 
                                          : 'hover:border-gray-400'
                                        : ''
                                    }`}
                                    onClick={() => {
                                      if (showProductSelection === area.id) {
                                        const currentSelected = selectedProducts[area.id] || [];
                                        if (isSelected) {
                                          // Remove from selection
                                          setSelectedProducts({
                                            ...selectedProducts,
                                            [area.id]: currentSelected.filter(id => id !== product.productId)
                                          });
                                        } else {
                                          // Add to selection
                                          setSelectedProducts({
                                            ...selectedProducts,
                                            [area.id]: [...currentSelected, product.productId]
                                          });
                                        }
                                      }
                                    }}
                                  >
                                    {showProductSelection === area.id && (
                                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                                        isSelected ? 'bg-green-500 border-green-500' : 'border-gray-400'
                                      }`}>
                                        {isSelected && <span className="text-white text-xs">✓</span>}
                                      </div>
                                    )}
                                    {product.imageUrl && (
                                      <img 
                                        src={product.imageUrl} 
                                        alt={product.productName || product.name}
                                        className="w-12 h-12 object-cover rounded"
                                      />
                                    )}
                                    <div className="flex-1">
                                      <p className="text-sm font-medium text-green-800">
                                        {product.productName || product.name}
                                      </p>
                                      <p className="text-xs text-green-600">
                                        {product.impactRating ? `Rated: ${product.impactRating}J` : ''}
                                      </p>
                                      {/* Per-metre price line — Sagarika's
                                          May 5 feedback: "I would like to
                                          add the one meter price for each
                                          solution". Mirrors the same line
                                          on the Site Survey PDF. */}
                                      {(product.perMetrePriceAed || product.perMetrePrice) && (
                                        <p className="text-xs text-gray-500 italic mt-0.5">
                                          Approx. AED {Number(product.perMetrePriceAed || product.perMetrePrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} / m
                                        </p>
                                      )}
                                      {product.reason && (
                                        <p className="text-xs text-gray-600 mt-1">{product.reason}</p>
                                      )}
                                      {/* Show buttons only when not in selection mode and product is saved */}
                                      {showProductSelection !== area.id && area.recommendedProducts && (
                                        <div className="flex space-x-2 mt-2">
                                          <SurveyProductCartButton product={product} area={area} />
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-xs px-2 py-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              navigate(`/products/${product.productId}`);
                                            }}
                                            data-testid={`button-view-details-${product.productId}`}
                                          >
                                            View Details
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {(!area.calculatedJoules && (area.vehicleWeight || area.vehicleSpeed)) && (
                        <Button
                          className="min-h-[44px] w-full sm:w-auto"
                          onClick={() => calculateImpactMutation.mutate({
                            areaId: area.id,
                            vehicleWeight: area.vehicleWeight,
                            vehicleSpeed: area.vehicleSpeed,
                            impactAngle: area.impactAngle || 90
                          })}
                          disabled={calculateImpactMutation.isPending}
                          data-testid={`button-calculate-impact-${area.id}`}
                        >
                          {calculateImpactMutation.isPending ? 'Calculating...' : 'Calculate Impact & Get Recommendations'}
                        </Button>
                      )}

                      {/* PAS-13-aligned barrier recommendations — auto-fetches
                          from the new deterministic engine when the area
                          carries vehicle metadata. */}
                      {area.vehicleWeight && area.vehicleSpeed && (
                        <AreaBarrierRecommendations
                          area={area}
                          surveyId={selectedSurvey?.id}
                        />
                      )}
                    </CardContent>
                  </Card>
                ))}

                {(!surveyAreas || (surveyAreas as any[]).length === 0) && (
                  <Card>
                    <CardContent className="text-center py-8">
                      <Camera className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600">
                        No areas of concern added yet. Start by adding your first area.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Area Dialog */}
      <Dialog open={showAreaDialog} onOpenChange={(open) => {
        setShowAreaDialog(open);
        if (!open) {
          setEditingArea(null);
          setNewArea({
            zoneName: '',
            areaName: '',
            areaType: '',
            customApplicationArea: '',
            issueDescription: '',
            currentCondition: '',
            riskLevel: '',
            vehicleWeight: '',
            vehicleSpeed: '',
            impactAngle: '90',
            matterportUrl: '',
            suggestedVehicles: [],
          });
          setUploadedImages([]);
          setSelectedCalculation('');
        }
      }}>
        <DialogContent className="site-survey-page sm:max-w-2xl max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingArea ? 'Edit' : 'Add'} Area of Concern</DialogTitle>
            <DialogDescription>
              {editingArea ? 'Update the details of this area of concern' : 'Document a specific area that requires safety assessment or protection'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="zoneName">Zone Name</Label>
                <Input
                  id="zoneName"
                  value={newArea.zoneName}
                  onChange={(e) => setNewArea({ ...newArea, zoneName: e.target.value })}
                  placeholder="e.g., Loading Dock A"
                  className="min-h-[44px] text-base sm:text-sm"
                  data-testid="input-zone-name"
                />
              </div>
              <div>
                <Label htmlFor="areaName">Specific Area Name</Label>
                <Input
                  id="areaName"
                  value={newArea.areaName}
                  onChange={(e) => setNewArea({ ...newArea, areaName: e.target.value })}
                  placeholder="e.g., East Column Section"
                  className="min-h-[44px] text-base sm:text-sm"
                  data-testid="input-area-name"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="areaType">Application Area Type</Label>
              <Select
                value={newArea.areaType}
                onValueChange={(value) => {
                  // PAS-13 auto-fill: when surveyor picks an area type, prefill
                  // riskLevel + suggestedVehicles from applicationAreaData so
                  // they don't have to retype on every card. Only fills empty
                  // values — never clobbers a user-entered risk level.
                  const cfg =
                    (applicationAreaData as Record<string, any>)[value] || null;
                  setNewArea((prev) => ({
                    ...prev,
                    areaType: value,
                    riskLevel:
                      prev.riskLevel || (cfg?.defaultRiskLevel ?? prev.riskLevel),
                    suggestedVehicles:
                      prev.suggestedVehicles && prev.suggestedVehicles.length > 0
                        ? prev.suggestedVehicles
                        : (cfg?.suggestedVehicles ?? []),
                  }));
                  haptic.select();
                }}
              >
                <SelectTrigger className="min-h-[44px]" data-testid="select-area-type">
                  <SelectValue placeholder="Select application area type" />
                </SelectTrigger>
                <SelectContent>
                  {APPLICATION_AREAS.map((area) => (
                    <SelectItem key={area} value={area} className="py-3">{area}</SelectItem>
                  ))}
                  <SelectItem value="Other" className="py-3">Other (Custom)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {newArea.areaType === 'Other' && (
              <div>
                <Label htmlFor="customApplicationArea">Custom Application Area</Label>
                <Input
                  id="customApplicationArea"
                  value={newArea.customApplicationArea}
                  onChange={(e) => setNewArea({ ...newArea, customApplicationArea: e.target.value })}
                  placeholder="Describe the custom application area"
                  className="min-h-[44px] text-base sm:text-sm"
                  data-testid="input-custom-area"
                />
              </div>
            )}

            {/* Risk & Benefit Details */}
            {newArea.areaType && newArea.areaType !== 'Other' && applicationAreaData[newArea.areaType as keyof typeof applicationAreaData] && (
              <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900/30 rounded-lg border">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">Risk Assessment</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {applicationAreaData[newArea.areaType as keyof typeof applicationAreaData].risk}
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <Shield className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">Safety Benefits</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                      {applicationAreaData[newArea.areaType as keyof typeof applicationAreaData].benefit}
                    </p>
                  </div>
                </div>

                {/* Suggested vehicles — pre-filled from PAS 13 norms; surveyor
                    can toggle chips to edit before save. Folded into the
                    issueDescription on submit (no schema change). */}
                {(() => {
                  const cfg = applicationAreaData[newArea.areaType as keyof typeof applicationAreaData] as any;
                  const baseSuggestions: string[] = cfg?.suggestedVehicles || [];
                  const allChips = Array.from(
                    new Set([...baseSuggestions, ...newArea.suggestedVehicles])
                  );
                  if (allChips.length === 0) return null;
                  return (
                    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                      <p className="font-medium text-sm text-gray-900 dark:text-white mb-2">
                        Suggested vehicle types{' '}
                        <span className="font-normal text-xs text-gray-500">
                          (PAS 13 default — tap to toggle)
                        </span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {allChips.map((veh) => {
                          const active = newArea.suggestedVehicles.includes(veh);
                          return (
                            <button
                              key={veh}
                              type="button"
                              onClick={() => {
                                haptic.select();
                                setNewArea((prev) => ({
                                  ...prev,
                                  suggestedVehicles: active
                                    ? prev.suggestedVehicles.filter((v) => v !== veh)
                                    : [...prev.suggestedVehicles, veh],
                                }));
                              }}
                              className={`min-h-[44px] px-3 py-1.5 text-xs sm:text-sm rounded-full border transition-colors ${
                                active
                                  ? 'bg-[#FFC72C] border-[#FFC72C] text-black font-medium'
                                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50'
                              }`}
                              data-testid={`chip-vehicle-${veh.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`}
                            >
                              {active ? '\u2713 ' : ''}{veh}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="currentCondition">Current Condition</Label>
                <Select value={newArea.currentCondition} onValueChange={(value) => setNewArea({ ...newArea, currentCondition: value })}>
                  <SelectTrigger className="min-h-[44px]" data-testid="select-condition">
                    <SelectValue placeholder="Select condition" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPTIONS.map((condition) => (
                      <SelectItem key={condition.value} value={condition.value} className="py-3">
                        {condition.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="riskLevel">Risk Level</Label>
                <Select value={newArea.riskLevel} onValueChange={(value) => setNewArea({ ...newArea, riskLevel: value })}>
                  <SelectTrigger className="min-h-[44px]" data-testid="select-risk-level">
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map((risk) => (
                      <SelectItem key={risk.value} value={risk.value} className="py-3">
                        {risk.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="issueDescription">Issue Description</Label>
                <VoiceNoteButton
                  value={newArea.issueDescription}
                  onChange={(next) =>
                    setNewArea((prev) => ({ ...prev, issueDescription: next }))
                  }
                  testId="button-voice-issue-description"
                />
              </div>
              <Textarea
                id="issueDescription"
                value={newArea.issueDescription}
                onChange={(e) => setNewArea({ ...newArea, issueDescription: e.target.value })}
                placeholder="Describe the safety concern or issue in detail. Tap the mic to dictate..."
                rows={4}
                className="min-h-[96px] text-base sm:text-sm"
                data-testid="textarea-issue-description"
              />
            </div>

            <div className="bg-blue-50 p-4 rounded-lg space-y-4">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-blue-600 mr-2" />
                <Label className="font-medium text-blue-900">Impact Calculation (Optional)</Label>
              </div>
              <p className="text-sm text-blue-800">
                Add vehicle information to calculate impact energy and get product recommendations
              </p>
              
              {/* Previous Calculation Selection */}
              {previousCalculations && Array.isArray(previousCalculations) && previousCalculations.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center">
                    <History className="h-4 w-4 text-blue-600 mr-2" />
                    <Label htmlFor="previousCalculation" className="text-sm">Use Previous Calculation</Label>
                  </div>
                  <Select 
                    value={selectedCalculation} 
                    onValueChange={(value) => {
                      setSelectedCalculation(value);
                      if (value && value !== 'new') {
                        // Find the selected calculation and populate fields
                        const calc = previousCalculations.find((c: any) => c.id === value);
                        if (calc) {
                          setNewArea({
                            ...newArea,
                            vehicleWeight: calc.vehicleMass?.toString() || '',
                            vehicleSpeed: calc.speed?.toString() || '',
                            impactAngle: calc.impactAngle?.toString() || '90'
                          });
                          toast({
                            title: 'Calculation Applied',
                            description: `Using vehicle data from "${calc.applicationArea || 'Previous calculation'}"`
                          });
                        }
                      } else if (value === 'new') {
                        // Clear the fields for new calculation
                        setNewArea({
                          ...newArea,
                          vehicleWeight: '',
                          vehicleSpeed: '',
                          impactAngle: '90'
                        });
                      }
                    }}
                  >
                    <SelectTrigger data-testid="select-previous-calculation">
                      <SelectValue placeholder="Select a previous calculation or enter new" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Enter New Values</SelectItem>
                      {previousCalculations.slice(0, 10).map((calc: any) => (
                        <SelectItem key={calc.id} value={calc.id}>
                          {calc.applicationArea || 'Unnamed'} - {Math.round(calc.kineticEnergy)}J ({calc.vehicleMass}kg at {calc.speed}{calc.speedUnit || 'km/h'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="vehicleWeight">Vehicle Weight (kg)</Label>
                  <Input
                    id="vehicleWeight"
                    type="number"
                    inputMode="numeric"
                    value={newArea.vehicleWeight}
                    onChange={(e) => setNewArea({ ...newArea, vehicleWeight: e.target.value })}
                    placeholder="e.g., 4000"
                    className="min-h-[44px] text-base sm:text-sm"
                    data-testid="input-vehicle-weight"
                  />
                </div>
                <div>
                  <Label htmlFor="vehicleSpeed">Vehicle Speed (km/h)</Label>
                  <Input
                    id="vehicleSpeed"
                    type="number"
                    inputMode="decimal"
                    value={newArea.vehicleSpeed}
                    onChange={(e) => setNewArea({ ...newArea, vehicleSpeed: e.target.value })}
                    placeholder="e.g., 8"
                    className="min-h-[44px] text-base sm:text-sm"
                    data-testid="input-vehicle-speed"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor="impactAngle">Impact Angle (°)</Label>
                  <Input
                    id="impactAngle"
                    type="number"
                    inputMode="numeric"
                    value={newArea.impactAngle}
                    onChange={(e) => setNewArea({ ...newArea, impactAngle: e.target.value })}
                    placeholder="90"
                    min="0"
                    max="90"
                    className="min-h-[44px] text-base sm:text-sm"
                    data-testid="input-impact-angle"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    90° = head-on, lower = glancing
                  </p>
                </div>
              </div>
            </div>

            {/* Matterport 3D Scan URL */}
            <div className="space-y-2">
              <Label htmlFor="matterportUrl">Matterport 3D Scan URL (optional)</Label>
              <Input
                id="matterportUrl"
                placeholder="https://my.matterport.com/show/?m=..."
                value={newArea.matterportUrl || ""}
                onChange={(e) => setNewArea({ ...newArea, matterportUrl: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Paste a Matterport URL to embed a 3D scan for this area</p>
            </div>

            {/* Reference Images — camera-first for tablet surveyors. The
                CameraPhotoCapture component opens the rear camera directly
                via <input capture="environment">, resizes to 1280px JPEG to
                stay under localStorage limits when offline, and shows a
                thumbnail strip with retake/delete. ObjectUploader is kept
                below as a fallback for desktop / large-batch ingest. */}
            <div className="bg-gray-50 dark:bg-gray-900/30 p-4 rounded-lg space-y-4">
              <div className="flex items-center">
                <Camera className="h-5 w-5 text-gray-600 mr-2" />
                <Label className="font-medium text-gray-900 dark:text-white">Reference Images</Label>
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300">
                Snap photos of the area on-site. Camera opens directly on tablet/phone.
              </p>

              <CameraPhotoCapture
                photos={uploadedImages}
                onChange={setUploadedImages}
                maxPhotos={8}
              />

              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Or upload from desktop / batch
                </summary>
                <div className="flex flex-wrap gap-2 mt-2">
                  <ObjectUploader
                    maxNumberOfFiles={5}
                    maxFileSize={10485760} // 10MB
                    allowedFileTypes={['image/jpeg', 'image/png', 'image/webp']}
                    onGetUploadParameters={handleImageUpload}
                    onComplete={handleImageUploadComplete}
                    buttonClassName="text-sm"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload via R2
                  </ObjectUploader>
                </div>
              </details>
            </div>

            <div className="flex justify-end space-x-2 sticky bottom-0 bg-background border-t pt-3 -mx-6 px-6 pb-2 sm:static sm:mx-0 sm:px-0 sm:pb-0 sm:border-0">
              <Button variant="outline" className="min-h-[44px]" onClick={() => {
                setShowAreaDialog(false);
                setEditingArea(null);
                setNewArea({
                  zoneName: '',
                  areaName: '',
                  areaType: '',
                  customApplicationArea: '',
                  issueDescription: '',
                  currentCondition: '',
                  riskLevel: '',
                  vehicleWeight: '',
                  vehicleSpeed: '',
                  impactAngle: '90',
                  matterportUrl: '',
                  suggestedVehicles: [],
                });
                setUploadedImages([]);
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitArea}
                disabled={createAreaMutation.isPending || updateAreaMutation.isPending}
                className="min-h-[44px]"
                data-testid={editingArea ? 'button-update-area' : 'button-create-area'}
              >
                {(createAreaMutation.isPending || updateAreaMutation.isPending) ?
                  (editingArea ? 'Updating...' : 'Adding...') :
                  (editingArea ? 'Update Area' : 'Add Area')
                }
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Complete Survey Confirmation Dialog */}
      <AlertDialog open={showCompleteConfirm} onOpenChange={setShowCompleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Site Survey</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this survey as completed? This action will finalize the survey
              and prevent further edits to areas of concern. The survey report will still be available for
              download.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-green-600 hover:bg-green-700"
              onClick={() => {
                if (selectedSurvey?.id) {
                  haptic.formSubmit();
                  completeSurveyMutation.mutate(selectedSurvey.id);
                }
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Complete Survey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Build Project Modal */}
      <Dialog open={showBuildProjectModal} onOpenChange={setShowBuildProjectModal}>
        <DialogContent className="site-survey-page max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Build Project from Site Survey</DialogTitle>
            <DialogDescription>
              Review and select recommended products for {selectedSurvey?.title}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {surveyAreas && Array.isArray(surveyAreas) && surveyAreas.filter((area: any) => area.recommendedProducts?.length > 0).map((area: any) => (
              <div key={area.id} className="space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {area.zoneName} - {area.areaName}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {area.areaType} | Risk Level: {area.riskLevel}
                    </p>
                  </div>
                  <Badge className={getRiskBadgeClass(area.riskLevel)}>
                    {area.riskLevel.charAt(0).toUpperCase() + area.riskLevel.slice(1)} Risk
                  </Badge>
                </div>

                <div className="grid gap-3">
                  {area.recommendedProducts?.map((product: any) => (
                    <Card key={product.id || product.name} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex gap-4">
                          {product.imageUrl && (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-20 h-20 object-contain border rounded"
                            />
                          )}
                          <div className="space-y-1">
                            <h4 className="font-medium">{product.name}</h4>
                            {product.impactRating && (
                              <Badge variant="secondary">
                                Impact Rating: {product.impactRating} Joules
                              </Badge>
                            )}
                            <p className="text-sm text-muted-foreground">
                              Unit Price: {product.price || 'Contact for pricing'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`qty-${area.id}-${product.id}`} className="text-sm">Qty:</Label>
                          <Input
                            id={`qty-${area.id}-${product.id}`}
                            type="number"
                            min="1"
                            defaultValue="1"
                            className="w-20"
                            data-testid={`input-quantity-${product.id}`}
                          />
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {Array.isArray(surveyAreas) ? surveyAreas.reduce((total: number, area: any) => 
                total + (area.recommendedProducts?.length || 0), 0
              ) : 0} products selected from {
                Array.isArray(surveyAreas) ? surveyAreas.filter((area: any) => area.recommendedProducts?.length > 0).length : 0
              } areas
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowBuildProjectModal(false)}>
                Cancel
              </Button>
              <Button 
                className="bg-[#FFC72C] hover:bg-[#F0B800] text-black"
                onClick={async () => {
                  try {
                    // Collect products and quantities from modal
                    const itemsToAdd: any[] = [];
                    
                    if (Array.isArray(surveyAreas)) {
                      surveyAreas.filter((area: any) => area.recommendedProducts?.length > 0).forEach((area: any) => {
                      area.recommendedProducts?.forEach((product: any) => {
                        const qtyInput = document.getElementById(`qty-${area.id}-${product.id}`) as HTMLInputElement;
                        const quantity = parseInt(qtyInput?.value || '1', 10);
                        
                        if (quantity > 0) {
                          itemsToAdd.push({
                            productName: product.name,
                            quantity,
                            pricingType: product.pricingType || 'unit',
                            unitPrice: product.price || 0,
                            totalPrice: (product.price || 0) * quantity,
                            notes: `From site survey area: ${area.zoneName} - ${area.areaName}`,
                            applicationArea: area.areaType,
                            areaName: area.areaName,
                            zoneName: area.zoneName,
                            impactRating: product.impactRating,
                            impactCalculationId: area.impactCalculationId,
                            riskLevel: area.riskLevel,
                            requiresDelivery: true,
                            deliveryAddress: selectedSurvey?.facilityLocation,
                            requiresInstallation: true
                          });
                        }
                      });
                    });
                    }
                    
                    if (itemsToAdd.length === 0) {
                      haptic.warning();
                      toast({
                        title: "No Products Selected",
                        description: "Please select at least one product with quantity > 0",
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    // Send bulk add request
                    const response = await fetch('/api/cart/bulk-add', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      credentials: 'include',
                      body: JSON.stringify({
                        items: itemsToAdd,
                        projectInfo: {
                          company: selectedSurvey?.facilityName,
                          location: selectedSurvey?.facilityLocation,
                          projectDescription: `Site Survey: ${selectedSurvey?.title} - ${selectedSurvey?.description || ''}`,
                          companyLogoUrl: selectedSurvey?.companyLogoUrl || '',
                          siteSurveyId: selectedSurvey?.id,
                          siteSurveyTitle: selectedSurvey?.title
                        },
                        autoSaveExisting: true
                      })
                    });
                    
                    if (!response.ok) {
                      throw new Error('Failed to add products to cart');
                    }
                    
                    const result = await response.json();
                    
                    haptic.success();
                    toast({
                      title: "Products Added to Cart",
                      description: result.message || `${result.itemsAdded} products added to your project cart`,
                    });

                    setShowBuildProjectModal(false);
                    
                    // Navigate to cart
                    setTimeout(() => {
                      navigate('/cart');
                    }, 1000);
                  } catch (error) {
                    console.error('Error adding products to cart:', error);
                    haptic.error();
                    toast({
                      title: "Error",
                      description: "Failed to add products to cart. Please try again.",
                      variant: "destructive"
                    });
                  }
                }}
                data-testid="button-add-all-to-cart"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Add All to Project Cart
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Quote Draft drawer — slides in from the right with the AI-composed
          quote, PDF preview, and promote-to-cart action. */}
      <QuoteDraftDrawer
        open={quoteDrawerOpen}
        onOpenChange={setQuoteDrawerOpen}
        draft={quoteDraft}
        isGenerating={quoteGenerating}
      />
    </div>
  );
}