import React, { useState, useRef, useCallback } from 'react';
import { Upload, Film, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '../common/Button';
import { Card } from '../common/Card';
import { uploadVideo } from '../../services/api';
import { Video, UploadProgress } from '../../types';
import { formatFileSize } from '../../utils/formatters';
import { cn } from '../../utils/cn';

interface VideoUploadProps {
  onUploadComplete: (video: Video) => void;
  onUploadError?: (error: string) => void;
  onUseDefaultVideo?: () => void;
}

export const VideoUpload: React.FC<VideoUploadProps> = ({
  onUploadComplete,
  onUploadError,
  onUseDefaultVideo,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptedFormats = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
  const maxFileSize = 500 * 1024 * 1024; // 500MB

  const validateFile = (file: File): string | null => {
    if (!acceptedFormats.includes(file.type)) {
      return 'Invalid file format. Please upload MP4, WebM, MOV, or AVI files.';
    }
    if (file.size > maxFileSize) {
      return `File size exceeds ${formatFileSize(maxFileSize)}. Please upload a smaller file.`;
    }
    return null;
  };

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      const error = validateFile(file);
      if (error) {
        setErrorMessage(error);
        setUploadStatus('error');
        onUploadError?.(error);
      } else {
        setSelectedFile(file);
        setUploadStatus('idle');
        setErrorMessage('');
      }
    }
  }, [onUploadError, validateFile]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const error = validateFile(file);
      if (error) {
        setErrorMessage(error);
        setUploadStatus('error');
        onUploadError?.(error);
      } else {
        setSelectedFile(file);
        setUploadStatus('idle');
        setErrorMessage('');
      }
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus('uploading');
    setErrorMessage('');

    try {
      const response = await uploadVideo(selectedFile, (progress) => {
        setUploadProgress({
          loaded: (progress / 100) * selectedFile.size,
          total: selectedFile.size,
          percentage: progress,
        });
      });

      if (response.success && response.data) {
        setUploadStatus('success');
        onUploadComplete(response.data);

        // Reset after success
        setTimeout(() => {
          setSelectedFile(null);
          setUploadProgress(null);
          setUploadStatus('idle');
        }, 2000);
      } else {
        setUploadStatus('error');
        const error = response.error || 'Upload failed';
        setErrorMessage(error);
        onUploadError?.(error);
      }
    } catch (error) {
      setUploadStatus('error');
      const errorMsg = error instanceof Error ? error.message : 'Upload failed';
      setErrorMessage(errorMsg);
      onUploadError?.(errorMsg);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setUploadProgress(null);
    setUploadStatus('idle');
    setErrorMessage('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card className="w-full mx-auto rounded-lg">
      <div className="space-y-4">
        {selectedFile && uploadStatus === 'idle' && (
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="w-4 h-4" />}
              onClick={handleCancel}
            >
              Clear
            </Button>
          </div>
        )}

        {!selectedFile ? (
          <div
            className={cn(
              'relative border-2 border-dashed rounded-lg p-8 sm:p-12 lg:p-16 text-center transition-all duration-200',
              isDragging
                ? 'border-notion-accent-blue bg-notion-surface-blue'
                : 'border-notion-border hover:border-notion-accent-blue bg-notion-bg-secondary'
            )}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptedFormats.join(',')}
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="flex flex-col items-center gap-4 sm:gap-6 lg:gap-8">
              <div className={cn(
                'w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full flex items-center justify-center',
                isDragging ? 'bg-notion-accent-blue' : 'bg-notion-bg-tertiary'
              )}>
                <Upload className={cn(
                  'w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12',
                  isDragging ? 'text-white' : 'text-notion-text-secondary'
                )} />
              </div>

              <div className="space-y-2 sm:space-y-3 lg:space-y-4">
                <p className="text-lg sm:text-xl lg:text-2xl text-notion-text-primary font-bold">
                  {isDragging ? 'Drop video here' : 'Drag and drop your video here'}
                </p>
                <p className="text-base sm:text-lg lg:text-xl text-notion-text-tertiary font-semibold">
                  or
                </p>
                <Button variant="secondary" onClick={handleBrowseClick} className="font-bold text-sm sm:text-base lg:text-lg px-4 py-2 sm:px-6 sm:py-2.5 lg:px-8 lg:py-3">
                  Browse Files
                </Button>
              </div>

              <div className="text-xs sm:text-sm lg:text-base text-notion-text-tertiary space-y-1 sm:space-y-1.5 lg:space-y-2 font-semibold">
                <p>Supported formats: MP4, WebM, MOV, AVI</p>
                <p>Maximum file size: {formatFileSize(maxFileSize)}</p>
              </div>

              {onUseDefaultVideo && (
                <div className="pt-4 border-t border-notion-border">
                  <p className="text-sm text-notion-text-secondary font-semibold mb-2">
                    Or try it out with a <Button variant="secondary" onClick={onUseDefaultVideo} className="font-bold ">
                      Use Sample Video
                    </Button>
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 sm:space-y-5 lg:space-y-6">
            {/* File Info */}
            <div className="flex items-start gap-3 sm:gap-4 p-4 sm:p-5 lg:p-6 bg-notion-bg-secondary rounded-xl">
              <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 rounded-xl bg-notion-accent-blue flex items-center justify-center flex-shrink-0">
                <Film className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm sm:text-base lg:text-lg font-bold text-notion-text-primary truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs sm:text-sm lg:text-base text-notion-text-tertiary font-semibold">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              {uploadStatus === 'success' && (
                <CheckCircle className="w-5 h-5 text-notion-accent-green flex-shrink-0" />
              )}
              {uploadStatus === 'error' && (
                <AlertCircle className="w-5 h-5 text-notion-accent-red flex-shrink-0" />
              )}
            </div>

            {/* Progress Bar */}
            {uploadStatus === 'uploading' && uploadProgress && (
              <div className="space-y-2 sm:space-y-2.5 lg:space-y-3">
                <div className="flex items-center justify-between text-sm sm:text-base">
                  <span className="text-notion-text-secondary font-semibold">Uploading...</span>
                  <span className="text-notion-text-primary font-bold">
                    {uploadProgress.percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 sm:h-2.5 lg:h-3 bg-notion-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-notion-accent-blue transition-all duration-300"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Success Message */}
            {uploadStatus === 'success' && (
              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base text-notion-accent-green p-3 sm:p-4 lg:p-5 bg-notion-surface-green rounded-xl font-semibold">
                <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
                <span>Video uploaded successfully!</span>
              </div>
            )}

            {/* Error Message */}
            {uploadStatus === 'error' && errorMessage && (
              <div className="flex items-start gap-2 sm:gap-3 text-sm sm:text-base text-notion-accent-red p-3 sm:p-4 lg:p-5 bg-notion-surface-red rounded-xl font-semibold">
                <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            {uploadStatus === 'idle' && (
              <div className="flex items-center gap-3 sm:gap-4">
                <Button
                  variant="primary"
                  onClick={handleUpload}
                  className="flex-1 font-bold text-sm sm:text-base lg:text-lg px-4 py-2 sm:px-6 sm:py-2.5 lg:px-8 lg:py-3"
                >
                  Upload Video
                </Button>
                <Button variant="secondary" onClick={handleCancel} className="font-bold text-sm sm:text-base lg:text-lg px-4 py-2 sm:px-6 sm:py-2.5 lg:px-8 lg:py-3">
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};
