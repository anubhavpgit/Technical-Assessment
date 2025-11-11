"""
Video Processing Module with YOLOv11 Person Segmentation + SAM Refinement
Handles person detection, background segmentation, and selective filtering
with optional SAM for pixel-perfect boundary refinement
"""

import cv2
import numpy as np
from ultralytics import YOLO
import logging
import os
from pathlib import Path
import time
import subprocess
import shutil

logger = logging.getLogger(__name__)

# SAM imports - optional, will gracefully degrade if not available
try:
    from segment_anything import sam_model_registry, SamPredictor
    SAM_AVAILABLE = True
except ImportError:
    SAM_AVAILABLE = False
    logger.warning("segment-anything not installed. SAM refinement will be disabled.")


class LayoutTracker:
    """
    Stabilizes which layout/column should be processed so the grayscale region
    does not jitter every time the person moves.
    """

    def __init__(
        self,
        frame_width,
        frame_height,
        lock_frames=8,
        unlock_frames=15,
        decay_frames=45,
        smoothing=0.15,
        full_frame_threshold=0.55,
        full_frame_release=0.45,
        center_release_frames=10,
        wide_release_ratio=0.6
    ):
        self.frame_width = frame_width
        self.frame_height = frame_height
        self.lock_frames = lock_frames
        self.unlock_frames = unlock_frames
        self.decay_frames = decay_frames
        self.smoothing = smoothing
        self.full_frame_threshold = full_frame_threshold
        self.full_frame_release = full_frame_release
        self.center_release_frames = center_release_frames
        self.wide_release_ratio = wide_release_ratio

        self.locked_side = None
        self.pending_side = None
        self.pending_count = 0
        self.drift_count = 0
        self.no_person_frames = 0
        self.smoothed_bbox = None
        self.center_count = 0

    def register_detection(self):
        self.no_person_frames = 0

    def register_no_person(self):
        self.no_person_frames += 1
        if self.no_person_frames >= self.decay_frames:
            self._reset_state()

    def update_side(self, proposed_side, area_ratio, width_ratio=None):
        """
        Update the locked layout (left/right/full) with hysteresis so that we
        only switch columns after sustained evidence.
        """
        width_ratio = width_ratio or 0.0

        if width_ratio >= self.wide_release_ratio:
            proposed_side = 'center'

        if area_ratio >= self.full_frame_threshold:
            self.locked_side = 'full'
            self.pending_side = None
            self.pending_count = 0
            self.drift_count = 0
            self.center_count = 0
            self.reset_bbox()
            return 'full'

        if self.locked_side == 'full' and area_ratio < self.full_frame_release:
            self.locked_side = None

        if self.locked_side in ('left', 'right'):
            if proposed_side == self.locked_side:
                self.center_count = 0
                self.drift_count = 0
                return self.locked_side

            if proposed_side == 'center':
                self.center_count += 1
                if self.center_count >= self.center_release_frames:
                    self.locked_side = None
                    self.drift_count = 0
                    self.reset_bbox()
                    return 'center'
                return self.locked_side

            self.center_count = 0
            self.drift_count += 1
            if self.drift_count >= self.unlock_frames:
                self.locked_side = proposed_side if proposed_side in ('left', 'right') else None
                self.drift_count = 0
                self.center_count = 0
            return self.locked_side or proposed_side

        if self.locked_side == 'full':
            return 'full'

        if proposed_side in ('left', 'right'):
            self.center_count = 0
            if self.pending_side == proposed_side:
                self.pending_count += 1
            else:
                self.pending_side = proposed_side
                self.pending_count = 1

            if self.pending_count >= self.lock_frames:
                self.locked_side = proposed_side
                self.pending_side = None
                self.pending_count = 0
                self.reset_bbox()
                return self.locked_side
        else:
            self.pending_side = None
            self.pending_count = 0

        if proposed_side == 'center':
            self.center_count += 1
        else:
            self.center_count = 0

        return proposed_side

    def smooth_bbox(self, bbox):
        """
        Apply exponential smoothing to the rectangular region we process
        when no column layout is locked.
        """
        if bbox is None:
            return None

        if self.smoothed_bbox is None:
            self.smoothed_bbox = tuple(int(v) for v in bbox)
            return self.smoothed_bbox

        smoothed = []
        for prev, cur in zip(self.smoothed_bbox, bbox):
            val = int(self.smoothing * cur + (1 - self.smoothing) * prev)
            smoothed.append(val)

        x1, y1, x2, y2 = smoothed
        x1 = max(0, min(self.frame_width, x1))
        x2 = max(0, min(self.frame_width, x2))
        y1 = max(0, min(self.frame_height, y1))
        y2 = max(0, min(self.frame_height, y2))

        if x2 <= x1:
            x2 = min(self.frame_width, x1 + 1)
        if y2 <= y1:
            y2 = min(self.frame_height, y1 + 1)

        self.smoothed_bbox = (x1, y1, x2, y2)
        return self.smoothed_bbox

    def reset_bbox(self):
        self.smoothed_bbox = None

    def _reset_state(self):
        self.locked_side = None
        self.pending_side = None
        self.pending_count = 0
        self.drift_count = 0
        self.smoothed_bbox = None
        self.center_count = 0



class VideoProcessor:
    """
    Video processor using YOLOv11-seg for person detection and optional SAM for refinement
    """

    def __init__(self, model_path='yolo11n-seg.pt', use_sam=False, sam_model_type='vit_b', sam_checkpoint=None):
        """
        Initialize the video processor with YOLOv11 segmentation model and optional SAM

        Args:
            model_path: Path to YOLOv11 segmentation model weights
            use_sam: Enable SAM refinement for pixel-perfect boundaries
            sam_model_type: SAM model type ('vit_b', 'vit_l', 'vit_h')
            sam_checkpoint: Path to SAM checkpoint file (auto-detects if None)
        """
        # Load YOLO
        try:
            logger.info(f"Loading YOLOv11 model: {model_path}")
            self.model = YOLO(model_path)
            logger.info("YOLOv11 model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise

        # Optionally load SAM
        self.use_sam = use_sam and SAM_AVAILABLE
        self.sam_predictor = None

        if use_sam:
            if not SAM_AVAILABLE:
                logger.warning("SAM requested but not available. Install with: pip install segment-anything")
                self.use_sam = False
            else:
                try:
                    # Auto-detect SAM checkpoint if not provided
                    if sam_checkpoint is None:
                        models_dir = Path(__file__).parent / 'models'
                        sam_checkpoint = models_dir / f'sam_{sam_model_type}_01ec64.pth'

                    if not os.path.exists(sam_checkpoint):
                        logger.warning(f"SAM checkpoint not found: {sam_checkpoint}")
                        logger.warning("Download from: https://github.com/facebookresearch/segment-anything#model-checkpoints")
                        self.use_sam = False
                    else:
                        logger.info(f"Loading SAM model: {sam_model_type}")
                        sam = sam_model_registry[sam_model_type](checkpoint=str(sam_checkpoint))
                        sam.to(device=self._get_device())
                        self.sam_predictor = SamPredictor(sam)
                        logger.info("SAM model loaded successfully - pixel-perfect refinement enabled")
                except Exception as e:
                    logger.error(f"Failed to load SAM: {e}")
                    logger.warning("Falling back to YOLO-only mode")
                    self.use_sam = False

        self._prev_mask = None
        self._prev_gray = None
        self._missing_person_frames = 0

    def process_video_selective_filter(
        self,
        input_video_path: str,
        output_video_path: str,
        filter_type: str = 'grayscale',
        apply_to: str = 'background',
        no_person_behavior: str = 'keep_original',
        confidence_threshold: float = 0.5,
        progress_callback=None,
        region_aware: bool = True,
        roi_expansion: float = 0.3,
        boundary_refinement: str = 'balanced'
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
            region_aware: If True, only process the column/region where person appears
            roi_expansion: How much to expand the person's bounding box to define region (0.3 = 30%)
            boundary_refinement: Boundary refinement level ('minimal', 'balanced', 'aggressive')
                                - 'minimal': Use raw YOLO mask with minimal refinement (most precise)
                                - 'balanced': Moderate refinement to fill small gaps (default)
                                - 'aggressive': Strong refinement for incomplete detections

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

        # Video writer - Use H.264 codec for browser compatibility
        # Try avc1 first (H.264), fallback to mp4v if not available
        fourcc = cv2.VideoWriter_fourcc(*'avc1')
        out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

        # If avc1 fails, try H264
        if not out.isOpened():
            logger.warning("avc1 codec not available, trying H264")
            fourcc = cv2.VideoWriter_fourcc(*'H264')
            out = cv2.VideoWriter(output_video_path, fourcc, fps, (width, height))

        if not out.isOpened():
            raise ValueError(f"Could not create output video: {output_video_path}")

        # Processing statistics
        frame_count = 0
        frames_with_person = 0
        total_inference_time = 0
        layout_tracker = LayoutTracker(width, height)
        self._reset_temporal_state()

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
                    layout_tracker.register_detection()
                    self._missing_person_frames = 0

                    # Log detection details periodically
                    if frame_count % 100 == 0:
                        logger.info(f"Frame {frame_count}: Detected {num_people} person(s), "
                                  f"applying {filter_type} to {apply_to}")

                    # Apply selective filter with region awareness
                    output_frame = self._apply_selective_filter(
                        frame,
                        results[0].masks.data.cpu().numpy(),
                        filter_type,
                        apply_to,
                        region_aware=region_aware,
                        roi_expansion=roi_expansion,
                        layout_tracker=layout_tracker,
                        boundary_refinement=boundary_refinement
                    )
                else:
                    layout_tracker.register_no_person()
                    self._missing_person_frames += 1
                    if self._missing_person_frames >= 6:
                        self._reset_temporal_state()
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
                'confidence_threshold': confidence_threshold,
                'region_aware': region_aware,
                'roi_expansion': roi_expansion,
                'boundary_refinement': boundary_refinement
            }
        }

        logger.info(f"Processing complete - {frame_count} frames in {processing_time:.2f}s "
                   f"({avg_fps:.2f} FPS, {avg_inference_time:.2f}ms/frame)")
        logger.info(f"Person detected in {frames_with_person}/{frame_count} frames "
                   f"({detection_rate:.1f}%)")

        # Re-encode with ffmpeg and add audio from original video
        try:
            self._reencode_with_audio(input_video_path, output_video_path)
        except Exception as e:
            logger.warning(f"FFmpeg re-encoding with audio failed: {e}")
            # Try without audio as fallback
            try:
                self._reencode_with_ffmpeg(output_video_path)
            except Exception as e2:
                logger.warning(f"FFmpeg re-encoding failed, video may have compatibility issues: {e2}")

        return stats

    def _calculate_expanded_region(self, masks, frame_shape, expansion=0.3, layout_tracker=None):
        """
        Calculate expanded region/column where person appears
        Intelligently adapts based on how much of the frame the person occupies

        Args:
            masks: Person segmentation masks
            frame_shape: Frame dimensions (height, width, channels)
            expansion: How much to expand beyond person (0.3 = 30% on each side)
            layout_tracker: Optional tracker to lock layout columns over time

        Returns:
            numpy.ndarray: Region mask (1.0 in region to process, 0.0 elsewhere), or None for full frame
        """
        height, width = frame_shape[:2]
        frame_area = height * width

        # Find bounding box of all people
        min_x, min_y = width, height
        max_x, max_y = 0, 0

        for mask in masks:
            mask_resized = cv2.resize(mask, (width, height))
            mask_binary = (mask_resized > 0.5).astype(np.uint8)

            # Find contours
            contours, _ = cv2.findContours(mask_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for contour in contours:
                x, y, w, h = cv2.boundingRect(contour)
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x + w)
                max_y = max(max_y, y + h)

        # Calculate bounding box dimensions
        bbox_width = max_x - min_x
        bbox_height = max_y - min_y
        bbox_area = bbox_width * bbox_height
        width_ratio = bbox_width / width if width else 0

        # INTELLIGENT ADAPTATION: If person occupies >50% of frame, process entire frame
        # This handles dynamic layout changes (multi-column -> full-screen)
        area_ratio = bbox_area / frame_area if frame_area else 0

        if bbox_area <= 0:
            return None

        person_center_x = (min_x + max_x) / 2
        if person_center_x < width * 0.4:
            proposed_side = 'left'
        elif person_center_x > width * 0.6:
            proposed_side = 'right'
        else:
            proposed_side = 'center'

        side = proposed_side
        if layout_tracker is not None:
            side = layout_tracker.update_side(proposed_side, area_ratio, width_ratio=width_ratio)
        elif area_ratio > 0.5:
            side = 'full'

        if side == 'full':
            if layout_tracker:
                layout_tracker.reset_bbox()
            logger.debug(f"Person occupies {area_ratio*100:.1f}% of frame - processing entire frame")
            return None

        if side == 'left':
            if layout_tracker:
                layout_tracker.reset_bbox()
            region_x1 = 0
            region_x2 = int(width * 0.55)
            region_y1 = 0
            region_y2 = height
            logger.debug("Person locked in LEFT column - processing left region")
        elif side == 'right':
            if layout_tracker:
                layout_tracker.reset_bbox()
            region_x1 = int(width * 0.45)
            region_x2 = width
            region_y1 = 0
            region_y2 = height
            logger.debug("Person locked in RIGHT column - processing right region")
        else:
            # Person is centered or layout unlocked - use aggressive expansion
            expand_x = int(bbox_width * max(expansion, 0.5))
            expand_y = int(bbox_height * max(expansion, 0.5))

            region_x1 = max(0, min_x - expand_x)
            region_y1 = max(0, min_y - expand_y)
            region_x2 = min(width, max_x + expand_x)
            region_y2 = min(height, max_y + expand_y)

            if layout_tracker:
                smoothed = layout_tracker.smooth_bbox((region_x1, region_y1, region_x2, region_y2))
                if smoothed:
                    region_x1, region_y1, region_x2, region_y2 = smoothed

            logger.debug("Person centered - using expanded rectangular region")

        # Create region mask
        region_mask = np.zeros((height, width), dtype=np.float32)
        region_mask[region_y1:region_y2, region_x1:region_x2] = 1.0

        logger.debug(f"Person occupies {area_ratio*100:.1f}% of frame - region: [{region_x1}:{region_x2}, {region_y1}:{region_y2}]")
        return region_mask

    def _refine_mask_with_sam(self, frame, yolo_mask):
        """
        Use SAM to refine YOLO's mask into pixel-perfect boundaries.
        SAM excels at capturing fine details like arms on tables.

        Args:
            frame: Input frame (BGR format)
            yolo_mask: Rough mask from YOLO (H, W) float32

        Returns:
            Refined mask with pixel-perfect boundaries (H, W) float32
        """
        if not self.use_sam or self.sam_predictor is None:
            return yolo_mask

        try:
            # Convert BGR to RGB for SAM
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

            # Set image for SAM
            self.sam_predictor.set_image(frame_rgb)

            # Get bounding box from YOLO mask
            mask_binary = (yolo_mask > 0.5).astype(np.uint8)
            contours, _ = cv2.findContours(mask_binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if len(contours) == 0:
                return yolo_mask

            # Get bounding box from largest contour
            contour = max(contours, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(contour)

            # Expand box slightly for better SAM performance
            expand = 10
            x1 = max(0, x - expand)
            y1 = max(0, y - expand)
            x2 = min(frame.shape[1], x + w + expand)
            y2 = min(frame.shape[0], y + h + expand)

            box = np.array([x1, y1, x2, y2])

            # Use YOLO mask as additional hint (downsampled to 256x256 for SAM)
            mask_hint = cv2.resize(yolo_mask, (256, 256))

            # Run SAM prediction with both box and mask hints
            refined_masks, scores, _ = self.sam_predictor.predict(
                box=box,
                mask_input=mask_hint[None, :, :],
                multimask_output=False  # Single best mask
            )

            # Resize refined mask back to frame size
            refined_mask = cv2.resize(
                refined_masks[0].astype(np.float32),
                (frame.shape[1], frame.shape[0])
            )

            logger.debug(f"SAM refinement applied - quality score: {scores[0]:.3f}")
            return refined_mask

        except Exception as e:
            logger.warning(f"SAM refinement failed: {e}. Using YOLO mask.")
            return yolo_mask

    def _apply_selective_filter(self, frame, masks, filter_type, apply_to,
                               region_aware=True, roi_expansion=0.3,
                               layout_tracker=None, boundary_refinement='balanced'):
        """
        Apply filter selectively to either person or background

        CORRECT IMPLEMENTATION:
        - Uses actual YOLO segmentation mask for person detection (follows contours precisely)
        - Uses region mask to determine which area to process (handles multi-column)
        - Properly composites: person in color, background filtered, other areas untouched
        - Configurable boundary refinement for balancing precision vs completeness

        Args:
            frame: Input frame (BGR)
            masks: Person segmentation masks from YOLO (pixel-perfect person detection)
            filter_type: Type of filter to apply
            apply_to: 'background' or 'person'
            region_aware: If True, only process region where person detected
            roi_expansion: Expansion factor for region (0.3 = 30%)
            layout_tracker: Optional tracker that stabilizes the processing region
            boundary_refinement: 'minimal', 'balanced', or 'aggressive' refinement level

        Returns:
            numpy.ndarray: Processed frame
        """
        # Combine all person masks - this is PIXEL-PERFECT segmentation from YOLO
        # It follows the exact contours of the person, including spaces between arms/body
        combined_mask = np.zeros(frame.shape[:2], dtype=np.float32)
        for mask in masks:
            mask_resized = cv2.resize(mask, (frame.shape[1], frame.shape[0]))
            combined_mask = np.maximum(combined_mask, mask_resized)

        # HYBRID YOLO+SAM: If SAM is enabled, use it for pixel-perfect refinement
        if self.use_sam and self.sam_predictor is not None:
            logger.debug("Using SAM for pixel-perfect boundary refinement")
            combined_mask = self._refine_mask_with_sam(frame, combined_mask)
            # SAM output is already pixel-perfect, just apply slight temporal smoothing
            combined_mask = self._temporal_smooth_mask(combined_mask, frame)
        else:
            # CONFIGURABLE REFINEMENT: Apply boundary refinement based on selected level
            mask_binary = (combined_mask > 0.5).astype(np.uint8)

            if boundary_refinement == 'minimal':
                # MINIMAL: Use RAW YOLO mask with NO additional processing
                # This is the cleanest, most precise detection directly from YOLOv11
                # Best when original YOLO detection is good (which it usually is)
                # Just use the combined_mask as-is, no modifications
                pass  # No processing - use raw YOLO mask

            elif boundary_refinement == 'aggressive':
                # AGGRESSIVE: Strong refinement to fill gaps and extend boundaries
                # Best when YOLO misses significant body parts
                min_dim = min(frame.shape[:2])
                kernel_size = max(9, int(min_dim * 0.03))
                if kernel_size % 2 == 0:
                    kernel_size += 1
                kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
                mask_refined = cv2.morphologyEx(mask_binary, cv2.MORPH_CLOSE, kernel)

                # Apply aggressive geometric enhancement
                mask_refined = self._enhance_person_mask_geometry_aggressive(mask_refined, frame.shape)

                # Edge-aware refinement
                combined_mask = self._refine_mask_with_grabcut(frame, mask_refined.astype(np.float32))

                # Temporal smoothing
                combined_mask = self._temporal_smooth_mask(combined_mask, frame)

                # Blur for smooth transitions
                combined_mask = cv2.GaussianBlur(combined_mask, (7, 7), 0)

            else:  # 'balanced' (default)
                # BALANCED: Very light refinement - just temporal smoothing and slight blur
                # Keeps YOLO's original boundaries but smooths transitions between frames
                # This is much closer to raw YOLO output

                # Only apply temporal smoothing to reduce flickering between frames
                combined_mask = self._temporal_smooth_mask(combined_mask, frame)

                # Very slight blur to soften hard edges (3x3 instead of 5x5)
                combined_mask = cv2.GaussianBlur(combined_mask, (3, 3), 0)

        # Calculate region mask if region-aware mode is enabled
        region_mask = None
        if region_aware:
            region_mask = self._calculate_expanded_region(
                masks,
                frame.shape,
                roi_expansion,
                layout_tracker=layout_tracker
            )

        # If no region mask (None), it means process entire frame
        if region_mask is None:
            region_mask = np.ones(frame.shape[:2], dtype=np.float32)

        # Determine base masks using ACTUAL person segmentation
        if apply_to == 'background':
            # We want to filter background, keep person in color
            # combined_mask = 1.0 where person is, 0.0 where background is
            person_mask = combined_mask
            background_mask = 1 - combined_mask
        else:
            # Filter person, keep background in color
            person_mask = 1 - combined_mask
            background_mask = combined_mask

        # Apply region constraint
        # CRITICAL FIX: Only filter background pixels that are within the processing region
        # Formula breakdown:
        # - background_mask: All background pixels (0.0 = not background, 1.0 = background)
        # - region_mask: Processing region (0.0 = don't process, 1.0 = process)
        # - background_mask * region_mask: Background pixels within processing region only
        filter_mask = background_mask * region_mask

        # CRITICAL FIX: Keep person pixels everywhere + keep all pixels outside region
        # Formula breakdown:
        # - person_mask: Person pixels (1.0 = person, 0.0 = not person)
        # - (1 - region_mask): Pixels outside processing region
        # - (1 - person_mask): Non-person pixels
        # - (1 - region_mask) * (1 - person_mask): Background pixels outside region
        # Final: person_mask + (1 - region_mask) = person + everything outside region
        keep_mask = person_mask + (1 - region_mask)

        # Ensure masks sum to 1.0 for proper compositing
        # This prevents double-darkening or over-brightening
        keep_mask = np.clip(keep_mask, 0, 1)
        filter_mask = np.clip(filter_mask, 0, 1)

        # Apply filter to entire frame
        filtered_frame = self._apply_filter(frame, filter_type)

        # Create 3-channel masks for compositing
        filter_mask_3ch = np.stack([filter_mask] * 3, axis=-1)
        keep_mask_3ch = np.stack([keep_mask] * 3, axis=-1)

        # Composite result using proper alpha blending
        # output = original_pixels_we_keep + filtered_pixels_we_apply
        output = (frame * keep_mask_3ch + filtered_frame * filter_mask_3ch).astype(np.uint8)

        return output

    def _refine_mask_with_grabcut(self, frame, mask):
        """
        Use GrabCut to pull in ambiguous regions (e.g., arms on desks) so the
        body mask follows the true silhouette more closely.

        TUNED: Reduced kernel sizes for more conservative refinement that respects
        natural boundaries better.
        """
        if frame is None or mask is None:
            return mask.astype(np.float32)

        mask_binary = (mask > 0.5).astype(np.uint8)
        if np.count_nonzero(mask_binary) < 10:
            return mask.astype(np.float32)

        # TUNED: Reduced from (9,9) to (5,5) and (21,21) to (11,11) for gentler refinement
        fg_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        bg_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (11, 11))

        sure_fg = cv2.erode(mask_binary, fg_kernel, iterations=1)
        sure_bg = cv2.dilate(1 - mask_binary, bg_kernel, iterations=1)

        grabcut_mask = np.full(mask_binary.shape, cv2.GC_PR_BGD, dtype=np.uint8)
        grabcut_mask[mask_binary == 1] = cv2.GC_PR_FGD
        grabcut_mask[sure_fg == 1] = cv2.GC_FGD
        grabcut_mask[sure_bg == 1] = cv2.GC_BGD

        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)

        try:
            cv2.grabCut(
                frame,
                grabcut_mask,
                None,
                bgd_model,
                fgd_model,
                1,
                cv2.GC_INIT_WITH_MASK
            )
        except cv2.error as err:
            logger.debug(f"GrabCut refinement skipped due to OpenCV error: {err}")
            return mask.astype(np.float32)
        except Exception as err:
            logger.debug(f"GrabCut refinement skipped: {err}")
            return mask.astype(np.float32)

        refined = np.where(
            (grabcut_mask == cv2.GC_FGD) | (grabcut_mask == cv2.GC_PR_FGD),
            1.0,
            0.0
        ).astype(np.float32)

        return refined

    def _enhance_person_mask_geometry_aggressive(self, mask, frame_shape):
        """
        AGGRESSIVE geometric enhancement with convex hull for incomplete detections.
        Uses stronger morphological operations and convex hull to fill large gaps.

        WARNING: May create unnatural pyramidic boundaries. Use only when YOLO
        detection is very poor and missing significant body parts.
        """
        if mask is None:
            return mask

        enhanced = (mask > 0).astype(np.uint8)
        if np.count_nonzero(enhanced) == 0:
            return enhanced.astype(np.float32)

        # Fill holes aggressively
        enhanced = self._fill_mask_holes(enhanced)

        # Apply convex hull to fill large gaps
        contours, _ = cv2.findContours(enhanced, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        hull_mask = np.zeros_like(enhanced)
        frame_area = frame_shape[0] * frame_shape[1]
        min_contour_area = max(300, frame_area // 1000)

        for contour in contours:
            if cv2.contourArea(contour) < min_contour_area:
                continue
            hull = cv2.convexHull(contour)
            cv2.drawContours(hull_mask, [hull], -1, 1, thickness=-1)

        enhanced = np.maximum(enhanced, hull_mask)

        # Strong morphological closing
        min_dim = min(frame_shape[:2])
        close_kernel = self._build_ellipse_kernel(min_dim, 0.05, min_size=11, max_size=61)
        enhanced = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, close_kernel)

        # Aggressive lower mask extension
        enhanced = self._extend_lower_mask_aggressive(enhanced)

        return enhanced.astype(np.float32)

    def _enhance_person_mask_geometry(self, mask, frame_shape):
        """
        Gently fill small gaps (e.g., between crossed arms and torso) while
        maintaining natural body boundaries. Extends lower body region moderately
        to capture hands resting on desks.

        CRITICAL FIX: Removed convex hull which was causing pyramidic boundaries.
        Now uses gentler morphological operations to preserve natural body contours.
        """
        if mask is None:
            return mask

        enhanced = (mask > 0).astype(np.uint8)
        if np.count_nonzero(enhanced) == 0:
            return enhanced.astype(np.float32)

        # Fill internal holes (gaps between arms and torso)
        enhanced = self._fill_mask_holes(enhanced)

        # REMOVED: Convex hull operation that was creating pyramidic boundaries
        # The convex hull was too aggressive and created unnatural triangular shapes
        # Instead, we rely on gentler morphological closing below

        # Use GENTLER morphological closing to connect nearby regions
        # Reduced kernel size significantly to avoid over-expansion
        min_dim = min(frame_shape[:2])
        # Changed from 0.05 to 0.02 (60% reduction) for more conservative closing
        close_kernel = self._build_ellipse_kernel(min_dim, 0.02, min_size=5, max_size=25)
        enhanced = cv2.morphologyEx(enhanced, cv2.MORPH_CLOSE, close_kernel)

        # Moderately extend lower body for hands on desk
        enhanced = self._extend_lower_mask(enhanced)

        return enhanced.astype(np.float32)

    def _fill_mask_holes(self, mask):
        mask_uint8 = (mask > 0).astype(np.uint8) * 255
        h, w = mask_uint8.shape
        flood = mask_uint8.copy()
        fill_mask = np.zeros((h + 2, w + 2), dtype=np.uint8)
        cv2.floodFill(flood, fill_mask, (0, 0), 255)
        holes = cv2.bitwise_not(flood)
        filled = cv2.bitwise_or(mask_uint8, holes)
        return (filled > 0).astype(np.uint8)

    def _extend_lower_mask_aggressive(self, mask):
        """
        AGGRESSIVE lower mask extension for capturing arms/hands on desks.
        Uses larger kernels and more aggressive dilation.
        """
        h, w = mask.shape
        if h == 0 or w == 0:
            return mask

        # Process lower 60% of frame
        band_start = int(h * 0.4)
        lower_band = mask.copy()
        lower_band[:band_start, :] = 0

        # Aggressive kernel sizes (original values)
        kernel_w = int(max(7, min(w - 1 if w > 1 else 1, w * 0.08)))
        kernel_h = int(max(5, min(h - 1 if h > 1 else 1, h * 0.04)))

        if kernel_w % 2 == 0:
            kernel_w = max(3, kernel_w - 1)
        if kernel_h % 2 == 0:
            kernel_h = max(3, kernel_h - 1)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, kernel_w), max(3, kernel_h)))
        extended = cv2.dilate(lower_band, kernel, iterations=1)

        return np.maximum(mask, extended)

    def _extend_lower_mask(self, mask):
        """
        Moderately extend the lower body region to capture hands/arms on desks.

        TUNED: Reduced extension aggressiveness to preserve natural boundaries.
        """
        h, w = mask.shape
        if h == 0 or w == 0:
            return mask

        # Only process lower 60% of frame (changed from 40% for more conservative approach)
        band_start = int(h * 0.5)
        lower_band = mask.copy()
        lower_band[:band_start, :] = 0

        # TUNED: Reduced kernel sizes from 0.08/0.04 to 0.04/0.02 (50% reduction)
        kernel_w = int(max(5, min(w - 1 if w > 1 else 1, w * 0.04)))
        kernel_h = int(max(3, min(h - 1 if h > 1 else 1, h * 0.02)))

        if kernel_w % 2 == 0:
            kernel_w = max(3, kernel_w - 1)
        if kernel_h % 2 == 0:
            kernel_h = max(3, kernel_h - 1)

        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, kernel_w), max(3, kernel_h)))
        extended = cv2.dilate(lower_band, kernel, iterations=1)

        return np.maximum(mask, extended)

    def _build_ellipse_kernel(self, min_dim, fraction, min_size=9, max_size=61):
        size = int(max(min_size, min(max_size, round(min_dim * fraction))))
        if size % 2 == 0:
            size += 1
        return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (size, size))

    def _temporal_smooth_mask(self, mask, frame):
        mask = np.clip(mask, 0, 1).astype(np.float32)
        try:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        except cv2.error:
            return mask

        if (
            self._prev_mask is not None and
            self._prev_gray is not None and
            self._prev_mask.shape == mask.shape and
            self._prev_gray.shape == gray.shape
        ):
            try:
                flow = cv2.calcOpticalFlowFarneback(
                    self._prev_gray,
                    gray,
                    None,
                    0.5,
                    1,
                    23,
                    2,
                    7,
                    1.5,
                    0
                )

                h, w = mask.shape
                grid_x, grid_y = np.meshgrid(np.arange(w), np.arange(h))
                map_x = (grid_x + flow[..., 0]).astype(np.float32)
                map_y = (grid_y + flow[..., 1]).astype(np.float32)
                warped_prev = cv2.remap(
                    self._prev_mask,
                    map_x,
                    map_y,
                    interpolation=cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_CONSTANT,
                    borderValue=0
                )
                mask = np.maximum(mask, warped_prev * 0.8)
                mask = np.clip(mask, 0, 1)
            except cv2.error as err:
                logger.debug(f"Optical flow smoothing skipped: {err}")

        self._prev_gray = gray
        self._prev_mask = mask.copy()
        return mask

    def _reset_temporal_state(self):
        self._prev_mask = None
        self._prev_gray = None
        self._missing_person_frames = 0

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

    def _reencode_with_audio(self, input_video_path, output_video_path):
        """
        Re-encode processed video with audio from original video
        Uses H.264 codec with web-optimized settings

        Args:
            input_video_path: Path to original video (with audio)
            output_video_path: Path to processed video (without audio)
        """
        # Check if ffmpeg is available
        if not shutil.which('ffmpeg'):
            logger.warning("ffmpeg not found in PATH, skipping re-encoding")
            return

        logger.info(f"Re-encoding video with audio from original: {output_video_path}")

        # Create temporary output path
        temp_path = output_video_path.replace('.mp4', '_temp.mp4')

        try:
            # FFmpeg command to combine processed video with original audio
            cmd = [
                'ffmpeg',
                '-i', output_video_path,      # Processed video (no audio)
                '-i', input_video_path,       # Original video (with audio)
                '-c:v', 'libx264',            # H.264 video codec
                '-preset', 'medium',           # Encoding speed/quality tradeoff
                '-crf', '23',                  # Quality (lower = better, 18-28 is good range)
                '-pix_fmt', 'yuv420p',         # Pixel format for compatibility
                '-c:a', 'aac',                 # AAC audio codec (browser compatible)
                '-b:a', '192k',                # Audio bitrate
                '-map', '0:v:0',               # Take video from first input (processed)
                '-map', '1:a:0?',              # Take audio from second input (original), if exists
                '-movflags', '+faststart',     # Enable streaming (moov atom at start)
                '-shortest',                   # Match shortest stream duration
                '-y',                          # Overwrite output file
                temp_path
            ]

            # Run ffmpeg
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=300  # 5 minute timeout
            )

            if result.returncode == 0:
                # Replace original with re-encoded version
                shutil.move(temp_path, output_video_path)
                logger.info("Video successfully re-encoded with audio")
            else:
                logger.error(f"FFmpeg re-encoding failed: {result.stderr.decode()}")
                # Clean up temp file if it exists
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        except subprocess.TimeoutExpired:
            logger.error("FFmpeg re-encoding timed out")
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as e:
            logger.error(f"FFmpeg re-encoding error: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)

    def _reencode_with_ffmpeg(self, video_path):
        """
        Re-encode video with ffmpeg to ensure browser compatibility
        Uses H.264 codec with web-optimized settings

        Args:
            video_path: Path to video file to re-encode
        """
        # Check if ffmpeg is available
        if not shutil.which('ffmpeg'):
            logger.warning("ffmpeg not found in PATH, skipping re-encoding")
            return

        logger.info(f"Re-encoding video with ffmpeg for browser compatibility: {video_path}")

        # Create temporary output path
        temp_path = video_path.replace('.mp4', '_temp.mp4')

        try:
            # FFmpeg command for browser-compatible H.264 encoding
            cmd = [
                'ffmpeg',
                '-i', video_path,
                '-c:v', 'libx264',           # H.264 video codec
                '-preset', 'medium',          # Encoding speed/quality tradeoff
                '-crf', '23',                 # Quality (lower = better, 18-28 is good range)
                '-pix_fmt', 'yuv420p',        # Pixel format for compatibility
                '-movflags', '+faststart',    # Enable streaming (moov atom at start)
                '-y',                         # Overwrite output file
                temp_path
            ]

            # Run ffmpeg
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=300  # 5 minute timeout
            )

            if result.returncode == 0:
                # Replace original with re-encoded version
                shutil.move(temp_path, video_path)
                logger.info("Video successfully re-encoded with ffmpeg")
            else:
                logger.error(f"FFmpeg re-encoding failed: {result.stderr.decode()}")
                # Clean up temp file if it exists
                if os.path.exists(temp_path):
                    os.remove(temp_path)

        except subprocess.TimeoutExpired:
            logger.error("FFmpeg re-encoding timed out")
            if os.path.exists(temp_path):
                os.remove(temp_path)
        except Exception as e:
            logger.error(f"FFmpeg re-encoding error: {e}")
            if os.path.exists(temp_path):
                os.remove(temp_path)


# Singleton instance
_processor_instance = None


def get_video_processor(model_path='yolo11n-seg.pt', use_sam=False, sam_model_type='vit_b'):
    """
    Get or create a singleton video processor instance

    Args:
        model_path: Path to YOLOv11 model weights
        use_sam: Enable SAM refinement for pixel-perfect boundaries
        sam_model_type: SAM model type ('vit_b', 'vit_l', 'vit_h')

    Returns:
        VideoProcessor: Singleton processor instance
    """
    global _processor_instance
    # Recreate instance if SAM settings changed
    if _processor_instance is None or (_processor_instance.use_sam != use_sam):
        _processor_instance = VideoProcessor(
            model_path=model_path,
            use_sam=use_sam,
            sam_model_type=sam_model_type
        )
    return _processor_instance
