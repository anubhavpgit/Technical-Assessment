import React from 'react';
import { Detection } from '../types';

interface DetectionStatsProps {
  detections: Detection[];
  processingTime: number;
  isDetecting: boolean;
}

const DetectionStats: React.FC<DetectionStatsProps> = ({ 
  detections, 
  processingTime, 
  isDetecting 
}) => {
  const averageConfidence = detections.length > 0 
    ? detections.reduce((sum, det) => sum + det.confidence, 0) / detections.length
    : 0;

  return (
    <div className="stats">
      <h3>Detection Results</h3>
      <div className="stats-grid">
        <div className="stat-item">
          <div className="stat-value">
            {isDetecting ? '...' : detections.length}
          </div>
          <div className="stat-label">Faces Detected</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">
            {isDetecting ? '...' : `${Math.round(averageConfidence * 100)}%`}
          </div>
          <div className="stat-label">Avg Confidence</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">
            {isDetecting ? '...' : `${processingTime}ms`}
          </div>
          <div className="stat-label">Processing Time</div>
        </div>
      </div>
      
      {detections.length > 0 && (
        <div style={{ marginTop: '15px' }}>
          <h4>Individual Detections:</h4>
          <ul style={{ textAlign: 'left', maxWidth: '400px', margin: '0 auto' }}>
            {detections.map((detection) => (
              <li key={detection.id} style={{ margin: '5px 0' }}>
                {detection.label || `Face ${detection.id}`}: {Math.round(detection.confidence * 100)}% confidence
                <br />
                <small>
                  Position: ({detection.x}, {detection.y}) 
                  Size: {detection.width}x{detection.height}
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default DetectionStats; 