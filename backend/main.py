from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from dotenv import load_dotenv
import logging
import os
from pathlib import Path
from werkzeug.utils import secure_filename
import uuid
from video_processor import get_video_processor

app = Flask(__name__)
cors = CORS(app)

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
UPLOAD_FOLDER = Path(__file__).parent / 'uploads'
PROCESSED_FOLDER = Path(__file__).parent / 'processed'
ALLOWED_EXTENSIONS = {'mp4', 'mov', 'avi', 'webm', 'mkv'}
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB

# Create directories
UPLOAD_FOLDER.mkdir(exist_ok=True)
PROCESSED_FOLDER.mkdir(exist_ok=True)

# Initialize video processor (lazy loading)
video_processor = None


def get_processor():
    """Get or initialize the video processor"""
    global video_processor
    if video_processor is None:
        logger.info("Initializing video processor...")
        video_processor = get_video_processor('yolo11n-seg.pt')
        logger.info("Video processor initialized successfully")
    return video_processor


def allowed_file(filename):
    """Check if file extension is allowed"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


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

        # Validate input video exists
        input_path = UPLOAD_FOLDER / video_id
        if not input_path.exists():
            return jsonify({"error": f"Video not found: {video_id}"}), 404

        # Generate output filename
        output_filename = f"processed_{uuid.uuid4()}.mp4"
        output_path = PROCESSED_FOLDER / output_filename

        logger.info(f"Starting video processing: {video_id}")
        logger.info(f"Settings - Filter: {filter_type}, Apply to: {apply_to}, "
                   f"Confidence: {confidence_threshold}")

        # Get processor and process video
        processor = get_processor()
        stats = processor.process_video_selective_filter(
            input_video_path=str(input_path),
            output_video_path=str(output_path),
            filter_type=filter_type,
            apply_to=apply_to,
            no_person_behavior=no_person_behavior,
            confidence_threshold=confidence_threshold
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
    app.run(host='0.0.0.0', port=8080, debug=True, use_reloader=False)
