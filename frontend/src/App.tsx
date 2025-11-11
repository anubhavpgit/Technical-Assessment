import React, { useState, useEffect } from 'react';
import { Film, Sparkles, Clock, Settings, Info } from 'lucide-react';
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
import { cn } from './utils/cn';
import { videoUrl } from './consts';

function App() {
  // Video state
  const [currentVideo, setCurrentVideo] = useState<Video | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // Filter state
  const [selectedFilter, setSelectedFilter] = useState<Filter | null>(null);
  const [timelineItems, setTimelineItems] = useState<TimelineItem[]>([]);
  const [appliedFilters, setAppliedFilters] = useState<string[]>([]);

  // UI state
  const [activeTab, setActiveTab] = useState<'filters' | 'timeline' | 'settings'>('filters');
  const [showUpload, setShowUpload] = useState(true);

  // Video player hook
  const { videoRef, state: playerState, controls } = useVideoPlayer();

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
    setShowUpload(false);
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
    setShowUpload(false);
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
    <div className="min-h-screen bg-notion-bg-secondary flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-notion-border sticky top-0 z-50 shadow-notion">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-notion-accent-blue to-notion-accent-purple rounded-notion flex items-center justify-center">
                <Film className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-notion-text-primary">
                  Overlap
                </h1>
                <p className="text-xs text-notion-text-tertiary">
                  Minimal design, powerful editing
                </p>
              </div>
            </div>

            {currentVideo && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowUpload(true)}
              >
                Upload New Video
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {showUpload ? (
          <div className="space-y-6">
            <VideoUpload
              onUploadComplete={handleVideoUpload}
              onUploadError={(error) => console.error('Upload error:', error)}
            />

            {/* Default Video Option */}
            <Card className="max-w-2xl mx-auto">
              <div className="text-center space-y-3">
                <p className="text-sm text-notion-text-secondary">
                  Or try it out with a
                  <Button className="ml-2 p-2" variant="secondary" onClick={handleUseDefaultVideo}>
                    sample video
                  </Button>
                </p>
              </div>
            </Card>

            {/* Info Card */}
            <Card className="max-w-2xl mx-auto">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-notion-surface-blue rounded-notion flex items-center justify-center flex-shrink-0">
                  <Info className="w-5 h-5 text-notion-accent-blue" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-notion-text-primary">
                    Getting Started
                  </h3>
                  <ul className="text-sm text-notion-text-secondary space-y-1 list-disc list-inside">
                    <li>Upload a video to begin editing</li>
                    <li>Choose from various filters in the gallery</li>
                    <li>Apply filters to specific timeframes using the timeline</li>
                    <li>Switch between viewing modes for different experiences</li>
                    <li>Export your edited video when ready</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Sidebar - Filters & Controls */}
            <div className="lg:col-span-1 space-y-4">
              <Card>
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-notion-bg-secondary rounded-notion p-1 mb-4">
                  <button
                    onClick={() => setActiveTab('filters')}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-notion text-sm font-medium transition-all duration-200 flex-1',
                      activeTab === 'filters'
                        ? 'bg-white text-notion-text-primary shadow-notion'
                        : 'text-notion-text-secondary hover:text-notion-text-primary'
                    )}
                  >
                    <Sparkles className="w-4 h-4" />
                    Filters
                  </button>
                  <button
                    onClick={() => setActiveTab('timeline')}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-notion text-sm font-medium transition-all duration-200 flex-1',
                      activeTab === 'timeline'
                        ? 'bg-white text-notion-text-primary shadow-notion'
                        : 'text-notion-text-secondary hover:text-notion-text-primary'
                    )}
                  >
                    <Clock className="w-4 h-4" />
                    Timeline
                  </button>
                  <button
                    onClick={() => setActiveTab('settings')}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-notion text-sm font-medium transition-all duration-200 flex-1',
                      activeTab === 'settings'
                        ? 'bg-white text-notion-text-primary shadow-notion'
                        : 'text-notion-text-secondary hover:text-notion-text-primary'
                    )}
                  >
                    <Settings className="w-4 h-4" />
                    Settings
                  </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'filters' && (
                  <div className="space-y-4">
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
                )}

                {activeTab === 'timeline' && (
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-notion-text-primary">
                      Applied Filters ({timelineItems.length})
                    </h3>
                    {timelineItems.length === 0 ? (
                      <p className="text-sm text-notion-text-tertiary text-center py-8">
                        No filters applied yet
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {timelineItems.map((item) => (
                          <Card key={item.id} padding="sm" className="text-sm">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-notion-text-primary">
                                {item.filterName}
                              </span>
                              <button
                                onClick={() => handleRemoveFilterFromTimeline(item.id)}
                                className="text-notion-accent-red hover:underline text-xs"
                              >
                                Remove
                              </button>
                            </div>
                            <p className="text-xs text-notion-text-tertiary mt-1">
                              {item.startTime.toFixed(1)}s - {item.endTime.toFixed(1)}s
                            </p>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold text-notion-text-primary mb-2">
                        Video Settings
                      </h3>
                      <div className="space-y-3 text-sm">
                        <div>
                          <span className="text-notion-text-secondary">Resolution:</span>
                          <span className="text-notion-text-primary ml-2">
                            {currentVideo?.resolution.width} x {currentVideo?.resolution.height}
                          </span>
                        </div>
                        <div>
                          <span className="text-notion-text-secondary">Duration:</span>
                          <span className="text-notion-text-primary ml-2">
                            {playerState.duration.toFixed(2)}s
                          </span>
                        </div>
                        <div>
                          <span className="text-notion-text-secondary">Format:</span>
                          <span className="text-notion-text-primary ml-2">
                            {currentVideo?.format || 'MP4'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Main Content - Video Player */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <VideoPlayer
                  ref={videoRef}
                  src={currentVideo?.url || ''}
                  viewMode={viewMode}
                  onViewModeChange={setViewMode}
                  filters={appliedFilters}
                />
              </Card>

              {/* Timeline */}
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
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-notion-border mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-notion-text-tertiary">
            Overlap - Professional editing made simple
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
