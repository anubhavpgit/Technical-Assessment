import { ApiResponse, Video, Filter, Detection } from '../types';

const API_BASE_URL = 'http://127.0.0.1:8080';

/**
 * Get a user-friendly error message based on the error type and HTTP status
 */
function getErrorMessage(error: unknown, statusCode?: number): string {
  // Handle fetch/network errors
  if (error instanceof TypeError) {
    // Network errors typically manifest as TypeError in fetch
    if (error.message.includes('fetch')) {
      return 'Unable to communicate with server. Please check if the server is running.';
    }
    return 'Network error. Please check your connection.';
  }

  // Handle AbortError (timeout or cancelled requests)
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Request timeout. The server took too long to respond.';
  }

  // Handle HTTP status codes
  if (statusCode) {
    switch (true) {
      case statusCode === 400:
        return 'Invalid request. Please check your input.';
      case statusCode === 401:
        return 'Authentication required. Please log in.';
      case statusCode === 403:
        return 'Access forbidden. You do not have permission.';
      case statusCode === 404:
        return 'Resource not found. The requested item does not exist.';
      case statusCode === 408:
        return 'Request timeout. Please try again.';
      case statusCode === 429:
        return 'Too many requests. Please wait and try again.';
      case statusCode === 502:
        return 'Bad gateway. Unable to reach the server.';
      case statusCode === 503:
        return 'Server unavailable. The service is temporarily down.';
      case statusCode === 504:
        return 'Gateway timeout. The server took too long to respond.';
      case statusCode >= 500 && statusCode < 600:
        return 'Server error. The server is experiencing issues. Please try again later.';
      default:
        return `Server error (${statusCode}). Please try again.`;
    }
  }

  // Fallback for other errors
  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred. Please try again.';
}

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
      // Try to get error message from response body
      let errorMessage = getErrorMessage(new Error(), response.status);
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // If response body is not JSON, use status-based message
      }

      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
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
          let errorMessage = getErrorMessage(new Error(), xhr.status);
          try {
            const errorData = JSON.parse(xhr.responseText);
            if (errorData.error) {
              errorMessage = errorData.error;
            }
          } catch {
            // Use status-based message if response is not JSON
          }
          resolve({
            success: false,
            error: errorMessage,
          });
        }
      });

      xhr.addEventListener('error', () => {
        resolve({
          success: false,
          error: 'Unable to communicate with server. Please check if the server is running.',
        });
      });

      xhr.addEventListener('timeout', () => {
        resolve({
          success: false,
          error: 'Upload timeout. The server took too long to respond.',
        });
      });

      xhr.open('POST', `${API_BASE_URL}/api/upload`);
      xhr.send(formData);
    });
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
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
 * Legacy endpoint - use processVideoWithAI for new implementation
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
 * Process video with AI-powered person detection and selective filtering
 */
export async function processVideoWithAI(
  videoId: string,
  filterType: 'grayscale' | 'blur' | 'sepia' = 'grayscale',
  applyTo: 'background' | 'person' = 'background',
  noPersonBehavior: 'keep_original' | 'apply_filter' = 'keep_original',
  confidenceThreshold: number = 0.5
): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/process/selective-filter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_id: videoId,
        filter_type: filterType,
        apply_to: applyTo,
        no_person_behavior: noPersonBehavior,
        confidence_threshold: confidenceThreshold,
        // use_sam: true, // Enable SAM for better segmentation
        // Disabling here because of performance + SAM is not pushed to git
      }),
    });

    if (!response.ok) {
      let errorMessage = getErrorMessage(new Error(), response.status);
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use status-based message if response is not JSON
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
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

/**
 * Start async video processing job
 */
export async function startProcessingJob(
  videoId: string,
  filterType: 'grayscale' | 'blur' | 'sepia' = 'grayscale',
  applyTo: 'background' | 'person' = 'background',
  noPersonBehavior: 'keep_original' | 'apply_filter' = 'keep_original',
  confidenceThreshold: number = 0.5,
  useSam: boolean = false
): Promise<ApiResponse<{ job_id: string }>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/process/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_id: videoId,
        filter_type: filterType,
        apply_to: applyTo,
        no_person_behavior: noPersonBehavior,
        confidence_threshold: confidenceThreshold,
        use_sam: useSam,
      }),
    });

    if (!response.ok) {
      let errorMessage = getErrorMessage(new Error(), response.status);
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use status-based message if response is not JSON
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Get job status
 */
export async function getJobStatus(jobId: string): Promise<ApiResponse<any>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/status`);

    if (!response.ok) {
      let errorMessage = getErrorMessage(new Error(), response.status);
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use status-based message if response is not JSON
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Cancel processing job
 */
export async function cancelJob(jobId: string): Promise<ApiResponse<void>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}/cancel`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      let errorMessage = getErrorMessage(new Error(), response.status);
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use status-based message if response is not JSON
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

/**
 * Connect to SSE progress stream
 */
export function connectToProgressStream(
  jobId: string,
  onProgress: (data: any) => void,
  onStatus: (status: string, error?: string) => void,
  onError: (error: Error) => void
): EventSource {
  const eventSource = new EventSource(`${API_BASE_URL}/api/stream/progress/${jobId}`);

  eventSource.onmessage = (event) => {
    try {
      const update = JSON.parse(event.data);

      if (update.type === 'progress') {
        onProgress(update.data);
      } else if (update.type === 'status') {
        onStatus(update.data.status, update.data.error);
      }
    } catch (error) {
      console.error('Error parsing SSE message:', error);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    onError(new Error('Unable to communicate with server. The connection was lost.'));
    eventSource.close();
  };

  return eventSource;
}

/**
 * Extract first keyframe and generate filter previews
 */
export async function extractFilterPreviews(
  videoId: string,
  confidenceThreshold: number = 0.5,
  applyTo: 'background' | 'person' = 'background'
): Promise<ApiResponse<{
  video_id: string;
  previews: Array<{
    filter_id: string;
    filter_name: string;
    preview_url: string;
    error?: string;
  }>;
  frame_size: {
    width: number;
    height: number;
  };
}>> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/extract-filter-previews`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_id: videoId,
        confidence_threshold: confidenceThreshold,
        apply_to: applyTo,
      }),
    });

    if (!response.ok) {
      let errorMessage = getErrorMessage(new Error(), response.status);
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use status-based message if response is not JSON
      }
      return {
        success: false,
        error: errorMessage,
      };
    }

    const data = await response.json();
    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}
