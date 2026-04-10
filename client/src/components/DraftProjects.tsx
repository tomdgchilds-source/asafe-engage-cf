import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FolderOpen, Save, ChevronDown, ChevronUp, Download, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/CurrencyContext";
import { ConflictResolutionModal } from "@/components/ConflictResolutionModal";
import { useLocation } from "wouter";

interface CartItemType {
  id: string;
  productName: string;
  quantity: number;
  totalPrice: number;
}

export function DraftProjects() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { formatPrice } = useCurrency();
  const [, setLocation] = useLocation();

  const [draftsExpanded, setDraftsExpanded] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [saveDraftModalOpen, setSaveDraftModalOpen] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [selectedDraft, setSelectedDraft] = useState<any>(null);
  const [existingCartData, setExistingCartData] = useState<any>(null);
  
  // Fetch project info to prepopulate the project name
  const { data: projectInfo } = useQuery<any>({
    queryKey: ['/api/cart-project-info'],
    enabled: !!user
  });
  
  // Auto-populate project name when modal opens
  useEffect(() => {
    if (saveDraftModalOpen && projectInfo) {
      const parts = [];
      
      // Add company name
      if (projectInfo.company?.trim()) {
        parts.push(projectInfo.company.trim());
      }
      
      // Add location
      if (projectInfo.location?.trim()) {
        parts.push(projectInfo.location.trim());
      }
      
      // Add project description
      if (projectInfo.projectDescription?.trim()) {
        parts.push(projectInfo.projectDescription.trim());
      }
      
      // Add date in format M/D/YYYY (no leading zeros)
      const now = new Date();
      const dateStamp = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
      
      // Join with underscores and add date
      const generatedName = parts.length > 0 
        ? `${parts.join('_')}_${dateStamp}`
        : `Draft Project ${dateStamp}`;
      
      setDraftNameInput(generatedName);
    }
  }, [saveDraftModalOpen, projectInfo]);

  // Fetch cart data to determine if save button should be shown
  const { data: cartData } = useQuery<CartItemType[]>({
    queryKey: ['/api/cart'],
    enabled: !!user
  });

  // Fetch draft projects
  const { data: draftProjects } = useQuery({
    queryKey: ['/api/draft-projects'],
    enabled: !!user
  });

  // Check for existing cart data before loading
  const checkExistingDataMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/cart/check-existing-data', 'POST');
    },
    onSuccess: (data: any) => {
      if (data.hasExistingData && selectedDraft) {
        // Show conflict modal
        setExistingCartData(data.existingData);
        setConflictModalOpen(true);
      } else if (selectedDraft) {
        // No conflicts, proceed with loading
        loadDraftMutation.mutate(selectedDraft.id);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to check existing cart data",
        variant: "destructive"
      });
    }
  });

  // Draft project mutations
  const saveDraftMutation = useMutation({
    mutationFn: async (data: { projectName: string; description?: string }) => {
      return apiRequest('/api/draft-projects', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/draft-projects'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      toast({
        title: "Draft Saved",
        description: "Your project cart has been saved as a draft project"
      });
      setSaveDraftModalOpen(false);
      setDraftNameInput('');
      setDraftDescription('');
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save draft project",
        variant: "destructive"
      });
    }
  });

  const loadDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      return apiRequest(`/api/draft-projects/${draftId}/load`, 'POST');
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
      queryClient.invalidateQueries({ queryKey: ['/api/cart-project-info'] });
      queryClient.invalidateQueries({ queryKey: ['/api/layout-drawings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/project-case-studies'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calculations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-discount-selections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user-service-selection'] });
      
      toast({
        title: "Draft Loaded Successfully",
        description: "Navigating to Project Cart...",
      });
      
      // Reset modal state
      setConflictModalOpen(false);
      setSelectedDraft(null);
      setExistingCartData(null);
      
      // Navigate to cart after a brief delay for toast visibility
      setTimeout(() => {
        setLocation('/cart');
      }, 500);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to load draft project",
        variant: "destructive"
      });
      
      // Reset modal state on error too
      setConflictModalOpen(false);
      setSelectedDraft(null);
      setExistingCartData(null);
    }
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (draftId: string) => {
      return apiRequest(`/api/draft-projects/${draftId}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/draft-projects'] });
      toast({
        title: "Draft Deleted",
        description: "Draft project has been deleted"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete draft project",
        variant: "destructive"
      });
    }
  });

  // Handle load draft click - check for conflicts first
  const handleLoadDraft = (draft: any) => {
    setSelectedDraft(draft);
    checkExistingDataMutation.mutate();
  };

  // Handle conflict resolution modal close
  const handleConflictModalClose = () => {
    setConflictModalOpen(false);
    setSelectedDraft(null);
    setExistingCartData(null);
  };

  // Handle successful load after conflict resolution
  const handleLoadComplete = () => {
    // The loadDraftMutation success handler will take care of cleanup
  };

  const cartItems = Array.isArray(cartData) ? cartData : [];
  const drafts = Array.isArray(draftProjects) ? draftProjects : [];

  if (!user) return null;

  return (
    <>
      <Card className="w-full max-w-4xl mx-auto mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-green-900">
              <FolderOpen className="h-5 w-5" />
              Draft Projects
            </CardTitle>
            <div className="flex items-center gap-2">
              {cartItems.length > 0 && (
                <Button
                  onClick={() => setSaveDraftModalOpen(true)}
                  size="sm"
                  className="bg-green-600 hover:bg-green-700"
                  data-testid="button-save-draft"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save Current Project
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDraftsExpanded(!draftsExpanded)}
                className="h-8 w-8 p-0"
                data-testid="button-toggle-drafts"
              >
                {draftsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {!draftsExpanded && drafts.length > 0 && (
            <p className="text-sm text-green-700">
              {drafts.length} saved {drafts.length === 1 ? 'project' : 'projects'}
            </p>
          )}

          {draftsExpanded && (
            <div className="space-y-2">
              {drafts.length > 0 ? (
                drafts.map((draft: any) => (
                  <div key={draft.id} className="flex items-center justify-between bg-white dark:bg-[#121212] rounded p-3 border border-gray-200 dark:border-[#2a2a2a]">
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{draft.projectName}</h4>
                      <p className="text-xs text-gray-500">
                        {formatPrice(parseFloat(draft.totalAmount))} • {new Date(draft.createdAt).toLocaleDateString()}
                      </p>
                      {draft.description && (
                        <p className="text-xs text-gray-400 mt-1">{draft.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button
                        onClick={() => handleLoadDraft(draft)}
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50"
                        data-testid={`button-load-draft-${draft.id}`}
                        title="Load into Project Cart"
                        disabled={checkExistingDataMutation.isPending || loadDraftMutation.isPending}
                      >
                        <Download className="h-3 w-3" />
                      </Button>
                      <Button
                        onClick={() => deleteDraftMutation.mutate(draft.id)}
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                        data-testid={`button-delete-draft-${draft.id}`}
                        title="Delete Draft"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <FolderOpen className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-sm text-gray-500 mb-2">No draft projects saved</p>
                  <p className="text-xs text-gray-400">
                    Build a project in your Project Cart and save it as a draft to work on later
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Draft Modal */}
      <Dialog open={saveDraftModalOpen} onOpenChange={setSaveDraftModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Save className="h-5 w-5 text-green-600" />
              Save Project as Draft
            </DialogTitle>
            <DialogDescription>
              Save your current project cart ({cartItems.length} items) as a draft to continue working on later.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project Name *</Label>
              <Input
                id="project-name"
                placeholder="e.g., Warehouse Safety Upgrade"
                value={draftNameInput}
                onChange={(e) => setDraftNameInput(e.target.value)}
                data-testid="input-project-name"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="project-description">Description (Optional)</Label>
              <Textarea
                id="project-description"
                placeholder="Brief description of this project..."
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                rows={3}
                data-testid="textarea-project-description"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDraftModalOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => saveDraftMutation.mutate({
                projectName: draftNameInput.trim(),
                description: draftDescription.trim() || undefined
              })}
              disabled={!draftNameInput.trim() || saveDraftMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {saveDraftMutation.isPending ? "Saving..." : "Save Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conflict Resolution Modal */}
      {selectedDraft && existingCartData && (
        <ConflictResolutionModal
          isOpen={conflictModalOpen}
          onClose={handleConflictModalClose}
          draftProject={selectedDraft}
          existingCartData={existingCartData}
          onLoadComplete={handleLoadComplete}
        />
      )}
    </>
  );
}