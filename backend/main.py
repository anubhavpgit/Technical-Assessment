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
# Configure CORS to handle all origins and automatic OPTIONS
CORS(app, origins="*", allow_headers=["Content-Type"], supports_credentials=False)

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

# Import helper functions
from helpers import (
    jobs, jobs_lock,
    create_job as create_job_helper,
    update_job_progress as update_job_progress_helper,
    update_job_status, add_job_segment, get_job,
    allowed_file as allowed_file_helper
)

# Initialize video processor (lazy loading)
video_processor = None


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


# Wrapper functions for helpers with appropriate signatures
def allowed_file(filename):
    """Check if file extension is allowed"""
    return allowed_file_helper(filename, ALLOWED_EXTENSIONS)


def create_job(video_id, params):
    """Create a new processing job"""
    return create_job_helper(video_id, params)


def update_job_progress(job_id, current, total, fps=0, preview_frame=None):
    """Update job progress"""
    return update_job_progress_helper(job_id, current, total, fps, preview_frame, PREVIEW_FOLDER)


def process_video_background(job_id):
    """Background task for video processing - delegates to helper"""
    from helpers import process_video_background as process_video_background_helper
    return process_video_background_helper(
        job_id,
        UPLOAD_FOLDER,
        PROCESSED_FOLDER,
        PREVIEW_FOLDER,
        get_processor,
        update_job_progress,
        update_job_status,
        get_job
    )


# Register API routes
from api import register_routes

config = {
    'logger': logger,
    'UPLOAD_FOLDER': UPLOAD_FOLDER,
    'PROCESSED_FOLDER': PROCESSED_FOLDER,
    'PREVIEW_FOLDER': PREVIEW_FOLDER,
    'ALLOWED_EXTENSIONS': ALLOWED_EXTENSIONS,
    'MAX_FILE_SIZE': MAX_FILE_SIZE,
    'get_processor': get_processor,
    'allowed_file': allowed_file,
    'create_job': create_job,
    'update_job_status': update_job_status,
    'get_job': get_job,
    'process_video_background': process_video_background
}

register_routes(app, config)


if __name__ == "__main__":
    logger.info("Starting Overlap Video Processing Server")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    logger.info(f"Processed folder: {PROCESSED_FOLDER}")
    app.run(host='0.0.0.0', port=8080, debug=True, use_reloader=True)
