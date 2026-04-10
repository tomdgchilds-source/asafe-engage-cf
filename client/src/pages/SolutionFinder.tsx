import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Link } from "wouter";
import { 
  Search, 
  Lightbulb, 
  Target, 
  TrendingUp, 
  CheckCircle, 
  ArrowRight,
  Star,
  Shield,
  Zap,
  FileText,
  ExternalLink,
  BookOpen,
  ClipboardList,
  Video,
  Download,
  Clock,
  Trash2,
  Eye,
  History,
  Package,
  AlertTriangle,
  Calendar,
  ShoppingCart,
  Truck,
  Image,
  XCircle,
  Building2,
  Factory,
  Store,
  Heart,
  Utensils,
  Plane,
  Droplet,
  HardHat,
  Pickaxe,
  School,
  Briefcase,
  Warehouse,
  Home,
  Trees,
  ParkingCircle,
  Waypoints,
  Cog,
  Check
} from "lucide-react";
import { InfoPopover } from "@/components/ui/info-popover";
import { ConsolidatedProductCard } from "@/components/ConsolidatedProductCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { VehicleType } from "@shared/schema";

const solutionRequestSchema = z.object({
  problemTitle: z.string().min(5, "Title must be at least 5 characters"),
  problemDescription: z.string().min(20, "Description must be at least 20 characters"),
  industry: z.string().optional(),
  workplaceType: z.string().optional(),
  vehicleTypes: z.array(z.string()).optional(),
  otherVehicleType: z.string().optional(),
  vehicleWeight: z.number().min(0).optional(),
  vehicleSpeed: z.number().min(0).optional(),
  urgency: z.enum(["low", "medium", "high"]).optional()
});

type SolutionRequestForm = z.infer<typeof solutionRequestSchema>;

const industries = [
  { id: "automotive", name: "Automotive", icon: Truck },
  { id: "warehousing-logistics", name: "Warehousing & Logistics", icon: Warehouse },
  { id: "manufacturing", name: "Manufacturing", icon: Factory },
  { id: "retail", name: "Retail", icon: Store },
  { id: "healthcare", name: "Healthcare", icon: Heart },
  { id: "food-beverage", name: "Food & Beverage", icon: Utensils },
  { id: "aerospace", name: "Aerospace", icon: Plane },
  { id: "oil-gas", name: "Oil & Gas", icon: Droplet },
  { id: "construction", name: "Construction", icon: HardHat },
  { id: "mining", name: "Mining", icon: Pickaxe },
  { id: "public-sector", name: "Public Sector", icon: Building2 },
  { id: "education", name: "Education", icon: School }
];

const workplaceTypes = [
  { id: "warehouse", name: "Warehouse", icon: Warehouse },
  { id: "manufacturing", name: "Manufacturing Floor", icon: Factory },
  { id: "office", name: "Office", icon: Briefcase },
  { id: "outdoor", name: "Outdoor", icon: Trees },
  { id: "loading-dock", name: "Loading Dock", icon: Truck },
  { id: "parking", name: "Parking Area", icon: ParkingCircle },
  { id: "corridor", name: "Corridor", icon: Waypoints },
  { id: "production-line", name: "Production Line", icon: Cog }
];

const vehicleTypes = [
  "forklift",
  "truck",
  "van",
  "car",
  "pedestrian",
  "trolley",
  "conveyor",
  "other"
];

// Component to handle authenticated image loading
function AuthenticatedImage({ src, alt, className }: { src: string; alt: string; className: string }) {
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
          // For A-SAFE CDN URLs, use directly without fetching
          if (src.includes('asafe.com') || src.includes('webcdn.asafe.com')) {
            setImageSrc(src);
            setHasError(false);
            setIsLoading(false);
            clearTimeout(timeoutId);
            return;
          }
          
          // For other URLs, use proxy or fetch directly
          const fetchUrl = src.startsWith('http') ? `/api/proxy-image?url=${encodeURIComponent(src)}` : src;
          const response = await fetch(fetchUrl, {
            credentials: 'include',
            signal: abortController.signal
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
    return (
      <div className={`${className} bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center`}>
        <Truck className="h-6 w-6 text-gray-400" />
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

export function SolutionFinder() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recommendations, setRecommendations] = useState<any>(null);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [showRequestHistory, setShowRequestHistory] = useState(false);
  const [showOtherVehicleInput, setShowOtherVehicleInput] = useState(false);
  const [showVehicleSelector, setShowVehicleSelector] = useState(false);
  const [showIndustrySelector, setShowIndustrySelector] = useState(false);
  const [showWorkplaceSelector, setShowWorkplaceSelector] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch vehicle types from API
  const { data: vehicleTypesData, isLoading: loadingVehicleTypes } = useQuery({
    queryKey: ["/api/vehicle-types"],
    queryFn: async () => {
      const response = await fetch("/api/vehicle-types");
      if (!response.ok) throw new Error('Failed to fetch vehicle types');
      return response.json() as Promise<VehicleType[]>;
    },
  });

  const form = useForm<SolutionRequestForm>({
    resolver: zodResolver(solutionRequestSchema),
    defaultValues: {
      problemTitle: "",
      problemDescription: "",
      industry: undefined,
      workplaceType: undefined,
      vehicleTypes: [],
      otherVehicleType: "",
      vehicleWeight: undefined,
      vehicleSpeed: undefined,
      urgency: "medium"
    }
  });

  // Get user's previous solution requests
  const { data: previousRequests, refetch: refetchRequests } = useQuery({
    queryKey: ["/api/solution-requests"],
    enabled: true
  });

  // Delete solution request mutation
  const deleteSolutionRequest = useMutation({
    mutationFn: async (requestId: string) => {
      const response = await fetch(`/api/solution-requests/${requestId}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!response.ok) {
        throw new Error("Failed to delete request");
      }
      return response.json();
    },
    onSuccess: (_, requestId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/solution-requests"] });
      toast({
        title: "Request Deleted",
        description: "Solution request has been removed from your history."
      });
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(null);
        setRecommendations(null);
      }
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: "Delete Failed",
        description: "Could not delete the request. Please try again."
      });
    }
  });

  const submitProblem = useMutation({
    mutationFn: async (data: SolutionRequestForm) => {
      const response = await fetch("/api/solution-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return response.json();
    },
    onSuccess: (data: any) => {
      setRecommendations(data);
      setSelectedRequest(data);
      queryClient.invalidateQueries({ queryKey: ["/api/solution-requests"] });
      toast({
        title: "Analysis Complete!",
        description: `Found ${data.recommendedProducts?.length || 0} product matches and ${data.recommendedCaseStudies?.length || 0} relevant case studies.`
      });
      form.reset();
      setShowOtherVehicleInput(false);
      // Show request history section after successful submission
      setShowRequestHistory(true);
    },
    onError: (error) => {
      console.error("Error submitting problem:", error);
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: "Please try again or contact support."
      });
    }
  });

  const onSubmit = async (data: SolutionRequestForm) => {
    setIsSubmitting(true);
    try {
      // If "other" is selected and otherVehicleType is provided, add it to the data
      const submitData = { ...data };
      if (data.vehicleTypes?.includes("other") && data.otherVehicleType) {
        // Include the custom vehicle type in the submission
        submitData.vehicleTypes = data.vehicleTypes.map(v => 
          v === "other" ? (data.otherVehicleType || "other") : v
        ).filter((v): v is string => v !== undefined);
      }
      await submitProblem.mutateAsync(submitData);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
      <div className="w-full px-2 sm:px-4">
        {/* Hero Section */}
        <div className="text-center mb-4 sm:mb-8">
          <div className="flex items-center justify-center mb-2 sm:mb-3">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-primary rounded-full flex items-center justify-center mr-3 sm:mr-4">
              <Lightbulb className="h-6 w-6 sm:h-8 sm:w-8 text-black" />
            </div>
            <h1 className="text-2xl sm:text-4xl font-bold text-gray-900">Solution Finder</h1>
            <InfoPopover 
              content="Describe your workplace safety challenge and get intelligent recommendations for A-SAFE products and proven case studies from similar situations."
              iconClassName="h-5 w-5 ml-2 text-gray-400 hover:text-gray-600 cursor-help"
            />
          </div>
        </div>

        {/* How It Works Section - At the Top */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl flex items-center">
              <Target className="h-5 w-5 mr-2 text-primary" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-black font-bold text-xl">1</div>
                <div>
                  <h4 className="font-semibold text-lg mb-1">Describe Your Challenge</h4>
                  <p className="text-sm text-gray-600">Tell us about your workplace safety problem, including details about vehicles, workplace type, and urgency</p>
                </div>
              </div>
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-black font-bold text-xl">2</div>
                <div>
                  <h4 className="font-semibold text-lg mb-1">Intelligent Analysis</h4>
                  <p className="text-sm text-gray-600">Our AI-powered system analyzes your requirements and matches them with our comprehensive product database</p>
                </div>
              </div>
              <div className="flex flex-col items-center text-center space-y-3">
                <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-black font-bold text-xl">3</div>
                <div>
                  <h4 className="font-semibold text-lg mb-1">Get Recommendations</h4>
                  <p className="text-sm text-gray-600">Receive tailored product suggestions, relevant case studies, and implementation guidance</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Problem Submission Form - Full Width */}
        <Card className="mb-8">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="flex items-center text-base sm:text-lg">
                  <Search className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-primary" />
                  Describe Your Safety Challenge
                  <InfoPopover 
                    content="Provide details about your workplace safety problem for personalized recommendations"
                    iconClassName="h-4 w-4 ml-2 text-gray-400 hover:text-gray-600 cursor-help"
                  />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="form-solution-finder">
                    {/* Problem Title */}
                    <FormField
                      control={form.control}
                      name="problemTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Problem Title *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="e.g., Forklift collisions in warehouse loading area"
                              {...field}
                              data-testid="input-problem-title"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Problem Description */}
                    <FormField
                      control={form.control}
                      name="problemDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Detailed Description *</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe the safety challenge, current situation, vehicles involved, frequency of incidents, and specific concerns..."
                              className="min-h-32"
                              {...field}
                              data-testid="textarea-problem-description"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Industry & Workplace Type - Visual Selectors */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="industry"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Industry *</FormLabel>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowIndustrySelector(true)}
                                className="w-full justify-start text-left font-normal"
                                data-testid="button-select-industry"
                              >
                                {field.value ? (
                                  <div className="flex items-center">
                                    {(() => {
                                      const selected = industries.find(i => i.id === field.value);
                                      const IconComponent = selected?.icon;
                                      return (
                                        <>
                                          {IconComponent && <IconComponent className="h-4 w-4 mr-2" />}
                                          {selected?.name}
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">Select industry</span>
                                )}
                              </Button>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="workplaceType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Workplace Type *</FormLabel>
                            <FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setShowWorkplaceSelector(true)}
                                className="w-full justify-start text-left font-normal"
                                data-testid="button-select-workplace"
                              >
                                {field.value ? (
                                  <div className="flex items-center">
                                    {(() => {
                                      const selected = workplaceTypes.find(w => w.id === field.value);
                                      const IconComponent = selected?.icon;
                                      return (
                                        <>
                                          {IconComponent && <IconComponent className="h-4 w-4 mr-2" />}
                                          {selected?.name}
                                        </>
                                      );
                                    })()}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">Select workplace type</span>
                                )}
                              </Button>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Vehicle Types - Visual Selector */}
                    <FormField
                      control={form.control}
                      name="vehicleTypes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Types Involved (Optional)</FormLabel>
                          <FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setShowVehicleSelector(true)}
                              className="w-full justify-start text-left font-normal"
                              data-testid="button-select-vehicles"
                            >
                              {field.value && field.value.length > 0 ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Truck className="h-4 w-4" />
                                  <span>{field.value.length} vehicle type{field.value.length > 1 ? 's' : ''} selected</span>
                                  {vehicleTypesData && (
                                    <span className="text-xs text-muted-foreground">
                                      ({field.value.map(id => 
                                        vehicleTypesData.find(v => v.id === id)?.name || id
                                      ).join(', ')})
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Select vehicle types</span>
                              )}
                            </Button>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Vehicle Hazard Data */}
                    <div className="mb-4">
                      <h4 className="font-medium mb-3">Common Vehicle Hazards in the Area (Optional)</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <FormField
                          control={form.control}
                          name="vehicleWeight"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vehicle Weight (kg)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  placeholder="e.g., 3000 for forklift"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                  data-testid="input-vehicle-weight"
                                />
                              </FormControl>
                              <p className="text-xs text-muted-foreground mt-1">
                                Typical: Forklift 3000kg, Van 2000kg, Truck 7500kg
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="vehicleSpeed"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Vehicle Speed (km/h)</FormLabel>
                              <FormControl>
                                <Input 
                                  type="number"
                                  placeholder="e.g., 8 for warehouse"
                                  {...field}
                                  onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                                  data-testid="input-vehicle-speed"
                                />
                              </FormControl>
                              <p className="text-xs text-muted-foreground mt-1">
                                Typical: Warehouse 8km/h, Loading bay 10km/h, Outdoor 15km/h
                              </p>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Urgency Level */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div></div>

                      <FormField
                        control={form.control}
                        name="urgency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Urgency Level</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-urgency">
                                  <SelectValue placeholder="Select urgency" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="low">Low - Planning Phase</SelectItem>
                                <SelectItem value="medium">Medium - Need Solution Soon</SelectItem>
                                <SelectItem value="high">High - Urgent Safety Concern</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={isSubmitting}
                      data-testid="button-submit-problem"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin mr-2" />
                          Analyzing Problem...
                        </>
                      ) : (
                        <>
                          <Target className="h-4 w-4 mr-2" />
                          Find Solutions
                        </>
                      )}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>

        {/* Recommendations Results - Before History */}
        {recommendations && (
          <div className="mt-12" id="recommendations">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your Intelligent Safety Analysis</h2>
              <div className="flex items-center justify-center flex-wrap gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{recommendations.matchScore}%</div>
                  <div className="text-sm text-gray-600">Match Score</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{recommendations.recommendedProducts?.length || 0}</div>
                  <div className="text-sm text-gray-600">Products</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{recommendations.recommendedCaseStudies?.length || 0}</div>
                  <div className="text-sm text-gray-600">Case Studies</div>
                </div>
                {recommendations.recommendedResources && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{recommendations.recommendedResources.length}</div>
                    <div className="text-sm text-gray-600">Resources</div>
                  </div>
                )}
                {recommendations.implementationGuidance && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{recommendations.implementationGuidance.length}</div>
                    <div className="text-sm text-gray-600">Action Items</div>
                  </div>
                )}
              </div>
            </div>

            {/* Safety Context Analysis */}
            {recommendations.safetyContext && (
              <div className="mb-8">
                <Card className="border-l-4 border-l-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Zap className="h-5 w-5 mr-2 text-primary" />
                      Safety Analysis Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="font-bold text-lg capitalize text-gray-900">
                          {recommendations.safetyContext.riskLevel}
                        </div>
                        <div className="text-sm text-gray-600">Risk Level</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="font-bold text-lg capitalize text-gray-900">
                          {recommendations.safetyContext.urgencyLevel}
                        </div>
                        <div className="text-sm text-gray-600">Urgency</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="font-bold text-lg capitalize text-gray-900">
                          {recommendations.safetyContext.industrySpecific}
                        </div>
                        <div className="text-sm text-gray-600">Industry</div>
                      </div>
                    </div>
                    
                    {recommendations.vehicleAnalysis && recommendations.vehicleAnalysis.vehicles?.length > 0 && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-semibold mb-2 text-blue-900">Vehicle Threat Analysis</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-blue-800">
                              <strong>Max Impact Energy:</strong> {Math.round(recommendations.vehicleAnalysis.estimatedMaxImpact / 1000)}kJ
                            </p>
                            <p className="text-sm text-blue-800">
                              <strong>Threat Level:</strong> {recommendations.vehicleAnalysis.maxThreatLevel}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-blue-800">
                              <strong>Vehicles Analyzed:</strong> {recommendations.vehicleAnalysis.vehicles.map((v: any) => v.type).join(', ')}
                            </p>
                          </div>
                        </div>
                        {recommendations.vehicleAnalysis.recommendations?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-blue-700 font-medium">Key Recommendations:</p>
                            <ul className="text-xs text-blue-700 mt-1 space-y-1">
                              {recommendations.vehicleAnalysis.recommendations.slice(0, 2).map((rec: string, idx: number) => (
                                <li key={idx} className="flex items-center">
                                  <CheckCircle className="h-3 w-3 text-blue-600 mr-2 flex-shrink-0" />
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Product Recommendations */}
            {recommendations.recommendedProducts && Array.isArray(recommendations.recommendedProducts) && recommendations.recommendedProducts.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold flex items-center">
                    <Shield className="h-6 w-6 mr-2 text-primary" />
                    Recommended Products
                  </h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          Build Project from These Solutions
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Add all {recommendations.recommendedProducts.length} recommended products to your project cart
                        </p>
                      </div>
                      <Button
                        onClick={async () => {
                          try {
                            const items = recommendations.recommendedProducts.map((rec: any) => ({
                              productName: rec.product.name,
                              quantity: 1,
                              pricingType: rec.product.pricingType || 'per-unit',
                              unitPrice: rec.product.price || 0,
                              category: rec.product.category,
                              impactRating: rec.product.impactRating,
                              solutionContext: {
                                problemTitle: selectedRequest?.problemTitle || form.getValues('problemTitle'),
                                problemDescription: selectedRequest?.problemDescription || form.getValues('problemDescription'),
                                industry: selectedRequest?.industry || form.getValues('industry'),
                                workplaceType: selectedRequest?.workplaceType || form.getValues('workplaceType'),
                                vehicleTypes: selectedRequest?.vehicleTypes || form.getValues('vehicleTypes'),
                                urgency: selectedRequest?.urgency || form.getValues('urgency'),
                                score: rec.score,
                                matchingReasons: rec.matchingReasons
                              },
                              applicationArea: rec.product.category,
                              notes: `Solution for: ${selectedRequest?.problemTitle || form.getValues('problemTitle') || 'Safety challenge'}`
                            }));

                            const response = await apiRequest('/api/cart/bulk-add', 'POST', {
                              items,
                              projectInfo: {
                                projectDescription: `Solution for: ${selectedRequest?.problemTitle || form.getValues('problemTitle') || 'Safety challenge'}`,
                                solutionRequestId: selectedRequest?.id,
                                solutionType: 'solution-finder'
                              },
                              autoSaveExisting: true
                            });

                            const data = await response.json();
                            toast({
                              title: "Project Created",
                              description: data.message || `${items.length} solutions added to project cart`,
                            });
                            queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
                          } catch (error) {
                            console.error("Error building project:", error);
                            toast({
                              title: "Error",
                              description: "Failed to create project. Please try again.",
                              variant: "destructive"
                            });
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold whitespace-nowrap"
                        data-testid="build-project-from-solutions"
                      >
                        <Lightbulb className="w-4 h-4 mr-2" />
                        Build Project
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recommendations.recommendedProducts.map((rec: any, index: number) => {
                    // Extract base product name for cleaner display
                    const baseProductName = rec.product.name
                      .replace(/\s*[-–]\s*\d+\s*mm.*$/i, '')
                      .replace(/\s*[-–]\s*\d+m.*$/i, '')
                      .replace(/\s+(Plus|Standard|Heavy Duty|Light Duty)$/i, '')
                      .trim();
                    
                    return (
                      <ConsolidatedProductCard
                        key={rec.product.id}
                        baseProductName={baseProductName}
                        product={rec.product}
                        variants={rec.variants}
                        score={rec.score}
                        matchingReasons={rec.matchingReasons}
                        impactRange={rec.impactRange}
                        index={index}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Case Study Recommendations */}
            {recommendations.recommendedCaseStudies && Array.isArray(recommendations.recommendedCaseStudies) && recommendations.recommendedCaseStudies.length > 0 && (
              <div className="mb-12">
                <h3 className="text-2xl font-bold mb-6 flex items-center">
                  <FileText className="h-6 w-6 mr-2 text-primary" />
                  Relevant Case Studies
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {recommendations.recommendedCaseStudies.map((rec: any, index: number) => (
                    <Card key={rec.caseStudy.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{rec.caseStudy.title}</CardTitle>
                            <div className="flex items-center gap-2 mt-2">
                              {rec.hasVideo && (
                                <Badge variant="outline" className="text-xs">
                                  <Video className="h-3 w-3 mr-1" />
                                  Video
                                </Badge>
                              )}
                              {rec.hasPdf && (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="h-3 w-3 mr-1" />
                                  PDF
                                </Badge>
                              )}
                              <Badge className="text-xs">
                                Score: {rec.score}%
                              </Badge>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-gray-600 mb-3">
                          {rec.caseStudy.description}
                        </p>
                        {rec.matchingReasons && rec.matchingReasons.length > 0 && (
                          <div className="mb-3">
                            <p className="text-xs font-semibold mb-1">Why this matches:</p>
                            <div className="flex flex-wrap gap-1">
                              {rec.matchingReasons.slice(0, 3).map((reason: string, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">
                                  {reason}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        <Link href={`/case-studies/${rec.caseStudy.id}`}>
                          <Button variant="outline" size="sm" className="w-full">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Case Study
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Implementation Guidance */}
            {recommendations.implementationGuidance && recommendations.implementationGuidance.length > 0 && (
              <div className="mb-12">
                <Card className="border-l-4 border-l-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <ClipboardList className="h-5 w-5 mr-2 text-green-500" />
                      Implementation Roadmap
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recommendations.implementationGuidance.map((step: any, index: number) => (
                        <div key={index} className="flex items-start space-x-3">
                          <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-green-700 font-bold text-sm">{index + 1}</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="font-semibold text-gray-900">{step.title}</h4>
                            <p className="text-sm text-gray-600 mt-1">{step.description}</p>
                            {step.priority && (
                              <Badge 
                                variant={step.priority === 'high' ? 'destructive' : step.priority === 'medium' ? 'default' : 'secondary'} 
                                className="mt-2 text-xs"
                              >
                                {step.priority} priority
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Ready to implement?</p>
                      <div className="flex gap-3">
                        <Link href="/products">
                          <Button variant="default" size="sm">
                            <Package className="h-4 w-4 mr-2" />
                            Browse Products
                          </Button>
                        </Link>
                        <Link href="/impact-calculator">
                          <Button variant="outline" size="sm">
                            <Zap className="h-4 w-4 mr-2" />
                            Calculate Impact
                          </Button>
                        </Link>
                        <Link href="/cart">
                          <Button variant="outline" size="sm">
                            <ShoppingCart className="h-4 w-4 mr-2" />
                            View Cart
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Relevant Resources */}
            {recommendations.recommendedResources && recommendations.recommendedResources.length > 0 && (
              <div className="mb-12">
                <h3 className="text-2xl font-bold mb-6 flex items-center">
                  <BookOpen className="h-6 w-6 mr-2 text-primary" />
                  Helpful Resources
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {recommendations.recommendedResources.slice(0, 6).map((res: any) => (
                    <Card key={res.resource.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm">{res.resource.title}</CardTitle>
                        <div className="flex items-center gap-2 mt-2">
                          {res.resource.type === 'video' && (
                            <Badge variant="outline" className="text-xs">
                              <Video className="h-3 w-3 mr-1" />
                              Video
                            </Badge>
                          )}
                          {res.resource.type === 'pdf' && (
                            <Badge variant="outline" className="text-xs">
                              <FileText className="h-3 w-3 mr-1" />
                              PDF
                            </Badge>
                          )}
                          {res.resource.type === 'download' && (
                            <Badge variant="outline" className="text-xs">
                              <Download className="h-3 w-3 mr-1" />
                              Download
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-gray-600 mb-3">
                          {res.resource.description}
                        </p>
                        <Link href={`/resources#${res.resource.id}`}>
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            View Resource
                          </Button>
                        </Link>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recent Requests Section - Moved to Bottom */}
        {previousRequests && Array.isArray(previousRequests) && previousRequests.length > 0 && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5 text-primary" />
                  <span>Recent Solution Requests</span>
                  <Badge className="ml-2">{previousRequests.length} Total</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRequestHistory(!showRequestHistory)}
                >
                  {showRequestHistory ? 'Hide' : 'Show All'}
                </Button>
              </CardTitle>
            </CardHeader>
            {!showRequestHistory ? (
              <CardContent>
                <div className="space-y-3">
                  {previousRequests.slice(0, 3).map((request: any) => (
                    <div 
                      key={request.id} 
                      className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => {
                        setSelectedRequest(request);
                        setRecommendations(request);
                        window.scrollTo({ top: document.getElementById('recommendations')?.offsetTop || 0, behavior: 'smooth' });
                      }}
                    >
                      <h4 className="font-medium text-sm">{request.problemTitle}</h4>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-gray-600">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {new Date(request.createdAt).toLocaleDateString()} at {new Date(request.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                      <div className="flex items-center mt-2 space-x-2">
                        <Badge variant="secondary" className="text-xs">
                          Score: {request.matchScore || 0}%
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {request.recommendedProducts?.length || 0} products
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {request.recommendedCaseStudies?.length || 0} cases
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            ) : (
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {previousRequests.map((request: any) => (
                    <div 
                      key={request.id} 
                      className={`border rounded-lg p-4 transition-all ${
                        selectedRequest?.id === request.id ? 'ring-2 ring-primary bg-primary/5' : 'hover:shadow-md'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-1">{request.problemTitle}</h3>
                          <p className="text-sm text-gray-600 line-clamp-2">{request.problemDescription}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {new Date(request.createdAt).toLocaleDateString()} at {new Date(request.createdAt).toLocaleTimeString()}
                            </span>
                            {request.industry && (
                              <span className="capitalize">
                                Industry: {request.industry}
                              </span>
                            )}
                            {request.urgency && (
                              <Badge variant={request.urgency === 'high' ? 'destructive' : request.urgency === 'medium' ? 'default' : 'secondary'} className="text-xs">
                                {request.urgency} urgency
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedRequest(request);
                              setRecommendations(request);
                              window.scrollTo({ top: document.getElementById('recommendations')?.offsetTop || 0, behavior: 'smooth' });
                            }}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this request?')) {
                                deleteSolutionRequest.mutate(request.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <Separator className="my-3" />
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                        <div>
                          <div className="text-lg font-bold text-primary">{request.matchScore || 0}%</div>
                          <div className="text-xs text-gray-600">Match Score</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{request.recommendedProducts?.length || 0}</div>
                          <div className="text-xs text-gray-600">Products</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{request.recommendedCaseStudies?.length || 0}</div>
                          <div className="text-xs text-gray-600">Case Studies</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold">{request.recommendedResources?.length || 0}</div>
                          <div className="text-xs text-gray-600">Resources</div>
                        </div>
                      </div>
                      {request.keywords && request.keywords.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {request.keywords.slice(0, 5).map((keyword: string, index: number) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {keyword}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {/* Recommendations Results */}
        {recommendations && (
          <div className="mt-12" id="recommendations">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Your Intelligent Safety Analysis</h2>
              <div className="flex items-center justify-center flex-wrap gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{recommendations.matchScore}%</div>
                  <div className="text-sm text-gray-600">Match Score</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{recommendations.recommendedProducts?.length || 0}</div>
                  <div className="text-sm text-gray-600">Products</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{recommendations.recommendedCaseStudies?.length || 0}</div>
                  <div className="text-sm text-gray-600">Case Studies</div>
                </div>
                {recommendations.recommendedResources && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{recommendations.recommendedResources.length}</div>
                    <div className="text-sm text-gray-600">Resources</div>
                  </div>
                )}
                {recommendations.implementationGuidance && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{recommendations.implementationGuidance.length}</div>
                    <div className="text-sm text-gray-600">Action Items</div>
                  </div>
                )}
              </div>
            </div>

            {/* Safety Context Analysis */}
            {recommendations.safetyContext && (
              <div className="mb-8">
                <Card className="border-l-4 border-l-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Zap className="h-5 w-5 mr-2 text-primary" />
                      Safety Analysis Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="font-bold text-lg capitalize text-gray-900">
                          {recommendations.safetyContext.riskLevel}
                        </div>
                        <div className="text-sm text-gray-600">Risk Level</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="font-bold text-lg capitalize text-gray-900">
                          {recommendations.safetyContext.urgencyLevel}
                        </div>
                        <div className="text-sm text-gray-600">Urgency</div>
                      </div>
                      <div className="text-center p-3 bg-gray-50 rounded-lg">
                        <div className="font-bold text-lg capitalize text-gray-900">
                          {recommendations.safetyContext.industrySpecific}
                        </div>
                        <div className="text-sm text-gray-600">Industry</div>
                      </div>
                    </div>
                    
                    {recommendations.vehicleAnalysis && recommendations.vehicleAnalysis.vehicles?.length > 0 && (
                      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                        <h4 className="font-semibold mb-2 text-blue-900">Vehicle Threat Analysis</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-blue-800">
                              <strong>Max Impact Energy:</strong> {Math.round(recommendations.vehicleAnalysis.estimatedMaxImpact / 1000)}kJ
                            </p>
                            <p className="text-sm text-blue-800">
                              <strong>Threat Level:</strong> {recommendations.vehicleAnalysis.maxThreatLevel}
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-blue-800">
                              <strong>Vehicles Analyzed:</strong> {recommendations.vehicleAnalysis.vehicles.map((v: any) => v.type).join(', ')}
                            </p>
                          </div>
                        </div>
                        {recommendations.vehicleAnalysis.recommendations?.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-blue-700 font-medium">Key Recommendations:</p>
                            <ul className="text-xs text-blue-700 mt-1 space-y-1">
                              {recommendations.vehicleAnalysis.recommendations.slice(0, 2).map((rec: string, idx: number) => (
                                <li key={idx} className="flex items-center">
                                  <CheckCircle className="h-3 w-3 text-blue-600 mr-2 flex-shrink-0" />
                                  {rec}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Product Recommendations */}
            {recommendations.recommendedProducts && Array.isArray(recommendations.recommendedProducts) && recommendations.recommendedProducts.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold flex items-center">
                    <Shield className="h-6 w-6 mr-2 text-primary" />
                    Recommended Products
                  </h3>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                          Build Project from These Solutions
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          Add all {recommendations.recommendedProducts.length} recommended products to your project cart
                        </p>
                      </div>
                      <Button
                        onClick={async () => {
                          try {
                            const items = recommendations.recommendedProducts.map((rec: any) => ({
                              productName: rec.product.name,
                              quantity: 1,
                              pricingType: rec.product.pricingType || 'per-unit',
                              unitPrice: rec.product.price || 0,
                              category: rec.product.category,
                              impactRating: rec.product.impactRating,
                              solutionContext: {
                                problemTitle: selectedRequest?.problemTitle || form.getValues('problemTitle'),
                                problemDescription: selectedRequest?.problemDescription || form.getValues('problemDescription'),
                                industry: selectedRequest?.industry || form.getValues('industry'),
                                workplaceType: selectedRequest?.workplaceType || form.getValues('workplaceType'),
                                vehicleTypes: selectedRequest?.vehicleTypes || form.getValues('vehicleTypes'),
                                urgency: selectedRequest?.urgency || form.getValues('urgency'),
                                score: rec.score,
                                matchingReasons: rec.matchingReasons
                              },
                              applicationArea: rec.product.category,
                              notes: `Solution for: ${selectedRequest?.problemTitle || form.getValues('problemTitle') || 'Safety challenge'}`
                            }));

                            const response = await apiRequest('/api/cart/bulk-add', 'POST', {
                              items,
                              projectInfo: {
                                projectDescription: `Solution for: ${selectedRequest?.problemTitle || form.getValues('problemTitle') || 'Safety challenge'}`,
                                solutionRequestId: selectedRequest?.id,
                                solutionType: 'solution-finder'
                              },
                              autoSaveExisting: true
                            });

                            const data = await response.json();
                            toast({
                              title: "Project Created",
                              description: data.message || `${items.length} solutions added to project cart`,
                            });
                            queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
                          } catch (error) {
                            console.error("Error building project:", error);
                            toast({
                              title: "Error",
                              description: "Failed to create project. Please try again.",
                              variant: "destructive"
                            });
                          }
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold whitespace-nowrap"
                        data-testid="build-project-from-solutions"
                      >
                        <Lightbulb className="w-4 h-4 mr-2" />
                        Build Project
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recommendations.recommendedProducts.map((rec: any, index: number) => {
                    // Extract base product name for cleaner display
                    const baseProductName = rec.product.name
                      .replace(/\s*[-–]\s*\d+\s*mm.*$/i, '')
                      .replace(/\s*[-–]\s*\d+m.*$/i, '')
                      .replace(/\s+(Plus|Standard|Heavy Duty|Light Duty)$/i, '')
                      .trim();
                    
                    return (
                      <ConsolidatedProductCard
                        key={rec.product.id}
                        baseProductName={baseProductName}
                        product={rec.product}
                        variants={rec.variants}
                        score={rec.score}
                        matchingReasons={rec.matchingReasons}
                        impactRange={rec.impactRange}
                        index={index}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Case Study Recommendations */}
            {recommendations.recommendedCaseStudies && Array.isArray(recommendations.recommendedCaseStudies) && recommendations.recommendedCaseStudies.length > 0 && (
              <div>
                <h3 className="text-2xl font-bold mb-6 flex items-center">
                  <FileText className="h-6 w-6 mr-2 text-primary" />
                  Relevant Case Studies
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {recommendations.recommendedCaseStudies.map((rec: any, index: number) => (
                    <Card key={rec.caseStudy.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-lg">{rec.caseStudy.title}</CardTitle>
                            <div className="flex items-center gap-2 mt-2">
                              {rec.hasVideo && (
                                <Badge variant="outline" className="text-xs">
                                  <Video className="h-3 w-3 mr-1" />
                                  Video
                                </Badge>
                              )}
                              {rec.hasPdf && (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="h-3 w-3 mr-1" />
                                  PDF
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Badge variant="secondary">{index + 1}</Badge>
                        </div>
                        <CardDescription className="line-clamp-2 mt-2">{rec.caseStudy.description}</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {rec.matchingReasons && rec.matchingReasons.length > 0 && (
                          <div className="mb-4">
                            <h5 className="font-medium text-sm mb-2">Relevance:</h5>
                            <ul className="space-y-1">
                              {rec.matchingReasons.map((reason: string, idx: number) => (
                                <li key={idx} className="flex items-center text-xs">
                                  <CheckCircle className="h-3 w-3 text-green-500 mr-2 flex-shrink-0" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <Badge variant="outline" className="text-xs">
                            {rec.caseStudy.industry?.replace("-", " ").replace(/\b\w/g, (l: string) => l.toUpperCase())}
                          </Badge>
                          <Link href={`/case-studies/${rec.caseStudy.id}`}>
                            <Button size="sm" variant="outline" data-testid={`button-view-case-study-${rec.caseStudy.id}`}>
                              Read Case Study
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Resources Section */}
            {recommendations.recommendedResources && Array.isArray(recommendations.recommendedResources) && recommendations.recommendedResources.length > 0 && (
              <div className="mb-12">
                <h3 className="text-2xl font-bold mb-6 flex items-center">
                  <BookOpen className="h-6 w-6 mr-2 text-primary" />
                  Relevant Resources
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recommendations.recommendedResources.map((rec: any, index: number) => {
                    const getResourceIcon = (category: string) => {
                      switch (category.toLowerCase()) {
                        case 'video guides': return <Video className="h-4 w-4" />;
                        case 'installation guides': return <ClipboardList className="h-4 w-4" />;
                        default: return <Download className="h-4 w-4" />;
                      }
                    };

                    return (
                      <Card key={rec.resource.id} className="hover:shadow-lg transition-shadow">
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <CardTitle className="text-lg flex items-center">
                                {getResourceIcon(rec.resource.category)}
                                <span className="ml-2">{rec.resource.title}</span>
                              </CardTitle>
                              <Badge variant="outline" className="mt-2 text-xs">
                                {rec.resource.category}
                              </Badge>
                            </div>
                            <Badge variant="secondary">{index + 1}</Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600 mb-4 line-clamp-3">{rec.resource.description}</p>
                          
                          {rec.matchingReasons && rec.matchingReasons.length > 0 && (
                            <div className="mb-4">
                              <h5 className="font-medium text-sm mb-2">Why this helps:</h5>
                              <ul className="space-y-1">
                                {rec.matchingReasons.map((reason: string, idx: number) => (
                                  <li key={idx} className="flex items-center text-xs">
                                    <CheckCircle className="h-3 w-3 text-green-500 mr-2 flex-shrink-0" />
                                    {reason}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="flex items-center justify-between mt-4">
                            <div className="text-sm">
                              <span className="font-medium">Match Score: </span>
                              <span className="text-primary font-bold">{rec.score}</span>
                            </div>
                            <Link href={`/resources/${rec.resource.id}`}>
                              <Button size="sm" variant="outline" data-testid={`button-view-resource-${rec.resource.id}`}>
                                View Resource
                                <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Implementation Guidance */}
            {recommendations.implementationGuidance && Array.isArray(recommendations.implementationGuidance) && recommendations.implementationGuidance.length > 0 && (
              <div className="mb-12">
                <Card className="border-l-4 border-l-green-500">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <ClipboardList className="h-5 w-5 mr-2 text-green-600" />
                      Implementation Guidance
                      <InfoPopover 
                        content="Professional recommendations for implementing your safety solution"
                        iconClassName="h-4 w-4 ml-2 text-gray-400 hover:text-gray-600 cursor-help"
                      />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {recommendations.implementationGuidance.map((guidance: string, index: number) => (
                        <div key={index} className="flex items-start space-x-3 p-3 bg-green-50 rounded-lg">
                          <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5">
                            {index + 1}
                          </div>
                          <p className="text-sm text-green-800">{guidance}</p>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="flex items-center mb-2">
                        <Zap className="h-4 w-4 text-yellow-600 mr-2" />
                        <h4 className="font-semibold text-yellow-800">Next Steps</h4>
                      </div>
                      <p className="text-sm text-yellow-700">
                        Ready to implement your safety solution? Contact our A-SAFE specialists for personalized consultation 
                        and detailed implementation planning tailored to your specific requirements.
                      </p>
                      <div className="mt-3">
                        <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white">
                          Book Consultation
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Keywords Extracted */}
            {recommendations.extractedKeywords && Array.isArray(recommendations.extractedKeywords) && recommendations.extractedKeywords.length > 0 && (
              <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-2">Analysis Keywords:</h4>
                <div className="flex flex-wrap gap-2">
                  {(recommendations.extractedKeywords as string[]).map((keyword: string, index: number) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Visual Industry Selector Dialog */}
      <Dialog open={showIndustrySelector} onOpenChange={setShowIndustrySelector}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Industry</DialogTitle>
            <DialogDescription>
              Choose the industry that best describes your workplace
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            {industries.map(industry => {
              const isSelected = form.watch("industry") === industry.id;
              const IconComponent = industry.icon;
              return (
                <div
                  key={industry.id}
                  onClick={() => {
                    form.setValue("industry", industry.id);
                    setShowIndustrySelector(false);
                  }}
                  className={`relative cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md ${
                    isSelected
                      ? 'border-yellow-500 bg-yellow-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  data-testid={`industry-option-${industry.id}`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className="flex flex-col items-center text-center space-y-2">
                    <IconComponent className="h-8 w-8 text-gray-600" />
                    <p className="font-medium text-sm">{industry.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Visual Workplace Selector Dialog */}
      <Dialog open={showWorkplaceSelector} onOpenChange={setShowWorkplaceSelector}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Workplace Type</DialogTitle>
            <DialogDescription>
              Choose the type of workplace area requiring protection
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            {workplaceTypes.map(workplace => {
              const isSelected = form.watch("workplaceType") === workplace.id;
              const IconComponent = workplace.icon;
              return (
                <div
                  key={workplace.id}
                  onClick={() => {
                    form.setValue("workplaceType", workplace.id);
                    setShowWorkplaceSelector(false);
                  }}
                  className={`relative cursor-pointer rounded-lg border-2 p-4 transition-all hover:shadow-md ${
                    isSelected
                      ? 'border-yellow-500 bg-yellow-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  data-testid={`workplace-option-${workplace.id}`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                  
                  <div className="flex flex-col items-center text-center space-y-2">
                    <IconComponent className="h-8 w-8 text-gray-600" />
                    <p className="font-medium text-sm">{workplace.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Visual Vehicle Selector Dialog */}
      <Dialog open={showVehicleSelector} onOpenChange={setShowVehicleSelector}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Vehicle Types</DialogTitle>
            <DialogDescription>
              Select all vehicle types that operate in this area (multiple selection allowed)
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 mt-4">
            {loadingVehicleTypes ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
                <span className="ml-2">Loading vehicles...</span>
              </div>
            ) : (
              vehicleTypesData && (
                <div className="space-y-6">
                  {/* Group vehicles by category */}
                  {Array.from(new Set(vehicleTypesData.map(v => v.category))).map(category => (
                    <div key={category} className="space-y-3">
                      <h3 className="font-semibold text-sm uppercase text-gray-600">
                        {category.replace(/-/g, ' ')}
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {vehicleTypesData
                          .filter(v => v.category === category)
                          .map(vehicle => {
                            const currentTypes = form.watch("vehicleTypes") || [];
                            const isSelected = currentTypes.includes(vehicle.id);
                            return (
                              <div
                                key={vehicle.id}
                                onClick={() => {
                                  const current = form.getValues("vehicleTypes") || [];
                                  if (isSelected) {
                                    form.setValue("vehicleTypes", current.filter(id => id !== vehicle.id));
                                  } else {
                                    form.setValue("vehicleTypes", [...current, vehicle.id]);
                                  }
                                }}
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
                                
                                {/* Vehicle image */}
                                <div className="aspect-square mb-2 bg-gray-100 rounded flex items-center justify-center">
                                  {vehicle.iconUrl ? (
                                    <AuthenticatedImage
                                      src={vehicle.iconUrl}
                                      alt={vehicle.name}
                                      className="w-full h-full object-contain p-2"
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
                form.setValue("vehicleTypes", []);
                toast({ title: "Selection Cleared", description: "All vehicle selections have been removed." });
              }}
            >
              Clear All
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowVehicleSelector(false)}>
                Cancel
              </Button>
              <Button onClick={() => setShowVehicleSelector(false)} className="bg-yellow-600 hover:bg-yellow-700">
                Apply Selection
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}