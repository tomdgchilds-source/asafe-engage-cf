import { useMemo, useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, AlertTriangle, ExternalLink, ShoppingCart, Camera, Image, XCircle, ChevronRight, Package, Truck, Check, Users, Settings, Shield, CheckCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Link } from "wouter";
import { AddToCartModal } from "@/components/AddToCartModal";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Pas13VerdictPanel } from "@/components/Pas13VerdictPanel";
import { pas13Verdict } from "@shared/pas13Rules";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import type { Product, VehicleType } from "@shared/schema";
import type { UploadResult } from "@uppy/core";
import {
  findLadderForApplication,
  recommendTier,
  SAFETY_FACTORS,
  safetyMargin,
  type BarrierLadder,
  type BarrierTier,
} from "@/utils/barrierLadders";
import { useBarrierLadders } from "@/hooks/useBarrierLadders";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Component to handle authenticated image loading
function AuthenticatedImage({ src, alt, className, category }: { src: string; alt: string; className: string; category?: string }) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // Helper function to validate URL
  const isValidUrl = (url: string): boolean => {
    if (!url || typeof url !== 'string') return false;
    
    // Check for data URLs (already base64 encoded)
    if (url.startsWith('data:')) return true;
    
    // Check for blob URLs
    if (url.startsWith('blob:')) return true;
    
    // Check for relative URLs (starting with /)
    if (url.startsWith('/')) return true;
    
    // Check for absolute URLs
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let abortController: AbortController | null = null;
    
    const loadImage = async () => {
      try {
        // Validate URL first
        if (!src || !isValidUrl(src)) {
          setHasError(true);
          setIsLoading(false);
          return;
        }
        
        // Handle data URLs directly
        if (src.startsWith('data:') || src.startsWith('blob:')) {
          setImageSrc(src);
          setIsLoading(false);
          setHasError(false);
          return;
        }
        
        setIsLoading(true);
        setHasError(false);
        
        // Create abort controller for timeout
        abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController?.abort(), 10000); // 10 second timeout
        
        try {
          // For CORS-friendly CDNs, use directly without proxy
          const directAllow = [
            'asafe.com',
            'webcdn.asafe.com',
            'api.iconify.design',
            'iconify.design',
            'img.youtube.com',
            'i.ytimg.com',
          ];
          if (directAllow.some(d => src.includes(d))) {
            setImageSrc(src);
            setHasError(false);
            setIsLoading(false);
            clearTimeout(timeoutId);
            return;
          }

          // Use proxy for other external URLs to avoid CORS issues
          const fetchUrl = src.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
          const response = await fetch(fetchUrl, {
            signal: abortController.signal,
            cache: 'force-cache'
          });
          
          clearTimeout(timeoutId);
          
          // Check if response is ok
          if (!response.ok) {
            // Don't throw, just mark as error
            setHasError(true);
            setIsLoading(false);
            return;
          }
          
          // Check if response is actually an image
          const contentType = response.headers.get('content-type');
          if (!contentType || !contentType.startsWith('image/')) {
            setHasError(true);
            setIsLoading(false);
            return;
          }
          
          const blob = await response.blob();
          const imageUrl = URL.createObjectURL(blob);
          setImageSrc(imageUrl);
          setHasError(false);
        } catch (fetchError: any) {
          // Handle fetch errors silently
          if (fetchError.name === 'AbortError') {
            // Timeout occurred
            setHasError(true);
          } else {
            // Network or other error
            setHasError(true);
          }
        }
      } catch {
        // Catch any unexpected errors silently
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };

    if (src && src.trim() !== '') {
      loadImage();
    } else {
      setHasError(true);
      setIsLoading(false);
    }

    return () => {
      // Cleanup
      if (abortController) {
        abortController.abort();
      }
      if (imageSrc && imageSrc.startsWith('blob:')) {
        URL.revokeObjectURL(imageSrc);
      }
    };
  }, [src]);

  if (isLoading) {
    return (
      <div className={`${className} bg-gray-200 animate-pulse flex items-center justify-center`}>
        <Image className="h-6 w-6 text-gray-400" />
      </div>
    );
  }

  if (hasError) {
    // Show category-specific fallback icon
    const getIcon = () => {
      switch(category?.toLowerCase()) {
        case 'forklift': return <Truck className="h-6 w-6 text-gray-400" />;
        case 'pedestrian': return <Users className="h-6 w-6 text-gray-400" />;
        case 'truck': return <Truck className="h-6 w-6 text-gray-400" />;
        default: return <Package className="h-6 w-6 text-gray-400" />;
      }
    };
    
    return (
      <div className={`${className} bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center`}>
        {getIcon()}
      </div>
    );
  }

  return (
    <img 
      src={imageSrc} 
      alt={alt} 
      className={className}
      onError={() => {
        // Final fallback if image fails to render
        setHasError(true);
        setImageSrc('');
      }}
    />
  );
}

interface CalculationResult {
  totalMass: number;
  speedMs: number;
  kineticEnergy: number;
  riskLevel: string;
  riskDescription: string;
  // PAS 13:2017 Compliance Fields
  pas13Compliant: boolean;
  pas13AdjustedEnergy?: number;
  pas13MaxAngle?: number;
  pas13SafetyMargin?: number;
}

interface CalculationInputs {
  applicationArea: string;
  customApplicationArea: string;
  operatingZone: string;
  selectedVehicleTypes: string[]; // Array for multi-select vehicles
  vehicleMass: number | string;
  loadMass: number | string;
  speed: number | string;
  speedUnit: "mph" | "kmh" | "ms";
  impactAngle: number | string;
  aisleWidth?: number | string; // PAS 13 aisle width for angle calculation
  usePAS13?: boolean; // Toggle for PAS 13 compliance calculations
}

// Application area mapping data
const applicationAreaData = {
  "WorkStation(s)": {
    risk: "Employees seated close to vehicle routes remain exposed while distracted. Basic, non-tested barriers are easily damaged and ineffective against real impacts.",
    benefit: "Impact-rated barriers shield staff, reduce repeat maintenance, and prevent costly downtime from accidents."
  },
  "Pedestrian Walkways": {
    risk: "Painted lines alone offer no protection. Pedestrians are exposed to vehicles, blocked routes, and poor driver visibility.",
    benefit: "Physical barriers safely segregate pedestrians, maintain evacuation routes, and improve MHE efficiency with fewer obstacles."
  },
  "Crossing Points / Entry & Exits": {
    risk: "Staff crossing high-traffic or blind spots are vulnerable. Painted markings fail to stop vehicles or distracted pedestrians.",
    benefit: "Guided crossings and barriers provide safe, visible, and controlled movement across vehicle zones."
  },
  "Racking": {
    risk: "Vehicle impacts compromise racking integrity, risking collapse, product loss, and costly replacement.",
    benefit: "Barriers preserve racking stability, prevent collapse, and protect both staff and stored goods."
  },
  "Shutter Doors": {
    risk: "Vehicle damage disrupts workflows, reduces loading capacity, and compromises environmental control.",
    benefit: "Robust barriers protect doors, maintain security, efficiency, and climate control, while avoiding repair downtime."
  },
  "Cold Store Walls": {
    risk: "Insulated panels are easily damaged, causing temperature loss, product spoilage, and high repair costs.",
    benefit: "Barriers prevent panel damage, preserve goods, reduce energy waste, and avoid operational disruption."
  },
  "Fire Hose Cabinets": {
    risk: "Impact damage can render firefighting equipment unusable, delaying emergency response.",
    benefit: "Barriers ensure cabinets remain accessible and operational, protecting staff, assets, and compliance."
  },
  "Columns (Structural / Mezzanine)": {
    risk: "Impacts from vehicles can damage structural or mezzanine columns, threatening building integrity.",
    benefit: "Impact-rated barriers absorb collisions, protect structures, and prevent costly facility repairs."
  },
  "Overhead Pipework / Cables": {
    risk: "Overhead utilities are often overlooked. Impacts can disrupt power, processing, or CCTV, causing downtime.",
    benefit: "Barriers protect critical infrastructure, ensuring uninterrupted power and operations."
  },
  "Loading Docks": {
    risk: "Forklifts risk falling 1–2m from raised docks, endangering operators and damaging equipment.",
    benefit: "Barriers eliminate fall hazards, safeguard operators, and maintain safe, continuous loading operations."
  },
  "Processing Machines": {
    risk: "Vehicle collisions can cause severe equipment damage, downtime, and injury or fatalities.",
    benefit: "Barriers protect machinery, prevent production halts, and safeguard employees from life-threatening risks."
  },
  "Electrical DBs": {
    risk: "Impact damage risks short circuits, outages, fires, and prolonged downtime from complex repairs.",
    benefit: "Barriers maintain power continuity, reduce outage risks, and mitigate fire hazards."
  }
};

export function VehicleImpactCalculator() {
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  
  // Load saved state from sessionStorage with migration logic
  const loadSavedState = useCallback(() => {
    const saved = sessionStorage.getItem('impactCalculatorState');
    if (saved) {
      try {
        const parsedState = JSON.parse(saved);
        
        // Migrate old state format to new format
        if (parsedState?.inputs) {
          // Check if using old format with selectedVehicleType (singular)
          if ('selectedVehicleType' in parsedState.inputs && !('selectedVehicleTypes' in parsedState.inputs)) {
            // Convert old format to new format
            const oldVehicleType = parsedState.inputs.selectedVehicleType;
            parsedState.inputs.selectedVehicleTypes = oldVehicleType ? [oldVehicleType] : [];
            delete parsedState.inputs.selectedVehicleType;
            
            // Save migrated state back to sessionStorage
            sessionStorage.setItem('impactCalculatorState', JSON.stringify(parsedState));
            console.log('Migrated old calculator state to new format');
          }
          
          // Ensure selectedVehicleTypes exists and is an array
          if (!parsedState.inputs.selectedVehicleTypes || !Array.isArray(parsedState.inputs.selectedVehicleTypes)) {
            parsedState.inputs.selectedVehicleTypes = [];
          }
        }
        
        return parsedState;
      } catch (e) {
        console.error('Error loading saved state:', e);
        // Clear corrupted state
        sessionStorage.removeItem('impactCalculatorState');
      }
    }
    return null;
  }, []);
  
  const savedState = loadSavedState();
  
  const [inputs, setInputs] = useState<CalculationInputs>({
    applicationArea: savedState?.inputs?.applicationArea || "",
    customApplicationArea: savedState?.inputs?.customApplicationArea || "",
    operatingZone: savedState?.inputs?.operatingZone || "",
    selectedVehicleTypes: savedState?.inputs?.selectedVehicleTypes || [], // Ensure array
    vehicleMass: savedState?.inputs?.vehicleMass || 2000,
    loadMass: savedState?.inputs?.loadMass || 500,
    speed: savedState?.inputs?.speed || 5,
    speedUnit: savedState?.inputs?.speedUnit || "kmh",
    impactAngle: savedState?.inputs?.impactAngle || 90,
    aisleWidth: savedState?.inputs?.aisleWidth || 3, // Default 3m aisle width
    usePAS13: savedState?.inputs?.usePAS13 !== undefined ? savedState?.inputs?.usePAS13 : true, // Default to PAS 13 compliance
  });
  
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);

  const [result, setResult] = useState<CalculationResult | null>(savedState?.result || null);
  const [savedCalculationId, setSavedCalculationId] = useState<string | null>(savedState?.savedCalculationId || null);
  const [operationalZoneImageUrls, setOperationalZoneImageUrls] = useState<string[]>(savedState?.operationalZoneImageUrls || []);

  // -------------------------------------------------------------------
  // Good / Better / Best tier recommender state
  // -------------------------------------------------------------------
  // The calc's applicationArea already drives ladder auto-selection via
  // `findLadderForApplication`. When no match is found (or the user
  // wants to override) we expose a manual ladder picker above the cards.
  // Default = "single-traffic", per the brief.
  const [manualLadderId, setManualLadderId] = useState<string | null>(null);
  const [manualRiskLevel, setManualRiskLevel] = useState<
    "critical" | "high" | "medium" | "low"
  >("medium");
  const {
    ladders: allLadders,
    findProductsForFamily,
    priceForFamily,
    joulesForFamily,
    heroProductForFamily,
  } = useBarrierLadders();
  
  // Fetch vehicle types
  const { data: vehicleTypes, isLoading: loadingVehicleTypes } = useQuery({
    queryKey: ["/api/vehicle-types"],
    queryFn: async () => {
      const response = await fetch("/api/vehicle-types");
      if (!response.ok) throw new Error('Failed to fetch vehicle types');
      return response.json() as Promise<VehicleType[]>;
    },
  });
  
  // Handle vehicle type selection (now multi-select)
  const handleVehicleToggle = (vehicleTypeId: string) => {
    setInputs(prev => {
      // Ensure selectedVehicleTypes exists and is an array
      const currentTypes = prev.selectedVehicleTypes || [];
      const isSelected = currentTypes.includes(vehicleTypeId);
      let newSelectedTypes: string[];
      
      if (isSelected) {
        // Remove from selection
        newSelectedTypes = currentTypes.filter(id => id !== vehicleTypeId);
      } else {
        // Add to selection
        newSelectedTypes = [...currentTypes, vehicleTypeId];
      }
      
      // Calculate heaviest vehicle weight from all selected
      let maxWeight = 2000; // Default weight
      let maxLoadCapacity = 500; // Default load
      
      if (newSelectedTypes.length > 0 && vehicleTypes) {
        const selectedVehicles = vehicleTypes.filter(v => newSelectedTypes.includes(v.id));
        const heaviestVehicle = selectedVehicles.reduce((max, vehicle) => {
          const vehicleWeight = parseFloat(vehicle.weightTypical as string);
          const maxWeight = parseFloat(max.weightTypical as string);
          return vehicleWeight > maxWeight ? vehicle : max;
        }, selectedVehicles[0]);
        
        maxWeight = parseFloat(heaviestVehicle.weightTypical as string);
        maxLoadCapacity = heaviestVehicle.capacityMax ? heaviestVehicle.capacityMax / 2 : 500;
        
        haptic.select();
        toast({
          title: isSelected ? "Vehicle Removed" : "Vehicle Added",
          description: `Using heaviest vehicle: ${heaviestVehicle.name} (${maxWeight} kg)`,
        });
      }
      
      return {
        ...prev,
        selectedVehicleTypes: newSelectedTypes,
        vehicleMass: maxWeight,
        loadMass: maxLoadCapacity,
      };
    });
  };

  // Check for calculationId in URL query parameters and pre-fill data
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const calculationId = urlParams.get('calculationId');
    
    if (calculationId) {
      // Fetch the calculation data and pre-fill the form
      fetch(`/api/calculations/${calculationId}`, {
        credentials: 'include'
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Failed to fetch calculation');
      })
      .then((calculation: any) => {
        setInputs({
          applicationArea: calculation.operatingZone || "",
          customApplicationArea: "",
          operatingZone: calculation.operatingZone || "",
          selectedVehicleTypes: [], // No saved vehicle types
          vehicleMass: parseFloat(calculation.vehicleMass) || 2000,
          loadMass: parseFloat(calculation.loadMass) || 500,
          speed: parseFloat(calculation.speed) || 5,
          speedUnit: calculation.speedUnit || "kmh",
          impactAngle: parseFloat(calculation.impactAngle) || 90,
        });
        
        // Set operational zone images if available
        if (calculation.operationalZoneImageUrl) {
          const imageUrls = calculation.operationalZoneImageUrl.split(',').filter(Boolean);
          setOperationalZoneImageUrls(imageUrls);
        }
        
        setSavedCalculationId(calculationId);
        
        toast({
          title: "Impact Report Loaded",
          description: "Previous calculation data has been loaded. You can now add more products to this operating zone.",
        });
      })
      .catch(error => {
        console.error('Error loading calculation:', error);
        toast({
          title: "Error Loading Report", 
          description: "Could not load the previous impact calculation. Please try again.",
          variant: "destructive",
        });
      });
    }
  }, [toast]);

  // Fetch product recommendations when calculation is complete
  const { data: recommendations, isLoading: loadingRecommendations, error: recommendationsError } = useQuery<any[]>({
    queryKey: ["/api/products/recommendations", result?.kineticEnergy],
    queryFn: async () => {
      if (!result?.kineticEnergy) return [];
      const response = await fetch(`/api/products/recommendations/${result.kineticEnergy}`);
      if (!response.ok) throw new Error('Failed to fetch recommendations');
      const data = await response.json() as any[];
      console.log('Recommendations API Response:', {
        dataType: typeof data,
        isArray: Array.isArray(data),
        length: data?.length,
        firstItem: data?.[0],
        raw: data
      });
      return data;
    },
    enabled: !!result?.kineticEnergy,
  });

  // Fetch all products for the Product-Suitability cross-reference panel.
  // Client-side filter against `suitabilityData.vehicleSuitability` (a string[])
  // intersected with the union of selected-vehicle `suitabilityLabels`.
  // Only enabled once the user has selected at least one vehicle, otherwise
  // we'd burn the fetch before it's useful.
  const {
    data: allProductsForSuitability,
    isLoading: loadingSuitabilityProducts,
  } = useQuery<any[]>({
    queryKey: ["/api/products", "suitability-grouped"],
    queryFn: async () => {
      const response = await fetch("/api/products");
      if (!response.ok) throw new Error("Failed to fetch products");
      const data = (await response.json()) as any;
      return Array.isArray(data) ? data : data?.products || [];
    },
    enabled:
      !!inputs.selectedVehicleTypes && inputs.selectedVehicleTypes.length > 0,
    // Cache aggressively — this is a mostly-static catalog and the panel
    // re-runs the client-side filter whenever selection changes.
    staleTime: 5 * 60 * 1000,
  });

  // Union of PDF vehicle-suitability labels across the user's selection.
  // Reads `suitabilityLabels` from each selected vehicle_types row (populated
  // by /api/admin/apply-vehicle-suitability-labels from VEHICLE_SUITABILITY_MAP).
  const selectedSuitabilityLabels = useMemo(() => {
    if (!vehicleTypes || !inputs.selectedVehicleTypes?.length) return new Set<string>();
    const out = new Set<string>();
    for (const id of inputs.selectedVehicleTypes) {
      const v = vehicleTypes.find((vt) => vt.id === id);
      const labels = (v as any)?.suitabilityLabels;
      if (Array.isArray(labels)) for (const l of labels) out.add(l);
    }
    return out;
  }, [vehicleTypes, inputs.selectedVehicleTypes]);

  // Products whose `suitabilityData.vehicleSuitability` intersects the union
  // (ANY-match semantics — one matching label is enough to surface it).
  const suitableProducts = useMemo(() => {
    if (!allProductsForSuitability || selectedSuitabilityLabels.size === 0)
      return [];
    const out: any[] = [];
    for (const p of allProductsForSuitability) {
      const sd = (p as any).suitabilityData;
      const productLabels: string[] | undefined = sd?.vehicleSuitability;
      if (!Array.isArray(productLabels) || productLabels.length === 0) continue;
      let matched = false;
      for (const l of productLabels) {
        if (selectedSuitabilityLabels.has(l)) {
          matched = true;
          break;
        }
      }
      if (matched) out.push(p);
    }
    // Sort by impact rating desc to mirror the rest of the calculator UI.
    return out.sort(
      (a, b) => (b.impactRating || 0) - (a.impactRating || 0),
    );
  }, [allProductsForSuitability, selectedSuitabilityLabels]);

  // Save calculation mutation
  const saveCalculation = useMutation({
    mutationFn: async (calculationData: any) => {
      return await apiRequest("/api/calculations", "POST", calculationData);
    },
  });

  // Photo upload handlers
  const handleGetUploadParameters = async (): Promise<{ method: "PUT"; url: string; }> => {
    try {
      const key = `uploads/${crypto.randomUUID()}`;
      const accessPath = `/api/objects/${key}`;
      console.log("Upload parameters generated:", { accessPath });
      return {
        method: "PUT" as const,
        url: accessPath,
      };
    } catch (error) {
      console.error("Error getting upload parameters:", error);
      throw error;
    }
  };

  const handlePhotoUploadComplete = async (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    if (result.successful && result.successful.length > 0) {
      const newImageUrls: string[] = [];

      // Process all uploaded files
      for (const uploadedFile of result.successful) {
        // The uploadURL is the URL we uploaded to (our PUT endpoint)
        const imageURL = uploadedFile.uploadURL || (uploadedFile as any).response?.uploadURL;

        try {
          // Tell the backend about the uploaded image so it can resolve the access path
          const response = await apiRequest("/api/operational-zone-images", "PUT", {
            imageURL: imageURL,
          });
          const data = await response.json() as any;
          newImageUrls.push(data.objectPath);
        } catch (error) {
          console.error("Error setting image ACL:", error);
          // Fall back to using the upload URL directly as the access path
          if (imageURL) {
            newImageUrls.push(imageURL);
          }
          haptic.error();
          toast({
            title: "Upload Error",
            description: "Failed to process one or more uploaded images",
            variant: "destructive",
          });
        }
      }

      if (newImageUrls.length > 0) {
        setOperationalZoneImageUrls(prev => [...prev, ...newImageUrls]);
        haptic.success();
        toast({
          title: "Photos Uploaded",
          description: `${newImageUrls.length} application area photo(s) have been attached to this calculation`,
        });
      }
    }
  };

  // Save state to sessionStorage whenever it changes
  useEffect(() => {
    const stateToSave = {
      inputs,
      result,
      savedCalculationId,
      operationalZoneImageUrls
    };
    sessionStorage.setItem('impactCalculatorState', JSON.stringify(stateToSave));
  }, [inputs, result, savedCalculationId, operationalZoneImageUrls]);

  // PAS 13:2017 Maximum Impact Angle Calculation (per Figure 17 & 18)
  const calculatePAS13MaxAngle = (aisleWidth: number, vehicleLength: number = 2.5): number => {
    // Based on PAS 13:2017 Figure 17 - Maximum angle calculation
    // tan(θ) = (aisle width - vehicle width) / vehicle length
    // Assuming typical vehicle width of 1.2m for forklifts
    const vehicleWidth = 1.2;
    const clearance = Math.max(0, aisleWidth - vehicleWidth);
    const maxAngleRad = Math.atan(clearance / vehicleLength);
    const maxAngleDeg = (maxAngleRad * 180) / Math.PI;
    
    // PAS 13 specifies maximum practical angle of 45 degrees
    return Math.min(maxAngleDeg, 45);
  };

  const calculateImpact = () => {
    console.log('Starting impact calculation...');
    const { applicationArea, customApplicationArea, vehicleMass, loadMass, speed, speedUnit, impactAngle, aisleWidth, usePAS13 } = inputs;

    // Validate application area is provided
    if (!applicationArea.trim()) {
      haptic.error();
      alert("Application area is required for impact calculations");
      return;
    }

    // If "Other" is selected, validate custom application area
    if (applicationArea === "Other" && !customApplicationArea.trim()) {
      haptic.error();
      alert("Please describe your custom application area");
      return;
    }

    // Convert inputs to numbers and validate
    const vehicleMassNum = typeof vehicleMass === 'string' ? parseFloat(vehicleMass) : vehicleMass;
    const loadMassNum = typeof loadMass === 'string' ? parseFloat(loadMass) : loadMass;
    const speedNum = typeof speed === 'string' ? parseFloat(speed) : speed;
    const impactAngleNum = typeof impactAngle === 'string' ? parseFloat(impactAngle) : impactAngle;
    const aisleWidthNum = typeof aisleWidth === 'string' ? parseFloat(aisleWidth) : (aisleWidth || 3);

    if (isNaN(vehicleMassNum) || isNaN(loadMassNum) || isNaN(speedNum) || isNaN(impactAngleNum)) {
      return; // Don't calculate if any input is invalid
    }

    // Convert speed to m/s
    let speedMs = speedNum;
    if (speedUnit === "mph") {
      speedMs = speedNum * 0.447;
    } else if (speedUnit === "kmh") {
      speedMs = speedNum / 3.6;
    }

    // Calculate total mass
    const totalMass = vehicleMassNum + loadMassNum;

    // PAS 13:2017 Compliance Calculations
    let actualAngle = impactAngleNum;
    let pas13MaxAngle: number | undefined;
    let pas13AdjustedEnergy: number | undefined;
    let pas13SafetyMargin: number | undefined;
    let pas13Compliant = false;

    if (usePAS13) {
      // Calculate maximum angle per PAS 13:2017 Figure 17
      pas13MaxAngle = calculatePAS13MaxAngle(aisleWidthNum);
      
      // Use the lesser of user input angle or PAS 13 maximum
      actualAngle = Math.min(impactAngleNum, pas13MaxAngle);
      
      // PAS 13 specifies 45-degree impact for testing (Section 7.2.4)
      const pas13TestAngle = Math.min(actualAngle, 45);
      
      // Calculate energy at PAS 13 test angle
      const pas13AngleRad = (pas13TestAngle * Math.PI) / 180;
      const pas13VelocityComponent = speedMs * Math.sin(pas13AngleRad);
      pas13AdjustedEnergy = 0.5 * totalMass * Math.pow(pas13VelocityComponent, 2);
      
      // Apply PAS 13 safety margin (typically 20% as per industry practice)
      pas13SafetyMargin = 20; // 20% safety margin
      pas13AdjustedEnergy = pas13AdjustedEnergy * (1 + pas13SafetyMargin / 100);
      
      // Check compliance (energy must be within testable range per PAS 13)
      pas13Compliant = pas13AdjustedEnergy <= 50000; // Maximum testable per PAS 13
    }

    // Calculate standard kinetic energy
    const angleRad = (actualAngle * Math.PI) / 180;
    const velocityComponent = speedMs * Math.sin(angleRad);
    const kineticEnergy = 0.5 * totalMass * Math.pow(velocityComponent, 2);

    // Use PAS 13 adjusted energy for risk assessment if enabled
    const assessmentEnergy = usePAS13 && pas13AdjustedEnergy ? pas13AdjustedEnergy : kineticEnergy;

    // Determine risk level
    const { riskLevel, riskDescription } = getRiskAssessment(assessmentEnergy);

    const calculationResult: CalculationResult = {
      totalMass,
      speedMs,
      kineticEnergy,
      riskLevel,
      riskDescription,
      pas13Compliant,
      pas13AdjustedEnergy,
      pas13MaxAngle,
      pas13SafetyMargin,
    };

    console.log('Setting calculation result:', calculationResult);
    setResult(calculationResult);
    haptic.calculate();

    // Save calculation for logged-in users
    const finalApplicationArea = applicationArea === "Other" ? customApplicationArea : applicationArea;
    saveCalculation.mutate({
      operatingZone: finalApplicationArea,
      operationalZoneImageUrl: operationalZoneImageUrls.join(','), // Store multiple URLs as comma-separated string
      vehicleMass: vehicleMassNum.toString(),
      loadMass: loadMassNum.toString(),
      speed: speedNum.toString(),
      speedUnit,
      impactAngle: impactAngleNum.toString(),
      kineticEnergy: kineticEnergy.toString(),
    }, {
      onSuccess: async (response: any) => {
        const data = await response.json() as any;
        setSavedCalculationId(data.id);
        haptic.success();
      },
      onError: () => {
        haptic.error();
      }
    });
  };

  const getRiskAssessment = (energy: number) => {
    if (energy < 5000) {
      return {
        riskLevel: "Low Risk",
        riskDescription: "Standard pedestrian barriers may be sufficient.",
      };
    }
    if (energy < 12000) {
      return {
        riskLevel: "Medium Risk",
        riskDescription: "Industrial traffic barriers recommended.",
      };
    }
    if (energy < 20000) {
      return {
        riskLevel: "High Risk",
        riskDescription: "Heavy-duty barriers with high joule rating required.",
      };
    }
    return {
      riskLevel: "Extreme Risk",
      riskDescription: "Maximum protection barriers and professional consultation required.",
    };
  };

  const handleInputChange = (field: keyof CalculationInputs, value: string | number | boolean) => {
    setInputs(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // -------------------------------------------------------------------
  // Good / Better / Best tier resolution for the recommendation cards.
  // -------------------------------------------------------------------
  // Ladder choice: prefer a manual user pick, else resolve from the
  // selected application area, else default to "single-traffic".
  const resolvedLadder: BarrierLadder | null = useMemo(() => {
    if (manualLadderId) {
      return allLadders.find((l) => l.id === manualLadderId) ?? null;
    }
    const appArea =
      inputs.applicationArea === "Other"
        ? inputs.customApplicationArea
        : inputs.applicationArea;
    const fromArea = appArea ? findLadderForApplication(appArea) : null;
    if (fromArea) return fromArea;
    return allLadders.find((l) => l.id === "single-traffic") ?? allLadders[0] ?? null;
  }, [manualLadderId, inputs.applicationArea, inputs.customApplicationArea, allLadders]);

  // Risk level: map the calculator's own descriptive riskLevel
  // ("Low Risk" / "Medium Risk" / …) to the sibling API's 4-value
  // enum. When no calculation has run yet, use the manual picker.
  const riskLevelEnum: "critical" | "high" | "medium" | "low" = useMemo(() => {
    const r = (result?.riskLevel ?? "").toLowerCase();
    if (r.includes("extreme") || r.includes("critical")) return "critical";
    if (r.includes("high")) return "high";
    if (r.includes("medium")) return "medium";
    if (r.includes("low")) return "low";
    return manualRiskLevel;
  }, [result?.riskLevel, manualRiskLevel]);

  // Recommended tier for the current calculation + ladder.
  const calcRecommendedTier: BarrierTier | undefined = useMemo(() => {
    if (!resolvedLadder || !result) return undefined;
    return recommendTier(
      result.kineticEnergy,
      riskLevelEnum,
      resolvedLadder,
      (family) => joulesForFamily(family),
    );
  }, [resolvedLadder, result, riskLevelEnum, joulesForFamily]);

  // Add-to-cart handler for a given tier card. Re-uses the existing
  // /api/cart POST contract with the chosen family's unit price +
  // impactRating, carrying the calculation context through.
  const addTierToCart = async (ladder: BarrierLadder, tier: BarrierTier) => {
    const family = ladder.tiers[tier].family;
    const hero = heroProductForFamily(family);
    const unitPrice = priceForFamily(family);
    if (!hero) {
      toast({
        title: "Unavailable",
        description: `No catalog product matches "${family}".`,
        variant: "destructive",
      });
      return;
    }
    if (unitPrice == null) {
      toast({
        title: "Price on request",
        description: `${family} does not have a published unit price.`,
        variant: "destructive",
      });
      return;
    }
    try {
      haptic.addToCart();
      const finalApplicationArea =
        inputs.applicationArea === "Other"
          ? inputs.customApplicationArea
          : inputs.applicationArea;
      const calcContext = result
        ? {
            operatingZone: finalApplicationArea,
            vehicleMass: inputs.vehicleMass,
            loadMass: inputs.loadMass,
            speed: inputs.speed,
            speedUnit: inputs.speedUnit,
            impactAngle: inputs.impactAngle,
            kineticEnergy: result.kineticEnergy,
            riskLevel: result.riskLevel,
            totalMass: result.totalMass,
            speedMs: result.speedMs,
            pas13Compliant: result.pas13Compliant,
            pas13AdjustedEnergy: result.pas13AdjustedEnergy,
          }
        : undefined;
      await apiRequest("/api/cart", "POST", {
        productName: hero.name,
        quantity: 1,
        pricingType:
          hero.basePricePerMeter && !hero.price ? "linear_meter" : "single_item",
        unitPrice,
        totalPrice: unitPrice,
        pricingTier: tier,
        applicationArea: finalApplicationArea || undefined,
        impactCalculationId: savedCalculationId ?? undefined,
        calculationContext: calcContext,
        notes: `Selected from Good/Better/Best (${tier.toUpperCase()}) for ${ladder.label}`,
        calculatorImages: operationalZoneImageUrls,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      haptic.success();
      toast({
        title: "Added to cart",
        description: `${hero.name} (${tier.toUpperCase()})`,
      });
    } catch (err: any) {
      console.error("Failed to add tier to cart:", err);
      haptic.error();
      toast({
        title: "Could not add to cart",
        description: err?.message ?? "Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto">

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Calculator Input */}
        <Card className="bg-gray-50 dark:bg-gray-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Impact Parameters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="applicationArea" className="text-gray-700 dark:text-gray-300 font-semibold">
                Application Area *
              </Label>
              <Select
                value={inputs.applicationArea}
                onValueChange={(value) => { haptic.select(); handleInputChange("applicationArea", value); }}
              >
                <SelectTrigger className="focus:ring-yellow-400 focus:border-yellow-400" data-testid="select-application-area">
                  <SelectValue placeholder="Select application area..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WorkStation(s)">WorkStation(s)</SelectItem>
                  <SelectItem value="Pedestrian Walkways">Pedestrian Walkways</SelectItem>
                  <SelectItem value="Crossing Points / Entry & Exits">Crossing Points / Entry & Exits</SelectItem>
                  <SelectItem value="Racking">Racking</SelectItem>
                  <SelectItem value="Shutter Doors">Shutter Doors</SelectItem>
                  <SelectItem value="Cold Store Walls">Cold Store Walls</SelectItem>
                  <SelectItem value="Fire Hose Cabinets">Fire Hose Cabinets</SelectItem>
                  <SelectItem value="Columns (Structural / Mezzanine)">Columns (Structural / Mezzanine)</SelectItem>
                  <SelectItem value="Overhead Pipework / Cables">Overhead Pipework / Cables</SelectItem>
                  <SelectItem value="Loading Docks">Loading Docks</SelectItem>
                  <SelectItem value="Processing Machines">Processing Machines</SelectItem>
                  <SelectItem value="Electrical DBs">Electrical DBs</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Select the type of area requiring protection</p>
            </div>

            {inputs.applicationArea === "Other" && (
              <div>
                <Label htmlFor="customApplicationArea" className="text-gray-700 dark:text-gray-300 font-semibold">
                  Custom Application Area *
                </Label>
                <Input
                  id="customApplicationArea"
                  type="text"
                  value={inputs.customApplicationArea}
                  onChange={(e) => handleInputChange("customApplicationArea", e.target.value)}
                  className="focus:ring-yellow-400 focus:border-yellow-400"
                  data-testid="input-custom-application-area"
                  placeholder="Describe your specific application area..."
                  required
                />
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Please describe the specific area requiring protection</p>
              </div>
            )}

            {/* Risk & Benefit Information Table */}
            {inputs.applicationArea && inputs.applicationArea !== "Other" && applicationAreaData[inputs.applicationArea as keyof typeof applicationAreaData] && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Risk & Benefit Analysis for {inputs.applicationArea}
                </h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h5 className="font-medium text-red-800 mb-2">Risk Without Protection:</h5>
                    <p className="text-sm text-red-700">
                      {applicationAreaData[inputs.applicationArea as keyof typeof applicationAreaData]?.risk}
                    </p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h5 className="font-medium text-green-800 mb-2">Benefit of Barrier Protection:</h5>
                    <p className="text-sm text-green-700">
                      {applicationAreaData[inputs.applicationArea as keyof typeof applicationAreaData]?.benefit}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Application Area Photo Upload */}
            <div>
              <Label className="text-gray-700 dark:text-gray-300 font-semibold">
                Application Area Photos (Optional)
              </Label>
              <div className="mt-2">
                {operationalZoneImageUrls.length > 0 ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {operationalZoneImageUrls.map((imageUrl, index) => (
                        <div key={index} className="relative">
                          <AuthenticatedImage 
                            src={imageUrl} 
                            alt={`Application Area ${index + 1}`} 
                            className="w-full h-20 object-contain rounded-lg border border-gray-300 shadow-sm hover:shadow-md transition-shadow bg-gray-50 dark:bg-gray-800"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setOperationalZoneImageUrls(prev => 
                                prev.filter((_, i) => i !== index)
                              );
                            }}
                            className="absolute -top-1 -right-1 h-5 w-5 p-0 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-sm text-xs"
                            title="Remove photo"
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-green-800">
                      <Image className="h-4 w-4 text-green-600" />
                      <span className="font-medium">
                        {operationalZoneImageUrls.length} application area photo{operationalZoneImageUrls.length > 1 ? 's' : ''} attached
                      </span>
                    </div>
                  </div>
                ) : null}
                
                <div className={operationalZoneImageUrls.length > 0 ? "mt-3" : ""}>
                  <ObjectUploader
                    maxNumberOfFiles={5}
                    maxFileSize={10485760}
                    onGetUploadParameters={handleGetUploadParameters}
                    onComplete={handlePhotoUploadComplete}
                    buttonClassName="w-full border-dashed border-2 border-gray-300 hover:border-yellow-400 bg-gray-50 dark:bg-gray-800 hover:bg-yellow-50"
                  >
                    <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                      <Camera className="h-4 w-4" />
                      <span>
                        {operationalZoneImageUrls.length > 0 
                          ? "Add More Photos" 
                          : "Add Photos of Operational Zone"
                        }
                      </span>
                    </div>
                  </ObjectUploader>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Upload photos to document the operational zone for this calculation (up to 5 photos)</p>
              </div>
            </div>

            <div>
              <Label className="text-gray-700 dark:text-gray-300 font-semibold">
                Vehicle Types (Select all that apply)
              </Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                onClick={() => setShowVehicleSelector(true)}
                data-testid="button-select-vehicles"
              >
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  <span>
                    {(!inputs.selectedVehicleTypes || inputs.selectedVehicleTypes.length === 0)
                      ? "Select vehicle types..."
                      : `${inputs.selectedVehicleTypes.length} vehicle${inputs.selectedVehicleTypes.length === 1 ? '' : 's'} selected`}
                  </span>
                </div>
                <Settings className="h-4 w-4" />
              </Button>
              {inputs.selectedVehicleTypes && inputs.selectedVehicleTypes.length > 0 && vehicleTypes && (
                <p className="text-sm text-gray-600 mt-2">
                  Using heaviest: {vehicleTypes
                    .filter(v => inputs.selectedVehicleTypes.includes(v.id))
                    .reduce((max, v) => {
                      const weight = parseFloat(v.weightTypical as string);
                      const maxWeight = parseFloat(max.weightTypical as string);
                      return weight > maxWeight ? v : max;
                    }, vehicleTypes.filter(v => inputs.selectedVehicleTypes.includes(v.id))[0])
                    ?.name} ({inputs.vehicleMass} kg)
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="vehicleMass" className="text-gray-700 dark:text-gray-300 font-semibold">
                Vehicle Mass (kg)
              </Label>
              <Input
                id="vehicleMass"
                type="number"
                value={inputs.vehicleMass}
                onChange={(e) => handleInputChange("vehicleMass", e.target.value)}
                className="focus:ring-yellow-400 focus:border-yellow-400"
                data-testid="input-vehicle-mass"
                placeholder="2000"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {inputs.selectedVehicleTypes.length > 0 && vehicleTypes 
                  ? `Weight from heaviest selected vehicle. Adjust if needed.`
                  : "Base vehicle weight"}
              </p>
            </div>

            <div>
              <Label htmlFor="loadMass" className="text-gray-700 dark:text-gray-300 font-semibold">
                Load Mass (kg)
              </Label>
              <Input
                id="loadMass"
                type="number"
                value={inputs.loadMass}
                onChange={(e) => handleInputChange("loadMass", e.target.value)}
                className="focus:ring-yellow-400 focus:border-yellow-400"
                data-testid="input-load-mass"
                placeholder="500"
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Maximum load capacity</p>
            </div>

            <div>
              <Label className="text-gray-700 dark:text-gray-300 font-semibold">Vehicle Speed</Label>
              <div className="flex space-x-2">
                <Input
                  type="number"
                  value={inputs.speed}
                  onChange={(e) => handleInputChange("speed", e.target.value)}
                  className="flex-1 focus:ring-yellow-400 focus:border-yellow-400"
                  data-testid="input-speed"
                  placeholder="5"
                />
                <Select
                  value={inputs.speedUnit}
                  onValueChange={(value) => handleInputChange("speedUnit", value as "mph" | "kmh" | "ms")}
                >
                  <SelectTrigger className="w-24" data-testid="select-speed-unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mph">mph</SelectItem>
                    <SelectItem value="kmh">km/h</SelectItem>
                    <SelectItem value="ms">m/s</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-gray-700 dark:text-gray-300 font-semibold">Impact Angle</Label>
              <Select
                value={inputs.impactAngle.toString()}
                onValueChange={(value) => handleInputChange("impactAngle", Number(value))}
              >
                <SelectTrigger data-testid="select-impact-angle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">90° (Direct impact)</SelectItem>
                  <SelectItem value="67.5">67.5°</SelectItem>
                  <SelectItem value="45">45°</SelectItem>
                  <SelectItem value="22.5">22.5°</SelectItem>
                  <SelectItem value="10">10°</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PAS 13:2017 Compliance Section */}
            <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <Label className="text-blue-800 dark:text-blue-200 font-semibold">
                    PAS 13:2017 Compliance Mode
                  </Label>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={inputs.usePAS13}
                    onChange={(e) => handleInputChange("usePAS13", e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-blue-700 dark:text-blue-300">
                    {inputs.usePAS13 ? "Enabled" : "Disabled"}
                  </span>
                </label>
              </div>
              
              {inputs.usePAS13 && (
                <>
                  <div>
                    <Label htmlFor="aisleWidth" className="text-blue-700 dark:text-blue-300 font-medium">
                      Aisle Width (meters)
                    </Label>
                    <Input
                      id="aisleWidth"
                      type="number"
                      step="0.1"
                      value={inputs.aisleWidth || 3}
                      onChange={(e) => handleInputChange("aisleWidth", e.target.value)}
                      className="focus:ring-blue-400 focus:border-blue-400"
                      data-testid="input-aisle-width"
                      placeholder="3.0"
                    />
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                      Per PAS 13:2017 Figure 17 - Used to calculate maximum impact angle
                    </p>
                  </div>
                  
                  <div className="bg-blue-100 dark:bg-blue-900/40 p-3 rounded">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      <strong>PAS 13:2017 Compliance:</strong> Calculations will follow British Standard PAS 13:2017 
                      including 45° maximum test angle, safety margins, and deflection zone requirements.
                    </p>
                  </div>
                </>
              )}
            </div>

            <Button
              onClick={calculateImpact}
              className="w-full bg-yellow-400 text-black hover:bg-yellow-500 font-semibold"
              data-testid="button-calculate"
            >
              Calculate Impact Energy
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card className="border-2 border-yellow-400">
          <CardHeader>
            <CardTitle>Calculation Results</CardTitle>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl font-bold text-yellow-500 mb-2" data-testid="result-kinetic-energy">
                    {Math.round(result.kineticEnergy).toLocaleString()} J
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">Kinetic Energy Required</p>
                </div>

                <div className="mb-4">
                  <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                    <p className="font-semibold text-sm text-blue-800">Operating Zone:</p>
                    <p className="text-blue-700" data-testid="result-operating-zone">{inputs.operatingZone}</p>
                    {operationalZoneImageUrls.length > 0 && (
                      <div className="mt-2 flex items-center gap-2">
                        <Image className="h-4 w-4 text-blue-600" />
                        <span className="text-sm text-blue-700">{operationalZoneImageUrls.length} photo{operationalZoneImageUrls.length > 1 ? 's' : ''} attached</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-semibold">Total Mass:</p>
                    <p data-testid="result-total-mass">{result.totalMass.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <p className="font-semibold">Speed (m/s):</p>
                    <p data-testid="result-speed-ms">{result.speedMs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m/s</p>
                  </div>
                  <div>
                    <p className="font-semibold">Impact Angle:</p>
                    <p>{typeof inputs.impactAngle === 'string' ? parseFloat(inputs.impactAngle) : inputs.impactAngle}°</p>
                  </div>
                  <div>
                    <p className="font-semibold">Sin θ:</p>
                    <p>{Math.sin(((typeof inputs.impactAngle === 'string' ? parseFloat(inputs.impactAngle) : inputs.impactAngle) * Math.PI) / 180).toFixed(3)}</p>
                  </div>
                </div>

                {/* PAS 13:2017 Compliance Results */}
                {inputs.usePAS13 && result.pas13AdjustedEnergy !== undefined && (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2 mb-3">
                      <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <p className="font-semibold text-blue-800 dark:text-blue-200">PAS 13:2017 Compliance</p>
                      {result.pas13Compliant && (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-blue-700 dark:text-blue-300 font-medium">Max Angle (PAS 13):</p>
                        <p className="text-blue-800 dark:text-blue-200">{result.pas13MaxAngle?.toFixed(1)}°</p>
                      </div>
                      <div>
                        <p className="text-blue-700 dark:text-blue-300 font-medium">Safety Margin:</p>
                        <p className="text-blue-800 dark:text-blue-200">{result.pas13SafetyMargin}%</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-blue-700 dark:text-blue-300 font-medium">PAS 13 Adjusted Energy:</p>
                        <p className="text-blue-800 dark:text-blue-200 font-bold text-lg">
                          {Math.round(result.pas13AdjustedEnergy).toLocaleString()} J
                        </p>
                      </div>
                    </div>
                    {result.pas13Compliant ? (
                      <div className="mt-3 flex items-center gap-2 text-green-700 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        <p className="text-sm font-medium">Calculation meets PAS 13:2017 requirements</p>
                      </div>
                    ) : (
                      <div className="mt-3 flex items-center gap-2 text-yellow-700 dark:text-yellow-400">
                        <AlertTriangle className="h-4 w-4" />
                        <p className="text-sm">Energy exceeds PAS 13 testable range</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <p className="font-semibold text-sm">Risk Assessment:</p>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      result.riskLevel === "Low Risk" ? "bg-green-100 text-green-800" :
                      result.riskLevel === "Medium Risk" ? "bg-yellow-100 text-yellow-800" :
                      result.riskLevel === "High Risk" ? "bg-orange-100 text-orange-800" :
                      "bg-red-100 text-red-800"
                    }`}>
                      {result.riskLevel}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{result.riskDescription}</p>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>Enter parameters and click calculate to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* PAS 13:2017 alignment verdict — additive panel below the KE
          result. The barrier-recommendation logic below is UNCHANGED —
          this panel adds a deterministic PAS 13 verdict (aligned /
          borderline / not aligned) with cited sections.

          Rated energy comes from the highest-rated recommended product
          (i.e. the one the calculator would actually surface first). When
          no recommendations are back yet we show the verdict against the
          recommended-tier's family joules as a proxy so the panel is
          never empty once a calculation has run. */}
      {result && (() => {
        const ratedJoules =
          (Array.isArray(recommendations) && recommendations.length > 0
            ? recommendations
                .map((p: any) => p?.impactRating)
                .filter((j: any) => typeof j === "number" && j > 0)
                .sort((a: number, b: number) => b - a)[0]
            : undefined) ??
          (resolvedLadder && calcRecommendedTier
            ? (joulesForFamily(
                resolvedLadder.tiers[calcRecommendedTier].family,
              ) ?? undefined)
            : undefined) ??
          0;

        // Impact-zone proxy: default 200 mm if no product-level deflection
        // data attached. §5.10 adds the 600 mm pedestrian safe-zone on top.
        const impactZoneMm =
          (Array.isArray(recommendations) && recommendations.length > 0
            ? recommendations
                .map((p: any) => p?.deflectionZone)
                .find((d: any) => typeof d === "number" && d > 0)
            : undefined) ?? 200;

        const angleDeg =
          typeof inputs.impactAngle === "string"
            ? parseFloat(inputs.impactAngle) || 90
            : inputs.impactAngle || 90;

        // Re-derive raw inputs in the expected units.
        const vmKg =
          typeof inputs.vehicleMass === "string"
            ? parseFloat(inputs.vehicleMass) || 0
            : inputs.vehicleMass;
        const lmKg =
          typeof inputs.loadMass === "string"
            ? parseFloat(inputs.loadMass) || 0
            : inputs.loadMass;
        const speedNum =
          typeof inputs.speed === "string"
            ? parseFloat(inputs.speed) || 0
            : inputs.speed;
        const speedKmh =
          inputs.speedUnit === "mph"
            ? speedNum * 1.60934
            : inputs.speedUnit === "ms"
              ? speedNum * 3.6
              : speedNum;

        const verdict = pas13Verdict({
          vehicleMassKg: vmKg,
          loadMassKg: lmKg,
          speedKmh,
          approachAngleDeg: angleDeg,
          productRatedJoulesAt45deg: ratedJoules,
          productImpactZoneMaxMm: impactZoneMm,
          measuredDeflectionZoneMm: null,
        });
        return (
          <div className="mt-6">
            <Pas13VerdictPanel verdict={verdict} />
          </div>
        );
      })()}

      {/* Product Recommendations */}
      {result && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Recommended Products</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingRecommendations ? (
              <div className="text-center py-4">
                <div className="animate-spin h-6 w-6 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Loading recommendations...</p>
              </div>
            ) : recommendationsError ? (
              <div className="text-center py-4 text-red-500">
                <p>Error loading recommendations. Please try again.</p>
              </div>
            ) : recommendations && Array.isArray(recommendations) && recommendations.length > 0 ? (
              <div className="space-y-4">
                <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        Build Project from This Calculation
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        Add all {recommendations.length} recommended products to your project cart with impact calculation context
                      </p>
                    </div>
                    <Button
                      onClick={async () => {
                        haptic.addToCart();
                        try {
                          const items = recommendations.map((product: any) => ({
                            productName: product.name,
                            quantity: 1,
                            pricingType: product.pricingType || 'per-unit',
                            unitPrice: product.price || 0,
                            category: product.category,
                            impactRating: product.impactRating,
                            impactCalculationId: savedCalculationId,
                            calculationContext: {
                              operatingZone: inputs.applicationArea === "Other" ? inputs.customApplicationArea : inputs.applicationArea,
                              vehicleMass: inputs.vehicleMass,
                              loadMass: inputs.loadMass,
                              speed: inputs.speed,
                              speedUnit: inputs.speedUnit,
                              impactAngle: inputs.impactAngle,
                              kineticEnergy: result.kineticEnergy,
                              riskLevel: result.riskLevel,
                              totalMass: result.totalMass,
                              speedMs: result.speedMs,
                              pas13Compliant: result.pas13Compliant,
                              pas13AdjustedEnergy: result.pas13AdjustedEnergy
                            },
                            applicationArea: inputs.applicationArea === "Other" ? inputs.customApplicationArea : inputs.applicationArea,
                            notes: `Recommended for ${Math.floor(result.kineticEnergy).toLocaleString()}J impact (${result.riskLevel})`
                          }));

                          const response = await apiRequest('/api/cart/bulk-add', 'POST', {
                            items,
                            projectInfo: {
                              projectDescription: `Impact Protection for ${Math.floor(result.kineticEnergy).toLocaleString()}J (${result.riskLevel})`,
                              impactCalculationId: savedCalculationId,
                              calculationType: 'impact-calculator'
                            },
                            autoSaveExisting: true
                          });

                          const data = await response.json() as any;
                          haptic.success();
                          toast({
                            title: "Project Created",
                            description: data.message || `${items.length} products added to project cart`,
                          });
                          queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
                        } catch (error) {
                          console.error("Error building project:", error);
                          haptic.error();
                          toast({
                            title: "Error",
                            description: "Failed to create project. Please try again.",
                            variant: "destructive"
                          });
                        }
                      }}
                      className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
                      data-testid="build-project-from-calculation"
                    >
                      <Package className="w-4 h-4 mr-2" />
                      Build Project
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Recommended products for {Math.floor(result.kineticEnergy).toLocaleString()}J impact:
                </p>
                <div className="grid grid-cols-1 gap-4">
                  {recommendations.map((product: any) => {
                    // Calculate individual safety margin for this product
                    const productImpactRating = parseInt(product.impactRating) || 0;
                    const requiredEnergy = Math.floor(result.kineticEnergy);
                    const safetyMargin = productImpactRating > 0 
                      ? Math.round(((productImpactRating - requiredEnergy) / requiredEnergy) * 100)
                      : 0;
                    
                    return (
                      <div key={product.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white" data-testid={`recommendation-${product.id}`}>
                        {/* Safety margin badge */}
                        {safetyMargin > 0 && (
                          <div className="mb-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              {safetyMargin}% safety margin
                            </span>
                          </div>
                        )}
                        <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-semibold text-black">{product.name}</h4>
                            {product.variantCount > 1 && (
                              <span className="text-xs px-2 py-1 bg-purple-100 text-purple-800 rounded font-semibold">
                                <Package className="w-3 h-3 inline mr-1" />
                                {product.variantCount} variants available
                              </span>
                            )}
                            {product.impactRating && (
                              <span className="text-xs px-2 py-1 bg-yellow-400 text-black rounded font-bold">
                                {product.impactRating.toLocaleString()}J
                              </span>
                            )}
                            {product.heightMax && product.variantCount <= 1 && (
                              <span className="text-xs px-2 py-1 bg-blue-500 text-white rounded font-bold">
                                {product.heightMax}mm Height
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 mb-3">{product.description}</p>
                          <div className="flex flex-wrap gap-2">
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">
                              {product.category.replace('-', ' ').toUpperCase()}
                            </span>
                            {product.subcategory && (
                              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-800 rounded">
                                {product.subcategory.replace('-', ' ')}
                              </span>
                            )}
                            {product.applications && Array.isArray(product.applications) && product.applications.length > 0 && (
                              <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded">
                                {String(product.applications[0])}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-shrink-0 flex flex-row md:flex-col items-center md:items-end gap-2 md:gap-2 md:min-w-[120px]">
                          {product.price && (
                            <p className="font-bold text-black text-lg">
                              {typeof product.price === 'string' && product.price.includes('-') 
                                ? `${formatPrice(parseFloat(product.price.split('-')[0]))} - ${formatPrice(parseFloat(product.price.split('-')[1]))}`
                                : formatPrice(parseFloat(String(product.price)))}
                            </p>
                          )}
                          {product.imageUrl && (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-20 h-16 object-contain rounded border"
                            />
                          )}
                          <div className="flex flex-col gap-2 w-full">
                            {product.variantCount > 1 ? (
                              <AddToCartModal 
                                product={product.variants[0] as any}
                                variants={product.variants}
                                showVariantSelector={true}
                                impactCalculationId={savedCalculationId}
                                calculationContext={result ? {
                                  operatingZone: inputs.applicationArea === "Other" ? inputs.customApplicationArea : inputs.applicationArea,
                                  vehicleMass: inputs.vehicleMass,
                                  loadMass: inputs.loadMass,
                                  speed: inputs.speed,
                                  speedUnit: inputs.speedUnit,
                                  impactAngle: inputs.impactAngle,
                                  kineticEnergy: result.kineticEnergy,
                                  riskLevel: result.riskLevel,
                                  totalMass: result.totalMass,
                                  speedMs: result.speedMs
                                } : undefined}
                                calculatorImages={operationalZoneImageUrls}
                              >
                                <Button size="sm" className="text-xs whitespace-nowrap w-full" data-testid={`add-to-cart-${product.id}`}>
                                  <ChevronRight className="w-3 h-3 mr-1" />
                                  Select Variant
                                </Button>
                              </AddToCartModal>
                            ) : (
                              <AddToCartModal 
                                product={product as any}
                                impactCalculationId={savedCalculationId}
                                calculationContext={result ? {
                                  operatingZone: inputs.applicationArea === "Other" ? inputs.customApplicationArea : inputs.applicationArea,
                                  vehicleMass: inputs.vehicleMass,
                                  loadMass: inputs.loadMass,
                                  speed: inputs.speed,
                                  speedUnit: inputs.speedUnit,
                                  impactAngle: inputs.impactAngle,
                                  kineticEnergy: result.kineticEnergy,
                                  riskLevel: result.riskLevel,
                                  totalMass: result.totalMass,
                                  speedMs: result.speedMs
                                } : undefined}
                                calculatorImages={operationalZoneImageUrls}
                              >
                                <Button size="sm" className="text-xs whitespace-nowrap w-full" data-testid={`add-to-cart-${product.id}`}>
                                  <ShoppingCart className="w-3 h-3 mr-1" />
                                  Add to Cart
                                </Button>
                              </AddToCartModal>
                            )}
                            <Link href={`/products/${product.id}?from=calculator`}>
                              <Button variant="outline" size="sm" className="text-xs whitespace-nowrap w-full" data-testid={`view-product-${product.id}`}>
                                <ExternalLink className="w-3 h-3 mr-1" />
                                View Details
                              </Button>
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">
                No specific product recommendations available for this energy level.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Products suitable for selected vehicles — cross-references the PDF
          Product Suitability dataset (products.suitability_data.vehicleSuitability)
          against the union of suitabilityLabels on the user's selected
          vehicle_types rows. Additive panel; the existing barrier
          recommendations above remain the primary action. */}
      {inputs.selectedVehicleTypes && inputs.selectedVehicleTypes.length > 0 && (
        <Card className="mt-8" data-testid="suitable-products-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-[#B8860B]" />
              Products Suitable for Your Vehicles
            </CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Cross-referenced from the A-SAFE Product Suitability spec sheet —
              filters products whose declared vehicle suitability includes any
              of your selected vehicle types.
            </p>
          </CardHeader>
          <CardContent>
            {loadingSuitabilityProducts ? (
              <div className="text-center py-4">
                <div className="animate-spin h-6 w-6 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto"></div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  Loading catalog…
                </p>
              </div>
            ) : selectedSuitabilityLabels.size === 0 ? (
              <p className="text-sm text-gray-500">
                Selected vehicles have no mapped product-suitability labels yet.
                Barrier recommendations above still apply.
              </p>
            ) : suitableProducts.length === 0 ? (
              <p className="text-sm text-gray-500">
                No perfectly matched products — try adjusting the vehicle
                selection. The barrier recommendations above still apply.
              </p>
            ) : (
              <>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  {suitableProducts.length} product
                  {suitableProducts.length === 1 ? "" : "s"} match —
                  {" "}
                  {Array.from(selectedSuitabilityLabels)
                    .slice(0, 4)
                    .join(", ")}
                  {selectedSuitabilityLabels.size > 4
                    ? ` +${selectedSuitabilityLabels.size - 4} more`
                    : ""}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {suitableProducts.slice(0, 12).map((product) => {
                    const sd: any = (product as any).suitabilityData;
                    const apps: string[] = Array.isArray(sd?.fitForPurposeApplications)
                      ? sd.fitForPurposeApplications.slice(0, 2)
                      : [];
                    return (
                      <Link
                        key={product.id}
                        href={`/products/${product.id}?from=calculator`}
                      >
                        <div
                          className="rounded-lg border p-3 bg-white dark:bg-gray-900 hover:shadow-md hover:border-yellow-400 transition cursor-pointer h-full flex flex-col"
                          data-testid={`suitable-product-${product.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="text-sm font-semibold leading-tight line-clamp-2">
                              {product.name}
                            </p>
                            {product.impactRating != null && (
                              <span className="text-[10px] font-bold uppercase tracking-wide text-[#B8860B] whitespace-nowrap shrink-0">
                                {product.impactRating.toLocaleString()}J
                              </span>
                            )}
                          </div>
                          {apps.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-auto pt-2">
                              {apps.map((app) => (
                                <span
                                  key={app}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 border border-yellow-200 text-gray-700"
                                >
                                  {app}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {suitableProducts.length > 12 && (
                  <p className="text-xs text-gray-500 mt-3">
                    Showing 12 of {suitableProducts.length}. Visit the Products
                    page and filter by vehicle type to browse the rest.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Recommended Barrier Options — 3-tier ladder */}
      {result && resolvedLadder && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-[#B8860B]" />
              Recommended Barrier Options
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Ladder + risk-level controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  Barrier Family
                </Label>
                <Select
                  value={resolvedLadder.id}
                  onValueChange={(v) => setManualLadderId(v)}
                >
                  <SelectTrigger data-testid="select-ladder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allLadders.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400">
                  Risk Level
                </Label>
                <Select
                  value={riskLevelEnum}
                  onValueChange={(v) =>
                    setManualRiskLevel(v as "critical" | "high" | "medium" | "low")
                  }
                >
                  <SelectTrigger data-testid="select-risk-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(["good", "better", "best"] as BarrierTier[]).map((tier) => {
                const cfg = resolvedLadder.tiers[tier];
                const family = cfg.family;
                const hero = heroProductForFamily(family);
                const unitPrice = priceForFamily(family);
                const ratedJoules = joulesForFamily(family);
                const margin = safetyMargin(ratedJoules, result.kineticEnergy);
                const marginPct = Math.round(margin * 100);
                const isRecommended = calcRecommendedTier === tier;
                return (
                  <div
                    key={tier}
                    data-testid={`calc-tier-card-${tier}`}
                    className={[
                      "relative rounded-lg border p-4 bg-white dark:bg-gray-900 flex flex-col",
                      isRecommended
                        ? "ring-2 ring-[#FFC72C] border-[#FFC72C]"
                        : "border-gray-200 dark:border-gray-700",
                    ].join(" ")}
                  >
                    {isRecommended && (
                      <div className="text-[10px] font-bold uppercase tracking-wider text-[#B8860B] mb-1">
                        Recommended
                      </div>
                    )}
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-base font-semibold capitalize">
                        {tier}
                      </span>
                      <span className="text-xs text-gray-500">
                        · +{Math.round((SAFETY_FACTORS[tier] - 1) * 100)}% factor
                      </span>
                    </div>
                    {/* Hero image */}
                    <div className="h-24 w-full bg-gray-50 dark:bg-gray-800 rounded mb-2 flex items-center justify-center overflow-hidden">
                      {hero?.imageUrl ? (
                        <img
                          src={hero.imageUrl}
                          alt={family}
                          className="h-full w-full object-contain p-1"
                          loading="lazy"
                        />
                      ) : (
                        <Package className="h-8 w-8 text-gray-300" />
                      )}
                    </div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
                      {family}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                      {cfg.rationale}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500">Rated</div>
                        <div className="font-semibold">
                          {ratedJoules != null
                            ? `${ratedJoules.toLocaleString()}J`
                            : "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Margin</div>
                        <div
                          className={
                            marginPct >= 0 ? "font-semibold text-green-600" : "font-semibold text-red-600"
                          }
                        >
                          {ratedJoules != null
                            ? `${marginPct >= 0 ? "+" : ""}${marginPct}%`
                            : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-sm font-bold">
                        {unitPrice != null ? formatPrice(unitPrice) : "—"}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="mt-3 w-full bg-yellow-400 text-black hover:bg-yellow-500 font-semibold"
                      onClick={() => addTierToCart(resolvedLadder, tier)}
                      disabled={!hero || unitPrice == null}
                      data-testid={`calc-tier-add-${tier}`}
                    >
                      <ShoppingCart className="w-3 h-3 mr-1" />
                      Add to cart
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Formula Explanation */}
      <Card className="mt-8 bg-black text-white">
        <CardHeader>
          <CardTitle>PAS 13 Calculation Method</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="mb-4">The kinetic energy calculation follows PAS 13 standards:</p>
              <div className="bg-gray-800 rounded p-4 font-mono text-yellow-400 text-center text-lg">
                KE = ½m × (v sin θ)²
              </div>
            </div>
            <div>
              <p className="mb-2 text-white">
                <strong>Where:</strong>
              </p>
              <ul className="space-y-1 text-sm text-gray-300">
                <li>
                  <strong className="text-white">KE:</strong> Kinetic energy (Joules)
                </li>
                <li>
                  <strong className="text-white">m:</strong> Total mass (vehicle + load)
                </li>
                <li>
                  <strong className="text-white">v:</strong> Velocity (m/s)
                </li>
                <li>
                  <strong className="text-white">θ:</strong> Impact angle
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Visual Vehicle Selector Dialog */}
      <Dialog open={showVehicleSelector} onOpenChange={setShowVehicleSelector}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Vehicle Types</DialogTitle>
            <DialogDescription>
              Select all vehicle types that operate in this area. The calculation will use the heaviest vehicle weight.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {loadingVehicleTypes ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
                <span className="ml-2">Loading vehicles...</span>
              </div>
            ) : (
              vehicleTypes && (
                <div className="space-y-6">
                  {/* Group vehicles by category */}
                  {Array.from(new Set(vehicleTypes.map(v => v.category))).map(category => (
                    <div key={category} className="space-y-3">
                      <h3 className="font-semibold text-sm uppercase text-gray-600">
                        {category.replace(/-/g, ' ')}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {vehicleTypes
                          .filter(v => v.category === category)
                          .map(vehicle => {
                            const isSelected = (inputs.selectedVehicleTypes || []).includes(vehicle.id);
                            return (
                              <div
                                key={vehicle.id}
                                onClick={() => handleVehicleToggle(vehicle.id)}
                                className={`relative cursor-pointer rounded-lg border-2 p-3 transition-all hover:shadow-md ${
                                  isSelected
                                    ? 'border-yellow-500 bg-yellow-50'
                                    : 'border-gray-200 hover:border-gray-300'
                                }`}
                                data-testid={`vehicle-option-${vehicle.id}`}
                              >
                                {/* Selection indicator */}
                                {isSelected && (
                                  <div className="absolute top-2 right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                                    <Check className="w-4 h-4 text-white" />
                                  </div>
                                )}
                                
                                {/* Vehicle image — photo (thumbnailUrl) if seeded,
                                    else iconify silhouette (iconUrl). */}
                                <div className="aspect-square mb-2 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                                  {vehicle.thumbnailUrl ? (
                                    <AuthenticatedImage
                                      src={vehicle.thumbnailUrl}
                                      alt={vehicle.name}
                                      className="w-full h-full object-cover"
                                      category={vehicle.category}
                                    />
                                  ) : vehicle.iconUrl ? (
                                    <AuthenticatedImage
                                      src={vehicle.iconUrl}
                                      alt={vehicle.name}
                                      className="w-full h-full object-contain p-2"
                                      category={vehicle.category}
                                    />
                                  ) : (
                                    <Truck className="w-12 h-12 text-gray-400" />
                                  )}
                                </div>
                                
                                {/* Vehicle details */}
                                <div className="space-y-1">
                                  <p className="font-medium text-sm line-clamp-2">{vehicle.name}</p>
                                  <p className="text-xs text-gray-600">
                                    {vehicle.weightTypical} kg
                                  </p>
                                  {vehicle.capacityMax && (
                                    <p className="text-xs text-gray-500">
                                      Cap: {vehicle.capacityMax} kg
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
          
          <div className="flex justify-between items-center mt-6 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setInputs(prev => ({ ...prev, selectedVehicleTypes: [] }));
                haptic.select();
                toast({ title: "Selection Cleared", description: "All vehicle selections have been removed." });
              }}
            >
              Clear All
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowVehicleSelector(false)}>
                Cancel
              </Button>
              <Button onClick={() => { haptic.select(); setShowVehicleSelector(false); }} className="bg-yellow-600 hover:bg-yellow-700">
                Apply Selection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
