import { useRef, useState, useCallback, useEffect } from 'react';

export interface VideoPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
}

export const useVideoPlayer = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<VideoPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    playbackRate: 1,
  });

  const play = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.play();
      setState((prev) => ({ ...prev, isPlaying: true }));
    }
  }, []);

  const pause = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      setState((prev) => ({ ...prev, isPlaying: false }));
    }
  }, []);

  const togglePlayPause = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  const seek = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setState((prev) => ({ ...prev, currentTime: time }));
    }
  }, []);

  const setVolume = useCallback((volume: number) => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      setState((prev) => ({ ...prev, volume }));
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setState((prev) => ({ ...prev, isMuted: !prev.isMuted }));
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
      setState((prev) => ({ ...prev, playbackRate: rate }));
    }
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setState((prev) => ({ ...prev, currentTime: video.currentTime }));
    };

    const handleLoadedMetadata = () => {
      console.log('useVideoPlayer: Metadata loaded, duration =', video.duration);
      setState((prev) => ({ ...prev, duration: video.duration }));
    };

    const handleDurationChange = () => {
      console.log('useVideoPlayer: Duration changed, duration =', video.duration);
      setState((prev) => ({ ...prev, duration: video.duration }));
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
        volume: video.volume,
        isMuted: video.muted,
      }));
    };

    // Check if video already has metadata loaded
    if (video.duration && isFinite(video.duration) && video.duration > 0) {
      console.log('useVideoPlayer: Video already has duration on mount:', video.duration);
      setState((prev) => ({ ...prev, duration: video.duration }));
    }

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('volumechange', handleVolumeChange);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('volumechange', handleVolumeChange);
    };
  }, [videoRef.current]);

  return {
    videoRef,
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
