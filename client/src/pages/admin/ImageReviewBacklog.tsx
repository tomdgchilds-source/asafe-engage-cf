import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ImageOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ──────────────────────────────────────────────
// Admin page: photography backlog.
//
// Lists every product flagged `needsImageReview` (products that are
// currently rendering a sibling-family placeholder image). Admins can
// paste the real CDN URLs inline and clear the flag once resolved.
// Wired to GET/PATCH /api/admin/image-review[/:id].
// ──────────────────────────────────────────────

interface FlaggedProduct {
  id: string;
  name: string;
  category: string;
  imageUrl: string | null;
  lifestyleImageUrl: string | null;
  updatedAt: string | null;
}

export default function ImageReviewBacklog() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: products = [], isLoading, error } = useQuery<FlaggedProduct[]>({
    queryKey: ["/api/admin/image-review"],
    retry: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/admin")}
              data-testid="back-to-admin"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Admin
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Image review backlog</h1>
              <p className="text-sm text-muted-foreground">
                Products currently rendering a placeholder image. Upload the real hero + lifestyle
                photo, then clear the flag.
              </p>
            </div>
          </div>
          <Badge variant="secondary" data-testid="backlog-count">
            {products.length} flagged
          </Badge>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="py-8 text-center text-sm text-destructive" data-testid="backlog-error">
            Failed to load backlog. You may need admin access.
          </div>
        )}

        {!isLoading && !error && products.length === 0 && (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <ImageOff className="h-10 w-10 text-muted-foreground" />
              <div className="font-medium">Backlog is clear</div>
              <div className="text-sm text-muted-foreground">
                Every product has a reviewed hero image. New placeholders appear here automatically.
              </div>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {products.map((p) => (
            <ImageReviewRow key={p.id} product={p} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ImageReviewRow({ product }: { product: FlaggedProduct }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [imageUrl, setImageUrl] = useState(product.imageUrl ?? "");
  const [lifestyleImageUrl, setLifestyleImageUrl] = useState(product.lifestyleImageUrl ?? "");
  const [clearFlag, setClearFlag] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {};
      if (imageUrl !== (product.imageUrl ?? "")) body.imageUrl = imageUrl;
      if (lifestyleImageUrl !== (product.lifestyleImageUrl ?? "")) {
        body.lifestyleImageUrl = lifestyleImageUrl;
      }
      if (clearFlag) body.clearFlag = true;
      if (Object.keys(body).length === 0) {
        throw new Error("No changes to save");
      }
      const res = await apiRequest(`/api/admin/image-review/${product.id}`, "PATCH", body);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Product updated", description: product.name });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/image-review"] });
      setClearFlag(false);
    },
    onError: (err: Error) => {
      toast({
        title: "Update failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card data-testid={`image-review-card-${product.id}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{product.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">{product.category}</p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            Needs review
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-4 items-start">
        <div className="w-32 h-32 rounded border bg-muted overflow-hidden flex items-center justify-center">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
          ) : (
            <ImageOff className="h-8 w-8 text-muted-foreground" />
          )}
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor={`image-${product.id}`} className="text-xs">
              Hero image URL
            </Label>
            <Input
              id={`image-${product.id}`}
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
              data-testid={`input-image-${product.id}`}
            />
          </div>
          <div>
            <Label htmlFor={`lifestyle-${product.id}`} className="text-xs">
              Lifestyle image URL
            </Label>
            <Input
              id={`lifestyle-${product.id}`}
              value={lifestyleImageUrl}
              onChange={(e) => setLifestyleImageUrl(e.target.value)}
              placeholder="https://…"
              data-testid={`input-lifestyle-${product.id}`}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`clear-${product.id}`}
              checked={clearFlag}
              onCheckedChange={(val) => setClearFlag(val === true)}
              data-testid={`checkbox-clear-${product.id}`}
            />
            <Label htmlFor={`clear-${product.id}`} className="text-sm cursor-pointer">
              Clear "needs image review" flag
            </Label>
          </div>
          <div>
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              data-testid={`save-${product.id}`}
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
