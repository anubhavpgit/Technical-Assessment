import React, { forwardRef } from 'react';

interface VideoPlayerProps {
  src: string;
  onLoadedMetadata?: () => void;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, onLoadedMetadata }, ref) => {
    return (
      <video
        ref={ref}
        src={src}
        className="video-player"
        controls
        onLoadedMetadata={onLoadedMetadata}
        crossOrigin="anonymous"
      />
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export default VideoPlayer; 