import { useState, useRef } from "react";
import { ObjectUploader } from "@/components/ObjectUploader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { InfoPopover } from "@/components/ui/info-popover";
import { Input } from "@/components/ui/input";
import { 
  Upload, 
  FileImage, 
  FileText, 
  Trash2, 
  Edit3, 
  PlusSquare, 
  Pencil, 
  Check, 
  X 
} from "lucide-react";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { UploadResult, UppyFile } from "@uppy/core";
import type { LayoutDrawing } from "@shared/schema";

interface LayoutDrawingUploadProps {
  company?: string;
  location?: string;
  projectName?: string;
  onDrawingSelect?: (drawing: LayoutDrawing) => void;
}

export function LayoutDrawingUpload({ 
  company, 
  location, 
  projectName, 
  onDrawingSelect 
}: LayoutDrawingUploadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFileName, setPendingFileName] = useState<string>("");
  const [uploadPreview, setUploadPreview] = useState<{ name: string; type: string } | null>(null);
  const [editingDrawingId, setEditingDrawingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");

  const { data: drawings = [], isLoading } = useQuery<LayoutDrawing[]>({
    queryKey: ["/api/layout-drawings"],
  });

  const createDrawingMutation = useMutation({
    mutationFn: async (drawingData: {
      projectName?: string;
      company?: string; 
      location?: string;
      fileName: string;
      fileUrl: string;
      fileType: string;
      thumbnailUrl?: string;
    }) => {
      return apiRequest("/api/layout-drawings", "POST", drawingData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({
        title: "Layout Drawing Uploaded",
        description: "Your layout drawing has been saved successfully.",
      });
      setIsUploading(false);
    },
    onError: () => {
      toast({
        title: "Upload Failed",
        description: "Failed to save layout drawing. Please try again.",
        variant: "destructive",
      });
      setIsUploading(false);
    },
  });

  const deleteDrawingMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/layout-drawings/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({
        title: "Drawing Deleted",
        description: "Layout drawing has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete Failed",
        description: "Failed to delete layout drawing.",
        variant: "destructive",
      });
    },
  });

  const updateDrawingNameMutation = useMutation({
    mutationFn: async ({ id, fileName }: { id: string; fileName: string }) => {
      return apiRequest(`/api/layout-drawings/${id}`, "PATCH", { fileName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({
        title: "Drawing Renamed",
        description: "Drawing name has been updated successfully.",
      });
      setEditingDrawingId(null);
      setEditingName("");
    },
    onError: () => {
      toast({
        title: "Rename Failed",
        description: "Failed to rename drawing. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createBlankCanvasMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/layout-drawings/blank-canvas", "POST", {
        projectName,
        company,
        location,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/layout-drawings"] });
      toast({
        title: "Blank Canvas Created",
        description: "A blank canvas has been created for your markup.",
      });
    },
    onError: () => {
      toast({
        title: "Creation Failed",
        description: "Failed to create blank canvas. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Store the access path for later use - using useRef to avoid state issues with async uploads
  const currentAccessPathRef = useRef<string | null>(null);

  const handleGetUploadParameters = async () => {
    try {
      const response = await fetch("/api/objects/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      
      if (!response.ok) {
        throw new Error(`Upload endpoint failed: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('Upload parameters:', data);
      
      if (!data.uploadURL || !data.accessPath) {
        throw new Error('No upload URL or access path received from server');
      }

      // Store the access path for use when upload completes
      currentAccessPathRef.current = data.accessPath;
      console.log('Stored access path:', data.accessPath);
      
      return {
        method: "PUT" as const,
        url: data.uploadURL,
      };
    } catch (error) {
      console.error('Error getting upload parameters:', error);
      toast({
        title: "Upload Error",
        description: "Failed to get upload URL. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const handleUploadComplete = (result: UploadResult<Record<string, unknown>, Record<string, unknown>>) => {
    console.log('Upload result:', result);
    if (result.successful && result.successful.length > 0) {
      const uploadedFile = result.successful[0];
      console.log('Uploaded file:', uploadedFile);
      
      // Use the access path that goes through authenticated backend instead of direct URL
      const fileUrl = currentAccessPathRef.current;
      // Use custom name if provided, otherwise use original filename
      const fileName = pendingFileName.trim() || uploadedFile.name || 'Unknown file';
      const fileType = uploadedFile.name?.toLowerCase().endsWith('.pdf') ? 'pdf' : 'image';
      
      console.log('File URL:', fileUrl, 'File name:', fileName);
      
      if (fileUrl && fileName) {
        // Create layout drawing record
        createDrawingMutation.mutate({
          projectName,
          company,
          location,
          fileName,
          fileUrl,
          fileType,
        });
        
        // Clear the access path and pending states
        currentAccessPathRef.current = null;
        setPendingFileName("");
        setUploadPreview(null);
      } else {
        console.error('Missing file URL or name:', { fileUrl, fileName });
        console.error('Access path ref:', currentAccessPathRef.current);
        toast({
          title: "Upload Error",
          description: "Failed to get file access path. Please try again.",
          variant: "destructive",
        });
      }
    }
  };

  // Helper functions for inline editing
  const startEditingDrawing = (drawing: LayoutDrawing) => {
    setEditingDrawingId(drawing.id);
    setEditingName(drawing.fileName || "");
  };

  const cancelEditing = () => {
    setEditingDrawingId(null);
    setEditingName("");
  };

  const saveDrawingName = (drawingId: string) => {
    if (editingName.trim() && editingName.trim() !== "") {
      updateDrawingNameMutation.mutate({ 
        id: drawingId, 
        fileName: editingName.trim() 
      });
    } else {
      cancelEditing();
    }
  };

  const getFileIcon = (fileType: string) => {
    if (fileType === 'pdf') return FileText;
    if (fileType === 'canvas') return PlusSquare;
    return FileImage;
  };

  const getFileTypeDisplay = (fileType: string) => {
    if (fileType === 'canvas') return 'CANVAS';
    return fileType.toUpperCase();
  };


  return (
    <Card className="border-purple-200 bg-purple-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-purple-900">
          <Upload className="h-5 w-5" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span>Drawing Markup</span>
              <InfoPopover
                content="Upload your site layout drawing to mark barrier placement areas. Our tool detects corners and calculates run lengths automatically, making it easier to plan your safety barrier installation."
                iconClassName="h-4 w-4 text-purple-600 hover:text-purple-800"
              />
            </div>
            <span className="text-sm text-purple-600 font-normal">(optional)</span>
          </div>
          <Badge variant="secondary" className="text-xs">PDF or JPG</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Upload Preview with Editable Filename */}
        {uploadPreview && (
          <div className="p-4 bg-purple-100 rounded-lg border-2 border-purple-300 space-y-3">
            <div className="flex items-center gap-2">
              <FileImage className="h-5 w-5 text-purple-600" />
              <span className="text-sm font-medium text-purple-900">File Ready to Upload</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={pendingFileName}
                onChange={(e) => setPendingFileName(e.target.value)}
                placeholder={uploadPreview.name || "Click to rename your drawing"}
                className="flex-1 bg-white border-purple-300 focus:border-purple-500 focus:ring-purple-500"
                autoFocus
              />
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Pencil className="h-4 w-4 text-purple-600" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Edit filename before uploading</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-xs text-purple-600">
              Original: {uploadPreview.name}
            </p>
          </div>
        )}

        {/* Upload Button - Note: Upload preview will show after file is selected in the modal */}
        <ObjectUploader
          maxNumberOfFiles={1}
          maxFileSize={100 * 1024 * 1024} // 100MB for high-quality drawings
          allowedFileTypes={['image/*', 'application/pdf']} // Allow images and PDF files
          onGetUploadParameters={handleGetUploadParameters}
          onComplete={handleUploadComplete}
          buttonClassName="w-full bg-purple-600 hover:bg-purple-700 text-white"
        >
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span>Upload Layout Drawing</span>
          </div>
        </ObjectUploader>

        {/* Add Blank Canvas Button */}
        <Button
          onClick={() => createBlankCanvasMutation.mutate()}
          disabled={createBlankCanvasMutation.isPending}
          className="w-full bg-white hover:bg-gray-50 text-purple-700 border-2 border-purple-300"
          variant="outline"
        >
          <div className="flex items-center gap-2">
            <PlusSquare className="h-4 w-4" />
            <span>Add Blank Canvas</span>
          </div>
        </Button>

        {/* Existing Drawings */}
        {drawings.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-purple-900">Uploaded Drawings</h4>
            <div className="space-y-2">
              {drawings.map((drawing) => {
                const FileIcon = getFileIcon(drawing.fileType);
                const isEditing = editingDrawingId === drawing.id;
                
                return (
                  <div
                    key={drawing.id}
                    className="flex items-center p-3 bg-white rounded-lg border border-purple-200 hover:bg-purple-25 transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
                      <div className="flex-shrink-0">
                        <FileIcon className="h-6 w-6 text-purple-600" />
                      </div>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  saveDrawingName(drawing.id);
                                } else if (e.key === 'Escape') {
                                  cancelEditing();
                                }
                              }}
                              className="flex-1 h-7 text-xs border-purple-300 focus:border-purple-500 focus:ring-purple-500"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                              onClick={() => saveDrawingName(drawing.id)}
                              disabled={updateDrawingNameMutation.isPending}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                              onClick={cancelEditing}
                              disabled={updateDrawingNameMutation.isPending}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p 
                                    className="text-xs font-medium text-gray-900 truncate max-w-full cursor-pointer hover:text-purple-600 transition-colors"
                                    onClick={() => startEditingDrawing(drawing)}
                                  >
                                    {drawing.fileName}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Click to rename</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 text-purple-600 hover:text-purple-700"
                                    onClick={() => startEditingDrawing(drawing)}
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Rename drawing</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                        )}
                        <p className="text-xs text-gray-500 truncate">
                          {getFileTypeDisplay(drawing.fileType)} • {drawing.createdAt ? new Date(drawing.createdAt).toLocaleDateString() : 'Unknown date'}
                        </p>
                        {drawing.company && (
                          <p className="text-xs text-blue-600 truncate max-w-full">
                            {drawing.company} {drawing.location && ` • ${drawing.location}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDrawingSelect?.(drawing)}
                        className="text-purple-600 border-purple-300 hover:bg-purple-50 p-1"
                        data-testid={`button-edit-drawing-${drawing.id}`}
                      >
                        <Edit3 className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => deleteDrawingMutation.mutate(drawing.id)}
                        disabled={deleteDrawingMutation.isPending}
                        className="text-red-600 border-red-300 hover:bg-red-50 p-1"
                        data-testid={`button-delete-drawing-${drawing.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-4">
            <div className="animate-pulse text-purple-600">Loading drawings...</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}