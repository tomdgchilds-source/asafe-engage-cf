import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Package, ShoppingCart, PenTool, FileImage, Upload, MoreHorizontal, Copy, Loader2 } from "lucide-react";
import { LayoutDrawingUpload } from "@/components/LayoutDrawingUpload";
import { LayoutMarkupEditor } from "@/components/layout-markup";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { LayoutDrawing as LayoutDrawingType, CartItem as CartItemType, Project, CustomerCompany } from "@shared/schema";

type ProjectWithCustomer = Project & { customerCompany: CustomerCompany | null };
type ActiveProject = ProjectWithCustomer | null;

export default function LayoutDrawing() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedDrawing, setSelectedDrawing] = useState<LayoutDrawingType | null>(null);
  const [isMarkupEditorOpen, setIsMarkupEditorOpen] = useState(false);
  // Copy-to-project dialog state. `null` = closed. Holds the drawing
  // the user is copying so the dialog can render its title and target
  // the right row on confirm.
  const [copySource, setCopySource] = useState<LayoutDrawingType | null>(null);

  // Set page title and meta description
  useEffect(() => {
    document.title = "Layout Drawing - A-SAFE ENGAGE";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Upload your floor plan and mark up safety barrier placements with A-SAFE ENGAGE Layout Drawing tool.');
    }
  }, []);

  // Fetch user's cart items
  const { data: cartItems = [] } = useQuery<CartItemType[]>({
    queryKey: ['/api/cart'],
  });

  // Fetch existing layout drawings (worker filters to the active
  // project + any legacy orphans).
  const { data: drawings = [] } = useQuery<LayoutDrawingType[]>({
    queryKey: ['/api/layout-drawings'],
  });

  // Active project + full project list drive the copy-to-project
  // picker. We only fetch projects once the user actually opens a
  // copy dialog (see `enabled` below) to keep the page cheap.
  const { data: activeProject } = useQuery<ActiveProject>({
    queryKey: ["/api/active-project"],
    staleTime: 30_000,
    retry: false,
  });
  const { data: projects = [] } = useQuery<ProjectWithCustomer[]>({
    queryKey: ["/api/projects"],
    enabled: !!copySource,
    staleTime: 30_000,
  });

  // Signal to ProjectSwitcher: when a drawing is open in the editor,
  // switching projects would hide it (and any unsaved strokes). We
  // write a simple window flag the switcher's peek logic can read
  // without having to climb up the React tree. Cleared on close.
  useEffect(() => {
    const w = window as any;
    if (isMarkupEditorOpen && selectedDrawing) {
      w.__openLayoutDrawingId = selectedDrawing.id;
      w.__openLayoutDrawingProjectId = (selectedDrawing as any).projectId ?? null;
    } else {
      delete w.__openLayoutDrawingId;
      delete w.__openLayoutDrawingProjectId;
    }
    return () => {
      delete w.__openLayoutDrawingId;
      delete w.__openLayoutDrawingProjectId;
    };
  }, [isMarkupEditorOpen, selectedDrawing]);

  const copyMutation = useMutation({
    mutationFn: async ({ id, projectId }: { id: string; projectId: string }) => {
      const res = await apiRequest(
        `/api/layout-drawings/${id}/copy-to-project`,
        "POST",
        { projectId },
      );
      return (await res.json()) as LayoutDrawingType;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      setCopySource(null);
      toast({
        title: "Drawing copied",
        description: "A linked copy now lives in the selected project.",
      });
    },
    onError: (err: unknown) => {
      toast({
        title: "Copy failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleDrawingSelect = (drawing: LayoutDrawingType) => {
    setSelectedDrawing(drawing);
    setIsMarkupEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setIsMarkupEditorOpen(false);
    setSelectedDrawing(null);
  };

  // Projects available as copy targets: everything the user owns
  // except the drawing's own project (or the active project if the
  // drawing is an unassigned orphan).
  const copyTargets = projects.filter((p) => {
    const currentProjectId = (copySource as any)?.projectId ?? activeProject?.id ?? null;
    return p.id !== currentProjectId;
  });

  // Transform cart items for the markup editor
  const cartItemsForEditor = cartItems.map(item => ({
    id: item.id,
    productName: item.productName || 'Unknown Product',
    quantity: item.quantity || 1,
  }));

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Back Button */}
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
            data-testid="link-back-project"
          >
            <Link href="/start-new-project">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Start New Project
            </Link>
          </Button>
        </div>

        {/* Page Title */}
        <div className="flex items-center mb-8">
          <PenTool className="h-8 w-8 mr-3 text-purple-600" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Layout Drawing
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              Upload your floor plan and mark safety barrier placements
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content - Drawing Upload */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileImage className="h-5 w-5" />
                  Upload Floor Plan
                </CardTitle>
                <CardDescription>
                  Upload a PDF, image, or create a blank canvas to start marking barrier placements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LayoutDrawingUpload
                  company={user?.company || undefined}
                  location={user?.location || undefined}
                  projectName="Layout Drawing Project"
                  onDrawingSelect={handleDrawingSelect}
                />
              </CardContent>
            </Card>

            {/* Existing Drawings */}
            {drawings.length > 0 && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>Recent Drawings</CardTitle>
                  <CardDescription>
                    Click on a drawing to continue editing
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {drawings.slice(0, 6).map((drawing) => (
                      <div
                        key={drawing.id}
                        className="relative border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                        data-testid={`drawing-${drawing.id}`}
                      >
                        {/* Row-level menu: copy the drawing into another
                            project. Stops propagation so clicking the
                            dots doesn't open the editor. */}
                        <div className="absolute top-2 right-2 z-10" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                data-testid={`drawing-menu-${drawing.id}`}
                                aria-label="Drawing actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => setCopySource(drawing)}
                                data-testid={`drawing-copy-${drawing.id}`}
                              >
                                <Copy className="mr-2 h-4 w-4" />
                                Copy to project…
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div
                          onClick={() => handleDrawingSelect(drawing)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-start justify-between mb-2 pr-10">
                            <FileImage className="h-5 w-5 text-gray-400" />
                            {drawing.isScaleSet && (
                              <Badge variant="outline" className="text-xs">
                                Scale Set
                              </Badge>
                            )}
                          </div>
                          <h4 className="font-medium text-sm text-gray-900 dark:text-white mb-1">
                            {drawing.fileName}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {drawing.company} • {drawing.location}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            {new Date(drawing.updatedAt || drawing.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar - Cart Items */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  Cart Items
                </CardTitle>
                <CardDescription>
                  Products available for marking on your layout
                </CardDescription>
              </CardHeader>
              <CardContent>
                {cartItems.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-sm text-gray-500 mb-4">
                      No items in cart
                    </p>
                    <Button asChild size="sm">
                      <Link href="/products">
                        Browse Products
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {cartItems.map((item, index) => {
                      const colorIndex = index % 15;
                      const productColors = [
                        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                        '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6366F1',
                        '#14B8A6', '#F43F5E', '#A855F7', '#22C55E', '#EAB308'
                      ];
                      const color = productColors[colorIndex];
                      
                      return (
                        <div
                          key={item.id}
                          className="flex items-start gap-3 p-3 rounded-lg border dark:border-gray-700"
                          data-testid={`cart-item-${item.id}`}
                        >
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                            style={{ backgroundColor: color }}
                          >
                            {cartItems.length - index}
                          </div>
                          <div className="flex-1">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                              {item.productName}
                            </h4>
                            <p className="text-xs text-gray-500">
                              Qty: {item.quantity}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    
                    <Separator className="my-4" />
                    
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      <p className="mb-2">How to mark barriers:</p>
                      <ol className="list-decimal list-inside space-y-1 text-xs">
                        <li>Upload or select a floor plan</li>
                        <li>Click the pen icon to enter draw mode</li>
                        <li>Draw lines where barriers should be placed</li>
                        <li>Select the product from your cart</li>
                        <li>Add any notes or specifications</li>
                      </ol>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Markup Editor Modal */}
      {selectedDrawing && (
        <LayoutMarkupEditor
          isOpen={isMarkupEditorOpen}
          onClose={handleCloseEditor}
          drawing={selectedDrawing}
          cartItems={cartItemsForEditor}
        />
      )}

      {/* Copy-to-project dialog. Lists every project the user owns
          except the source drawing's current project; clicking a row
          clones the drawing + all markups into that project. */}
      <Dialog
        open={!!copySource}
        onOpenChange={(o) => {
          if (!o) setCopySource(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Copy drawing to another project</DialogTitle>
            <DialogDescription>
              A linked copy of{" "}
              <span className="font-medium">{copySource?.fileName}</span> will
              be created in the project you pick. The original stays where it
              is.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[360px] overflow-y-auto -mx-1 py-1">
            {copyTargets.length === 0 ? (
              <div className="text-sm text-muted-foreground px-3 py-6 text-center">
                No other projects to copy into.
              </div>
            ) : (
              copyTargets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (copySource) {
                      copyMutation.mutate({ id: copySource.id, projectId: p.id });
                    }
                  }}
                  disabled={copyMutation.isPending}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
                  data-testid={`copy-target-${p.id}`}
                >
                  <div className="text-sm font-medium text-foreground truncate">
                    {p.customerCompany?.name ?? "No customer"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.name}
                  </div>
                </button>
              ))
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCopySource(null)}
              disabled={copyMutation.isPending}
            >
              Cancel
            </Button>
            {copyMutation.isPending && (
              <div className="flex items-center text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Copying…
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}