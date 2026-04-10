import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Building, Play, FileText, Share2, Mail, MessageCircle } from "lucide-react";
import type { CaseStudy } from "@shared/schema";

interface CaseStudyCardProps {
  caseStudy: CaseStudy;
  onDownload?: (caseStudy: CaseStudy) => void;
}

export function CaseStudyCard({ caseStudy, onDownload }: CaseStudyCardProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  
  const handleDownload = () => {
    if (onDownload) {
      onDownload(caseStudy);
    }
  };

  const handleShare = (method: 'email' | 'whatsapp') => {
    // Use the actual download URL or video URL for sharing
    const shareUrl = (caseStudy as any).videoUrl || caseStudy.pdfUrl || '';
    const shareText = `Check out this A-SAFE case study: ${caseStudy.title}`;
    
    if (method === 'email') {
      const subject = encodeURIComponent(`A-SAFE Case Study: ${caseStudy.title}`);
      const body = encodeURIComponent(`Hi,\n\nI thought you might find this A-SAFE case study interesting:\n\n${caseStudy.title}\nCompany: ${caseStudy.company || 'N/A'}\n${caseStudy.description || ''}\n\nView it here: ${shareUrl}\n\nBest regards`);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    } else if (method === 'whatsapp') {
      const text = encodeURIComponent(`${shareText}\nCompany: ${caseStudy.company || 'N/A'}\n${caseStudy.description || ''}\n\n${shareUrl}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
    
    setShowShareMenu(false);
  };

  const getIndustryColor = (industry: string) => {
    const colors: Record<string, string> = {
      automotive: "bg-red-100 text-red-800",
      "Food & Beverage": "bg-orange-100 text-orange-800",
      "Warehousing & Logistics": "bg-green-100 text-green-800",
      manufacturing: "bg-blue-100 text-blue-800",
      airports: "bg-indigo-100 text-indigo-800",
      "parking-lot": "bg-purple-100 text-purple-800",
      "recycling-packaging": "bg-teal-100 text-teal-800",
      multiple: "bg-yellow-100 text-yellow-800",
    };
    // Use case-insensitive lookup
    const lowerIndustry = industry.toLowerCase();
    for (const [key, value] of Object.entries(colors)) {
      if (key.toLowerCase() === lowerIndustry) {
        return value;
      }
    }
    return "bg-gray-100 text-gray-800";
  };

  return (
    <Card className="group hover:shadow-lg transition-all duration-300" data-testid={`case-study-card-${caseStudy.id}`}>
      <CardHeader className="pb-3">
        {/* Content Type Header with Icon and Share Button */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {(caseStudy as any).contentType === 'video' ? (
              <div className="flex items-center gap-1 text-purple-600">
                <Play className="h-4 w-4" />
                <span className="text-xs font-medium">Video Case Study</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-blue-600">
                <FileText className="h-4 w-4" />
                <span className="text-xs font-medium">Document Case Study</span>
              </div>
            )}
          </div>
          <DropdownMenu open={showShareMenu} onOpenChange={setShowShareMenu}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                data-testid={`share-case-study-${caseStudy.id}`}
              >
                <Share2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleShare('email')}>
                <Mail className="h-4 w-4 mr-2" />
                Share via Email
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleShare('whatsapp')}>
                <MessageCircle className="h-4 w-4 mr-2" />
                Share via WhatsApp
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Image or Video Thumbnail */}
        {caseStudy.imageUrl && (
          <div className="aspect-video rounded-lg overflow-hidden mb-3 relative">
            <img
              src={caseStudy.imageUrl}
              alt={caseStudy.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              data-testid={`case-study-image-${caseStudy.id}`}
              onError={(e) => {
                console.error('Failed to load image:', caseStudy.imageUrl);
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {(caseStudy as any).contentType === 'video' && (
              <div 
                className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center cursor-pointer hover:bg-opacity-50 transition-all duration-200"
                onClick={() => {
                  if ((caseStudy as any).videoUrl) {
                    window.open((caseStudy as any).videoUrl, '_blank');
                  }
                }}
                data-testid={`video-thumbnail-play-${caseStudy.id}`}
              >
                <div className="bg-white bg-opacity-90 rounded-full p-3 hover:bg-opacity-100 transition-all duration-200 hover:scale-110">
                  <Play className="h-6 w-6 text-gray-800" />
                </div>
              </div>
            )}
          </div>
        )}
        
        <div className="flex items-start justify-between mb-2">
          <Badge className={getIndustryColor(caseStudy.industry)}>
            {caseStudy.industry}
          </Badge>
        </div>
        
        <h3 className="font-bold text-black text-lg leading-tight" data-testid={`case-study-title-${caseStudy.id}`}>
          {caseStudy.title}
        </h3>
        
        {caseStudy.company && (
          <div className="flex items-center text-sm text-gray-600 mt-1">
            <Building className="h-4 w-4 mr-1" />
            {caseStudy.company}
          </div>
        )}
      </CardHeader>
      
      <CardContent className="pt-0">
        <p className="text-gray-600 text-sm mb-4 line-clamp-3" data-testid={`case-study-description-${caseStudy.id}`}>
          {caseStudy.description}
        </p>

        {caseStudy.challenge && (
          <div className="mb-3">
            <h4 className="font-semibold text-sm text-gray-800 mb-1">Challenge:</h4>
            <p className="text-xs text-gray-600 line-clamp-2">{caseStudy.challenge}</p>
          </div>
        )}

        {caseStudy.solution && (
          <div className="mb-3">
            <h4 className="font-semibold text-sm text-gray-800 mb-1">Solution:</h4>
            <p className="text-xs text-gray-600 line-clamp-2">{caseStudy.solution}</p>
          </div>
        )}

        {caseStudy.outcomes && Array.isArray(caseStudy.outcomes) && caseStudy.outcomes.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold text-sm text-gray-800 mb-2">Key Outcomes:</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              {(caseStudy.outcomes as string[]).slice(0, 2).map((outcome, index) => (
                <li key={index} className="flex items-center">
                  <span className="w-1 h-1 bg-green-500 rounded-full mr-2"></span>
                  <span>{outcome}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-xs text-gray-500">
            {caseStudy.createdAt ? new Date(caseStudy.createdAt).toLocaleDateString() : ''}
          </div>
          
          {/* Download/View Button */}
          {(caseStudy as any).contentType === 'video' ? (
            <Button
              onClick={() => {
                if ((caseStudy as any).videoUrl) {
                  window.open((caseStudy as any).videoUrl, '_blank');
                }
              }}
              variant="outline"
              size="sm"
              className="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200"
              data-testid={`watch-video-${caseStudy.id}`}
            >
              <Play className="h-3 w-3 mr-1" />
              Watch Video
            </Button>
          ) : (
            caseStudy.pdfUrl && (
              <Button
                onClick={handleDownload}
                variant="outline"
                size="sm"
                className="hover:bg-yellow-50"
                data-testid={`button-download-case-study-${caseStudy.id}`}
              >
                <Download className="h-3 w-3 mr-1" />
                Download PDF
              </Button>
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
