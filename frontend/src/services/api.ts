import { ApiResponse, Video, Filter, Detection } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8080';

/**
 * Generic API request handler
 */
async function apiRequest<T>(
  endpoint: string,
  options?: RequestInit
): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }
}

/**
 * Upload video file
 */
export async function uploadVideo(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ApiResponse<Video>> {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();

    return new Promise((resolve) => {
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          const progress = (e.loaded / e.total) * 100;
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          resolve({
            success: true,
            data,
          });
        } else {
          resolve({
            success: false,
            error: 'Upload failed',
          });
        }
      });

      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Network error during upload',
        });
      });

      xhr.open('POST', `${API_BASE_URL}/api/upload`);
      xhr.send(formData);
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Get available filters
 */
export async function getFilters(): Promise<ApiResponse<Filter[]>> {
  return apiRequest<Filter[]>('/api/filters');
}

/**
 * Add filter to timeline
 */
export async function addFilterToTimeline(
  videoId: string,
  filterId: string,
  startTime: number,
  endTime: number,
  parameters?: Record<string, any>
): Promise<ApiResponse<{ timelineItemId: string }>> {
  return apiRequest('/api/timeline/add-filter', {
    method: 'POST',
    body: JSON.stringify({
      videoId,
      filterId,
      startTime,
      endTime,
      parameters,
    }),
  });
}

/**
 * Remove filter from timeline
 */
export async function removeFilterFromTimeline(
  timelineItemId: string
): Promise<ApiResponse<void>> {
  return apiRequest('/api/timeline/remove-filter', {
    method: 'DELETE',
    body: JSON.stringify({ timelineItemId }),
  });
}

/**
 * Update filter in timeline
 */
export async function updateFilterInTimeline(
  timelineItemId: string,
  startTime?: number,
  endTime?: number,
  parameters?: Record<string, any>
): Promise<ApiResponse<void>> {
  return apiRequest('/api/timeline/update-filter', {
    method: 'PUT',
    body: JSON.stringify({
      timelineItemId,
      startTime,
      endTime,
      parameters,
    }),
  });
}

/**
 * Detect persons in video
 */
export async function detectPersons(
  videoId: string,
  frameNumber?: number,
  continuous?: boolean
): Promise<ApiResponse<{ detections: Detection[]; frameNumber: number; timestamp: number }>> {
  return apiRequest('/api/detect/person', {
    method: 'POST',
    body: JSON.stringify({
      videoId,
      frameNumber,
      continuous,
    }),
  });
}

/**
 * Segment background from person
 */
export async function segmentBackground(
  videoId: string,
  detectionId?: string
): Promise<ApiResponse<{ maskUrl: string }>> {
  return apiRequest('/api/segment/background', {
    method: 'POST',
    body: JSON.stringify({
      videoId,
      detectionId,
    }),
  });
}

/**
 * Apply selective filter (background or person only)
 */
export async function applySelectiveFilter(
  videoId: string,
  filterId: string,
  applyTo: 'background' | 'person',
  startTime: number,
  endTime: number
): Promise<ApiResponse<{ processedVideoUrl: string }>> {
  return apiRequest('/api/process/selective-filter', {
    method: 'POST',
    body: JSON.stringify({
      videoId,
      filterId,
      applyTo,
      startTime,
      endTime,
    }),
  });
}

/**
 * Process video in real-time with filters
 */
export async function processRealtime(
  videoId: string,
  filters: Array<{
    filterId: string;
    startTime: number;
    endTime: number;
    parameters?: Record<string, any>;
  }>
): Promise<ApiResponse<{ streamUrl: string }>> {
  return apiRequest('/api/process/realtime', {
    method: 'POST',
    body: JSON.stringify({
      videoId,
      filters,
    }),
  });
}

/**
 * Test backend connection
 */
export async function pingBackend(): Promise<ApiResponse<string>> {
  return apiRequest<string>('/hello-world');
}
