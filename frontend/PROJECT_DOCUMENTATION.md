# Overlap - Project Documentation

## 🎯 Project Overview

Overlap is a sleek, minimal video editing platform with modern, clean design. This application provides advanced video editing capabilities including person detection, background segmentation, selective filtering, and real-time video processing.

---

## 🎨 Design System

### Color Palette
```css
Primary Background: #ffffff (White)
Secondary Background: #f7f6f3 (Warm Gray)
Surface: #ffffff
Border: #e9e9e7
Text Primary: #37352f
Text Secondary: #787774
Accent Blue: #2383e2
Accent Purple: #9065b0
Accent Red: #d44c47
Accent Green: #4dab9a
Accent Yellow: #dfab01
Accent Gray: #9b9a97
```

### Typography
- **Font Family**: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui
- **Headings**: font-semibold, tracking-tight
- **Body**: font-normal, leading-relaxed

### Spacing System
- Uses Tailwind's 4px-based spacing scale
- Consistent padding: p-4, p-6, p-8
- Gap spacing: gap-2, gap-4, gap-6

---

## 🏗️ Architecture

### Tech Stack
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: React Hooks (useState, useContext)
- **Build Tool**: Create React App
- **Video Processing**: OpenCV + FFmpeg (Backend)

### Project Structure
```
frontend/
├── public/
│   └── index.html
├── src/
│   ├── components/
│   │   ├── common/           # Reusable UI components
│   │   ├── video/            # Video-related components
│   │   ├── filters/          # Filter gallery & timeline
│   │   ├── upload/           # Upload functionality
│   │   └── layouts/          # Layout components
│   ├── services/
│   │   └── api.ts           # API service layer
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions
│   ├── constants/           # App constants
│   ├── App.tsx
│   ├── index.tsx
│   └── index.css
├── tailwind.config.js
└── tsconfig.json
```

---

## 🎬 Core Features

### 1. Video Upload
- **Description**: Drag-and-drop or click to upload video files
- **Supported Formats**: MP4, WebM, MOV, AVI
- **Max File Size**: 500MB (configurable)
- **API Endpoint**: `POST /api/upload`

### 2. Filter Gallery
- **Filters Available**:
  - Grayscale
  - Sepia
  - Blur
  - Sharpen
  - Vintage
  - Cool Tone
  - Warm Tone
  - High Contrast
  - Vignette
  - Brightness/Contrast Adjustments
- **API Endpoint**: `GET /api/filters`

### 3. Timeline-Based Filter Application
- **Description**: Apply/remove filters at specific timeframes
- **Features**:
  - Visual timeline with playhead
  - Drag-and-drop filter placement
  - Adjustable start/end times
  - Multiple filters per timeline
- **API Endpoints**:
  - `POST /api/timeline/add-filter`
  - `DELETE /api/timeline/remove-filter`
  - `PUT /api/timeline/update-filter`

### 4. Viewing Modes
- **Theater Mode**: Full-screen cinematic experience
- **Window Mode**: Floating video window
- **Editor Mode**: Professional timeline editing interface

### 5. Person Detection & Background Segmentation
- **Description**: AI-powered person detection with background isolation
- **Features**:
  - Real-time person detection
  - Background segmentation
  - Selective filter application (background only)
  - Bounding box visualization
- **API Endpoints**:
  - `POST /api/detect/person`
  - `POST /api/segment/background`
  - `POST /api/process/selective-filter`

### 6. Real-Time Video Processing
- **Description**: Live preview of video with applied filters
- **API Endpoint**: `POST /api/process/realtime`

---

## 🔌 API Endpoints (To Be Implemented)

### Video Upload
```typescript
POST /api/upload
Content-Type: multipart/form-data

Request:
{
  file: File
}

Response:
{
  videoId: string
  url: string
  duration: number
  resolution: { width: number, height: number }
  format: string
  size: number
}
```

### Get Available Filters
```typescript
GET /api/filters

Response:
{
  filters: [
    {
      id: string
      name: string
      description: string
      thumbnail: string
      parameters?: object
    }
  ]
}
```

### Apply Filter to Timeline
```typescript
POST /api/timeline/add-filter

Request:
{
  videoId: string
  filterId: string
  startTime: number  // seconds
  endTime: number    // seconds
  parameters?: object
}

Response:
{
  timelineItemId: string
  success: boolean
}
```

### Person Detection
```typescript
POST /api/detect/person

Request:
{
  videoId: string
  frameNumber?: number
  continuous?: boolean
}

Response:
{
  detections: [
    {
      id: string
      x: number
      y: number
      width: number
      height: number
      confidence: number
      label?: string
    }
  ]
  frameNumber: number
  timestamp: number
}
```

### Background Segmentation
```typescript
POST /api/segment/background

Request:
{
  videoId: string
  detectionId?: string
}

Response:
{
  maskUrl: string
  success: boolean
}
```

### Apply Selective Filter
```typescript
POST /api/process/selective-filter

Request:
{
  videoId: string
  filterId: string
  applyTo: 'background' | 'person'
  startTime: number
  endTime: number
}

Response:
{
  processedVideoUrl: string
  success: boolean
}
```

### Real-Time Processing
```typescript
POST /api/process/realtime

Request:
{
  videoId: string
  filters: Array<{
    filterId: string
    startTime: number
    endTime: number
    parameters?: object
  }>
}

Response:
{
  streamUrl: string
  success: boolean
}
```

---

## 📊 Data Models

### Video
```typescript
interface Video {
  id: string
  filename: string
  url: string
  duration: number
  resolution: {
    width: number
    height: number
  }
  format: string
  size: number
  uploadedAt: Date
}
```

### Filter
```typescript
interface Filter {
  id: string
  name: string
  description: string
  thumbnail: string
  category: 'color' | 'blur' | 'artistic' | 'adjustment'
  parameters?: {
    [key: string]: {
      type: 'number' | 'boolean' | 'string'
      default: any
      min?: number
      max?: number
    }
  }
}
```

### TimelineItem
```typescript
interface TimelineItem {
  id: string
  filterId: string
  startTime: number
  endTime: number
  parameters?: object
  layer: number
}
```

### Detection
```typescript
interface Detection {
  id: string
  x: number
  y: number
  width: number
  height: number
  confidence: number
  label?: string
  trackingId?: string
}
```

---

## 🎯 Implementation Progress

### ✅ Completed
- [x] Initial codebase exploration
- [x] Project documentation created

### 🚧 In Progress
- [ ] Tailwind CSS setup

### 📋 To Do
- [ ] Design system implementation
- [ ] Video upload component
- [ ] Filter gallery
- [ ] Timeline component
- [ ] Viewing modes
- [ ] API service layer
- [ ] State management
- [ ] Real-time preview
- [ ] TypeScript error fixes

---

## 🛠️ Development Guidelines

### Code Style
- Use functional components with hooks
- Implement proper TypeScript types
- Follow Notion's minimal design principles
- Use Tailwind utility classes
- Keep components small and focused

### Component Naming
- PascalCase for components
- camelCase for functions and variables
- UPPER_SNAKE_CASE for constants
- Descriptive names over brevity

### File Organization
- One component per file
- Co-locate related components
- Group by feature, not by type
- Index files for barrel exports

---

## 🚀 Getting Started

### Installation
```bash
cd frontend
npm install
```

### Development
```bash
npm start
```
Runs on http://localhost:3000

### Build
```bash
npm run build
```

### Backend Connection
Backend runs on http://127.0.0.1:8080

---

## 📝 Notes

- Backend will handle OpenCV and FFmpeg processing
- Frontend focuses on UI/UX and state management
- Real-time processing uses WebSocket connections (to be implemented)
- Video processing is computationally expensive - handle loading states gracefully
- Consider implementing progressive loading for large videos

---

## 🔄 Version History

### v0.1.0 (Current)
- Initial documentation
- Project structure defined
- API endpoints specified
- Design system outlined

---

**Last Updated**: 2025-11-11
**Maintained By**: Development Team
**Product Name**: Overlap
