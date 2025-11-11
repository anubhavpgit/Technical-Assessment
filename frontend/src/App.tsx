import { useState, useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { VideoPlayer } from './components/video/VideoPlayer';
import { VideoUpload } from './components/upload/VideoUpload';
import { FilterGallery } from './components/filters/FilterGallery';
import { VideoTimeline } from './components/filters/VideoTimeline';
import { Button } from './components/common/Button';
import { Card } from './components/common/Card';
import { useVideoPlayer } from './hooks/useVideoPlayer';
import { Video, ViewMode, Filter, TimelineItem } from './types';
import { generateId } from './utils/formatters';
import { FILTERS } from './constants/filters';
import { videoUrl } from './consts';

function App() {
  // Video state
  const [currentVideo, setCurrentVideo] = useState<Video | null>(() => {
    const savedVideo = localStorage.getItem('overlap-current-video');
    return savedVideo ? JSON.parse(savedVideo) : null;
  });
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<Filter | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>(() => {
    const savedTimeline = localStorage.getItem('overlap-timeline-items');
    return savedTimeline ? JSON.parse(savedTimeline) : [];
  });
  const [appliedFilters, setAppliedFilters] = useState<string[]>([]);

  // UI state

  // Mouse tracking for animated background
  const [mousePosition, setMousePosition] = useState({ x: 50, y: 50 });

  // Video player hook
  const { videoRef, state: playerState, controls } = useVideoPlayer();

  // Ref for scrolling to editor section
  const editorSectionRef = useRef<HTMLDivElement>(null);

  // Track mouse movement
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Save current video to localStorage whenever it changes
  useEffect(() => {
    if (currentVideo) {
      localStorage.setItem('overlap-current-video', JSON.stringify(currentVideo));
    } else {
      localStorage.removeItem('overlap-current-video');
    }
  }, [currentVideo]);

  // Save timeline items to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('overlap-timeline-items', JSON.stringify(timelineItems));
  }, [timelineItems]);

  // Update applied filters based on current time
  useEffect(() => {
    const currentFilters = timelineItems
      .filter(
        (item) =>
          playerState.currentTime >= item.startTime &&
          playerState.currentTime <= item.endTime
      )
      .map((item) => {
        const filter = FILTERS.find((f) => f.id === item.filterId);
        return filter?.cssFilter || '';
      })
      .filter(Boolean);

    setAppliedFilters(currentFilters);
  }, [playerState.currentTime, timelineItems]);

  const handleVideoUpload = (video: Video) => {
    setCurrentVideo(video);
    // Scroll to editor section after video is selected
    setTimeout(() => {
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleUseDefaultVideo = () => {
    const defaultVideo: Video = {
      id: 'default',
      filename: 'Default Video',
      url: videoUrl,
      duration: 0,
      resolution: { width: 1920, height: 1080 },
      format: 'mp4',
      size: 0,
      uploadedAt: new Date(),
    };
    setCurrentVideo(defaultVideo);
    // Scroll to editor section after video is selected
    setTimeout(() => {
      editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleFilterSelect = (filter: Filter) => {
    setSelectedFilter(filter);
  };

  const handleAddFilterToTimeline = () => {
    if (!selectedFilter || !currentVideo) return;

    const startTime = playerState.currentTime;
    const endTime = Math.min(startTime + 5, playerState.duration);

    const newItem: TimelineItem = {
      id: generateId(),
      filterId: selectedFilter.id,
      filterName: selectedFilter.name,
      startTime,
      endTime,
      layer: timelineItems.length,
      color: selectedFilter.category,
    };

    setTimelineItems([...timelineItems, newItem]);
  };

  const handleRemoveFilterFromTimeline = (id: string) => {
    setTimelineItems(timelineItems.filter((item) => item.id !== id));
  };

  const handleUpdateFilterInTimeline = (
    id: string,
    startTime: number,
    endTime: number
  ) => {
    setTimelineItems(
      timelineItems.map((item) =>
        item.id === id ? { ...item, startTime, endTime } : item
      )
    );
  };

  return (
    <SimpleBar
      className="custom-simplebar h-screen"
      autoHide={false}
      scrollbarMaxSize={120}
      style={{ maxHeight: '100vh' }}
    >
      <div className="min-h-screen bg-notion-bg-secondary overflow-x-hidden">
        {/* Main Container with Background */}
        <div className="relative w-full min-h-screen">
          {/* Animated Gradient Background */}
          <div className="absolute inset-0 overflow-hidden">
            {/* Base gradient layer */}
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, #ffe8d6 0%, #ffd6ba 100%)',
              }}
            />

            {/* Dynamic gradient blobs that follow mouse */}
            <div
              className="absolute inset-0 transition-all duration-700 ease-out"
              style={{
                background: `
                radial-gradient(circle at ${mousePosition.x}% ${mousePosition.y}%, #f5735b 0%, transparent 40%),
                radial-gradient(circle at ${100 - mousePosition.x}% ${mousePosition.y}%, #e85d47 0%, transparent 35%),
                radial-gradient(circle at ${mousePosition.x}% ${100 - mousePosition.y}%, #f7795d 0%, transparent 45%),
                radial-gradient(circle at ${50 + (mousePosition.x - 50) * 0.3}% ${50 + (mousePosition.y - 50) * 0.3}%, #d94c38 0%, transparent 30%),
                radial-gradient(circle at 20% 80%, #ffd194 0%, transparent 50%),
                radial-gradient(circle at 80% 20%, #ffa574 0%, transparent 50%)
              `,
                filter: 'blur(60px)',
              }}
            />

            {/* Additional animated layer for depth */}
            <div
              className="absolute inset-0 animate-gradient"
              style={{
                background: `
                radial-gradient(circle at ${50 - (mousePosition.x - 50) * 0.2}% ${50 - (mousePosition.y - 50) * 0.2}%, #c73e2e 0%, transparent 40%)
              `,
                filter: 'blur(80px)',
                opacity: 0.6,
              }}
            />
          </div>

          {/* Content Container */}
          <div className="relative z-10 flex flex-col min-h-screen">
            {/* Floating Header */}
            <header className="mx-3 sm:mx-6 lg:mx-auto mt-4 sm:mt-6 bg-white/95 backdrop-blur-sm rounded-lg sm:rounded-xl border border-notion-border shadow-notion-md w-auto sm:w-full max-w-6xl sticky top-4 z-50">
              <div className="px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 sm:gap-3">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 120 31"
                    className="h-6 sm:h-8"
                    aria-label="Overlap Logo"
                  >
                    <g transform="translate(0.269 0.025)">
                      <path
                        d="M 13.73 27.092 C 7.385 27.092 1.44 22.467 1.44 15.623 C 1.44 8.467 6.523 3.092 13.453 3.092 C 20.106 3.092 25.496 8.311 25.496 14.936 C 25.496 21.78 20.26 27.092 13.73 27.092 Z M 13.545 21.905 C 17.149 21.905 19.675 18.811 19.675 15.123 C 19.675 11.498 17.118 8.28 13.453 8.28 C 9.818 8.28 7.262 11.373 7.262 15.03 C 7.262 18.842 9.818 21.905 13.545 21.905 Z M 34.823 26.655 L 28.816 26.655 L 21.208 3.53 L 27.184 3.53 L 31.773 19.748 L 31.835 19.748 L 36.455 3.53 L 42.461 3.53 Z M 53.355 26.655 L 40.696 26.655 L 40.696 3.53 L 53.355 3.53 L 53.355 8.717 L 46.271 8.717 L 46.271 12.311 L 53.14 12.311 L 53.14 17.498 L 46.271 17.498 L 46.271 21.467 L 53.355 21.467 Z M 71.754 26.655 L 65.101 26.655 L 59.833 19.186 L 59.772 19.186 L 59.772 26.655 L 54.197 26.655 L 54.197 3.53 L 61.651 3.53 C 64.023 3.53 65.84 3.842 67.041 4.373 C 69.505 5.498 71.23 8.217 71.23 11.498 C 71.23 15.155 69.074 18.155 65.563 18.78 Z M 59.772 15.155 L 61.928 15.155 C 64.238 15.155 65.655 14.061 65.655 11.842 C 65.655 9.842 64.177 8.717 61.99 8.717 L 59.772 8.717 Z M 83.037 26.655 L 70.47 26.655 L 70.47 3.53 L 76.291 3.53 L 76.291 21.467 L 83.037 21.467 Z M 102.645 26.655 L 96.33 26.655 L 95.221 23.311 L 87.305 23.311 L 86.104 26.655 L 79.851 26.655 L 89 3.53 L 93.589 3.53 Z M 93.681 18.623 L 91.34 10.748 L 91.248 10.717 L 88.907 18.623 Z M 106.859 26.655 L 101.284 26.655 L 101.284 3.53 L 108.984 3.53 C 111.417 3.498 113.235 3.842 114.436 4.405 C 116.9 5.561 118.44 8.217 118.44 11.342 C 118.44 15.623 116.099 19.405 109.569 19.405 L 106.859 19.405 Z M 106.859 14.217 L 109.354 14.217 C 111.695 14.217 112.865 13.405 112.865 11.436 C 112.865 9.561 111.726 8.717 109.138 8.717 L 106.859 8.717 Z"
                        fill="rgb(255,60,0)"
                      />
                    </g>
                  </svg>
                  <div className="hidden sm:block">
                    <p className="text-xs text-notion-text-primary font-semibold">
                      AI that clips, edits, and posts.
                    </p>
                  </div>
                </div>

                {currentVideo && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setCurrentVideo(null);
                        setTimelineItems([]);
                        localStorage.removeItem('overlap-current-video');
                        localStorage.removeItem('overlap-timeline-items');
                      }}
                      className="font-bold"
                    >
                      Clear Video
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="flex-1">
            {/* Video Upload Section - Full viewport */}
            <div className="min-h-[calc(100vh-8rem)] flex items-center justify-center px-3 sm:px-6 lg:px-8 py-6">
              <div className="w-full max-w-5xl">
                <VideoUpload
                  onUploadComplete={handleVideoUpload}
                  onUploadError={(error) => console.error('Upload error:', error)}
                  onUseDefaultVideo={handleUseDefaultVideo}
                />
              </div>
            </div>

            {/* Video Editor Section - Only show if video is selected */}
            {currentVideo && (
              <div ref={editorSectionRef} className="min-h-screen px-3 sm:px-6 lg:px-8 py-6 pb-12">
                <div className="w-full max-w-5xl mx-auto space-y-6">
                  {/* Video Player */}
                  <Card className="rounded-lg">
                    <VideoPlayer
                      ref={videoRef}
                      src={currentVideo?.url || ''}
                      viewMode={viewMode}
                      onViewModeChange={setViewMode}
                      filters={appliedFilters}
                    />
                  </Card>

                  {/* Keyframes Row */}
                  <Card className="rounded-lg">
                    <div className="space-y-3">
                      <h3 className="text-base font-bold text-notion-text-primary">Keyframes</h3>
                      <VideoTimeline
                        duration={playerState.duration}
                        currentTime={playerState.currentTime}
                        timelineItems={timelineItems}
                        onTimelineItemRemove={handleRemoveFilterFromTimeline}
                        onTimelineItemUpdate={handleUpdateFilterInTimeline}
                        onSeek={controls.seek}
                        isPlaying={playerState.isPlaying}
                        onPlayPause={controls.togglePlayPause}
                      />
                    </div>
                  </Card>

                  {/* Filters Row */}
                  <Card className="rounded-lg">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-base font-bold text-notion-text-primary flex items-center gap-2">
                          <Sparkles className="w-5 h-5" />
                          Filters
                        </h3>
                      </div>
                      <FilterGallery
                        onFilterSelect={handleFilterSelect}
                        selectedFilterId={selectedFilter?.id}
                      />
                      {selectedFilter && (
                        <Button
                          variant="primary"
                          onClick={handleAddFilterToTimeline}
                          className="w-full"
                          disabled={!currentVideo}
                        >
                          Add to Timeline at {Math.floor(playerState.currentTime)}s
                        </Button>
                      )}
                    </div>
                  </Card>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
    </SimpleBar>
  );
}

export default App;
