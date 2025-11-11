import React, { forwardRef, useState, useEffect } from 'react';
import { Maximize2, Minimize2, Video as VideoIcon, Edit3, Eye, Film, Loader2 } from 'lucide-react';
import { IconButton } from '../common/IconButton';
import { ViewMode } from '../../types';
import { cn } from '../../utils/cn';

// Camcorder Viewfinder Overlay Component
const CamcorderOverlay = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Corner brackets */}
      <div className="absolute top-4 left-4 w-8 h-8 border-l-2 border-t-2 border-red-500" />
      <div className="absolute top-4 right-4 w-8 h-8 border-r-2 border-t-2 border-red-500" />
      <div className="absolute bottom-4 left-4 w-8 h-8 border-l-2 border-b-2 border-red-500" />
      <div className="absolute bottom-4 right-4 w-8 h-8 border-r-2 border-b-2 border-red-500" />

      {/* Top HUD */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded text-white font-mono text-xs">
        <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
        <span className="font-bold">REC</span>
      </div>

      {/* Left side info */}
      <div className="absolute top-16 left-4 space-y-1 bg-black/60 px-2 py-1.5 rounded text-white font-mono text-xs">
        <div className="flex items-center gap-2">
          <span className="text-red-400">●</span>
          <span>1080p</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-green-400">●</span>
          <span>30 FPS</span>
        </div>
      </div>

      {/* Bottom timestamp */}
      <div className="absolute bottom-4 left-4 bg-black/70 px-3 py-1.5 rounded text-white font-mono text-xs">
        {time.toLocaleTimeString()}
      </div>

      {/* Battery indicator */}
      <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded text-white font-mono text-xs">
        <div className="w-6 h-3 border border-white rounded-sm relative">
          <div className="absolute inset-0.5 bg-green-400 rounded-sm" />
          <div className="absolute -right-0.5 top-1/2 -translate-y-1/2 w-0.5 h-1.5 bg-white rounded-r" />
        </div>
        <span className="text-green-400">100%</span>
      </div>

      {/* Center crosshair */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="relative w-8 h-8">
          <div className="absolute top-1/2 left-0 w-full h-px bg-white/40" />
          <div className="absolute left-1/2 top-0 w-px h-full bg-white/40" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 border border-white/60 rounded-full" />
        </div>
      </div>
    </div>
  );
};

// Editor Mode Overlay Component
const EditorOverlay = () => {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {/* Grid overlay for composition */}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="border border-white/10" />
        ))}
      </div>

      {/* Safe area guides */}
      <div className="absolute inset-[5%] border-2 border-dashed border-yellow-400/30" />
      <div className="absolute inset-[10%] border border-dashed border-blue-400/20" />

      {/* Top ruler */}
      <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-black/80 to-transparent flex items-start">
        <div className="w-full h-full flex">
          {[...Array(20)].map((_, i) => (
            <div key={i} className="flex-1 border-l border-white/20 relative">
              {i % 5 === 0 && (
                <span className="absolute -top-0.5 -left-2 text-[8px] text-white/50 font-mono">
                  {i}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Left ruler */}
      <div className="absolute top-0 left-0 bottom-0 w-6 bg-gradient-to-r from-black/80 to-transparent flex flex-col">
        {[...Array(15)].map((_, i) => (
          <div key={i} className="flex-1 border-t border-white/20 relative">
            {i % 5 === 0 && (
              <span className="absolute top-0 left-0.5 text-[8px] text-white/50 font-mono">
                {i}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Bottom info bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-black/80 px-4 py-2 flex items-center justify-between text-white text-xs font-mono">
        <div className="flex items-center gap-4">
          <span className="text-yellow-400">EDIT MODE</span>
          <span className="text-white/60">|</span>
          <span>16:9</span>
        </div>
        <div className="flex items-center gap-4">
          <span>1920x1080</span>
          <span className="text-white/60">|</span>
          <span className="text-green-400">Timeline Ready</span>
        </div>
      </div>
    </div>
  );
};

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
      default: 'w-full mx-auto aspect-video bg-black rounded-lg overflow-hidden shadow-lg',
      theater: 'w-full mx-auto aspect-video bg-black',
      camcorder: 'w-full mx-auto aspect-video shadow-notion-xl rounded-lg overflow-hidden bg-black',
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
                onClick={() => onViewModeChange('default')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-notion text-sm font-medium transition-all duration-200',
                  viewMode === 'default'
                    ? 'bg-white text-notion-text-primary shadow-notion'
                    : 'text-notion-text-secondary hover:text-notion-text-primary'
                )}
                title="Default Mode - Clean minimal view"
              >
                <VideoIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Default</span>
              </button>
              <button
                onClick={() => onViewModeChange('theater')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-notion text-sm font-medium transition-all duration-200',
                  viewMode === 'theater'
                    ? 'bg-white text-notion-text-primary shadow-notion'
                    : 'text-notion-text-secondary hover:text-notion-text-primary'
                )}
                title="Theater Mode - Cinematic letterbox experience"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline">Theater</span>
              </button>
              <button
                onClick={() => onViewModeChange('camcorder')}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-notion text-sm font-medium transition-all duration-200',
                  viewMode === 'camcorder'
                    ? 'bg-white text-notion-text-primary shadow-notion'
                    : 'text-notion-text-secondary hover:text-notion-text-primary'
                )}
                title="Camcorder Mode - Video camera viewfinder"
              >
                <Film className="w-4 h-4" />
                <span className="hidden sm:inline">Camcorder</span>
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

          {/* Theater Mode Overlay - Cinematic Letterbox Bars */}
          {viewMode === 'theater' && (
            <div className="absolute inset-0 pointer-events-none">
              {/* Top letterbox bar */}
              <div className="absolute top-0 left-0 right-0 h-[12%] bg-black" />
              {/* Bottom letterbox bar */}
              <div className="absolute bottom-0 left-0 right-0 h-[12%] bg-black" />
              {/* Subtle vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/30" />
            </div>
          )}

          {/* Camcorder Mode Overlay - Viewfinder Frame */}
          {viewMode === 'camcorder' && (
            <CamcorderOverlay />
          )}

          {/* Editor Mode Overlay - Professional Editing Interface */}
          {viewMode === 'editor' && (
            <EditorOverlay />
          )}
        </div>

      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';
