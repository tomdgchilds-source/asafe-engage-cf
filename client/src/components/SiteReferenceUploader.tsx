import { useState } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import Webcam from "@uppy/webcam";
import AwsS3 from "@uppy/aws-s3";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { Camera, Upload, MapPin, FileImage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle, CheckCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface SiteReferenceImage {
  url: string;
  caption: string;
  uploadedAt: Date;
  type: 'site' | 'location' | 'measurement';
}

interface SiteReferenceUploaderProps {
  productName: string;
  onImagesUploaded: (images: SiteReferenceImage[]) => void;
  existingImages?: SiteReferenceImage[];
  installationLocation?: string;
  onLocationChange?: (location: string) => void;
}

export function SiteReferenceUploader({
  productName,
  onImagesUploaded,
  existingImages = [],
  installationLocation = "",
  onLocationChange
}: SiteReferenceUploaderProps) {
  const [uploadedImages, setUploadedImages] = useState<SiteReferenceImage[]>(existingImages);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [imageCaption, setImageCaption] = useState("");
  const [imageType, setImageType] = useState<'site' | 'location' | 'measurement'>('site');
  const [location, setLocation] = useState(installationLocation);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  // Create separate Uppy instance to avoid conflicts
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles: 5,
        maxFileSize: 10485760, // 10MB per file
        allowedFileTypes: ['image/*', '.jpg', '.jpeg', '.png', '.webp']
      },
      autoProceed: false,
      allowMultipleUploadBatches: true, // Allow multiple batches
    })
      .use(Webcam, {
        modes: ['picture'],
        mirror: false,
        // Note: showVideoSourcePicker is not a valid option, camera selection is automatic
      })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: async (file) => {
          try {
            const response = await fetch('/api/objects/upload', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ fileType: file.type })
            });
            
            if (!response.ok) {
              throw new Error('Failed to get upload URL');
            }
            
            const { uploadURL } = await response.json();
            return {
              method: 'PUT' as const,
              url: uploadURL
            };
          } catch (error) {
            console.error('Error getting upload parameters:', error);
            throw error;
          }
        },
      })
      .on("complete", async (result) => {
        if (result.successful && result.successful.length > 0) {
          const newImages: SiteReferenceImage[] = [];
          const totalFiles = result.successful.length;
          let processedFiles = 0;
          let failedFiles = 0;
          
          // Process all uploaded files
          await Promise.all(result.successful.map(async (file, index) => {
            try {
              const response = await fetch('/api/site-references', {
                method: 'PUT',
                credentials: 'include',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ 
                  imageUrl: file.uploadURL,
                  productName,
                  caption: `${imageCaption || productName} - Image ${index + 1}`,
                  type: imageType
                })
              });
              
              if (response.ok) {
                const { objectPath } = await response.json();
                const newImage: SiteReferenceImage = {
                  url: objectPath,
                  caption: `${imageCaption || productName} - Image ${index + 1}`,
                  uploadedAt: new Date(),
                  type: imageType
                };
                newImages.push(newImage);
                processedFiles++;
              } else {
                failedFiles++;
                console.error(`Failed to save image ${index + 1}`);
              }
            } catch (error) {
              failedFiles++;
              console.error(`Error saving image reference ${index + 1}:`, error);
            }
          }));
          
          if (newImages.length > 0) {
            const allImages = [...uploadedImages, ...newImages];
            setUploadedImages(allImages);
            onImagesUploaded(allImages);
            
            // Show appropriate message based on results
            if (failedFiles > 0) {
              toast({
                title: "Partial Upload Success",
                description: `${processedFiles} of ${totalFiles} images uploaded successfully`,
                variant: "default",
              });
            } else {
              toast({
                title: "Images Uploaded",
                description: `All ${newImages.length} image${newImages.length !== 1 ? 's' : ''} uploaded successfully`,
              });
            }
          } else if (failedFiles > 0) {
            toast({
              title: "Upload Failed",
              description: "Failed to upload images. Please try again.",
              variant: "destructive",
            });
          }
          
          setShowUploadModal(false);
          setImageCaption("");
          // Reset Uppy for next upload batch
          uppy.cancelAll();
        }
      })
  );

  // Fallback upload handler for when modal doesn't work
  const handleFallbackUpload = async (files: FileList, type: 'site' | 'measurement') => {
    const newImages: SiteReferenceImage[] = [];
    
    for (const file of Array.from(files)) {
      try {
        // Get upload URL
        const response = await fetch('/api/objects/upload', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileType: file.type })
        });
        
        if (!response.ok) {
          throw new Error('Failed to get upload URL');
        }
        
        const { uploadURL } = await response.json();
        
        // Upload file directly
        const uploadResult = await fetch(uploadURL, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type
          }
        });

        if (!uploadResult.ok) {
          throw new Error(`Failed to upload ${file.name}`);
        }

        // Save reference
        const saveResponse = await fetch('/api/site-references', {
          method: 'PUT',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            imageUrl: uploadURL,
            productName,
            caption: `${productName} - ${type === 'measurement' ? 'Measurement' : 'Site Photo'}`,
            type: type === 'measurement' ? 'measurement' : 'site'
          })
        });
        
        if (saveResponse.ok) {
          const { objectPath } = await saveResponse.json();
          const newImage: SiteReferenceImage = {
            url: objectPath,
            caption: `${productName} - ${type === 'measurement' ? 'Measurement' : 'Site Photo'}`,
            uploadedAt: new Date(),
            type: type === 'measurement' ? 'measurement' : 'site'
          };
          newImages.push(newImage);
        }
      } catch (error) {
        console.error(`Error uploading file:`, error);
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive",
        });
      }
    }
    
    if (newImages.length > 0) {
      const allImages = [...uploadedImages, ...newImages];
      setUploadedImages(allImages);
      onImagesUploaded(allImages);
      
      toast({
        title: "Images uploaded",
        description: `${newImages.length} ${type === 'measurement' ? 'measurement' : 'site'} photo${newImages.length > 1 ? 's' : ''} uploaded successfully`,
      });
    }
  };

  const removeImage = (index: number) => {
    const newImages = uploadedImages.filter((_, i) => i !== index);
    setUploadedImages(newImages);
    onImagesUploaded(newImages);
    
    toast({
      title: "Image removed",
      description: "Site reference image removed from this item",
    });
  };

  const updateLocation = (newLocation: string) => {
    setLocation(newLocation);
    if (onLocationChange) {
      onLocationChange(newLocation);
    }
  };

  const getTypeLabel = (type: 'site' | 'location' | 'measurement') => {
    switch (type) {
      case 'site': return 'Site Photo';
      case 'location': return 'Location Context';
      case 'measurement': return 'Measurement Reference';
      default: return 'Photo';
    }
  };

  const getTypeIcon = (type: 'site' | 'location' | 'measurement') => {
    switch (type) {
      case 'site': return <Camera className="h-3 w-3" />;
      case 'location': return <MapPin className="h-3 w-3" />;
      case 'measurement': return <FileImage className="h-3 w-3" />;
      default: return <Camera className="h-3 w-3" />;
    }
  };

  // Check if running on mobile device
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <div className="space-y-4">
      {/* Site Reference Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Site Reference Images</h4>
          <p className="text-xs text-muted-foreground">
            Add photos of the installation location for accurate quoting
          </p>
        </div>
        {uploadedImages.length > 0 && (
          <Badge variant="secondary" className="ml-2">
            <CheckCircle className="h-3 w-3 mr-1" />
            {uploadedImages.length} image{uploadedImages.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {/* Installation Location Input */}
      <div className="space-y-2">
        <Label htmlFor="installation-location">Installation Location</Label>
        <Textarea
          id="installation-location"
          placeholder="e.g., Loading dock area, north entrance, warehouse zone B3..."
          value={location}
          onChange={(e) => updateLocation(e.target.value)}
          className="min-h-[60px] resize-none"
        />
        <p className="text-xs text-muted-foreground">
          Describe where this {productName} will be installed
        </p>
      </div>

      {/* Upload Buttons with fallback file input */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setImageType('site');
            setImageCaption(`${productName} installation site`);
            try {
              setShowUploadModal(true);
              // Small delay to ensure modal is ready
              setTimeout(() => {
                const modal = document.querySelector('.uppy-Dashboard');
                if (!modal) {
                  console.warn('Uppy modal not found, using fallback');
                  document.getElementById('fallback-site-input')?.click();
                  setShowUploadModal(false);
                }
              }, 100);
            } catch (error) {
              console.error('Error opening modal:', error);
              document.getElementById('fallback-site-input')?.click();
            }
          }}
          disabled={isUploading}
          className="flex-1 min-w-[140px]"
        >
          <Camera className="h-4 w-4 mr-2" />
          {isUploading ? 'Uploading...' : (isMobile ? 'Take Photo' : 'Add Site Photo')}
        </Button>
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setImageType('measurement');
            setImageCaption(`Measurements for ${productName}`);
            try {
              setShowUploadModal(true);
              setTimeout(() => {
                const modal = document.querySelector('.uppy-Dashboard');
                if (!modal) {
                  console.warn('Uppy modal not found, using fallback');
                  document.getElementById('fallback-measurement-input')?.click();
                  setShowUploadModal(false);
                }
              }, 100);
            } catch (error) {
              console.error('Error opening modal:', error);
              document.getElementById('fallback-measurement-input')?.click();
            }
          }}
          disabled={isUploading}
          className="flex-1 min-w-[140px]"
        >
          <FileImage className="h-4 w-4 mr-2" />
          {isUploading ? 'Uploading...' : 'Add Measurements'}
        </Button>
      </div>

      {/* Hidden fallback file inputs */}
      <input
        id="fallback-site-input"
        type="file"
        accept="image/*"
        multiple
        capture={isMobile ? "environment" : undefined}
        onChange={async (e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            setIsUploading(true);
            await handleFallbackUpload(files, 'site');
            setIsUploading(false);
          }
        }}
        className="hidden"
      />
      <input
        id="fallback-measurement-input"
        type="file"
        accept="image/*"
        multiple
        capture={isMobile ? "environment" : undefined}
        onChange={async (e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            setIsUploading(true);
            await handleFallbackUpload(files, 'measurement');
            setIsUploading(false);
          }
        }}
        className="hidden"
      />

      {/* Mobile-specific hint */}
      {isMobile && uploadedImages.length === 0 && (
        <Alert className="border-[#FFC72C]/20 bg-[#FFC72C]/5">
          <Camera className="h-4 w-4 text-[#FFC72C]" />
          <AlertDescription className="text-xs">
            <strong>Tip:</strong> Take photos directly from your device camera for best results. 
            Include the area where products will be installed, any obstacles, and measurement references.
          </AlertDescription>
        </Alert>
      )}

      {/* Uploaded Images Preview */}
      {uploadedImages.length > 0 && (
        <div className="space-y-2">
          <Separator />
          <div className="grid grid-cols-2 gap-2">
            {uploadedImages.map((image, index) => (
              <Card key={index} className="relative overflow-hidden group">
                <div className="aspect-video bg-muted">
                  <img
                    src={image.url}
                    alt={image.caption}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-1 left-1">
                    <Badge variant="secondary" className="text-xs">
                      {getTypeIcon(image.type)}
                      <span className="ml-1">{getTypeLabel(image.type)}</span>
                    </Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Remove image"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {image.caption && (
                  <div className="p-2">
                    <p className="text-xs text-muted-foreground truncate">{image.caption}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Upload Modal - Fixed with proper z-index and visibility */}
      {showUploadModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowUploadModal(false)} />
          <div className="relative z-[10000] w-full max-w-4xl max-h-[90vh]">
            <DashboardModal
              uppy={uppy}
              open={showUploadModal}
              onRequestClose={() => setShowUploadModal(false)}
              proudlyDisplayPoweredByUppy={false}
              note={`Uploading ${getTypeLabel(imageType).toLowerCase()} for ${productName}`}
              doneButtonHandler={() => setShowUploadModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}