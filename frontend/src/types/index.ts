// Core Video Types
export interface Video {
  id: string;
  filename: string;
  url: string;
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
