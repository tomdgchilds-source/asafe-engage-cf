import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, FileText, Info, Video, File } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CaseStudyCard } from "@/components/CaseStudyCard";
import type { CaseStudy } from "@shared/schema";

export default function CaseStudies() {
  const [selectedIndustry, setSelectedIndustry] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [contentType, setContentType] = useState(""); // "document", "video", or ""

  const { data: caseStudies, isLoading, error } = useQuery<CaseStudy[]>({
    queryKey: ["/api/case-studies", selectedIndustry || null, contentType || null],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedIndustry) params.append('industry', selectedIndustry);
      if (contentType) params.append('contentType', contentType);
      const url = `/api/case-studies${params.toString() ? '?' + params.toString() : ''}`;
      console.log('Fetching case studies from:', url);
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        console.error('API request failed:', res.status, res.statusText);
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      console.log('Received case studies:', data.length);
      return data;
    },
  });

  const industries = [
    { value: "automotive", label: "Automotive", color: "bg-red-100 text-red-800" },
    { value: "food-and-drink", label: "Food & Beverage", color: "bg-orange-100 text-orange-800" },
    { value: "warehousing-distribution", label: "Warehousing & Distribution", color: "bg-green-100 text-green-800" },
    { value: "manufacturing", label: "Manufacturing", color: "bg-blue-100 text-blue-800" },
    { value: "airports", label: "Airports", color: "bg-indigo-100 text-indigo-800" },
    { value: "parking-lot", label: "Parking", color: "bg-purple-100 text-purple-800" },
  ];

  const handleDownload = async (caseStudy: CaseStudy) => {
    if (caseStudy.pdfUrl) {
      window.open(caseStudy.pdfUrl, '_blank');
    }
  };

  const filteredCaseStudies = caseStudies?.filter((study: CaseStudy) => {
    const matchesSearch = !searchTerm || 
      study.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      study.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      study.company?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  }) || [];

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <FileText className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-black mb-2">Error Loading Case Studies</h2>
              <p className="text-gray-600">
                Unable to load case studies. Please try again later.
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
            <h1 className="text-2xl sm:text-3xl font-bold text-black" data-testid="case-studies-title">
              Industry Case Studies
            </h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[90vw] w-max">
                  <p>Discover how A-SAFE solutions transform workplace safety across industries. Learn from real-world implementations and their measurable outcomes.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Search className="h-4 w-4 sm:h-5 sm:w-5" />
              Search & Filter Case Studies
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-col md:flex-row gap-3 mb-4 sm:mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search case studies..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 focus:ring-yellow-400 focus:border-yellow-400"
                  data-testid="search-case-studies"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedIndustry("");
                  setContentType("");
                }}
                data-testid="clear-filters"
              >
                Clear Filters
              </Button>
            </div>

            {/* Content Type Filter Buttons */}
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Content Type</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={!contentType ? "default" : "outline"}
                  size="sm"
                  onClick={() => setContentType("")}
                  className={!contentType ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}
                  data-testid="filter-all-content"
                >
                  <File className="h-4 w-4 mr-1" />
                  All Content
                </Button>
                <Button
                  variant={contentType === "document" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setContentType("document")}
                  className={contentType === "document" ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}
                  data-testid="filter-documents"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Documents
                </Button>
                <Button
                  variant={contentType === "video" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setContentType("video")}
                  className={contentType === "video" ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}
                  data-testid="filter-videos"
                >
                  <Video className="h-4 w-4 mr-1" />
                  Videos
                </Button>
              </div>
            </div>

            {/* Industry Filter Buttons */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Industry</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={!selectedIndustry ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedIndustry("")}
                  className={!selectedIndustry ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}
                  data-testid="filter-all-industries"
                >
                  All Industries
                </Button>
                {industries.map((industry) => (
                  <Button
                    key={industry.value}
                    variant={selectedIndustry === industry.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedIndustry(industry.value)}
                    className={selectedIndustry === industry.value ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}
                    data-testid={`filter-industry-${industry.value}`}
                  >
                    {industry.label}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Case Studies Grid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500">Loading case studies...</p>
          </div>
        ) : filteredCaseStudies.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-black">
                  Case Studies ({filteredCaseStudies.length})
                </h2>
                {(searchTerm || selectedIndustry) && (
                  <div className="flex gap-2">
                    {searchTerm && (
                      <Badge variant="secondary">
                        Search: "{searchTerm}"
                      </Badge>
                    )}
                    {selectedIndustry && (
                      <Badge variant="secondary">
                        Industry: {industries.find(i => i.value === selectedIndustry)?.label}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-5" data-testid="case-studies-grid">
              {filteredCaseStudies.map((caseStudy: CaseStudy) => (
                <CaseStudyCard
                  key={caseStudy.id}
                  caseStudy={caseStudy}
                  onDownload={handleDownload}
                />
              ))}
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-black mb-2">No Case Studies Found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || selectedIndustry
                  ? "No case studies match your current filters. Try adjusting your search criteria."
                  : "No case studies are currently available. Please check back later."
                }
              </p>
              {(searchTerm || selectedIndustry) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setSelectedIndustry("");
                  }}
                >
                  Clear All Filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Call to Action */}
        <Card className="mt-12 bg-yellow-50 border-yellow-200">
          <CardContent className="p-8 text-center">
            <div className="flex items-center justify-center gap-2 mb-6">
              <h3 className="text-xl font-bold text-black">Ready to Transform Your Workplace Safety?</h3>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[90vw] w-max">
                    <p>See how A-SAFE solutions can deliver similar results in your facility. Contact our team for a personalized consultation and site assessment.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild className="bg-black text-white hover:bg-gray-800">
                <a href="mailto:support@asafe.ae">Request Consultation</a>
              </Button>
              <Button asChild variant="outline">
                <a href="https://wa.me/971503881285" target="_blank" rel="noopener noreferrer">
                  WhatsApp Us
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
