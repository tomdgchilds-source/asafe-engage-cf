import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Save, Trash2, AlertTriangle, ShoppingCart, FileText, MapPin, Building, Calculator, FolderOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftProject: {
    id: string;
    projectName: string;
    description?: string;
    totalAmount: number;
    currency: string;
    createdAt: string;
    cartData: any;
  };
  existingCartData: {
    cartItems: any[];
    projectInfo: any;
    layoutDrawings: any[];
    projectCaseStudies: any[];
    calculations: any[];
    discountSelections: any[];
    serviceSelections: any[];
  };
  onLoadComplete: () => void;
}

export function ConflictResolutionModal({
  isOpen,
  onClose,
  draftProject,
  existingCartData,
  onLoadComplete,
}: ConflictResolutionModalProps) {
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  // Count existing data items
  const existingItemsCount = {
    cartItems: existingCartData.cartItems?.length || 0,
    projectInfo: existingCartData.projectInfo ? 1 : 0,
    layoutDrawings: existingCartData.layoutDrawings?.length || 0,
    caseStudies: existingCartData.projectCaseStudies?.length || 0,
    calculations: existingCartData.calculations?.length || 0,
    discounts: existingCartData.discountSelections?.length || 0,
    services: existingCartData.serviceSelections?.length || 0,
  };

  // Count draft data items
  const draftItemsCount = {
    cartItems: draftProject.cartData?.cartItems?.length || 0,
    projectInfo: draftProject.cartData?.projectInfo ? 1 : 0,
    layoutDrawings: draftProject.cartData?.layoutDrawings?.length || 0,
    caseStudies: draftProject.cartData?.projectCaseStudies?.length || 0,
    calculations: draftProject.cartData?.impactCalculations?.length || 0,
    discounts: draftProject.cartData?.discountSelections?.length || 0,
    services: draftProject.cartData?.serviceSelections?.length || 0,
  };

  const totalExistingItems = Object.values(existingItemsCount).reduce((a, b) => a + b, 0);
  const totalDraftItems = Object.values(draftItemsCount).reduce((a, b) => a + b, 0);

  // Save current cart as draft before loading
  const saveCurrentCartMutation = useMutation({
    mutationFn: async () => {
      const timestamp = new Date().toLocaleString();
      return apiRequest('/api/draft-projects', 'POST', {
        projectName: `Auto-saved before loading ${draftProject.projectName} - ${timestamp}`,
        description: 'Automatically saved to preserve existing cart data before loading another draft project.',
      });
    },
    onSuccess: () => {
      toast({
        title: "Current Cart Saved",
        description: "Your existing cart has been automatically saved as a draft project.",
      });
      haptic.success();
      // Now load the selected draft
      loadDraftProject(false); // Don't save again
    },
    onError: (error: any) => {
      toast({
        title: "Error Saving Current Cart",
        description: error.message || "Failed to save current cart data",
        variant: "destructive",
      });
      haptic.error();
      setIsLoading(false);
    },
  });

  // Load draft project
  const loadDraftMutation = useMutation({
    mutationFn: async (clearCart: boolean = true) => {
      return apiRequest(`/api/draft-projects/${draftProject.id}/load`, 'POST', {
        clearCart,
      });
    },
    onSuccess: () => {
      // Invalidate all relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cart-project-info'] });
      queryClient.invalidateQueries({ queryKey: ['/api/layout-drawings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-case-studies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calculations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-discount-selections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-service-selection'] });
      queryClient.invalidateQueries({ queryKey: ['/api/draft-projects'] });

      toast({
        title: "Draft Project Loaded",
        description: `"${draftProject.projectName}" has been successfully loaded into your cart.`,
      });
      haptic.success();
      setIsLoading(false);
      onLoadComplete();
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Error Loading Draft",
        description: error.message || "Failed to load draft project",
        variant: "destructive",
      });
      haptic.error();
      setIsLoading(false);
    },
  });

  const loadDraftProject = (clearCart: boolean = true) => {
    setIsLoading(true);
    loadDraftMutation.mutate(clearCart);
  };

  const handleSaveAndLoad = () => {
    setIsLoading(true);
    haptic.save();
    saveCurrentCartMutation.mutate();
  };

  const handleDiscardAndLoad = () => {
    setIsLoading(true);
    haptic.delete();
    loadDraftProject(true);
  };

  const handleCancel = () => {
    haptic.light();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Existing Cart Data Detected
          </DialogTitle>
          <DialogDescription>
            You have existing data in your cart. Choose how to proceed with loading "{draftProject.projectName}".
          </DialogDescription>
        </DialogHeader>

        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Loading this draft will replace your current cart data. Choose an option below to prevent data loss.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Current Cart Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingCart className="h-5 w-5 text-blue-600" />
                Current Cart Data
                <Badge variant="secondary">{totalExistingItems} items</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {existingItemsCount.cartItems > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-gray-500" />
                    Cart Items
                  </span>
                  <Badge>{existingItemsCount.cartItems}</Badge>
                </div>
              )}
              {existingItemsCount.projectInfo > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-gray-500" />
                    Project Info
                  </span>
                  <Badge>1</Badge>
                </div>
              )}
              {existingItemsCount.layoutDrawings > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    Layout Drawings
                  </span>
                  <Badge>{existingItemsCount.layoutDrawings}</Badge>
                </div>
              )}
              {existingItemsCount.caseStudies > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    Case Studies
                  </span>
                  <Badge>{existingItemsCount.caseStudies}</Badge>
                </div>
              )}
              {existingItemsCount.calculations > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-gray-500" />
                    Calculations
                  </span>
                  <Badge>{existingItemsCount.calculations}</Badge>
                </div>
              )}
              {totalExistingItems === 0 && (
                <p className="text-gray-500 text-sm italic">No data found</p>
              )}
            </CardContent>
          </Card>

          {/* Draft Project Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FolderOpen className="h-5 w-5 text-green-600" />
                Draft Project Data
                <Badge variant="secondary">{totalDraftItems} items</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {draftItemsCount.cartItems > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-gray-500" />
                    Cart Items
                  </span>
                  <Badge>{draftItemsCount.cartItems}</Badge>
                </div>
              )}
              {draftItemsCount.projectInfo > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-gray-500" />
                    Project Info
                  </span>
                  <Badge>1</Badge>
                </div>
              )}
              {draftItemsCount.layoutDrawings > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-500" />
                    Layout Drawings
                  </span>
                  <Badge>{draftItemsCount.layoutDrawings}</Badge>
                </div>
              )}
              {draftItemsCount.caseStudies > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gray-500" />
                    Case Studies
                  </span>
                  <Badge>{draftItemsCount.caseStudies}</Badge>
                </div>
              )}
              {draftItemsCount.calculations > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Calculator className="h-4 w-4 text-gray-500" />
                    Calculations
                  </span>
                  <Badge>{draftItemsCount.calculations}</Badge>
                </div>
              )}
              {totalDraftItems === 0 && (
                <p className="text-gray-500 text-sm italic">No data found</p>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          
          <Button
            variant="destructive"
            onClick={handleDiscardAndLoad}
            disabled={isLoading}
            className="w-full sm:w-auto"
            data-testid="button-discard-and-load"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isLoading ? "Loading..." : "Discard Current & Load Draft"}
          </Button>
          
          <Button
            onClick={handleSaveAndLoad}
            disabled={isLoading}
            className="w-full sm:w-auto bg-[#FFC72C] hover:bg-[#FFD700] text-black"
            data-testid="button-save-and-load"
          >
            <Save className="h-4 w-4 mr-2" />
            {isLoading ? "Saving..." : "Save Current & Load Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}