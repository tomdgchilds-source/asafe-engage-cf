import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, CheckCircle2, Star, Settings, Check, X, Clock, Headphones, GraduationCap, Wrench, DollarSign, Info, CheckCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

interface ServiceCareOption {
  id: string;
  title: string;
  description: string;
  chargeable: boolean;
  value: string;
  isActive: boolean;
}

interface UserServiceSelection {
  id: string;
  userId: string;
  serviceOptionId: string;
  isSelected: boolean;
}

interface ServiceCareModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

export function ServiceCareModal({ isOpen, onClose, user }: ServiceCareModalProps) {
  const [selectedService, setSelectedService] = useState<string>("");
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();

  // Fetch available service care options
  const { data: serviceOptions = [], isLoading: optionsLoading } = useQuery<ServiceCareOption[]>({
    queryKey: ["/api/service-care-options"],
    enabled: isOpen && !!user,
  });

  // Fetch user's current selection
  const { data: userSelection, isLoading: selectionLoading } = useQuery<UserServiceSelection>({
    queryKey: ["/api/user-service-selection"],
    enabled: isOpen && !!user,
  });

  // Update selected service when user selection loads
  useEffect(() => {
    if (userSelection?.serviceOptionId) {
      setSelectedService(userSelection.serviceOptionId);
    } else {
      // Default to Essential Care (free option) if no selection
      setSelectedService("SERVICE_ESSENTIAL");
    }
  }, [userSelection]);

  // Save selection mutation
  const saveSelectionMutation = useMutation({
    mutationFn: async (serviceOptionId: string) => {
      return apiRequest("/api/user-service-selection", "POST", {
        serviceOptionId
      });
    },
    onSuccess: () => {
      haptic.save();
      queryClient.invalidateQueries({ queryKey: ["/api/user-service-selection"] });
      toast({
        title: "Success",
        description: "Your service care package has been updated",
      });
      onClose();
    },
    onError: (error: any) => {
      haptic.error();
      toast({
        title: "Error",
        description: error.message || "Failed to save service selection",
        variant: "destructive",
      });
    },
  });

  const getServiceIcon = (serviceId: string) => {
    switch (serviceId) {
      case "SERVICE_ESSENTIAL":
        return <Shield className="h-6 w-6" />;
      case "SERVICE_ENHANCED":
        return <CheckCircle2 className="h-6 w-6" />;
      case "SERVICE_ELITE":
        return <Star className="h-6 w-6" />;
      default:
        return <Settings className="h-6 w-6" />;
    }
  };

  const getServiceColors = (serviceId: string) => {
    switch (serviceId) {
      case "SERVICE_ESSENTIAL":
        return {
          border: "border-gray-300",
          bg: "bg-gradient-to-br from-gray-50 to-gray-100",
          text: "text-gray-700",
          iconBg: "bg-gray-200",
          iconText: "text-gray-600",
          theme: "Silver"
        };
      case "SERVICE_ENHANCED":
        return {
          border: "border-yellow-300",
          bg: "bg-gradient-to-br from-yellow-50 to-amber-100",
          text: "text-amber-700",
          iconBg: "bg-yellow-200",
          iconText: "text-yellow-700",
          theme: "Gold"
        };
      case "SERVICE_ELITE":
        return {
          border: "border-purple-300",
          bg: "bg-gradient-to-br from-purple-50 to-violet-100",
          text: "text-purple-700",
          iconBg: "bg-purple-200",
          iconText: "text-purple-700",
          theme: "Platinum"
        };
      default:
        return {
          border: "border-gray-300",
          bg: "bg-gray-50",
          text: "text-gray-700",
          iconBg: "bg-gray-200",
          iconText: "text-gray-600",
          theme: "Basic"
        };
    }
  };

  const comparisonFeatures = [
    {
      icon: <Check className="h-4 w-4" />,
      name: "Basic Inspection",
      essential: true,
      enhanced: true,
      elite: true,
      explanation: {
        title: "Basic Inspection",
        description: "Initial safety assessment and barrier condition check",
        essential: "Standard visual inspection included",
        enhanced: "Comprehensive inspection with detailed report",
        elite: "Advanced inspection with performance analysis and recommendations"
      }
    },
    {
      icon: <Headphones className="h-4 w-4" />,
      name: "Technical Support",
      essential: "Standard",
      enhanced: "Priority",
      elite: "24/7 Premium",
      explanation: {
        title: "Technical Support",
        description: "Expert assistance for technical issues and guidance",
        essential: "Business hours email and phone support",
        enhanced: "Priority support with faster response times",
        elite: "24/7 premium support with dedicated account manager"
      }
    },
    {
      icon: <GraduationCap className="h-4 w-4" />,
      name: "Staff Training",
      essential: "No",
      enhanced: "Once",
      elite: "Annually",
      explanation: {
        title: "Staff Training",
        description: "Professional training for your team on barrier systems",
        essential: "Online resources and documentation only",
        enhanced: "One-time on-site training session for key personnel",
        elite: "Annual comprehensive training program with certification"
      }
    },
    {
      icon: <Wrench className="h-4 w-4" />,
      name: "Maintenance Visits",
      essential: false,
      enhanced: "2 per year",
      elite: "4 per year",
      explanation: {
        title: "Maintenance Visits",
        description: "Regular professional maintenance to ensure optimal performance",
        essential: "Self-maintenance with guidance documentation",
        enhanced: "2 professional maintenance visits per year",
        elite: "Quarterly professional maintenance visits with detailed reports"
      }
    },
    {
      icon: <Shield className="h-4 w-4" />,
      name: "Extended Warranty",
      essential: false,
      enhanced: "+1 Year",
      elite: "+2 Years",
      explanation: {
        title: "Extended Warranty",
        description: "Additional warranty coverage beyond standard terms",
        essential: "Standard warranty coverage only",
        enhanced: "Extended warranty for additional 1 year coverage",
        elite: "Premium extended warranty for additional 2 years coverage"
      }
    },
    {
      icon: <Clock className="h-4 w-4" />,
      name: "Response Time",
      essential: "7 days",
      enhanced: "3 days",
      elite: "1 day",
      explanation: {
        title: "Response Time",
        description: "How quickly we respond to your support requests",
        essential: "Standard response within 7 business days",
        enhanced: "Fast response within 3 business days",
        elite: "Premium response within 1 business day guaranteed"
      }
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      name: "Barrier Cleaning",
      essential: "No",
      enhanced: "Once",
      elite: "Three times",
      explanation: {
        title: "Barrier Cleaning",
        description: "Professional cleaning service for your barrier systems",
        essential: "Self-cleaning with guidance documentation",
        enhanced: "One professional cleaning service per year",
        elite: "Three professional cleaning services per year with detailed maintenance"
      }
    }
  ];

  if (optionsLoading || selectionLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[100vw] max-w-[100vw] max-h-[90vh] overflow-y-auto p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Loading Service Care Options...
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-8">
            <div className="h-6 bg-gray-200 rounded animate-pulse" />
            <div className="h-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-20 bg-gray-200 rounded animate-pulse" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const essentialOption = serviceOptions.find(opt => opt.id === "SERVICE_ESSENTIAL");
  const enhancedOption = serviceOptions.find(opt => opt.id === "SERVICE_ENHANCED");
  const eliteOption = serviceOptions.find(opt => opt.id === "SERVICE_ELITE");

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="w-[100vw] max-w-[100vw] max-h-[90vh] overflow-y-auto p-2 sm:p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Shield className="h-6 w-6" />
              Service Care Package
            </DialogTitle>
            <DialogDescription className="text-base">
              Choose your preferred service care package for ongoing support and maintenance
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Comparison Table */}
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 border-b">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 text-center">
                  Service Package Comparison
                </h3>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="px-2 sm:px-6 py-2 sm:py-4 text-left">
                        <span className="text-xs sm:text-sm font-medium text-gray-700"></span>
                      </th>
                      <th className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedService("SERVICE_ESSENTIAL")}
                          className={`flex flex-col items-center gap-1 sm:gap-2 cursor-pointer transition-all hover:scale-105 mx-auto ${
                            selectedService === "SERVICE_ESSENTIAL" ? 'scale-105' : ''
                          }`}
                        >
                          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                            selectedService === "SERVICE_ESSENTIAL" 
                              ? 'bg-blue-500 ring-2 ring-blue-300' 
                              : 'bg-gray-200'
                          }`}>
                            <Shield className={`h-3 w-3 sm:h-4 sm:w-4 ${
                              selectedService === "SERVICE_ESSENTIAL" ? 'text-white' : 'text-gray-600'
                            }`} />
                          </div>
                          <span className={`text-xs sm:text-sm font-medium ${
                            selectedService === "SERVICE_ESSENTIAL" ? 'text-blue-600 font-bold' : 'text-gray-700'
                          }`}>Essential</span>
                          {selectedService === "SERVICE_ESSENTIAL" && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                        </button>
                      </th>
                      <th className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedService("SERVICE_ENHANCED")}
                          className={`flex flex-col items-center gap-1 sm:gap-2 cursor-pointer transition-all hover:scale-105 mx-auto ${
                            selectedService === "SERVICE_ENHANCED" ? 'scale-105' : ''
                          }`}
                        >
                          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                            selectedService === "SERVICE_ENHANCED" 
                              ? 'bg-blue-500 ring-2 ring-blue-300' 
                              : 'bg-yellow-200'
                          }`}>
                            <CheckCircle2 className={`h-3 w-3 sm:h-4 sm:w-4 ${
                              selectedService === "SERVICE_ENHANCED" ? 'text-white' : 'text-yellow-700'
                            }`} />
                          </div>
                          <span className={`text-xs sm:text-sm font-medium ${
                            selectedService === "SERVICE_ENHANCED" ? 'text-blue-600 font-bold' : 'text-amber-700'
                          }`}>Enhanced</span>
                          {selectedService === "SERVICE_ENHANCED" && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                        </button>
                      </th>
                      <th className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedService("SERVICE_ELITE")}
                          className={`flex flex-col items-center gap-1 sm:gap-2 cursor-pointer transition-all hover:scale-105 mx-auto ${
                            selectedService === "SERVICE_ELITE" ? 'scale-105' : ''
                          }`}
                        >
                          <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                            selectedService === "SERVICE_ELITE" 
                              ? 'bg-blue-500 ring-2 ring-blue-300' 
                              : 'bg-purple-200'
                          }`}>
                            <Star className={`h-3 w-3 sm:h-4 sm:w-4 ${
                              selectedService === "SERVICE_ELITE" ? 'text-white' : 'text-purple-700'
                            }`} />
                          </div>
                          <span className={`text-xs sm:text-sm font-medium ${
                            selectedService === "SERVICE_ELITE" ? 'text-blue-600 font-bold' : 'text-purple-700'
                          }`}>Elite</span>
                          {selectedService === "SERVICE_ELITE" && (
                            <CheckCircle className="h-4 w-4 text-blue-500" />
                          )}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonFeatures.map((feature, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="px-2 sm:px-6 py-2 sm:py-4">
                          <div className="flex items-center gap-1 sm:gap-3">
                            <div className="text-gray-500 p-0.5 sm:p-1 flex-shrink-0">
                              {feature.icon}
                            </div>
                            <span className="text-xs sm:text-sm font-medium text-gray-900 truncate">
                              {feature.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                          <div className="flex justify-center">
                            {feature.essential === true ? (
                              <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                            ) : feature.essential === false ? (
                              <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                            ) : (
                              <span className="text-xs sm:text-sm text-gray-600 font-medium">
                                {feature.essential}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                          <div className="flex justify-center">
                            {feature.enhanced === true ? (
                              <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                            ) : feature.enhanced === false ? (
                              <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                            ) : (
                              <span className="text-xs sm:text-sm text-amber-700 font-medium">
                                {feature.enhanced}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                          <div className="flex justify-center">
                            {feature.elite === true ? (
                              <Check className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
                            ) : feature.elite === false ? (
                              <X className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                            ) : (
                              <span className="text-xs sm:text-sm text-purple-700 font-medium">
                                {feature.elite}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    
                    {/* Pricing Row */}
                    <tr className="bg-gray-50 border-b-2 border-gray-200">
                      <td className="px-2 sm:px-6 py-2 sm:py-4">
                        <div className="flex items-center gap-1 sm:gap-3">
                          <DollarSign className="h-3 w-3 sm:h-4 sm:w-4 text-gray-500" />
                          <span className="text-xs sm:text-sm font-semibold text-gray-900">Cost</span>
                        </div>
                      </td>
                      <td className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                        <Badge className="bg-green-100 text-green-800 border-green-300 font-bold text-xs">
                          Free
                        </Badge>
                      </td>
                      <td className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 font-bold text-xs">
                          5%
                        </Badge>
                      </td>
                      <td className="px-1 sm:px-6 py-2 sm:py-4 text-center">
                        <Badge className="bg-purple-100 text-purple-800 border-purple-300 font-bold text-xs">
                          10%
                        </Badge>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              {/* Footer with rating indicators */}
              <div className="bg-gray-50 px-3 sm:px-6 py-3 sm:py-4 border-t">
                <div className="flex justify-center gap-4 sm:gap-8 text-xs sm:text-sm">
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="w-2 h-2 sm:w-3 sm:h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-600">Good</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="w-2 h-2 sm:w-3 sm:h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-gray-600">Better</span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="w-2 h-2 sm:w-3 sm:h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-gray-600">Best</span>
                  </div>
                </div>
              </div>
            </div>


            {/* Action Buttons */}
            <div className="flex justify-center gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={onClose}
                className="px-8 py-2"
                data-testid="button-cancel-service"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedService) {
                    saveSelectionMutation.mutate(selectedService);
                  }
                }}
                disabled={saveSelectionMutation.isPending}
                className="px-8 py-2 bg-blue-600 hover:bg-blue-700 text-white"
                data-testid="button-save-service"
              >
                {saveSelectionMutation.isPending ? 'Saving...' : 'Save Selection'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </>
  );
}