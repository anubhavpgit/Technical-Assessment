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
    <Card className="w-full max-w-2xl mx-auto rounded-xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-notion-text-primary">Upload Video</h3>
          {selectedFile && uploadStatus === 'idle' && (
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="w-4 h-4" />}
              onClick={handleCancel}
            >
              Clear
            </Button>
          )}
        </div>

        {!selectedFile ? (
          <div
            className={cn(
              'relative border-2 border-dashed rounded-notion p-12 text-center transition-all duration-200',
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

            <div className="flex flex-col items-center gap-4">
              <div className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center',
                isDragging ? 'bg-notion-accent-blue' : 'bg-notion-bg-tertiary'
              )}>
                <Upload className={cn(
                  'w-8 h-8',
                  isDragging ? 'text-white' : 'text-notion-text-secondary'
                )} />
              </div>

              <div className="space-y-2">
                <p className="text-notion-text-primary font-bold">
                  {isDragging ? 'Drop video here' : 'Drag and drop your video here'}
                </p>
                <p className="text-sm text-notion-text-tertiary font-semibold">
                  or
                </p>
                <Button variant="secondary" onClick={handleBrowseClick} className="font-bold">
                  Browse Files
                </Button>
              </div>

              <div className="text-xs text-notion-text-tertiary space-y-1 font-semibold">
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
          <div className="space-y-4">
            {/* File Info */}
            <div className="flex items-start gap-3 p-4 bg-notion-bg-secondary rounded-xl">
              <div className="w-10 h-10 rounded-xl bg-notion-accent-blue flex items-center justify-center flex-shrink-0">
                <Film className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-notion-text-primary truncate">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-notion-text-tertiary font-semibold">
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
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-notion-text-secondary font-semibold">Uploading...</span>
                  <span className="text-notion-text-primary font-bold">
                    {uploadProgress.percentage.toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 bg-notion-bg-tertiary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-notion-accent-blue transition-all duration-300"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}

            {/* Success Message */}
            {uploadStatus === 'success' && (
              <div className="flex items-center gap-2 text-sm text-notion-accent-green p-3 bg-notion-surface-green rounded-xl font-semibold">
                <CheckCircle className="w-4 h-4" />
                <span>Video uploaded successfully!</span>
              </div>
            )}

            {/* Error Message */}
            {uploadStatus === 'error' && errorMessage && (
              <div className="flex items-start gap-2 text-sm text-notion-accent-red p-3 bg-notion-surface-red rounded-xl font-semibold">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            {uploadStatus === 'idle' && (
              <div className="flex items-center gap-3">
                <Button
                  variant="primary"
                  onClick={handleUpload}
                  className="flex-1 font-bold"
                >
                  Upload Video
                </Button>
                <Button variant="secondary" onClick={handleCancel} className="font-bold">
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
