import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
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
import { uploadVideo, startProcessingJob, connectToProgressStream, getJobStatus } from './services/api';

function App() {
  // Video state
  const [currentVideo, setCurrentVideo] = useState<Video | null>(() => {
    const savedVideo = localStorage.getItem('overlap-current-video');
    return savedVideo ? JSON.parse(savedVideo) : null;
  });
  const [viewMode, setViewMode] = useState<ViewMode>('editor');

  // Processing state
  const [processingStatus, setProcessingStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [processedVideo, setProcessedVideo] = useState<Video | null>(null);
  const [processingError, setProcessingError] = useState<string>('');
  const [isUploadingSample, setIsUploadingSample] = useState(false);
  const [progressData, setProgressData] = useState<{
    current: number;
    total: number;
    percentage: number;
    fps: number;
    eta_seconds: number;
    preview_url?: string;
  } | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const [previewTimestamp, setPreviewTimestamp] = useState<number>(Date.now());

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
  };

  const handleUseDefaultVideo = async () => {
    setIsUploadingSample(true);
    try {
      // Fetch the sample video from URL
      const response = await fetch(videoUrl);
      if (!response.ok) {
        console.error('Failed to fetch sample video');
        setIsUploadingSample(false);
        return;
      }

      const blob = await response.blob();
      const file = new File([blob], 'sample-video.mp4', { type: 'video/mp4' });

      // Upload to backend to get video_id
      const uploadResponse = await uploadVideo(file);

      if (uploadResponse.success && uploadResponse.data) {
        const defaultVideo: Video = {
          id: uploadResponse.data.video_id || 'default',
          video_id: uploadResponse.data.video_id,
          filename: uploadResponse.data.original_filename || 'Sample Video',
          url: videoUrl,
          duration: 0,
          resolution: { width: 1920, height: 1080 },
          format: 'mp4',
          size: uploadResponse.data.file_size || 0,
          uploadedAt: new Date(),
        };
        setCurrentVideo(defaultVideo);
        setIsUploadingSample(false);
      } else {
        setIsUploadingSample(false);
      }
    } catch (error) {
      console.error('Error loading sample video:', error);
      setIsUploadingSample(false);
    }
  };

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const handleProcessVideo = async () => {
    if (!currentVideo?.video_id) {
      setProcessingError('No video ID available for processing');
      setProcessingStatus('error');
      return;
    }

    setProcessingStatus('processing');
    setProcessingError('');
    setProgressData(null);

    try {
      // Start the processing job
      const response = await startProcessingJob(
        currentVideo.video_id,
        'grayscale',
        'background',
        'keep_original',
        0.5,
        false // use_sam
      );

      if (!response.success || !response.data?.job_id) {
        setProcessingStatus('error');
        setProcessingError(response.error || 'Failed to start processing');
        return;
      }

      const jobId = response.data.job_id;

      // Connect to SSE for progress updates
      const eventSource = connectToProgressStream(
        jobId,
        // onProgress
        (data) => {
          setProgressData(data);
          if (data.preview_url) {
            setPreviewTimestamp(Date.now());
          }
        },
        // onStatus
        async (status, error) => {
          if (status === 'complete') {
            // Get final job status to retrieve the processed video URL
            const jobStatus = await getJobStatus(jobId);

            if (jobStatus.success && jobStatus.data) {
              setProcessingStatus('success');

              // Create a new Video object with the processed video
              const processed: Video = {
                id: jobStatus.data.output_video_id,
                video_id: jobStatus.data.output_video_id,
                filename: `Processed - ${currentVideo.filename}`,
                url: `http://127.0.0.1:8080${jobStatus.data.download_url}`,
                duration: jobStatus.data.stats?.video_properties?.duration || 0,
                resolution: {
                  width: jobStatus.data.stats?.video_properties?.width || 1920,
                  height: jobStatus.data.stats?.video_properties?.height || 1080,
                },
                format: 'mp4',
                size: 0,
                uploadedAt: new Date(),
              };

              setProcessedVideo(processed);

              // Scroll to processed video section
              setTimeout(() => {
                editorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 100);
            }

            // Close EventSource
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
          } else if (status === 'failed') {
            setProcessingStatus('error');
            setProcessingError(error || 'Processing failed');

            // Close EventSource
            if (eventSourceRef.current) {
              eventSourceRef.current.close();
              eventSourceRef.current = null;
            }
          }
        },
        // onError
        (error) => {
          setProcessingStatus('error');
          setProcessingError(error.message || 'Connection error');

          // Close EventSource
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        }
      );

      eventSourceRef.current = eventSource;

    } catch (error) {
      setProcessingStatus('error');
      setProcessingError(error instanceof Error ? error.message : 'Processing failed');
    }
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
      <div className="min-h-screen bg-notion-bg-secondary flex items-center justify-center p-3 sm:p-4 lg:p-6">
        {/* Main Container with Background */}
        <div className="relative w-full max-w-[95vw] min-h-[calc(100vh-3rem)] rounded-3xl overflow-hidden shadow-notion-xl">
          {/* Animated Gradient Background */}
          <div className="absolute inset-0 overflow-hidden rounded-3xl">
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
          <div className="relative z-10 flex flex-col min-h-[calc(100vh-3rem)]">
            {/* Floating Header */}
            <header className="mx-auto mt-4 sm:mt-6 bg-white/95 backdrop-blur-sm rounded-xl border border-notion-border shadow-notion-md w-full max-w-4xl">
              <div className="px-4 sm:px-6 lg:px-8 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 120 31"
                      className="h-8"
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
                          setProcessedVideo(null);
                          setProcessingStatus('idle');
                          setProcessingError('');
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
              {/* Video Upload Section */}
              <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-6">
                <div className="w-full max-w-5xl">
                  <VideoUpload
                    onUploadComplete={handleVideoUpload}
                    onUploadError={(error) => console.error('Upload error:', error)}
                    onUseDefaultVideo={handleUseDefaultVideo}
                    currentVideo={currentVideo}
                  />

                  {/* Process Button - Show when video is selected but not yet processed */}
                  {currentVideo && processingStatus !== 'success' && (
                    <div className="flex flex-col items-center gap-4 mt-6">
                      <Button
                        variant="primary"
                        onClick={handleProcessVideo}
                        disabled={isUploadingSample || processingStatus === 'processing' || !currentVideo?.video_id}
                        className="font-semibold text-sm px-6 py-3"
                      >
                        {isUploadingSample ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading Sample Video...
                          </>
                        ) : processingStatus === 'processing' ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processing Video...
                          </>
                        ) : (
                          'Process Video'
                        )}
                      </Button>

                      {/* Live Preview and Progress */}
                      {processingStatus === 'processing' && progressData && (
                        <div className="w-full space-y-4">
                          {/* Live Preview Frame */}
                          <Card className="w-full rounded-lg overflow-hidden">
                            <div className="space-y-2">
                              <h3 className="text-sm font-bold text-notion-text-primary">Live Preview</h3>
                              <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden">
                                {progressData.preview_url ? (
                                  <img
                                    src={`http://127.0.0.1:8080${progressData.preview_url}?t=${previewTimestamp}`}
                                    alt="Processing preview"
                                    className="w-full h-full object-contain"
                                  />
                                ) : (
                                  /* Buffering Loader */
                                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <Loader2 className="w-12 h-12 text-[#ff3c00] animate-spin mb-4" />
                                    <p className="text-sm text-white font-semibold">Processing frames...</p>
                                    <p className="text-xs text-gray-400 mt-1">Preview will appear shortly</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </Card>

                          {/* Progress Bar */}
                          <Card className="w-full rounded-lg">
                            <div className="space-y-3">
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-notion-text-secondary font-semibold">
                                  Processing... Frame {progressData.current} / {progressData.total}
                                </span>
                                <span className="text-notion-text-primary font-bold">
                                  {progressData.percentage.toFixed(1)}%
                                </span>
                              </div>

                              {/* Progress bar */}
                              <div className="h-3 bg-notion-bg-tertiary rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-[#ff3c00] transition-all duration-300 ease-out"
                                  style={{ width: `${progressData.percentage}%` }}
                                />
                              </div>

                              {/* Stats */}
                              <div className="flex items-center justify-between text-xs text-notion-text-tertiary">
                                <span className="font-semibold">
                                  {progressData.fps > 0 ? `${progressData.fps.toFixed(1)} FPS` : 'Calculating...'}
                                </span>
                                <span className="font-semibold">
                                  {progressData.eta_seconds > 0
                                    ? `ETA: ${Math.floor(progressData.eta_seconds / 60)}:${String(Math.floor(progressData.eta_seconds % 60)).padStart(2, '0')}`
                                    : 'Calculating ETA...'}
                                </span>
                              </div>
                            </div>
                          </Card>
                        </div>
                      )}

                      {processingStatus === 'error' && processingError && (
                        <Card className="w-full rounded-lg bg-notion-surface-red border-notion-accent-red">
                          <p className="text-sm text-notion-accent-red font-semibold">{processingError}</p>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Processed Video Section - Only show after successful processing */}
              {processedVideo && processingStatus === 'success' && (
                <div ref={editorSectionRef} className="px-4 sm:px-6 lg:px-8 py-6 pb-12">
                  <div className="w-full max-w-5xl mx-auto space-y-6">
                    <h2 className="text-xl font-bold text-white">Processed Video</h2>

                    {/* Video Player */}
                    <Card className="rounded-lg">
                      <VideoPlayer
                        ref={videoRef}
                        src={processedVideo?.url || ''}
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
                            disabled={!processedVideo}
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
