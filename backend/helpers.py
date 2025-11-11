"""
Utility functions for video processing application.
Contains file validation, job management, and background processing functions.
"""

import logging
import ffmpeg
import os
import uuid
import cv2
import threading
import time
from datetime import datetime
from queue import Queue
import numpy as np

# A lightweight face detection model
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Job management state
jobs = {}
jobs_lock = threading.Lock()


def get_temp_path():
    """Generate a temporary file path"""
    temp_dir = os.path.join(os.path.dirname(__file__), "temp")
    os.makedirs(temp_dir, exist_ok=True)
    random_filename = f"temp_{str(uuid.uuid4())[:8]}"
    return os.path.join(temp_dir, random_filename)


def allowed_file(filename, allowed_extensions):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions


def create_job(video_id, params):
    """Create a new processing job"""
    job_id = str(uuid.uuid4())
    output_filename = f"processed_{job_id}.mp4"
    with jobs_lock:
        jobs[job_id] = {
            'id': job_id,
            'status': 'queued',  # queued, processing, complete, failed, cancelled
            'video_id': video_id,
            'params': params,
            'progress': {
                'current': 0,
                'total': 0,
                'percentage': 0,
                'fps': 0,
                'eta_seconds': 0
            },
            'segments': [],
            'output_video_id': output_filename,  # Set output filename immediately
            'error': None,
            'created_at': datetime.now().isoformat(),
            'started_at': None,
            'completed_at': None,
            'progress_queue': Queue()
        }
    return job_id


def update_job_progress(job_id, current, total, fps=0, preview_frame=None, preview_folder=None):
    """Update job progress"""
    with jobs_lock:
        if job_id in jobs:
            percentage = (current / total * 100) if total > 0 else 0
            remaining_frames = total - current
            eta_seconds = (remaining_frames / fps) if fps > 0 else 0

            progress_data = {
                'current': current,
                'total': total,
                'percentage': round(percentage, 2),
                'fps': round(fps, 2),
                'eta_seconds': round(eta_seconds, 2)
            }

            # Save preview frame if provided
            if preview_frame is not None and preview_folder is not None:
                try:
                    preview_path = preview_folder / f"{job_id}_preview.jpg"
                    cv2.imwrite(str(preview_path), preview_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                    progress_data['preview_url'] = f"/api/preview/{job_id}_preview.jpg"
                    jobs[job_id]['latest_preview'] = str(preview_path)
                except Exception as e:
                    logger.error(f"Failed to save preview frame: {e}")

            jobs[job_id]['progress'] = progress_data

            # Push to progress queue for SSE
            try:
                jobs[job_id]['progress_queue'].put({
                    'type': 'progress',
                    'data': progress_data
                })
            except:
                pass


def update_job_status(job_id, status, error=None):
    """Update job status"""
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id]['status'] = status
            if error:
                jobs[job_id]['error'] = str(error)

            if status == 'processing' and not jobs[job_id]['started_at']:
                jobs[job_id]['started_at'] = datetime.now().isoformat()
            elif status in ['complete', 'failed', 'cancelled']:
                jobs[job_id]['completed_at'] = datetime.now().isoformat()

            # Push to progress queue for SSE
            try:
                jobs[job_id]['progress_queue'].put({
                    'type': 'status',
                    'data': {'status': status, 'error': error}
                })
            except:
                pass


def add_job_segment(job_id, segment_num):
    """Add completed segment to job"""
    with jobs_lock:
        if job_id in jobs:
            if segment_num not in jobs[job_id]['segments']:
                jobs[job_id]['segments'].append(segment_num)
                jobs[job_id]['segments'].sort()


def get_job(job_id):
    """Get job by ID"""
    with jobs_lock:
        return jobs.get(job_id)


def process_video_background(job_id, upload_folder, processed_folder, preview_folder, get_processor_func, update_job_progress_func, update_job_status_func, get_job_func):
    """
    Background task for video processing

    Args:
        job_id: Job identifier
        upload_folder: Path to upload directory
        processed_folder: Path to processed video directory
        preview_folder: Path to preview frames directory
        get_processor_func: Function to get video processor
        update_job_progress_func: Function to update job progress
        update_job_status_func: Function to update job status
        get_job_func: Function to get job by ID
    """
    try:
        job = get_job_func(job_id)
        if not job:
            return

        update_job_status_func(job_id, 'processing')

        video_id = job['video_id']
        params = job['params']

        # Validate input video exists
        input_path = upload_folder / video_id
        if not input_path.exists():
            update_job_status_func(job_id, 'failed', f"Video not found: {video_id}")
            return

        # Use output filename from job (already set in create_job)
        output_filename = job['output_video_id']
        output_path = processed_folder / output_filename

        logger.info(f"Starting background processing for job {job_id}")

        # Get processor with SAM if requested
        use_sam_param = params.get('use_sam', False)
        logger.info(f"Processing with use_sam={use_sam_param}")
        processor = get_processor_func(use_sam=use_sam_param)

        # Open input video for preview extraction
        preview_cap = cv2.VideoCapture(str(input_path))
        last_preview_frame = [0]  # Track last frame we saved preview for

        # Progress callback with preview frame extraction
        def progress_callback(progress_percent, current, total):
            fps = current / (time.time() - start_time) if (time.time() - start_time) > 0 else 0

            # Extract preview frame every 10 frames
            # NOTE: We do NOT use processor methods here to avoid corrupting temporal state
            if current - last_preview_frame[0] >= 10 and current > 0:
                last_preview_frame[0] = current
                try:
                    # Seek to current frame in input video
                    preview_cap.set(cv2.CAP_PROP_POS_FRAMES, current - 1)
                    ret, frame = preview_cap.read()
                    if ret:
                        # Simple YOLO inference WITHOUT temporal smoothing
                        results = processor.model.predict(
                            frame,
                            classes=[0],
                            conf=params.get('confidence_threshold', 0.5),
                            verbose=False,
                            device=processor._get_device()
                        )

                        # Apply filter based on detection
                        if results[0].masks is not None and len(results[0].masks) > 0:
                            # Get combined mask - basic approach without temporal smoothing
                            masks = results[0].masks.data.cpu().numpy()
                            combined_mask = masks[0]
                            for i in range(1, len(masks)):
                                combined_mask = np.maximum(combined_mask, masks[i])

                            height, width = frame.shape[:2]
                            combined_mask = cv2.resize(combined_mask, (width, height))
                            combined_mask = (combined_mask > 0.5).astype(np.uint8) * 255

                            # Apply filter manually without using processor methods
                            filter_type = params.get('filter_type', 'grayscale')
                            apply_to = params.get('apply_to', 'background')

                            # Create filtered version
                            if filter_type == 'grayscale':
                                filtered = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                                filtered = cv2.cvtColor(filtered, cv2.COLOR_GRAY2BGR)
                            elif filter_type == 'blur':
                                filtered = cv2.GaussianBlur(frame, (21, 21), 0)
                            else:  # sepia
                                kernel = np.array([[0.272, 0.534, 0.131],
                                                   [0.349, 0.686, 0.168],
                                                   [0.393, 0.769, 0.189]])
                                filtered = cv2.transform(frame, kernel)
                                filtered = np.clip(filtered, 0, 255).astype(np.uint8)

                            # Composite based on mask
                            mask_3ch = cv2.cvtColor(combined_mask, cv2.COLOR_GRAY2BGR) / 255.0
                            if apply_to == 'background':
                                # Invert mask - filter background, keep person
                                preview_frame = (frame * mask_3ch + filtered * (1 - mask_3ch)).astype(np.uint8)
                            else:
                                # Filter person, keep background
                                preview_frame = (filtered * mask_3ch + frame * (1 - mask_3ch)).astype(np.uint8)
                        else:
                            # No person detected
                            if params.get('no_person_behavior', 'keep_original') == 'keep_original':
                                preview_frame = frame
                            else:
                                # Apply filter to whole frame
                                filter_type = params.get('filter_type', 'grayscale')
                                if filter_type == 'grayscale':
                                    preview_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                                    preview_frame = cv2.cvtColor(preview_frame, cv2.COLOR_GRAY2BGR)
                                elif filter_type == 'blur':
                                    preview_frame = cv2.GaussianBlur(frame, (21, 21), 0)
                                else:  # sepia
                                    kernel = np.array([[0.272, 0.534, 0.131],
                                                       [0.349, 0.686, 0.168],
                                                       [0.393, 0.769, 0.189]])
                                    preview_frame = cv2.transform(frame, kernel)
                                    preview_frame = np.clip(preview_frame, 0, 255).astype(np.uint8)

                        # Update with preview frame
                        update_job_progress_func(job_id, current, total, fps, preview_frame)
                        return
                except Exception as e:
                    logger.error(f"Failed to generate preview frame: {e}")

            # Regular progress update without frame
            update_job_progress_func(job_id, current, total, fps)

        start_time = time.time()

        try:
            stats = processor.process_video_selective_filter(
                input_video_path=str(input_path),
                output_video_path=str(output_path),
                filter_type=params.get('filter_type', 'grayscale'),
                apply_to=params.get('apply_to', 'background'),
                no_person_behavior=params.get('no_person_behavior', 'keep_original'),
                confidence_threshold=params.get('confidence_threshold', 0.5),
                region_aware=params.get('region_aware', True),
                roi_expansion=params.get('roi_expansion', 0.3),
                boundary_refinement=params.get('boundary_refinement', 'balanced'),
                progress_callback=progress_callback
            )

            # Update job with completion info
            with jobs_lock:
                jobs[job_id]['stats'] = stats

            # Push stream_url update via SSE
            with jobs_lock:
                if job_id in jobs:
                    try:
                        jobs[job_id]['progress_queue'].put({
                            'type': 'stream_ready',
                            'data': {
                                'stream_url': f"/api/stream/video/{output_filename}",
                                'output_video_id': output_filename
                            }
                        })
                    except:
                        pass

            update_job_status_func(job_id, 'complete')
            logger.info(f"Background processing completed for job {job_id}")
        finally:
            # Clean up preview video capture
            preview_cap.release()

    except Exception as e:
        logger.error(f"Background processing error for job {job_id}: {e}", exc_info=True)
        update_job_status_func(job_id, 'failed', str(e))