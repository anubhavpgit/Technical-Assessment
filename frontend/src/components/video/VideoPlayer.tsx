import React, { forwardRef, useState } from 'react';
import { Maximize2, Minimize2, Monitor, Edit3, Eye } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { ViewMode } from '../../types';
import { cn } from '../../utils/cn';

interface VideoPlayerProps {
  src: string;
  onLoadedMetadata?: () => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  filters?: string[];
}

export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, onLoadedMetadata, viewMode = 'editor', onViewModeChange, filters = [] }, ref) => {
    const [isFullscreen, setIsFullscreen] = useState(false);

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
            onLoadedMetadata={onLoadedMetadata}
            controls
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
            style={{
              filter: appliedFilters || 'none',
            }}
          />

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
