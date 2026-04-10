import React, { useState, useRef } from 'react';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Upload, RotateCcw } from 'lucide-react';
import { InfoPopover } from '@/components/ui/info-popover';
import { useToast } from '@/hooks/use-toast';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import defaultAvatar from '@/assets/default-avatar.svg';

interface ProfileImageUploadProps {
  currentImage?: string;
  onImageUpdate: (imageUrl: string) => void;
}

export function ProfileImageUpload({ currentImage, onImageUpdate }: ProfileImageUploadProps) {
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string>('');
  const [crop, setCrop] = useState<Crop>({
    unit: '%',
    width: 80,
    height: 80,
    x: 10,
    y: 10,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(1);
  const [rotate, setRotate] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setIsModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    
    // Calculate optimal crop size - use smaller dimension to ensure crop fits
    const minDimension = Math.min(width, height);
    const cropSize = Math.min(minDimension * 0.8, 300); // 80% of smaller dimension, max 300px
    
    const cropWidthInPercent = (cropSize / width) * 100;
    const cropHeightInPercent = (cropSize / height) * 100;
    
    // Center the crop area perfectly
    const crop = {
      unit: '%' as const,
      width: cropWidthInPercent,
      height: cropHeightInPercent,
      x: (100 - cropWidthInPercent) / 2,
      y: (100 - cropHeightInPercent) / 2,
    };
    setCrop(crop);
  };

  const getCroppedImg = (
    image: HTMLImageElement,
    crop: PixelCrop,
    scale: number,
    rotate: number
  ): Promise<Blob> => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('No 2d context');
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;
    const cropWidth = crop.width * scaleX;
    const cropHeight = crop.height * scaleY;

    // Use high resolution canvas for crisp quality
    const pixelRatio = window.devicePixelRatio || 1;
    const targetSize = 400;
    canvas.width = targetSize;
    canvas.height = targetSize;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Clear canvas with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate centered positioning
    const canvasCenter = targetSize / 2;

    ctx.save();
    
    // Apply transformations from center
    ctx.translate(canvasCenter, canvasCenter);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.scale(scale, scale);
    
    // Draw image centered
    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      -targetSize / 2,
      -targetSize / 2,
      targetSize,
      targetSize
    );

    ctx.restore();

    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
      }, 'image/png'); // Use PNG for lossless quality
    });
  };

  const handleSaveImage = async () => {
    if (!imageRef.current || !completedCrop) {
      return;
    }

    try {
      const croppedImageBlob = await getCroppedImg(
        imageRef.current,
        completedCrop,
        scale,
        rotate
      );

      const formData = new FormData();
      formData.append('image', croppedImageBlob, 'profile.jpg');

      const uploadResponse = await fetch('/api/auth/profile/image', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (uploadResponse.ok) {
        const { imageUrl } = await uploadResponse.json();
        haptic.upload();
        onImageUpdate(imageUrl);
        setIsModalOpen(false);
        toast({
          title: 'Success',
          description: 'Profile picture updated successfully.',
        });
      } else {
        throw new Error('Failed to upload image');
      }
    } catch (error) {
      console.error('Image upload error:', error);
      haptic.error();
      toast({
        title: 'Error',
        description: 'Failed to upload profile picture.',
        variant: 'destructive',
      });
    }
  };

  const resetCrop = () => {
    setScale(1);
    setRotate(0);
    setCrop({
      unit: '%',
      width: 80,
      height: 80,
      x: 10,
      y: 10,
    });
  };

  return (
    <>
      <div className="relative">
        <Avatar className="w-72 h-72">
          <AvatarImage 
            src={currentImage && currentImage !== '/default-avatar.svg' ? currentImage : ''} 
            alt="Profile picture"
            className="object-cover"
          />
          <AvatarFallback>
            <img src={defaultAvatar} alt="Default avatar" className="w-full h-full object-cover" />
          </AvatarFallback>
        </Avatar>
        <label 
          htmlFor="profile-image-upload" 
          className="absolute bottom-2 right-2 bg-yellow-400 hover:bg-yellow-500 text-black p-3 rounded-full cursor-pointer transition-colors"
          data-testid="button-upload-image"
        >
          <Camera className="h-6 w-6" />
        </label>
        <input
          id="profile-image-upload"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="input-profile-image"
        />
      </div>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crop Profile Picture</DialogTitle>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Adjust crop settings for the perfect picture</span>
              <InfoPopover
                content="Adjust the crop area, scale, and rotation to get the perfect profile picture."
                iconClassName="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-pointer"
              />
            </div>
          </DialogHeader>
          
          <div className="space-y-4 pb-4">
            {imageSrc && (
              <div className="flex flex-col items-center space-y-4">
                <ReactCrop
                  crop={crop}
                  onChange={setCrop}
                  onComplete={setCompletedCrop}
                  aspect={1}
                  circularCrop
                  className="max-w-full"
                >
                  <img
                    ref={imageRef}
                    src={imageSrc}
                    alt="Crop preview"
                    style={{
                      transform: `scale(${scale}) rotate(${rotate}deg)`,
                    }}
                    onLoad={onImageLoad}
                    className="max-w-full max-h-64"
                  />
                </ReactCrop>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-lg">
                  <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium">Scale</label>
                    <input
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.1"
                      value={scale}
                      onChange={(e) => setScale(Number(e.target.value))}
                      className="w-full"
                    />
                    <span className="text-xs text-gray-500 text-center">{Math.round(scale * 100)}%</span>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    <label className="text-sm font-medium">Rotate</label>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="1"
                      value={rotate}
                      onChange={(e) => setRotate(Number(e.target.value))}
                      className="w-full"
                    />
                    <span className="text-xs text-gray-500 text-center">{rotate}°</span>
                  </div>
                </div>

                <div className="flex justify-center pt-2">
                  <Button
                    onClick={resetCrop}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveImage} className="bg-yellow-400 text-black hover:bg-yellow-500">
              <Upload className="h-4 w-4 mr-2" />
              Save Picture
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}