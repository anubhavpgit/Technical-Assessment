import { useState, useCallback, useEffect } from 'react';

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
}

export const useVideoPlayer = () => {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const [state, setState] = useState<VideoPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
  });

  // Callback ref to track when video element is attached
  const setVideoRef = useCallback((element: HTMLVideoElement | null) => {
    setVideoElement(element);
  }, []);

  const play = useCallback(() => {
    if (videoElement) {
      videoElement.play();
      setState((prev) => ({ ...prev, isPlaying: true }));
    }
  }, [videoElement]);

  const pause = useCallback(() => {
    if (videoElement) {
      videoElement.pause();
      setState((prev) => ({ ...prev, isPlaying: false }));
    }
  }, [videoElement]);

  const togglePlayPause = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (videoElement) {
      videoElement.currentTime = time;
      setState((prev) => ({ ...prev, currentTime: time }));
    }
  }, [videoElement]);

  const setVolume = useCallback((volume: number) => {
    if (videoElement) {
      videoElement.volume = volume;
      setState((prev) => ({ ...prev, volume }));
    }
  }, [videoElement]);

  const toggleMute = useCallback(() => {
    if (videoElement) {
      videoElement.muted = !videoElement.muted;
      setState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
    }
  }, [videoElement]);

  const setPlaybackRate = useCallback((rate: number) => {
    if (videoElement) {
      videoElement.playbackRate = rate;
      setState((prev) => ({ ...prev, playbackRate: rate }));
    }
  }, [videoElement]);

  // Attach event listeners when video element is available
  useEffect(() => {
    if (!videoElement) {
      console.log('useVideoPlayer: No video element yet');
      return;
    }

    console.log('useVideoPlayer: Attaching event listeners to video element');

    const handleTimeUpdate = () => {
      setState((prev) => ({ ...prev, currentTime: videoElement.currentTime }));
    };

    const handleLoadedMetadata = () => {
      console.log('useVideoPlayer: Metadata loaded, duration =', videoElement.duration);
      setState((prev) => ({ ...prev, duration: videoElement.duration }));
    };

    const handleDurationChange = () => {
      console.log('useVideoPlayer: Duration changed, duration =', videoElement.duration);
      setState((prev) => ({ ...prev, duration: videoElement.duration }));
    };

    const handlePlay = () => {
      setState((prev) => ({ ...prev, isPlaying: true }));
    };

    const handlePause = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
    };

    const handleVolumeChange = () => {
      setState((prev) => ({
        ...prev,
        volume: videoElement.volume,
        isMuted: videoElement.muted,
      }));
    };

    // Check if video already has metadata loaded
    if (videoElement.duration && isFinite(videoElement.duration) && videoElement.duration > 0) {
      console.log('useVideoPlayer: Video already has duration on mount:', videoElement.duration);
      setState((prev) => ({ ...prev, duration: videoElement.duration }));
    }

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('loadedmetadata', handleLoadedMetadata);
    videoElement.addEventListener('durationchange', handleDurationChange);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);
    videoElement.addEventListener('volumechange', handleVolumeChange);

    return () => {
      console.log('useVideoPlayer: Removing event listeners');
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
      videoElement.removeEventListener('durationchange', handleDurationChange);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
      videoElement.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [videoElement]);

  return {
    videoRef: setVideoRef,
    state,
    controls: {
      play,
      pause,
      togglePlayPause,
      seek,
      setVolume,
      toggleMute,
      setPlaybackRate,
    },
  };
};
