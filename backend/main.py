from flask import Flask, request, jsonify, send_file, Response, stream_with_context
from flask_cors import CORS
from dotenv import load_dotenv
import logging
import os
from pathlib import Path
from werkzeug.utils import secure_filename
import uuid
from video_processor import get_video_processor
import threading
import time
import json
from datetime import datetime
from queue import Queue
import cv2
import numpy as np

app = Flask(__name__)
cors = CORS(app)

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
UPLOAD_FOLDER = Path(__file__).parent / 'uploads'
PROCESSED_FOLDER = Path(__file__).parent / 'processed'
SEGMENTS_FOLDER = Path(__file__).parent / 'segments'
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'webm', 'mkv'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB

# Create directories
UPLOAD_FOLDER.mkdir(exist_ok=True)
PROCESSED_FOLDER.mkdir(exist_ok=True)
SEGMENTS_FOLDER.mkdir(exist_ok=True)
PREVIEW_FOLDER = Path(__file__).parent / 'previews'
PREVIEW_FOLDER.mkdir(exist_ok=True)

# Initialize video processor (lazy loading)
video_processor = None

# Job management
jobs = {}
jobs_lock = threading.Lock()


def get_processor(use_sam=False):
    """Get or initialize the video processor"""
    global video_processor

    # Check if we need to reinitialize
    need_reinit = False
    if video_processor is None:
        need_reinit = True
        logger.info("No processor exists, will initialize new one")
    elif hasattr(video_processor, 'use_sam') and video_processor.use_sam != use_sam:
        need_reinit = True
        logger.info(f"Processor SAM setting changed (current={video_processor.use_sam}, requested={use_sam}), will reinitialize")

    if need_reinit:
        logger.info(f"Initializing video processor with use_sam={use_sam}...")
        video_processor = get_video_processor('yolo11n-seg.pt', use_sam=use_sam)
        if use_sam:
            logger.info("Video processor initialized with SAM refinement")
        else:
            logger.info("Video processor initialized (YOLO-only mode)")
    else:
        logger.info(f"Reusing existing processor (use_sam={video_processor.use_sam if hasattr(video_processor, 'use_sam') else 'unknown'})")

    return video_processor


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def create_job(video_id, params):
    """Create a new processing job"""
    job_id = str(uuid.uuid4())
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
            'output_video_id': None,
            'error': None,
            'created_at': datetime.now().isoformat(),
            'started_at': None,
            'completed_at': None,
            'progress_queue': Queue()
        }
    return job_id


def update_job_progress(job_id, current, total, fps=0, preview_frame=None):
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

            # Save preview frame if provided (for future use)
            if preview_frame is not None:
                try:
                    preview_path = PREVIEW_FOLDER / f"{job_id}_preview.jpg"
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


def process_video_background(job_id):
    """Background task for video processing"""
    try:
        job = get_job(job_id)
        if not job:
            return

        update_job_status(job_id, 'processing')

        video_id = job['video_id']
        params = job['params']

        # Validate input video exists
        input_path = UPLOAD_FOLDER / video_id
        if not input_path.exists():
            update_job_status(job_id, 'failed', f"Video not found: {video_id}")
            return

        # Generate output filename
        output_filename = f"processed_{uuid.uuid4()}.mp4"
        output_path = PROCESSED_FOLDER / output_filename

        logger.info(f"Starting background processing for job {job_id}")

        # Get processor with SAM if requested
        use_sam_param = params.get('use_sam', False)
        logger.info(f"Processing with use_sam={use_sam_param}")
        processor = get_processor(use_sam=use_sam_param)

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
                        update_job_progress(job_id, current, total, fps, preview_frame)
                        return
                except Exception as e:
                    logger.error(f"Failed to generate preview frame: {e}")

            # Regular progress update without frame
            update_job_progress(job_id, current, total, fps)

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
                jobs[job_id]['output_video_id'] = output_filename
                jobs[job_id]['stats'] = stats

            update_job_status(job_id, 'complete')
            logger.info(f"Background processing completed for job {job_id}")
        finally:
            # Clean up preview video capture
            preview_cap.release()

    except Exception as e:
        logger.error(f"Background processing error for job {job_id}: {e}", exc_info=True)
        update_job_status(job_id, 'failed', str(e))


@app.route("/hello-world", methods=["GET"])
def hello_world():
    """Health check endpoint"""
    try:
        return jsonify({"Hello": "World"}), 200
    except Exception as e:
        logger.error(f"Error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/sample.mp4", methods=["GET"])
def serve_sample_video():
    """
    Serve sample video for demo

    Returns:
        Sample video file or 404 if not found
    """
    try:
        sample_path = UPLOAD_FOLDER / 'sample.mp4'
        if not sample_path.exists():
            return jsonify({
                "error": "Sample video not found",
                "message": "Please place a sample.mp4 file in the backend/uploads directory"
            }), 404

        return send_file(
            str(sample_path),
            mimetype='video/mp4',
            as_attachment=False,
            download_name='sample.mp4'
        )
    except Exception as e:
        logger.error(f"Sample video error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/upload", methods=["POST"])
def upload_video():
    """
    Upload a video file

    Returns:
        JSON with video metadata and file path
    """
    try:
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({"error": "No file part in request"}), 400

        file = request.files['file']

        # Check if file is selected
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400

        # Validate file type
        if not allowed_file(file.filename):
            return jsonify({
                "error": f"File type not allowed. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}"
            }), 400

        # Generate unique filename
        file_extension = file.filename.rsplit('.', 1)[1].lower()
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = UPLOAD_FOLDER / unique_filename

        # Save file
        file.save(str(file_path))
        file_size = os.path.getsize(file_path)

        # Check file size
        if file_size > MAX_FILE_SIZE:
            os.remove(file_path)
            return jsonify({
                "error": f"File too large. Max size: {MAX_FILE_SIZE / (1024*1024)}MB"
            }), 400

        logger.info(f"Video uploaded successfully: {unique_filename} ({file_size} bytes)")

        return jsonify({
            "success": True,
            "message": "Video uploaded successfully",
            "video_id": unique_filename,
            "original_filename": file.filename,
            "file_path": str(file_path),
            "file_size": file_size
        }), 200

    except Exception as e:
        logger.error(f"Upload error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/process/start", methods=["POST"])
def start_processing():
    """
    Start async video processing job

    Request body:
        video_id: str - Video filename from upload
        filter_type: str - Type of filter (grayscale, blur, sepia)
        apply_to: str - Where to apply (background, person)
        no_person_behavior: str - What to do when no person detected
        confidence_threshold: float - Detection confidence (0.0-1.0)
        region_aware: bool - Only process column/region where person appears
        roi_expansion: float - Region expansion factor 0.0-1.0
        boundary_refinement: str - Refinement level: minimal, balanced, aggressive
        use_sam: bool - Enable SAM for pixel-perfect boundary refinement

    Returns:
        JSON with job_id for tracking
    """
    try:
        data = request.get_json()

        # Validate required fields
        if not data or 'video_id' not in data:
            return jsonify({"error": "video_id is required"}), 400

        video_id = data['video_id']

        # Validate input video exists
        input_path = UPLOAD_FOLDER / video_id
        if not input_path.exists():
            return jsonify({"error": f"Video not found: {video_id}"}), 404

        # Create job
        params = {
            'filter_type': data.get('filter_type', 'grayscale'),
            'apply_to': data.get('apply_to', 'background'),
            'no_person_behavior': data.get('no_person_behavior', 'keep_original'),
            'confidence_threshold': data.get('confidence_threshold', 0.5),
            'region_aware': data.get('region_aware', True),
            'roi_expansion': data.get('roi_expansion', 0.3),
            'boundary_refinement': data.get('boundary_refinement', 'balanced'),
            'use_sam': data.get('use_sam', False)
        }

        job_id = create_job(video_id, params)

        # Start background processing
        thread = threading.Thread(target=process_video_background, args=(job_id,))
        thread.daemon = True
        thread.start()

        logger.info(f"Started processing job {job_id} for video {video_id}")

        return jsonify({
            "success": True,
            "job_id": job_id,
            "message": "Processing started"
        }), 200

    except Exception as e:
        logger.error(f"Start processing error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/jobs/<job_id>/status", methods=["GET"])
def get_job_status(job_id):
    """
    Get job status and progress

    Args:
        job_id: Job ID from start processing

    Returns:
        JSON with job details
    """
    try:
        job = get_job(job_id)

        if not job:
            return jsonify({"error": "Job not found"}), 404

        # Don't send the progress queue in response
        response_data = {
            'id': job['id'],
            'status': job['status'],
            'video_id': job['video_id'],
            'progress': job['progress'],
            'segments': job['segments'],
            'output_video_id': job['output_video_id'],
            'error': job['error'],
            'created_at': job['created_at'],
            'started_at': job['started_at'],
            'completed_at': job['completed_at']
        }

        if job['status'] == 'complete' and job['output_video_id']:
            response_data['download_url'] = f"/api/download/{job['output_video_id']}"
            response_data['stats'] = job.get('stats', {})

        return jsonify(response_data), 200

    except Exception as e:
        logger.error(f"Get job status error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/stream/progress/<job_id>", methods=["GET"])
def stream_progress(job_id):
    """
    Server-Sent Events endpoint for real-time progress updates

    Args:
        job_id: Job ID from start processing

    Returns:
        SSE stream of progress updates
    """
    def generate():
        job = get_job(job_id)
        if not job:
            yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
            return

        progress_queue = job['progress_queue']

        # Send initial status
        yield f"data: {json.dumps({'type': 'status', 'data': {'status': job['status']}})}\n\n"

        # Stream updates
        while True:
            try:
                # Check if job is complete
                current_job = get_job(job_id)
                if not current_job or current_job['status'] in ['complete', 'failed', 'cancelled']:
                    # Send final update
                    yield f"data: {json.dumps({'type': 'status', 'data': {'status': current_job['status'] if current_job else 'unknown'}})}\n\n"
                    break

                # Get progress update (timeout to check status periodically)
                try:
                    update = progress_queue.get(timeout=1)
                    yield f"data: {json.dumps(update)}\n\n"
                except:
                    # Send keepalive
                    yield f": keepalive\n\n"

            except GeneratorExit:
                break
            except Exception as e:
                logger.error(f"SSE error: {e}")
                break

    return Response(stream_with_context(generate()), mimetype='text/event-stream', headers={
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no'
    })


@app.route("/api/jobs/<job_id>/cancel", methods=["DELETE"])
def cancel_job(job_id):
    """
    Cancel a running job

    Args:
        job_id: Job ID to cancel

    Returns:
        JSON with cancellation status
    """
    try:
        job = get_job(job_id)

        if not job:
            return jsonify({"error": "Job not found"}), 404

        if job['status'] in ['complete', 'failed']:
            return jsonify({"error": "Job already finished"}), 400

        update_job_status(job_id, 'cancelled')

        logger.info(f"Job {job_id} cancelled")

        return jsonify({
            "success": True,
            "message": "Job cancelled"
        }), 200

    except Exception as e:
        logger.error(f"Cancel job error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/process/selective-filter", methods=["POST"])
def process_video():
    """
    Process video with selective filtering based on person segmentation

    Request body:
        video_id: str - Video filename from upload
        filter_type: str - Type of filter (grayscale, blur, sepia)
        apply_to: str - Where to apply (background, person)
        no_person_behavior: str - What to do when no person detected
        confidence_threshold: float - Detection confidence (0.0-1.0)
        region_aware: bool - Only process column/region where person appears (default: True)
        roi_expansion: float - Region expansion factor 0.0-1.0 (default: 0.3)
        boundary_refinement: str - Refinement level: minimal, balanced, aggressive (default: balanced)
        use_sam: bool - Enable SAM for pixel-perfect boundary refinement (default: False)

    Returns:
        JSON with processing statistics and processed video path
    """
    try:
        data = request.get_json()

        # Validate required fields
        if not data or 'video_id' not in data:
            return jsonify({"error": "video_id is required"}), 400

        video_id = data['video_id']
        filter_type = data.get('filter_type', 'grayscale')
        apply_to = data.get('apply_to', 'background')
        no_person_behavior = data.get('no_person_behavior', 'keep_original')
        confidence_threshold = data.get('confidence_threshold', 0.5)
        region_aware = data.get('region_aware', True)
        roi_expansion = data.get('roi_expansion', 0.3)
        boundary_refinement = data.get('boundary_refinement', 'balanced')
        use_sam = data.get('use_sam', False)

        # Validate input video exists
        input_path = UPLOAD_FOLDER / video_id
        if not input_path.exists():
            return jsonify({"error": f"Video not found: {video_id}"}), 404

        # Generate output filename
        output_filename = f"processed_{uuid.uuid4()}.mp4"
        output_path = PROCESSED_FOLDER / output_filename

        logger.info(f"Starting video processing: {video_id}")
        logger.info(f"Settings - Filter: {filter_type}, Apply to: {apply_to}, "
                   f"Confidence: {confidence_threshold}, Region-aware: {region_aware}, "
                   f"Boundary refinement: {boundary_refinement}, SAM: {use_sam}")

        # Get processor with SAM if requested
        processor = get_processor(use_sam=use_sam)
        stats = processor.process_video_selective_filter(
            input_video_path=str(input_path),
            output_video_path=str(output_path),
            filter_type=filter_type,
            apply_to=apply_to,
            no_person_behavior=no_person_behavior,
            confidence_threshold=confidence_threshold,
            region_aware=region_aware,
            roi_expansion=roi_expansion,
            boundary_refinement=boundary_refinement
        )

        # Add output info to stats
        stats['processed_video_id'] = output_filename
        stats['processed_video_path'] = str(output_path)
        stats['download_url'] = f"/api/download/{output_filename}"

        logger.info(f"Video processing completed: {output_filename}")

        return jsonify(stats), 200

    except FileNotFoundError as e:
        logger.error(f"File not found: {e}")
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.error(f"Processing error: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


@app.route("/api/download/<video_id>", methods=["GET"])
def download_video(video_id):
    """
    Download processed video

    Args:
        video_id: Processed video filename

    Returns:
        Video file
    """
    try:
        file_path = PROCESSED_FOLDER / video_id

        if not file_path.exists():
            return jsonify({"error": f"Video not found: {video_id}"}), 404

        return send_file(
            str(file_path),
            mimetype='video/mp4',
            as_attachment=True,
            download_name=f"processed_{video_id}"
        )

    except Exception as e:
        logger.error(f"Download error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/preview/<filename>", methods=["GET"])
def serve_preview(filename):
    """
    Serve preview frame image

    Args:
        filename: Preview image filename

    Returns:
        Image file
    """
    try:
        file_path = PREVIEW_FOLDER / filename

        if not file_path.exists():
            return jsonify({"error": f"Preview not found: {filename}"}), 404

        return send_file(
            str(file_path),
            mimetype='image/jpeg',
            as_attachment=False
        )

    except Exception as e:
        logger.error(f"Preview serve error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/model/info", methods=["GET"])
def model_info():
    """
    Get information about the AI model

    Returns:
        JSON with model information
    """
    try:
        processor = get_processor()
        info = processor.get_model_info()
        return jsonify(info), 200
    except Exception as e:
        logger.error(f"Model info error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/filters", methods=["GET"])
def get_filters():
    """
    Get available filter types

    Returns:
        JSON with list of available filters
    """
    filters = [
        {
            "id": "grayscale",
            "name": "Grayscale",
            "description": "Convert to black and white"
        },
        {
            "id": "blur",
            "name": "Blur",
            "description": "Apply Gaussian blur effect"
        },
        {
            "id": "sepia",
            "name": "Sepia",
            "description": "Apply vintage sepia tone"
        }
    ]
    return jsonify({"filters": filters}), 200


if __name__ == "__main__":
    logger.info("Starting Overlap Video Processing Server")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    logger.info(f"Processed folder: {PROCESSED_FOLDER}")
    app.run(host='0.0.0.0', port=8080, debug=True, use_reloader=True)
