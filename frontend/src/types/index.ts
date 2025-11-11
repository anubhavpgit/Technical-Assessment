// Core Video Types
export interface Video {
  id: string;
  video_id?: string; // From backend upload response
  filename: string;
  original_filename?: string; // From backend
  url: string;
  file_path?: string; // From backend
  file_size?: number; // From backend
  duration: number;
  resolution: {
    width: number;
    height: number;
  };
  format: string;
  size: number;
  uploadedAt: Date;
}

// Filter Types
export interface Filter {
  id: string;
  name: string;
  description: string;
  thumbnail: string;
  category: 'color' | 'blur' | 'artistic' | 'adjustment' | 'special';
  parameters?: FilterParameter[];
  cssFilter?: string; // CSS filter string for preview
}

export interface FilterParameter {
  name: string;
  type: 'number' | 'boolean' | 'string' | 'range';
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

// Timeline Types
export interface TimelineItem {
  id: string;
  filterId: string;
  filterName: string;
  startTime: number;
  endTime: number;
  parameters?: Record<string, any>;
  layer: number;
  color?: string;
}

// Detection Types
export interface Detection {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  label?: string;
  trackingId?: string;
}

// Viewing Mode Types
export type ViewMode = 'theater' | 'window' | 'editor';

// Upload Types
export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface ProcessingStatus {
  status: 'idle' | 'processing' | 'completed' | 'error';
  progress: number;
  message?: string;
}

// Video Processing Types
export interface ProcessingSettings {
  filter_type: 'grayscale' | 'blur' | 'sepia';
  apply_to: 'background' | 'person';
  no_person_behavior: 'keep_original' | 'apply_filter';
  confidence_threshold: number;
}

export interface ProcessingResult {
  success: boolean;
  input_video: string;
  output_video: string;
  processed_video_id: string;
  processed_video_path: string;
  download_url: string;
  total_frames: number;
  frames_with_person: number;
  detection_rate: number;
  processing_time: number;
  avg_fps: number;
  avg_inference_time_ms: number;
  video_properties: {
    width: number;
    height: number;
    fps: number;
    duration: number;
  };
  filter_settings: ProcessingSettings;
}
