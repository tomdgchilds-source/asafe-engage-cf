import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Check, X, Building2, RefreshCw, Upload } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CompanyLogoFinderProps {
  companyName: string;
  onLogoConfirmed: (logoUrl: string) => void;
  currentLogoUrl?: string;
  className?: string;
}

interface LogoSearchResult {
  url: string;
  thumbnailUrl?: string;
  source: string;
  confidence: number;
  metadata?: any;
}

export function CompanyLogoFinder({
  companyName,
  onLogoConfirmed,
  currentLogoUrl,
  className
}: CompanyLogoFinderProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<LogoSearchResult | null>(null);
  const [customUrl, setCustomUrl] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const { toast } = useToast();

  // Auto-search when company name changes (if valid)
  useEffect(() => {
    if (companyName && companyName.trim().length > 2 && !currentLogoUrl) {
      handleSearch(false); // Don't force refresh on auto-search
    }
  }, [companyName]);

  // Reset image loading state after a timeout
  useEffect(() => {
    if (imageLoading) {
      const timeout = setTimeout(() => {
        setImageLoading(false);
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [imageLoading]);

  const handleSearch = async (forceRefresh: boolean = false) => {
    if (!companyName || companyName.trim().length < 2) {
      toast({
        title: "Company name too short",
        description: "Please enter at least 2 characters",
        variant: "destructive"
      });
      return;
    }

    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const res = await apiRequest("/api/company-logo/search", "POST", {
        companyName,
        forceRefresh
      });
      const response = await res.json();

      if (response.success && response.logo) {
        setSearchResult(response.logo);
        setShowCustomInput(false);
        setImageLoadError(false);
        setImageLoading(true);
      } else {
        setSearchResult(null);
        setImageLoadError(false);
        toast({
          title: "No logo found",
          description: "We couldn't find a logo for this company. You can upload a custom logo instead.",
          variant: "default"
        });
      }
    } catch (error) {
      console.error("Error searching for logo:", error);
      toast({
        title: "Search failed",
        description: "Failed to search for company logo. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  };

  const handleConfirmLogo = async (logoUrl: string) => {
    try {
      const res = await apiRequest("/api/company-logo/confirm", "POST", {
        companyName,
        logoUrl
      });
      const response = await res.json();

      if (response.success) {
        onLogoConfirmed(logoUrl);
        toast({
          title: "Logo confirmed",
          description: "Company logo has been saved successfully.",
          variant: "default"
        });
      }
    } catch (error) {
      console.error("Error confirming logo:", error);
      toast({
        title: "Error",
        description: "Failed to save logo. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleCustomUrlSubmit = () => {
    if (!customUrl || !customUrl.startsWith("http")) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid logo URL starting with http:// or https://",
        variant: "destructive"
      });
      return;
    }

    handleConfirmLogo(customUrl);
    setCustomUrl("");
    setShowCustomInput(false);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600 dark:text-green-400";
    if (confidence >= 0.6) return "text-yellow-600 dark:text-yellow-400";
    return "text-orange-600 dark:text-orange-400";
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return "High Match";
    if (confidence >= 0.6) return "Good Match";
    return "Possible Match";
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Company Logo
        </CardTitle>
        <CardDescription>
          Automatically finds your company logo from our database
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current logo display */}
        {currentLogoUrl && (
          <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center gap-4">
              <img
                src={currentLogoUrl}
                alt="Company logo"
                className="h-12 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              <div>
                <p className="text-sm font-medium">Current Logo</p>
                <p className="text-xs text-muted-foreground">Click refresh to search for a new one</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSearch(true)}
              disabled={isSearching}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Search controls */}
        {!currentLogoUrl && (
          <div className="flex gap-2">
            <Button
              onClick={() => handleSearch(false)}
              disabled={!companyName || isSearching}
              className="flex-1"
            >
              {isSearching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search for Logo
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowCustomInput(!showCustomInput)}
              disabled={isSearching}
            >
              <Upload className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Search result */}
        {searchResult && (
          <div className="border rounded-lg p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="space-y-2">
                {currentLogoUrl && (
                  <p className="text-sm font-medium mb-2">New Logo Found:</p>
                )}
                {!imageLoadError ? (
                  <div className="relative h-16 min-w-[128px]">
                    {imageLoading && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                      </div>
                    )}
                    <img
                      src={searchResult.thumbnailUrl || searchResult.url}
                      alt="Found logo"
                      className={`h-16 w-auto object-contain ${imageLoading ? 'opacity-0' : 'opacity-100'} transition-opacity`}
                      crossOrigin="anonymous"
                      onLoad={() => {
                        setImageLoading(false);
                        setImageLoadError(false);
                      }}
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // Try proxy if direct URL fails and we haven't tried proxy yet
                        if (!target.src.includes('/api/company-logo/proxy')) {
                          const originalUrl = searchResult.thumbnailUrl || searchResult.url;
                          target.src = `/api/company-logo/proxy?url=${encodeURIComponent(originalUrl)}`;
                        } else {
                          setImageLoadError(true);
                          setImageLoading(false);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="h-16 w-32 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
                    <Building2 className="h-8 w-8 text-gray-400" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={getConfidenceColor(searchResult.confidence)}>
                    {getConfidenceLabel(searchResult.confidence)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Source: {searchResult.source}
                  </span>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleSearch(true)}
                  disabled={isSearching}
                  className="flex-shrink-0"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    handleConfirmLogo(searchResult.url);
                    setSearchResult(null); // Clear search result after confirming
                  }}
                  className="bg-[#FFC72C] hover:bg-[#FFD54C] text-black flex-1 sm:flex-initial"
                >
                  <Check className="mr-1 h-4 w-4" />
                  {currentLogoUrl ? 'Replace Logo' : 'Use This Logo'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* No result message */}
        {hasSearched && !searchResult && !currentLogoUrl && !showCustomInput && (
          <Alert>
            <AlertDescription>
              No logo found automatically. You can try searching again or upload a custom logo.
            </AlertDescription>
          </Alert>
        )}

        {/* Custom URL input */}
        {showCustomInput && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Enter a direct URL to your company logo:</p>
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com/logo.png"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={isSearching}
              />
              <Button
                onClick={handleCustomUrlSubmit}
                disabled={!customUrl || isSearching}
                className="bg-[#FFC72C] hover:bg-[#FFD54C] text-black"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomUrl("");
                }}
                disabled={isSearching}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}