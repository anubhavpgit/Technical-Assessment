"""
Video Processing Module with YOLOv11 Person Segmentation
Handles person detection, background segmentation, and selective filtering
"""

import cv2
import numpy as np
from ultralytics import YOLO
import logging
import os
from pathlib import Path
import time

logger = logging.getLogger(__name__)


class VideoProcessor:
    """
    Video processor using YOLOv11-seg for person detection and background segmentation
    """

    def __init__(self, model_path='yolo11n-seg.pt'):
        """
        Initialize the video processor with YOLOv11 segmentation model

        Args:
            model_path: Path to YOLOv11 segmentation model weights
        """
        try:
            logger.info(f"Loading YOLOv11 model: {model_path}")
            self.model = YOLO(model_path)
            logger.info("YOLOv11 model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise

    def process_video_selective_filter(
        self,
        input_video_path: str,
        output_video_path: str,
        filter_type: str = 'grayscale',
        apply_to: str = 'background',
        no_person_behavior: str = 'keep_original',
        confidence_threshold: float = 0.5,
        progress_callback=None
    ):
        """
        Process video with selective filtering based on person segmentation

        Args:
            input_video_path: Path to input video file
            output_video_path: Path to save processed video
            filter_type: Type of filter ('grayscale', 'blur', 'sepia')
            apply_to: Where to apply filter ('background' or 'person')
            no_person_behavior: What to do when no person detected
                               ('keep_original' or 'apply_filter')
            confidence_threshold: Confidence threshold for person detection (0.0-1.0)
            progress_callback: Optional callback function for progress updates

        Returns:
            dict: Processing statistics and metadata
        """
        start_time = time.time()

        # Validate input file
        if not os.path.exists(input_video_path):
            raise FileNotFoundError(f"Input video not found: {input_video_path}")

        # Open video capture
        cap = cv2.VideoCapture(input_video_path)
        if not cap.isOpened():
            raise ValueError(f"Could not open video: {input_video_path}")

        # Get video properties
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        logger.info(f"Video properties - FPS: {fps}, Size: {width}x{height}, Frames: {total_frames}")

        # Create output directory if needed
        output_dir = os.path.dirname(output_video_path)
        if output_dir:
            os.makedirs(output_dir, exist_ok=True)

        # Video writer
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

        if not out.isOpened():
            raise ValueError(f"Could not create output video: {output_video_path}")

        # Processing statistics
        frame_count = 0
        frames_with_person = 0
        total_inference_time = 0

        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                frame_count += 1

                # Run YOLOv11 inference
                inference_start = time.time()
                device = self._get_device()
                results = self.model.predict(
                    frame,
                    classes=[0],  # class 0 = person in COCO dataset
                    conf=confidence_threshold,
                    verbose=False,
                    device=device
                )
                inference_time = time.time() - inference_start
                total_inference_time += inference_time

                # Check if person detected
                if results[0].masks is not None and len(results[0].masks) > 0:
                    frames_with_person += 1
                    num_people = len(results[0].masks)

                    # Log detection details periodically
                    if frame_count % 100 == 0:
                        logger.info(f"Frame {frame_count}: Detected {num_people} person(s), "
                                  f"applying {filter_type} to {apply_to}")

                    # Apply selective filter (only to background or person, not entire frame)
                    output_frame = self._apply_selective_filter(
                        frame,
                        results[0].masks.data.cpu().numpy(),
                        filter_type,
                        apply_to
                    )
                else:
                    # No person detected - keep frame unchanged by default
                    if no_person_behavior == 'keep_original':
                        output_frame = frame
                        if frame_count % 100 == 0:
                            logger.info(f"Frame {frame_count}: No person detected, keeping original")
                    else:  # apply_filter to entire frame
                        output_frame = self._apply_filter(frame, filter_type)
                        if frame_count % 100 == 0:
                            logger.info(f"Frame {frame_count}: No person detected, applying full filter")

                # Write processed frame
                out.write(output_frame)

                # Progress callback
                if progress_callback and frame_count % 30 == 0:  # Update every 30 frames
                    progress = (frame_count / total_frames) * 100
                    progress_callback(progress, frame_count, total_frames)

                # Log progress periodically
                if frame_count % 100 == 0:
                    logger.info(f"Processed {frame_count}/{total_frames} frames "
                              f"({(frame_count/total_frames)*100:.1f}%)")

        finally:
            cap.release()
            out.release()

        # Calculate statistics
        processing_time = time.time() - start_time
        avg_fps = frame_count / processing_time if processing_time > 0 else 0
        avg_inference_time = (total_inference_time / frame_count * 1000) if frame_count > 0 else 0
        detection_rate = (frames_with_person / frame_count * 100) if frame_count > 0 else 0

        stats = {
            'success': True,
            'input_video': input_video_path,
            'output_video': output_video_path,
            'total_frames': frame_count,
            'frames_with_person': frames_with_person,
            'detection_rate': detection_rate,
            'processing_time': processing_time,
            'avg_fps': avg_fps,
            'avg_inference_time_ms': avg_inference_time,
            'video_properties': {
                'width': width,
                'height': height,
                'fps': fps,
                'duration': total_frames / fps if fps > 0 else 0
            },
            'filter_settings': {
                'filter_type': filter_type,
                'apply_to': apply_to,
                'no_person_behavior': no_person_behavior,
                'confidence_threshold': confidence_threshold
            }
        }

        logger.info(f"Processing complete - {frame_count} frames in {processing_time:.2f}s "
                   f"({avg_fps:.2f} FPS, {avg_inference_time:.2f}ms/frame)")
        logger.info(f"Person detected in {frames_with_person}/{frame_count} frames "
                   f"({detection_rate:.1f}%)")

        return stats

    def _apply_selective_filter(self, frame, masks, filter_type, apply_to):
        """
        Apply filter selectively to either person or background

        IMPORTANT: This applies the filter to ONLY the specified region:
        - If apply_to='background': Person stays in COLOR, background gets filtered
        - If apply_to='person': Background stays in COLOR, person gets filtered

        This means:
        - NOT the entire frame gets filtered
        - ONLY the specified region (background or person) gets the effect
        - The rest of the frame stays unchanged (original color/appearance)

        Args:
            frame: Input frame (BGR)
            masks: Person segmentation masks from YOLO (one mask per detected person)
            filter_type: Type of filter to apply ('grayscale', 'blur', 'sepia')
            apply_to: 'background' or 'person'

        Returns:
            numpy.ndarray: Processed frame with selective filtering applied
        """
        # Combine all person masks into one (handles multiple people)
        combined_mask = np.zeros(frame.shape[:2], dtype=np.float32)
        for mask in masks:
            # Resize mask to frame size
            mask_resized = cv2.resize(mask, (frame.shape[1], frame.shape[0]))
            # Combine multiple people masks (union operation)
            combined_mask = np.maximum(combined_mask, mask_resized)

        # Determine which regions to filter and which to keep original
        if apply_to == 'background':
            # DEFAULT MODE: Apply filter to background, keep person in original color
            filter_mask = 1 - combined_mask  # Filter the background (everything except person)
            keep_mask = combined_mask         # Keep the person unchanged (in color)
        else:  # apply_to == 'person'
            # INVERSE MODE: Apply filter to person, keep background in original color
            filter_mask = combined_mask       # Filter the person
            keep_mask = 1 - combined_mask     # Keep the background unchanged (in color)

        # Apply the filter to the entire frame (will be masked later)
        filtered_frame = self._apply_filter(frame, filter_type)

        # Create 3-channel masks for compositing
        filter_mask_3ch = np.stack([filter_mask] * 3, axis=-1)
        keep_mask_3ch = np.stack([keep_mask] * 3, axis=-1)

        # Composite: Combine filtered regions with original regions
        # Formula: output = (original * keep_mask) + (filtered * filter_mask)
        # This ensures only the specified region gets filtered
        output = (frame * keep_mask_3ch +
                 filtered_frame * filter_mask_3ch).astype(np.uint8)

        return output

    def _apply_filter(self, frame, filter_type):
        """
        Apply a specific filter to the entire frame

        Args:
            frame: Input frame (BGR)
            filter_type: Type of filter ('grayscale', 'blur', 'sepia')

        Returns:
            numpy.ndarray: Filtered frame
        """
        if filter_type == 'grayscale':
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            return cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

        elif filter_type == 'blur':
            return cv2.GaussianBlur(frame, (21, 21), 0)

        elif filter_type == 'sepia':
            # Sepia filter matrix
            kernel = np.array([[0.272, 0.534, 0.131],
                             [0.349, 0.686, 0.168],
                             [0.393, 0.769, 0.189]])
            sepia = cv2.transform(frame, kernel)
            sepia = np.clip(sepia, 0, 255).astype(np.uint8)
            return sepia

        else:
            # Unknown filter type, return original
            logger.warning(f"Unknown filter type: {filter_type}, returning original frame")
            return frame

    def _get_device(self):
        """
        Determine the best available device for inference
        Priority: CUDA (NVIDIA) > MPS (Apple Silicon) > CPU

        Returns:
            str: Device identifier ('cuda', 'mps', or 'cpu')
        """
        try:
            import torch

            # Check for NVIDIA CUDA
            if torch.cuda.is_available():
                return 'cuda'

            # Check for Apple Silicon MPS
            if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return 'mps'

            # Fallback to CPU
            return 'cpu'
        except:
            return 'cpu'

    def _is_cuda_available(self):
        """Check if CUDA is available for GPU acceleration"""
        try:
            import torch
            return torch.cuda.is_available()
        except:
            return False

    def _is_mps_available(self):
        """Check if MPS (Apple Silicon) is available for GPU acceleration"""
        try:
            import torch
            return hasattr(torch.backends, 'mps') and torch.backends.mps.is_available()
        except:
            return False

    def get_model_info(self):
        """Get information about the loaded model"""
        device = self._get_device()
        return {
            'model_type': 'YOLOv11-seg',
            'task': 'instance_segmentation',
            'cuda_available': self._is_cuda_available(),
            'mps_available': self._is_mps_available(),
            'device': device,
            'device_name': self._get_device_name(device)
        }

    def _get_device_name(self, device):
        """Get human-readable device name"""
        if device == 'cuda':
            try:
                import torch
                return f"NVIDIA GPU ({torch.cuda.get_device_name(0)})"
            except:
                return "NVIDIA GPU"
        elif device == 'mps':
            return "Apple Silicon GPU (Metal)"
        else:
            return "CPU"


# Singleton instance
_processor_instance = None


def get_video_processor(model_path='yolo11n-seg.pt'):
    """
    Get or create a singleton video processor instance

    Args:
        model_path: Path to YOLOv11 model weights

    Returns:
        VideoProcessor: Singleton processor instance
    """
    global _processor_instance
    if _processor_instance is None:
        _processor_instance = VideoProcessor(model_path)
    return _processor_instance
