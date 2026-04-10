import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, Download, FileText, Shield, Wrench, ClipboardList, Video, Package, Building2, ChevronLeft } from "lucide-react";
import { InfoPopover } from "@/components/ui/info-popover";
import { ResourceCard } from "@/components/ResourceCard";
import { apiRequest } from "@/lib/queryClient";
import type { Resource } from "@shared/schema";

export default function Resources() {
  const [selectedResourceType, setSelectedResourceType] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const queryClient = useQueryClient();

  const { data: resources = [], isLoading, error } = useQuery<Resource[]>({
    queryKey: ["/api/resources", selectedResourceType],
    queryFn: async () => {
      const url = selectedResourceType 
        ? `/api/resources?resourceType=${selectedResourceType}` 
        : `/api/resources`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
  });

  const trackDownloadMutation = useMutation({
    mutationFn: async (resourceId: string) => {
      const response = await apiRequest(`/api/resources/${resourceId}/download`, "POST");
      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch resources to update download counts
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
    },
  });

  const resourceTypes = [
    { 
      value: "Technical Specifications", 
      label: "Product Datasheets", 
      icon: FileText,
      description: "Technical specifications and detailed product drawings",
      color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      count: resources?.filter((r: Resource) => r.resourceType === "Technical Specifications").length || 0
    },
    { 
      value: "Installation Guides", 
      label: "Installation Guides", 
      icon: FileText,
      description: "Step-by-step installation instructions and videos",
      color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
      count: resources?.filter((r: Resource) => r.resourceType === "Installation Guides").length || 0
    },
    { 
      value: "Video Guides", 
      label: "Videos & Tutorials", 
      icon: Video,
      description: "Impact tests and educational content",
      color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      count: resources?.filter((r: Resource) => r.resourceType === "Video Guides").length || 0
    },
  ];

  // Product categories based on actual database content
  const productCategories = [
    { value: "Impact Testing", label: "Impact Testing", icon: Shield, count: 49 },
    { value: "Traffic Barriers", label: "Traffic Barriers", icon: Package, count: 10 },
    { value: "PAS 13 Standards", label: "PAS 13 Standards", icon: Shield, count: 7 },
    { value: "Bollards", label: "Bollards", icon: Building2, count: 6 },
    { value: "Rack Protection", label: "Rack Protection", icon: Package, count: 6 },
    { value: "Gates", label: "Gates & Access", icon: Package, count: 5 },
    { value: "Column Protection", label: "Column Protection", icon: Building2, count: 4 },
    { value: "Pedestrian Barriers", label: "Pedestrian Safety", icon: Shield, count: 3 },
  ];

  const handleDownload = async (resource: Resource) => {
    // Track the download
    await trackDownloadMutation.mutateAsync(resource.id);
  };

  const filteredResources = resources.filter((resource: Resource) => {
    const matchesSearch = !searchTerm || 
      resource.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      resource.category?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !selectedCategory || resource.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-7xl">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <Download className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Error Loading Resources</h2>
              <p className="text-gray-600 dark:text-gray-300">
                Unable to load the resource center. Please try again later.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
      <div className="w-full px-2 sm:px-4">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-6">
          <div className="flex items-center justify-center gap-2 mb-2 sm:mb-3">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white" data-testid="resources-title">
              Resource Center
            </h1>
            <InfoPopover 
              content="Download installation guides, PAS 13 certifications, safety templates, and technical specifications. All resources are free for A-SAFE customers."
              iconClassName="h-5 w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 cursor-pointer"
            />
          </div>
        </div>

        {/* Search and Active Filters */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Search className="h-4 w-4 sm:h-5 sm:w-5" />
              Search Resources
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
                <Input
                  placeholder="Search by title, description, or category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 focus:ring-yellow-400 focus:border-yellow-400"
                  data-testid="search-resources"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedResourceType("");
                  setSelectedCategory("");
                }}
                className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                data-testid="clear-filters"
              >
                Clear All Filters
              </Button>
            </div>
            
            {/* Active filters display */}
            {(selectedResourceType || selectedCategory) && (
              <div className="flex flex-wrap gap-2 mt-4">
                {selectedResourceType && (
                  <Badge 
                    variant="secondary" 
                    className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 cursor-pointer"
                    onClick={() => setSelectedResourceType("")}
                  >
                    Type: {resourceTypes.find(t => t.value === selectedResourceType)?.label}
                    <span className="ml-1">×</span>
                  </Badge>
                )}
                {selectedCategory && (
                  <Badge 
                    variant="secondary" 
                    className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 cursor-pointer"
                    onClick={() => setSelectedCategory("")}
                  >
                    Category: {selectedCategory}
                    <span className="ml-1">×</span>
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resource Types and Categories - Show when no filters are active */}
        {!selectedResourceType && !selectedCategory && (
          <>
            {/* Resource Types */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Browse by Type</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {resourceTypes.map((resourceType) => {
                  const Icon = resourceType.icon;
                  
                  return (
                    <Card 
                      key={resourceType.value} 
                      className="hover:shadow-lg transition-all duration-200 cursor-pointer group bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      onClick={() => setSelectedResourceType(resourceType.value)}
                      data-testid={`resource-type-${resourceType.value}`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <Icon className="h-8 w-8 text-gray-700 dark:text-gray-300 group-hover:text-yellow-500 dark:group-hover:text-yellow-400 transition-colors" />
                          <Badge variant="secondary" className={resourceType.color}>
                            {resourceType.count}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-col gap-1">
                          <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">
                            {resourceType.label}
                          </h3>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            {resourceType.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>

            {/* Product Categories */}
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Browse by Product Category</h2>
              <div className="flex flex-wrap gap-2">
                {productCategories.map((category) => {
                  const categoryResources = resources?.filter((r: Resource) => r.category === category.value) || [];
                  
                  return (
                    <Button
                      key={category.value}
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedCategory(category.value)}
                      className="hover:bg-yellow-50 dark:hover:bg-yellow-900/20 hover:border-yellow-400 dark:hover:border-yellow-600"
                      data-testid={`category-${category.value}`}
                    >
                      {category.label}
                      <Badge variant="secondary" className="ml-2 bg-gray-100 dark:bg-gray-700">
                        {categoryResources.length}
                      </Badge>
                    </Button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* Back button when filtered */}
        {(selectedResourceType || selectedCategory) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSelectedResourceType("");
              setSelectedCategory("");
            }}
            className="mb-4"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to All Resources
          </Button>
        )}

        {/* Resources Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500 dark:text-gray-400">Loading resources...</p>
          </div>
        ) : filteredResources.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Resources ({filteredResources.length})
                </h2>
                {(searchTerm || selectedResourceType) && (
                  <div className="flex flex-wrap gap-2">
                    {searchTerm && (
                      <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-700">
                        Search: "{searchTerm}"
                      </Badge>
                    )}
                    {selectedResourceType && (
                      <Badge variant="secondary" className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200">
                        Type: {resourceTypes.find(t => t.value === selectedResourceType)?.label}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="resources-grid">
              {filteredResources.map((resource: Resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Download className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Resources Found</h3>
              <p className="text-gray-600 dark:text-gray-300 mb-4">
                {searchTerm || selectedResourceType
                  ? "No resources match your current search. Try adjusting your search criteria."
                  : "No resources are currently available. Please check back later."
                }
              </p>
              {(searchTerm || selectedResourceType) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedResourceType("");
                  }}
                  className="bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Clear Search
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Help Section */}
        <Card className="mt-12 bg-blue-50 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <FileText className="h-6 w-6 text-blue-600 mt-1 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <h3 className="font-bold text-gray-900 dark:text-white">Need Additional Resources?</h3>
                  <InfoPopover 
                    content="Can't find what you're looking for? Our technical support team can provide custom documentation, additional certifications, or specific installation guidance for your project."
                    iconClassName="h-4 w-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 cursor-pointer"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button asChild size="sm" className="bg-black text-white hover:bg-gray-800">
                    <a href="mailto:support@asafe.ae">Request Documents</a>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <a href="https://wa.me/971503881285" target="_blank" rel="noopener noreferrer">
                      WhatsApp Support
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Download Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
          <Card className="text-center bg-white dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {resources.reduce((total: number, r: Resource) => total + (r.downloadCount || 0), 0)}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">Total Downloads</p>
            </CardContent>
          </Card>
          
          <Card className="text-center bg-white dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {resources.filter((r: Resource) => r.resourceType === 'Installation Guides').length}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">Installation Guides</p>
            </CardContent>
          </Card>
          
          <Card className="text-center bg-white dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {resources.filter((r: Resource) => r.resourceType === 'Certificates').length}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">Certificates</p>
            </CardContent>
          </Card>
          
          <Card className="text-center bg-white dark:bg-gray-800">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                {resources.filter((r: Resource) => r.resourceType === 'Technical Specifications').length}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-300">Technical Specs</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
