import { useState } from "react";
import type { ReactNode } from "react";
import Uppy from "@uppy/core";
import { DashboardModal } from "@uppy/react";
import "@uppy/core/dist/style.min.css";
import "@uppy/dashboard/dist/style.min.css";
import "@uppy/webcam/dist/style.min.css";
import AwsS3 from "@uppy/aws-s3";
import Webcam from "@uppy/webcam";
import type { UploadResult } from "@uppy/core";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  allowedFileTypes?: string[];
  onGetUploadParameters: () => Promise<{
    method: "PUT";
    url: string;
  }>;
  onComplete?: (
    result: UploadResult<Record<string, unknown>, Record<string, unknown>>
  ) => void;
  buttonClassName?: string;
  children: ReactNode;
}

/**
 * A file upload component that renders as a button and provides a modal interface for
 * file management.
 * 
 * Features:
 * - Renders as a customizable button that opens a file upload modal
 * - Provides a modal interface for:
 *   - File selection
 *   - File preview
 *   - Upload progress tracking
 *   - Upload status display
 * 
 * The component uses Uppy under the hood to handle all file upload functionality.
 * All file management features are automatically handled by the Uppy dashboard modal.
 * 
 * @param props - Component props
 * @param props.maxNumberOfFiles - Maximum number of files allowed to be uploaded
 *   (default: 1)
 * @param props.maxFileSize - Maximum file size in bytes (default: 10MB)
 * @param props.onGetUploadParameters - Function to get upload parameters (method and URL).
 *   Typically used to fetch a presigned URL from the backend server for direct-to-S3
 *   uploads.
 * @param props.onComplete - Callback function called when upload is complete. Typically
 *   used to make post-upload API calls to update server state and set object ACL
 *   policies.
 * @param props.buttonClassName - Optional CSS class name for the button
 * @param props.children - Content to be rendered inside the button
 */
export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760, // 10MB default
  allowedFileTypes = ['image/*'], // Default to images only
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const [showModal, setShowModal] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const [uppy] = useState(() =>
    new Uppy({
      restrictions: {
        maxNumberOfFiles,
        maxFileSize,
        allowedFileTypes,
      },
      autoProceed: false,
      allowMultipleUploadBatches: false,
    })
      .use(Webcam, {
        modes: ['picture'],
        mirror: false,
        showVideoSourceDropdown: false,
        countdown: false,
        preferredImageMimeType: 'image/jpeg',
        mobileNativeCamera: true   // Use native camera on mobile
      })
      .use(AwsS3, {
        shouldUseMultipart: false,
        getUploadParameters: async (file) => {
          try {
            const result = await onGetUploadParameters();
            return {
              ...result,
              headers: {
                'Content-Type': file.type || 'application/octet-stream',
              },
            };
          } catch (error) {
            console.error('Failed to get upload parameters:', error);
            throw error;
          }
        },
      })
      .on("complete", (result) => {
        console.log("Upload completed:", result);
        haptic.upload();
        onComplete?.(result);
        setShowModal(false);
      })
      .on("upload-success", (file, response) => {
        console.log("File uploaded successfully:", file?.name);
        toast({
          title: "Upload Successful",
          description: `${file?.name || 'File'} uploaded successfully!`,
        });
      })
      .on("restriction-failed", (file, error) => {
        console.warn("Upload restriction failed:", error);
        toast({
          title: "Upload Error", 
          description: `File restriction failed: ${error.message}`,
          variant: "destructive",
        });
      })
      .on("error", (error) => {
        console.error("Upload error:", error);
        haptic.error();
        toast({
          title: "Upload Failed",
          description: "There was an error uploading your file. Please try again.",
          variant: "destructive",
        });
        // Handle camera-related errors with detailed mobile guidance
        if (error.message && (error.message.includes('camera') || error.message.includes('permission'))) {
          setCameraPermissionDenied(true);
          toast({
            title: "Camera Access Required",
            description: "Camera permissions were denied. Please enable camera access in your browser settings.",
            variant: "destructive",
          });
        }
      })
  );

  const requestCameraPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Permission granted, close the stream immediately
      stream.getTracks().forEach(track => track.stop());
      setCameraPermissionDenied(false);
      setShowModal(true);
      toast({
        title: "Camera Access Granted",
        description: "You can now use the camera to take photos.",
      });
    } catch (error) {
      console.error("Camera permission error:", error);
      setCameraPermissionDenied(true);
      toast({
        title: "Camera Access Denied",
        description: "Please allow camera access in your browser settings and try again.",
        variant: "destructive",
      });
    }
  };

  const handleOpenModal = () => {
    if (cameraPermissionDenied) {
      requestCameraPermission();
    } else {
      setShowModal(true);
    }
  };

  return (
    <div>
      <Button onClick={handleOpenModal} className={buttonClassName}>
        {children}
      </Button>

      {cameraPermissionDenied && (
        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800 mb-2">
            Camera access is required to take photos. To enable:
          </p>
          <ol className="text-xs text-yellow-700 list-decimal list-inside space-y-1">
            <li>Look for a camera icon in your browser's address bar</li>
            <li>Click it and select "Allow" for camera permissions</li>
            <li>Or go to your browser settings and enable camera for this site</li>
            <li>Refresh the page if needed</li>
          </ol>
          <Button 
            onClick={requestCameraPermission}
            size="sm"
            className="mt-2 bg-yellow-600 hover:bg-yellow-700"
          >
            Request Camera Access
          </Button>
        </div>
      )}

      <DashboardModal
        uppy={uppy}
        open={showModal}
        onRequestClose={() => setShowModal(false)}
        proudlyDisplayPoweredByUppy={false}
        showLinkToFileUploadResult={false}
        showProgressDetails={true}
        hideUploadButton={false}
        hideRetryButton={true}
        hidePauseResumeButton={true}
        hideCancelButton={false}
        showRemoveButtonAfterComplete={true}
        showSelectedFiles={true}
        waitForThumbnailsBeforeUpload={false}
        plugins={['Webcam']}
        theme="light"
        disableStatusBar={false}
        disableInformer={false}
        disableThumbnailGenerator={false}
        closeModalOnClickOutside={true}
        animateOpenClose={true}
        browserBackButtonClose={true}
        note="Click 'Browse files' to select an image or use your camera to take a photo"
        metaFields={[]}
        fileManagerSelectionType="files"
        doneButtonHandler={() => setShowModal(false)}
      />
    </div>
  );
}