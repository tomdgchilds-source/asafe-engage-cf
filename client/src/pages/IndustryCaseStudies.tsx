import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Download, ExternalLink, MapPin, Phone, Mail, Star, Search, FileText, File, Video, Info } from "lucide-react";
import { Link } from "wouter";
import { CaseStudyCard } from "@/components/CaseStudyCard";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { CaseStudy } from "@shared/schema";

// Industry display names mapping (URL slug → human label)
const industryDisplayNames: Record<string, string> = {
  manufacturing: "Manufacturing",
  logistics: "Logistics & Warehousing",
  "warehousing-distribution": "Warehousing & Distribution",
  pharmaceuticals: "Pharmaceuticals",
  "food-drink": "Food & Beverage",
  automotive: "Automotive",
  airports: "Airports & Aviation",
  "health-hygiene": "Health & Hygiene",
  "recycling-packaging": "Recycling & Packaging",
  "chemical-and-power": "Chemical & Power",
  "car-parks": "Car Parks",
  "parking-lot": "Car Parks",
  "cold-storage": "Cold Storage",
};

// Industry-specific tags mapping — kept broad so we match both
// DB industry strings (e.g. "Warehousing & Logistics") and URL slugs.
const industryTags: Record<string, string[]> = {
  manufacturing: ["Manufacturing", "Industrial", "Factory", "Production"],
  logistics: ["Logistics", "Warehousing", "Distribution", "Supply Chain"],
  "warehousing-distribution": ["Warehousing", "Logistics", "Distribution"],
  pharmaceuticals: ["Pharmaceuticals", "Healthcare", "Medical", "Laboratory"],
  "food-drink": ["Food", "Beverage", "Drink"],
  automotive: ["Automotive", "Vehicle", "Transportation", "Assembly"],
  airports: ["Airport", "Aviation", "Airside"],
  "health-hygiene": ["Health", "Hygiene", "Pharmaceutical"],
  "recycling-packaging": ["Recycling", "Packaging", "Waste"],
  "chemical-and-power": ["Chemical", "Power", "Utilities"],
  "car-parks": ["Car Park", "Parking"],
  "parking-lot": ["Car Park", "Parking"],
  "cold-storage": ["Cold Storage", "Frozen", "Chilled"],
};

export default function IndustryCaseStudies() {
  const params = useParams();
  const industry = params.industry as string;
  const [searchTerm, setSearchTerm] = useState("");
  const [contentType, setContentType] = useState(""); // "document", "video", or ""
  
  const displayName = industryDisplayNames[industry] || industry;
  const relevantTags = industryTags[industry] || [];

  // Fetch case studies with filters
  const { data: caseStudies, isLoading, error } = useQuery<CaseStudy[]>({
    queryKey: ["/api/case-studies", contentType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (contentType) params.append('contentType', contentType);
      const url = `/api/case-studies${params.toString() ? '?' + params.toString() : ''}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`${res.status}: ${res.statusText}`);
      }
      return res.json();
    },
    retry: false,
  });

  // Filter case studies by industry tags and search term
  const filteredCaseStudies = Array.isArray(caseStudies) ? caseStudies.filter((study: CaseStudy) => {
    // Industry filtering — compare URL slug AND mapped tags against multiple study fields
    const slugTokens = industry ? industry.split("-") : [];
    const allTokens = [...relevantTags.map((t) => t.toLowerCase()), ...slugTokens];

    const haystack = [
      study.industry || "",
      study.title || "",
      study.description || "",
      ...((study as any).tags || []),
    ]
      .join(" ")
      .toLowerCase();

    const matchesIndustry = allTokens.length === 0 || allTokens.some((tok) => haystack.includes(tok.toLowerCase()));

    // Search term filtering
    const matchesSearch = !searchTerm ||
      study.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      study.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      study.company?.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesIndustry && matchesSearch;
  }) : [];

  const handleDownload = async (caseStudy: CaseStudy) => {
    if (caseStudy.pdfUrl) {
      window.open(caseStudy.pdfUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-400 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading case studies...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white text-black shadow-lg sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center h-16 w-full">
            {/* Logo */}
            <div className="flex items-center flex-shrink-0">
              <img 
                src="/asafe-logo.jpeg" 
                alt="A-SAFE Logo" 
                className="h-10 w-auto"
              />
            </div>

            {/* Centered ENGAGE Title */}
            <div className="flex-1 flex justify-center">
              <h1 className="text-2xl font-bold leading-tight text-gray-600 ml-4">ENGAGE</h1>
            </div>

            {/* Sign In Button */}
            <div className="flex items-center">
              <Button 
                asChild 
                className="bg-yellow-400 text-black hover:bg-yellow-500 whitespace-nowrap"
                data-testid="login-button"
              >
                <a href="/api/login">Sign In</a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Back to Landing */}
        <div className="mb-6">
          <Button 
            asChild 
            variant="outline"
            className="text-gray-600 hover:text-black"
          >
            <Link href="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <h1 className="text-3xl font-bold text-black" data-testid="industry-case-studies-title">
              {displayName} Case Studies
            </h1>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer" />
                </TooltipTrigger>
                <TooltipContent className="max-w-[90vw] w-max">
                  <p>Discover how A-SAFE solutions transform workplace safety in the {displayName.toLowerCase()} industry. Learn from real-world implementations and their measurable outcomes.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Filter {displayName} Case Studies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder={`Search ${displayName.toLowerCase()} case studies...`}
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

            {/* Industry Badge */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Industry Focus</h3>
              <Badge variant="default" className="bg-yellow-400 text-black">
                {displayName}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Case Studies Grid */}
        {error ? (
          <Card>
            <CardContent className="p-6 text-center">
              <FileText className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-black mb-2">Error Loading Case Studies</h2>
              <p className="text-gray-600">
                Unable to load case studies. Please try again later.
              </p>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-500">Loading {displayName.toLowerCase()} case studies...</p>
          </div>
        ) : filteredCaseStudies.length > 0 ? (
          <>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <h2 className="text-xl font-bold text-black">
                  {displayName} Case Studies ({filteredCaseStudies.length})
                </h2>
                {(searchTerm || contentType) && (
                  <div className="flex gap-2">
                    {searchTerm && (
                      <Badge variant="secondary">
                        Search: "{searchTerm}"
                      </Badge>
                    )}
                    {contentType && (
                      <Badge variant="secondary">
                        Type: {contentType === "document" ? "Documents" : "Videos"}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8" data-testid="case-studies-grid">
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
              <h3 className="text-xl font-bold text-black mb-2">No {displayName} Case Studies Found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || contentType
                  ? `No ${displayName.toLowerCase()} case studies match your current filters. Try adjusting your search criteria.`
                  : `We're continuously adding new case studies for the ${displayName.toLowerCase()} industry. Please check back later.`
                }
              </p>
              {(searchTerm || contentType) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchTerm("");
                    setContentType("");
                  }}
                  className="mb-4"
                >
                  Clear All Filters
                </Button>
              )}
              <Button asChild className="bg-yellow-400 text-black hover:bg-yellow-500">
                <a href="/api/login">Sign In to Access Full Portal</a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Call to Action */}
        <div className="bg-black text-white rounded-lg p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Ready to Transform Your Workplace Safety?</h2>
          <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
            Join thousands of companies in the {displayName.toLowerCase()} industry who trust A-SAFE to protect their people, assets, and operations.
          </p>
          <div className="flex flex-col md:flex-row gap-4 justify-center">
            <Button 
              asChild 
              size="lg"
              className="bg-yellow-400 text-black hover:bg-yellow-500"
            >
              <a href="/api/login">Access Full Portal</a>
            </Button>
            <Button 
              asChild
              variant="outline" 
              size="lg"
              className="border-white text-black bg-white hover:bg-gray-100"
            >
              <a href="mailto:support@asafe.ae">Contact Our Experts</a>
            </Button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-600 text-white py-8 mt-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="font-bold mb-4 text-yellow-400">A-SAFE Middle East</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-yellow-400" />
                  <div>
                    <a 
                      href="https://www.google.com/maps/dir/?api=1&destination=Office+220,+Dubai+South+Business+Park,+Dubai,+UAE"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-yellow-300 transition-colors cursor-pointer"
                    >
                      <p>Office 220, Dubai South Business Park</p>
                      <p>Dubai, UAE</p>
                    </a>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-yellow-400" />
                  <a 
                    href="tel:+97148842422"
                    className="hover:text-yellow-300 transition-colors cursor-pointer"
                  >
                    <p>+971 4884 2422</p>
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-yellow-400" />
                  <a 
                    href="mailto:support@asafe.ae"
                    className="hover:text-yellow-300 transition-colors cursor-pointer"
                  >
                    <p>support@asafe.ae</p>
                  </a>
                </div>
                
                {/* Google Maps Rating */}
                <div className="mt-4 pt-3 border-t border-gray-500">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                      ))}
                    </div>
                    <span className="text-sm font-medium">5.0</span>
                    <span className="text-xs text-gray-300">Written Testimonials</span>
                  </div>
                  <a 
                    href="https://maps.app.goo.gl/55wf4FPkAe2NfKDHA?g_st=ipc" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-yellow-400 hover:text-yellow-300 transition-colors text-sm"
                  >
                    <span>Visit us on Google Maps</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Industries</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/industry-case-studies/manufacturing" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Manufacturing
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/logistics" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Logistics & Warehousing
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/pharmaceuticals" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Pharmaceuticals
                  </Link>
                </li>
                <li>
                  <Link href="/industry-case-studies/automotive" className="hover:text-yellow-300 transition-colors cursor-pointer">
                    Automotive
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-500 mt-8 pt-8 text-center text-sm text-gray-300">
            <p>&copy; 2025 A-SAFE Middle East. All rights reserved. | Pioneering Workplace Safety</p>
          </div>
        </div>
      </footer>
    </div>
  );
}