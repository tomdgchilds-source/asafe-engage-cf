import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  FileText, 
  Calendar, 
  DollarSign, 
  ShoppingCart, 
  Trash2, 
  Loader2,
  AlertTriangle
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface DraftProject {
  id: string;
  projectName: string;
  description: string | null;
  totalAmount: string | null;
  currency: string | null;
  cartData: any[];
  createdAt: string;
  updatedAt: string;
}

export function DraftProjectsList() {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: draftProjects = [], isLoading } = useQuery<DraftProject[]>({
    queryKey: ["/api/draft-projects"],
  });

  const loadDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/draft-projects/${id}/load`, "POST", { clearCart: true });
    },
    onSuccess: () => {
      toast({
        title: "Draft Loaded",
        description: "Your draft project has been loaded into your cart.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      toast({
        title: "Load Failed",
        description: error.message || "Failed to load draft project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/draft-projects/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({
        title: "Draft Deleted",
        description: "Your draft project has been deleted.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/draft-projects"] });
      setDeleteId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete draft project. Please try again.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (draftProjects.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Draft Projects</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Save your cart as a draft project to continue working on it later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {draftProjects.map((draft) => (
        <Card key={draft.id} className="hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-yellow-500" />
                  {draft.projectName}
                </CardTitle>
                {draft.description && (
                  <CardDescription className="mt-1">
                    {draft.description}
                  </CardDescription>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => loadDraftMutation.mutate(draft.id)}
                  disabled={loadDraftMutation.isPending}
                  className="bg-yellow-400 text-black hover:bg-yellow-500"
                  data-testid={`button-load-draft-${draft.id}`}
                >
                  {loadDraftMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-1" />
                      Load to Cart
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setDeleteId(draft.id)}
                  data-testid={`button-delete-draft-${draft.id}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-1">
                <ShoppingCart className="h-4 w-4" />
                <span>{Array.isArray(draft.cartData) ? draft.cartData.length : 0} items</span>
              </div>
              
              {draft.totalAmount && (
                <div className="flex items-center gap-1">
                  <DollarSign className="h-4 w-4" />
                  <span>{Number(draft.totalAmount).toLocaleString()} {draft.currency || 'AED'}</span>
                </div>
              )}
              
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>
                  {format(new Date(draft.updatedAt), "MMM d, yyyy 'at' h:mm a")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              Delete Draft Project
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this draft project? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteDraftMutation.mutate(deleteId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}