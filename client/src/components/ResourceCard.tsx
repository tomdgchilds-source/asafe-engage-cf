import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { activityService } from "@/services/activityService";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, File, FileText, Image, Archive, ExternalLink, Video, PlayCircle, Share2, Mail, MessageCircle } from "lucide-react";
import type { Resource } from "@shared/schema";

interface ResourceCardProps {
  resource: Resource;
  onDownload?: (resource: Resource) => void;
}


export function ResourceCard({ resource, onDownload }: ResourceCardProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  
  const handleViewDocument = async () => {
    if (onDownload) {
      onDownload(resource);
    }
    
    // Track resource view
    activityService.recordActivity({
      itemType: 'resource',
      itemId: resource.id,
      itemTitle: resource.title,
      itemCategory: resource.category,
      itemSubcategory: resource.resourceType,
      itemImage: resource.thumbnailUrl,
      metadata: {
        fileType: resource.fileType,
        downloadCount: resource.downloadCount
      }
    });
    
    // Open the document in a new tab/window for viewing
    if (resource.fileUrl) {
      window.open(resource.fileUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShare = (method: 'email' | 'whatsapp') => {
    // Use the actual resource URL (YouTube, PDF, etc.) instead of internal app link
    const resourceUrl = resource.fileUrl || '';
    const shareText = `Check out this A-SAFE resource: ${resource.title}`;
    
    if (method === 'email') {
      const subject = encodeURIComponent(`A-SAFE Resource: ${resource.title}`);
      const body = encodeURIComponent(`Hi,\n\nI thought you might find this A-SAFE resource helpful:\n\n${resource.title}\n${resource.description || ''}\n\nView it here: ${resourceUrl}\n\nBest regards`);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    } else if (method === 'whatsapp') {
      const text = encodeURIComponent(`${shareText}\n${resource.description || ''}\n\n${resourceUrl}`);
      window.open(`https://wa.me/?text=${text}`, '_blank');
    }
    
    setShowShareMenu(false);
  };

  const getFileIcon = (fileType: string) => {
    const type = fileType?.toLowerCase() || '';
    if (type === 'video') return Video;
    if (type.includes('pdf')) return FileText;
    if (type.includes('doc') || type.includes('docx')) return FileText;
    if (type.includes('xls') || type.includes('xlsx')) return File;
    if (type.includes('ppt') || type.includes('pptx')) return File;
    if (type.includes('zip') || type.includes('rar')) return Archive;
    if (type.includes('jpg') || type.includes('png') || type.includes('gif')) return Image;
    return File;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      'Impact Testing': 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
      'Traffic Barriers': 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
      'PAS 13 Standards': 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
      'Bollards': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
      'Rack Protection': 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
      'Gates': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
      'Column Protection': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
      'Pedestrian Barriers': 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
    };
    return colors[category] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const FileIcon = getFileIcon(resource.fileType || '');
  const isVideo = resource.fileType === 'video' || resource.fileUrl?.includes('youtube.com') || resource.fileUrl?.includes('youtu.be');

  return (
    <Card className="group hover:shadow-lg transition-all duration-300" data-testid={`resource-card-${resource.id}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <Badge className={getCategoryColor(resource.category)}>
              {resource.category}
            </Badge>
            {resource.resourceType && (
              <Badge variant="outline" className="ml-2 text-xs">
                {resource.resourceType === 'Video Guides' ? 'Video' : 'PDF'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
              <Download className="h-3 w-3 mr-1" />
              {resource.downloadCount || 0}
            </div>
            <DropdownMenu open={showShareMenu} onOpenChange={setShowShareMenu}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  data-testid={`share-button-${resource.id}`}
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
        </div>
        
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center gap-2 shrink-0">
            {resource.thumbnailUrl ? (
              <div className="relative group">
                <img 
                  src={resource.thumbnailUrl} 
                  alt={resource.title}
                  className="w-24 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
                  loading="lazy"
                  onError={(e) => {
                    const target = e.currentTarget;
                    // Try fallback thumbnail for YouTube videos
                    if (resource.thumbnailUrl?.includes('youtube.com')) {
                      const videoId = resource.fileUrl?.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n]+)/)?.[1];
                      if (videoId && !target.dataset.fallback) {
                        target.dataset.fallback = 'true';
                        target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                        return;
                      }
                    }
                    // If all fails, show the icon fallback
                    target.style.display = 'none';
                    target.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <div className="hidden p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                  <FileIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
                </div>
                {isVideo && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <PlayCircle className="h-10 w-10 text-white drop-shadow-lg opacity-90" />
                  </div>
                )}
                <div className="absolute -bottom-1 -right-1 p-1 bg-white dark:bg-gray-800 rounded-full shadow-sm">
                  <FileIcon className="h-3 w-3 text-gray-600 dark:text-gray-400" />
                </div>
              </div>
            ) : (
              <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <FileIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-1" data-testid={`resource-title-${resource.id}`}>
              {resource.title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="uppercase">{resource.fileType}</span>
              {resource.fileSize && (
                <>
                  <span>•</span>
                  <span>{formatFileSize(resource.fileSize)}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {resource.description && (
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 line-clamp-3" data-testid={`resource-description-${resource.id}`}>
            {resource.description}
          </p>
        )}

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {resource.fileSize && resource.fileSize > 0 && (
              <span>{formatFileSize(resource.fileSize)} • </span>
            )}
            Added {new Date(resource.createdAt || new Date()).toLocaleDateString()}
          </div>
          
          <Button
            onClick={handleViewDocument}
            className="bg-yellow-400 text-black hover:bg-yellow-500"
            size="sm"
            data-testid={`button-view-resource-${resource.id}`}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            {isVideo ? 'Watch Video' : 'View Document'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
