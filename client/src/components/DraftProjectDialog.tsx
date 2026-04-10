import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Save, Loader2 } from "lucide-react";

interface DraftProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartItemsCount: number;
}

export function DraftProjectDialog({ open, onOpenChange, cartItemsCount }: DraftProjectDialogProps) {
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch project info to prepopulate the project name
  const { data: projectInfo } = useQuery<any>({
    queryKey: ["/api/cart-project-info"],
  });

  // Prepopulate the project name when dialog opens
  useEffect(() => {
    if (open) {
      // Build the project name from company, location, and description
      const parts = [];
      
      // Use the correct field names from API: 'company' and 'location'
      if (projectInfo?.company?.trim()) {
        parts.push(projectInfo.company.trim().replace(/\s+/g, ' '));
      }
      if (projectInfo?.location?.trim()) {
        parts.push(projectInfo.location.trim().replace(/\s+/g, ' '));
      }
      if (projectInfo?.projectDescription?.trim()) {
        // Use the full project description
        parts.push(projectInfo.projectDescription.trim().replace(/\s+/g, ' '));
      }
      
      // Add date stamp in format: M/D/YYYY (no leading zeros)
      const now = new Date();
      const dateStamp = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
      
      // Join with underscores and add date stamp
      let generatedName = parts.length > 0 
        ? `${parts.join('_')}_${dateStamp}`
        : `Draft Project ${dateStamp}`;
      
      setProjectName(generatedName);
    } else {
      // Reset when dialog closes
      setProjectName("");
      setDescription("");
    }
  }, [open, projectInfo]);

  const saveDraftMutation = useMutation({
    mutationFn: async (data: { projectName: string; description: string; clearCart: boolean }) => {
      return await apiRequest("/api/draft-projects", "POST", data);
    },
    onSuccess: () => {
      toast({
        title: "Project Saved as Draft",
        description: "Your cart has been saved as a draft project. You can access it later from your dashboard.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/draft-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      // Clear the form
      setProjectName("");
      setDescription("");
      // Close dialog after clearing
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message || "Failed to save draft project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    if (!projectName.trim()) {
      toast({
        title: "Project Name Required",
        description: "Please enter a name for your draft project.",
        variant: "destructive",
      });
      return;
    }

    saveDraftMutation.mutate({
      projectName: projectName.trim(),
      description: description.trim(),
      clearCart: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="h-5 w-5 text-yellow-500" />
            Save Cart as Draft Project
          </DialogTitle>
          <DialogDescription>
            Save your current cart ({cartItemsCount} items) as a draft project to continue working on later.
            Your cart will be cleared after saving.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name *</Label>
            <Input
              id="project-name"
              placeholder="Enter project name..."
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              data-testid="input-project-name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="project-description">Description (Optional)</Label>
            <Textarea
              id="project-description"
              placeholder="Add notes about this project..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              data-testid="textarea-project-description"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-save"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={saveDraftMutation.isPending}
              className="bg-yellow-400 text-black hover:bg-yellow-500"
              data-testid="button-save-draft"
            >
              {saveDraftMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Draft
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}