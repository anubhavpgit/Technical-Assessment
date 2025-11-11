import React, { useState, useRef } from 'react';
import { Clock, Trash2, Play, Pause } from 'lucide-react';
import { Card } from '../common/Card';
import { IconButton } from '../common/IconButton';
import { TimelineItem } from '../../types';
import { formatTime } from '../../utils/formatters';
import { cn } from '../../utils/cn';

interface VideoTimelineProps {
  duration: number;
  currentTime: number;
  timelineItems: TimelineItem[];
  onTimelineItemRemove: (id: string) => void;
  onTimelineItemUpdate: (id: string, startTime: number, endTime: number) => void;
  onSeek: (time: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
}

export const VideoTimeline: React.FC<VideoTimelineProps> = ({
  duration,
  currentTime,
  timelineItems,
  onTimelineItemRemove,
  onSeek,
  isPlaying,
  onPlayPause,
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration || duration <= 0) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;

    onSeek(Math.max(0, Math.min(duration, time)));
  };

  const getItemColor = (index: number) => {
    const colors = [
      'bg-notion-accent-blue',
      'bg-notion-accent-purple',
      'bg-notion-accent-green',
      'bg-notion-accent-yellow',
      'bg-notion-accent-red',
    ];
    return colors[index % colors.length];
  };

  return (
    <Card className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-notion-accent-blue" />
          <h3 className="text-lg font-semibold text-notion-text-primary">Timeline</h3>
        </div>
        <div className="flex items-center gap-3">
          <IconButton
            icon={isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            onClick={onPlayPause}
            variant="primary"
            tooltip={isPlaying ? 'Pause' : 'Play'}
          />
          <span className="text-sm font-mono text-notion-text-secondary">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Timeline Track */}
      <div className="space-y-2">
        {duration <= 0 && (
          <div className="text-center py-4 text-notion-text-tertiary text-sm">
            Loading video timeline...
          </div>
        )}
        <div
          ref={timelineRef}
          className="relative h-16 bg-notion-bg-secondary rounded-notion overflow-hidden cursor-pointer group"
          onClick={handleTimelineClick}
        >
          {/* Time markers */}
          <div className="absolute inset-0 flex items-end justify-between px-2 pb-1">
            {Array.from({ length: 11 }).map((_, i) => {
              const time = (duration / 10) * i;
              return (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="h-2 w-px bg-notion-border" />
                  <span className="text-xs text-notion-text-tertiary font-mono">
                    {formatTime(time)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Timeline Items (Filters) */}
          <div className="absolute inset-0 top-0 h-8">
            {duration > 0 && timelineItems.map((item, index) => {
              const left = Math.max(0, Math.min(100, (item.startTime / duration) * 100));
              const width = Math.max(0, Math.min(100 - left, ((item.endTime - item.startTime) / duration) * 100));
              const color = getItemColor(index);

              return (
                <div
                  key={item.id}
                  className={cn(
                    'absolute h-full flex items-center justify-between px-2 text-white text-xs font-medium transition-all duration-200 group/item cursor-pointer',
                    color,
                    hoveredItem === item.id && 'ring-2 ring-white ring-inset shadow-lg z-10'
                  )}
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                  }}
                  onMouseEnter={() => setHoveredItem(item.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={() => {
                    // Don't stop propagation - let the click bubble to timeline for seeking
                    // The timeline click handler will handle the seek
                  }}
                >
                  <span className="truncate">{item.filterName}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onTimelineItemRemove(item.id);
                    }}
                    className="opacity-0 group-hover/item:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Playhead */}
          {duration > 0 && (
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-notion-accent-red z-20 pointer-events-none"
              style={{
                left: `${Math.max(0, Math.min(100, (currentTime / duration) * 100))}%`,
              }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-notion-accent-red rounded-full" />
            </div>
          )}

          {/* Hover indicator */}
          <div className="absolute inset-0 border-2 border-transparent group-hover:border-notion-border rounded-notion pointer-events-none transition-colors" />
        </div>

        {/* Timeline Legend */}
        {timelineItems.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {timelineItems.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  'flex items-center gap-2 px-2 py-1 rounded-notion text-xs text-white transition-all duration-200',
                  getItemColor(index),
                  hoveredItem === item.id && 'ring-2 ring-notion-border shadow-notion'
                )}
                onMouseEnter={() => setHoveredItem(item.id)}
                onMouseLeave={() => setHoveredItem(null)}
              >
                <span className="font-medium">{item.filterName}</span>
                <span className="opacity-75">
                  {formatTime(item.startTime)} - {formatTime(item.endTime)}
                </span>
                <button
                  onClick={() => onTimelineItemRemove(item.id)}
                  className="hover:opacity-75 transition-opacity"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {timelineItems.length === 0 && (
          <div className="text-center py-4 text-notion-text-tertiary text-sm">
            No filters applied yet. Select a filter and click on the timeline to add it.
          </div>
        )}
      </div>
    </Card>
  );
};
