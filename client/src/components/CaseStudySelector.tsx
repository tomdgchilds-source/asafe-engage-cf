import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, Filter, FileText, Video, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type { CaseStudy } from "@shared/schema";

interface CaseStudySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedCaseStudies: string[];
  onSelectionChange: (selectedIds: string[]) => void;
}

export function CaseStudySelector({
  open,
  onOpenChange,
  selectedCaseStudies,
  onSelectionChange,
}: CaseStudySelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [industryFilter, setIndustryFilter] = useState<string>("all");
  const [contentTypeFilter, setContentTypeFilter] = useState<string>("all");
  const [localSelectedIds, setLocalSelectedIds] = useState<string[]>(selectedCaseStudies);

  // Fetch case studies
  const { data: caseStudies = [], isLoading } = useQuery<CaseStudy[]>({
    queryKey: ["/api/case-studies"],
  });

  // Get unique industries
  const industries = Array.from(new Set(caseStudies.map(cs => cs.industry).filter(Boolean)));

  // Filter case studies
  const filteredCaseStudies = caseStudies.filter(cs => {
    const matchesSearch = searchTerm === "" || 
      cs.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cs.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cs.company?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesIndustry = industryFilter === "all" || cs.industry === industryFilter;
    const matchesContentType = contentTypeFilter === "all" || cs.contentType === contentTypeFilter;
    
    return matchesSearch && matchesIndustry && matchesContentType && cs.isPublished;
  });

  // Update local selection when prop changes
  useEffect(() => {
    setLocalSelectedIds(selectedCaseStudies);
  }, [selectedCaseStudies]);

  const handleToggleSelection = (caseStudyId: string) => {
    setLocalSelectedIds(prev =>
      prev.includes(caseStudyId)
        ? prev.filter(id => id !== caseStudyId)
        : [...prev, caseStudyId]
    );
  };

  const handleApplySelection = () => {
    onSelectionChange(localSelectedIds);
    onOpenChange(false);
  };

  const handleClearSelection = () => {
    setLocalSelectedIds([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-5xl h-[90vh] sm:h-auto sm:max-h-[90vh] p-0 sm:p-6 flex flex-col">
        <div className="p-4 sm:p-0">
          <DialogHeader>
            <DialogTitle>Select Case Study References</DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Choose relevant case studies to include as references in your project. These will help demonstrate similar successful implementations.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 flex flex-col space-y-3 sm:space-y-4 px-4 sm:px-0 overflow-hidden">
          {/* Search and Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search case studies..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10 touch-manipulation"
                data-testid="input-case-study-search"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <Select value={industryFilter} onValueChange={setIndustryFilter}>
                <SelectTrigger 
                  className="h-10 touch-manipulation text-sm"
                  data-testid="select-industry-filter"
                >
                  <SelectValue placeholder="Industry" />
                </SelectTrigger>
                <SelectContent 
                  className="z-[100025] max-h-[200px]"
                  align="start"
                >
                  <SelectItem value="all" className="touch-manipulation py-2">All Industries</SelectItem>
                  {industries.map(industry => (
                    <SelectItem 
                      key={industry} 
                      value={industry}
                      className="touch-manipulation py-2"
                    >
                      {industry}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={contentTypeFilter} onValueChange={setContentTypeFilter}>
                <SelectTrigger 
                  className="h-10 touch-manipulation text-sm"
                  data-testid="select-content-type-filter"
                >
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent 
                  className="z-[100025] max-h-[200px]"
                  align="end"
                >
                  <SelectItem value="all" className="touch-manipulation py-2">All Types</SelectItem>
                  <SelectItem value="document" className="touch-manipulation py-2">Documents</SelectItem>
                  <SelectItem value="video" className="touch-manipulation py-2">Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Selection Info */}
          <div className="flex justify-between items-center">
            <div className="text-xs sm:text-sm text-gray-600">
              {localSelectedIds.length} case {localSelectedIds.length === 1 ? 'study' : 'studies'} selected
            </div>
            {localSelectedIds.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleClearSelection}
                className="text-xs sm:text-sm h-8"
                data-testid="button-clear-selection"
              >
                Clear Selection
              </Button>
            )}
          </div>

          {/* Case Studies Grid - Fixed for mobile scrolling */}
          <div className="flex-1 overflow-y-auto -webkit-overflow-scrolling-touch min-h-0">
            {isLoading ? (
              <div className="flex justify-center items-center h-full p-4">
                <div className="text-gray-500">Loading case studies...</div>
              </div>
            ) : filteredCaseStudies.length === 0 ? (
              <div className="flex justify-center items-center h-full p-4">
                <div className="text-gray-500">No case studies found</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 p-1 pb-4">
                {filteredCaseStudies.map(caseStudy => (
                  <Card 
                    key={caseStudy.id} 
                    className={`cursor-pointer transition-all touch-manipulation ${
                      localSelectedIds.includes(caseStudy.id) 
                        ? 'ring-2 ring-[#FFC72C] bg-[#FFC72C]/5' 
                        : 'hover:shadow-md active:bg-gray-50'
                    }`}
                    onClick={() => handleToggleSelection(caseStudy.id)}
                    data-testid={`card-case-study-${caseStudy.id}`}
                  >
                    <CardContent className="p-3 sm:p-4">
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          checked={localSelectedIds.includes(caseStudy.id)}
                          onCheckedChange={() => handleToggleSelection(caseStudy.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 h-5 w-5 touch-manipulation"
                          data-testid={`checkbox-case-study-${caseStudy.id}`}
                        />
                        
                        <div className="flex-1 space-y-2">
                          {/* Thumbnail and Title */}
                          <div className="flex items-start space-x-3">
                            {caseStudy.imageUrl ? (
                              <img
                                src={caseStudy.imageUrl}
                                alt={caseStudy.title}
                                className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded flex-shrink-0"
                              />
                            ) : (
                              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-200 rounded flex items-center justify-center flex-shrink-0">
                                {caseStudy.contentType === "video" ? (
                                  <Video className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400" />
                                ) : (
                                  <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400" />
                                )}
                              </div>
                            )}
                            
                            <div className="flex-1 min-w-0">
                              <h4 className="font-semibold text-xs sm:text-sm line-clamp-2">{caseStudy.title}</h4>
                              {caseStudy.company && (
                                <p className="text-xs text-gray-500 mt-1">{caseStudy.company}</p>
                              )}
                            </div>
                          </div>

                          {/* Description - Hidden on very small screens */}
                          <p className="text-xs text-gray-600 line-clamp-2 hidden sm:block">
                            {caseStudy.description}
                          </p>

                          {/* Badges */}
                          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                            <Badge variant="secondary" className="text-xs px-2 py-0.5">
                              {caseStudy.industry}
                            </Badge>
                            <Badge 
                              variant="outline" 
                              className="text-xs px-2 py-0.5"
                            >
                              {caseStudy.contentType === "video" ? (
                                <><Video className="h-3 w-3 mr-0.5 sm:mr-1" /> Video</>
                              ) : (
                                <><FileText className="h-3 w-3 mr-0.5 sm:mr-1" /> Doc</>
                              )}
                            </Badge>
                            {localSelectedIds.includes(caseStudy.id) && (
                              <CheckCircle className="h-4 w-4 text-[#FFC72C] ml-auto" />
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons - Fixed position at bottom for mobile */}
        <div className="p-4 sm:p-0 border-t">
          <div className="flex justify-end space-x-3">
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button 
              className="bg-[#FFC72C] hover:bg-[#FFD700] text-black"
              onClick={handleApplySelection}
              disabled={localSelectedIds.length === 0}
              data-testid="button-apply-selection"
            >
              Apply Selection ({localSelectedIds.length})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}