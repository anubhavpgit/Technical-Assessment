import React, { forwardRef, useState } from 'react';
import { Maximize2, Minimize2, Monitor, Edit3, Eye, Loader2 } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { ViewMode } from '../../types';
import { cn } from '../../utils/cn';

interface VideoPlayerProps {
  src: string;
  onLoadedMetadata?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  filters?: string[];
  isProcessing?: boolean;
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, onLoadedMetadata, viewMode = 'editor', onViewModeChange, filters = [], isProcessing = false }, ref) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isBuffering, setIsBuffering] = useState(true);
    const [hasError, setHasError] = useState(false);

    // Reset buffering state when src changes
    React.useEffect(() => {
      setIsBuffering(true);
      setHasError(false);
    }, [src]);

    const toggleFullscreen = async () => {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    };

    const containerClasses = {
      theater: 'w-full mx-auto aspect-video bg-black',
      window: 'w-full mx-auto aspect-video shadow-notion-xl rounded-lg overflow-hidden',
      editor: 'w-full aspect-video bg-notion-bg-secondary rounded-lg overflow-hidden',
    };

    const appliedFilters = filters.join(' ');

    return (
      <div className="space-y-3">
        {/* View Mode Selector */}
        {onViewModeChange && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 bg-notion-bg-tertiary rounded-notion p-1">
              <button
                onClick={() => onViewModeChange('theater')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-notion text-sm font-medium transition-all duration-200',
                  viewMode === 'theater'
                    ? 'bg-white text-notion-text-primary shadow-notion'
                    : 'text-notion-text-secondary hover:text-notion-text-primary'
                )}
                title="Theater Mode - Cinematic full-width experience"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Theater</span>
              </button>
              <button
                onClick={() => onViewModeChange('window')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-notion text-sm font-medium transition-all duration-200',
                  viewMode === 'window'
                    ? 'bg-white text-notion-text-primary shadow-notion'
                    : 'text-notion-text-secondary hover:text-notion-text-primary'
                )}
                title="Window Mode - Floating video window"
              >
                <Monitor className="w-4 h-4" />
                <span className="hidden sm:inline">Window</span>
              </button>
              <button
                onClick={() => onViewModeChange('editor')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-notion text-sm font-medium transition-all duration-200',
                  viewMode === 'editor'
                    ? 'bg-white text-notion-text-primary shadow-notion'
                    : 'text-notion-text-secondary hover:text-notion-text-primary'
                )}
                title="Editor Mode - Professional timeline editing"
              >
                <Edit3 className="w-4 h-4" />
                <span className="hidden sm:inline">Editor</span>
              </button>
            </div>

            <IconButton
              icon={
                isFullscreen ? (
                  <Minimize2 className="w-4 h-4" />
                ) : (
                  <Maximize2 className="w-4 h-4" />
                )
              }
              onClick={toggleFullscreen}
              tooltip={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              variant="ghost"
            />
          </div>
        )}

        {/* Video Container */}
        <div className={cn('relative', containerClasses[viewMode])}>
          <video
            ref={ref}
            src={src}
            key={src}
            onLoadedMetadata={(e) => {
              console.log('Video metadata loaded, duration:', (e.target as HTMLVideoElement).duration);
              setIsBuffering(false);
              setHasError(false);
              onLoadedMetadata?.();
            }}
            onLoadedData={() => {
              setIsBuffering(false);
            }}
            onCanPlay={() => {
              setIsBuffering(false);
            }}
            onWaiting={() => {
              setIsBuffering(true);
            }}
            onPlaying={() => {
              setIsBuffering(false);
            }}
            onError={(e) => {
              console.error('Video load error:', e);
              setHasError(true);
              setIsBuffering(false);
            }}
            controls
            crossOrigin="anonymous"
            preload="metadata"
            className="w-full h-full object-contain"
            style={{
              filter: appliedFilters || 'none',
            }}
          />

          {/* Buffering/Processing Overlay */}
          {(isBuffering || isProcessing) && !hasError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 pointer-events-none">
              <Loader2 className="w-16 h-16 text-[#ff3c00] animate-spin mb-4" />
              <p className="text-lg text-white font-semibold">
                {isProcessing ? 'Video Processing...' : 'Loading Video...'}
              </p>
              <p className="text-sm text-gray-300 mt-2">
                {isProcessing ? 'Your video is being generated' : 'Please wait'}
              </p>
            </div>
          )}

          {/* Theater Mode Overlay */}
          {viewMode === 'theater' && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/50" />
            </div>
          )}

          {/* Window Mode Frame */}
          {viewMode === 'window' && (
            <div className="absolute inset-0 pointer-events-none border-8 border-notion-bg-primary rounded-notion" />
          )}
        </div>

      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
