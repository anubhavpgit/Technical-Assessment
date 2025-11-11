"""
API route handlers for the video processing application.
This module registers all HTTP endpoints with the Flask application.
"""

from flask import request, jsonify, send_file, Response, stream_with_context
import os
import uuid
import threading
import json
import cv2
import numpy as np


def register_routes(app, config):
    """
    Register all API routes with the Flask app.

    Args:
        app: Flask application instance
        config: Dictionary containing configuration and helper functions
    """
    # Extract config
    logger = config['logger']
    UPLOAD_FOLDER = config['UPLOAD_FOLDER']
    PROCESSED_FOLDER = config['PROCESSED_FOLDER']
    PREVIEW_FOLDER = config['PREVIEW_FOLDER']
    ALLOWED_EXTENSIONS = config['ALLOWED_EXTENSIONS']
    MAX_FILE_SIZE = config['MAX_FILE_SIZE']
    get_processor = config['get_processor']
    allowed_file = config['allowed_file']
    create_job = config['create_job']
    update_job_status = config['update_job_status']
    get_job = config['get_job']
    process_video_background = config['process_video_background']

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

            # Always include stream URL if output_video_id exists (even during processing)
            if job['output_video_id']:
                response_data['stream_url'] = f"/api/stream/video/{job['output_video_id']}"
                response_data['download_url'] = f"/api/download/{job['output_video_id']}"

            if job['status'] == 'complete':
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
                    # Get progress update (timeout to check status periodically)
                    try:
                        update = progress_queue.get(timeout=1)
                        yield f"data: {json.dumps(update)}\n\n"
                    except:
                        # No update available, send keepalive
                        yield f": keepalive\n\n"

                    # Check if job is complete after processing any queued messages
                    current_job = get_job(job_id)
                    if not current_job or current_job['status'] in ['complete', 'failed', 'cancelled']:
                        # Drain any remaining messages in the queue
                        while not progress_queue.empty():
                            try:
                                update = progress_queue.get_nowait()
                                yield f"data: {json.dumps(update)}\n\n"
                            except:
                                break

                        # Send final status update
                        yield f"data: {json.dumps({'type': 'status', 'data': {'status': current_job['status'] if current_job else 'unknown'}})}\n\n"
                        break

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

    @app.route("/api/stream/video/<video_id>", methods=["GET"])
    def stream_video(video_id):
        """
        Stream video with HTTP Range support for progressive playback
        Supports streaming in-progress videos for real-time preview

        Args:
            video_id: Video filename (can be in-progress or completed)

        Returns:
            Video stream with Range support
        """
        try:
            file_path = PROCESSED_FOLDER / video_id

            if not file_path.exists():
                return jsonify({"error": f"Video not found: {video_id}"}), 404

            # Get file size
            file_size = os.path.getsize(file_path)

            # Parse Range header
            range_header = request.headers.get('Range')

            if not range_header:
                # No range requested, send entire file
                def generate():
                    with open(str(file_path), 'rb') as f:
                        while True:
                            chunk = f.read(1024 * 1024)  # 1MB chunks
                            if not chunk:
                                break
                            yield chunk

                return Response(
                    stream_with_context(generate()),
                    mimetype='video/mp4',
                    headers={
                        'Content-Length': str(file_size),
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'no-cache',
                    }
                )

            # Parse range request (format: "bytes=start-end")
            try:
                byte_range = range_header.replace('bytes=', '').split('-')
                start = int(byte_range[0]) if byte_range[0] else 0
                end = int(byte_range[1]) if byte_range[1] else file_size - 1

                # Ensure valid range
                if start >= file_size:
                    return Response(status=416)  # Range Not Satisfiable

                end = min(end, file_size - 1)
                length = end - start + 1

                def generate_range():
                    with open(str(file_path), 'rb') as f:
                        f.seek(start)
                        remaining = length
                        while remaining > 0:
                            chunk_size = min(1024 * 1024, remaining)  # 1MB chunks
                            chunk = f.read(chunk_size)
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            yield chunk

                return Response(
                    stream_with_context(generate_range()),
                    status=206,  # Partial Content
                    mimetype='video/mp4',
                    headers={
                        'Content-Range': f'bytes {start}-{end}/{file_size}',
                        'Content-Length': str(length),
                        'Accept-Ranges': 'bytes',
                        'Cache-Control': 'no-cache',
                    }
                )
            except (ValueError, IndexError):
                return Response(status=416)  # Range Not Satisfiable

        except Exception as e:
            logger.error(f"Stream video error: {e}")
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

    @app.route("/api/extract-filter-previews", methods=["POST"])
    def extract_filter_previews():
        """
        Extract first keyframe and generate filter previews for all available filters
        This is image processing with human detection applied to a single frame

        Request body:
            video_id: str - Video filename from upload
            confidence_threshold: float - Detection confidence (0.0-1.0)
            apply_to: str - Where to apply filter ('background' or 'person')

        Returns:
            JSON with array of filter previews (base64 encoded images)
        """
        try:
            data = request.get_json()

            # Validate required fields
            if not data or 'video_id' not in data:
                return jsonify({"error": "video_id is required"}), 400

            video_id = data['video_id']
            confidence_threshold = data.get('confidence_threshold', 0.5)
            apply_to = data.get('apply_to', 'background')

            # Validate input video exists
            input_path = UPLOAD_FOLDER / video_id
            if not input_path.exists():
                return jsonify({"error": f"Video not found: {video_id}"}), 404

            logger.info(f"Extracting filter previews for video: {video_id}")

            # Open video and extract first keyframe
            cap = cv2.VideoCapture(str(input_path))
            if not cap.isOpened():
                return jsonify({"error": f"Could not open video: {video_id}"}), 500

            # Read first frame
            ret, frame = cap.read()
            cap.release()

            if not ret or frame is None:
                return jsonify({"error": "Could not extract first frame from video"}), 500

            logger.info(f"Extracted first frame: {frame.shape}")

            # Get processor
            processor = get_processor(use_sam=False)  # Use YOLO-only for speed

            # Available filters
            filter_types = ['grayscale', 'blur', 'sepia']
            previews = []

            # Generate preview for each filter
            for filter_type in filter_types:
                try:
                    # Run person detection on the frame
                    results = processor.model.predict(
                        frame,
                        classes=[0],  # class 0 = person in COCO dataset
                        conf=confidence_threshold,
                        verbose=False,
                        device=processor._get_device()
                    )

                    # Apply filter based on detection
                    if results[0].masks is not None and len(results[0].masks) > 0:
                        # Person detected - apply selective filter
                        masks = results[0].masks.data.cpu().numpy()

                        # Combine all person masks
                        combined_mask = masks[0]
                        for i in range(1, len(masks)):
                            combined_mask = np.maximum(combined_mask, masks[i])

                        height, width = frame.shape[:2]
                        combined_mask = cv2.resize(combined_mask, (width, height))
                        combined_mask = (combined_mask > 0.5).astype(np.uint8) * 255

                        # Apply filter
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
                            # Filter background, keep person in color
                            output_frame = (frame * mask_3ch + filtered * (1 - mask_3ch)).astype(np.uint8)
                        else:
                            # Filter person, keep background in color
                            output_frame = (filtered * mask_3ch + frame * (1 - mask_3ch)).astype(np.uint8)
                    else:
                        # No person detected - apply filter to entire frame
                        if filter_type == 'grayscale':
                            output_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                            output_frame = cv2.cvtColor(output_frame, cv2.COLOR_GRAY2BGR)
                        elif filter_type == 'blur':
                            output_frame = cv2.GaussianBlur(frame, (21, 21), 0)
                        else:  # sepia
                            kernel = np.array([[0.272, 0.534, 0.131],
                                             [0.349, 0.686, 0.168],
                                             [0.393, 0.769, 0.189]])
                            output_frame = cv2.transform(frame, kernel)
                            output_frame = np.clip(output_frame, 0, 255).astype(np.uint8)

                    # Save preview image to file
                    preview_filename = f"{video_id}_{filter_type}_preview.jpg"
                    preview_path = PREVIEW_FOLDER / preview_filename
                    cv2.imwrite(str(preview_path), output_frame, [cv2.IMWRITE_JPEG_QUALITY, 85])

                    # Add to previews array
                    previews.append({
                        'filter_id': filter_type,
                        'filter_name': filter_type.capitalize(),
                        'preview_url': f"/api/preview/{preview_filename}"
                    })

                    logger.info(f"Generated preview for {filter_type} filter")

                except Exception as e:
                    logger.error(f"Error generating preview for {filter_type}: {e}")
                    # Add error placeholder
                    previews.append({
                        'filter_id': filter_type,
                        'filter_name': filter_type.capitalize(),
                        'error': str(e)
                    })

            logger.info(f"Successfully generated {len(previews)} filter previews")

            return jsonify({
                "success": True,
                "video_id": video_id,
                "previews": previews,
                "frame_size": {
                    "width": frame.shape[1],
                    "height": frame.shape[0]
                }
            }), 200

        except Exception as e:
            logger.error(f"Extract filter previews error: {e}", exc_info=True)
            return jsonify({"error": str(e)}), 500
