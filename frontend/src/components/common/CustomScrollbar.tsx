import { useState, useEffect } from 'react';

export const CustomScrollbar = () => {
  const [scrollPercentage, setScrollPercentage] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

      // Calculate scroll percentage
      const scrollableHeight = documentHeight - windowHeight;
      const percentage = scrollableHeight > 0 ? (scrollTop / scrollableHeight) * 100 : 0;

      setScrollPercentage(percentage);

      // Show scrollbar only if content is scrollable
      setIsVisible(documentHeight > windowHeight);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  if (!isVisible) return null;

  // Calculate thumb position and size
  const windowHeight = window.innerHeight;
  const documentHeight = document.documentElement.scrollHeight;
  const thumbHeight = Math.max((windowHeight / documentHeight) * windowHeight, 40);
  const maxTrackHeight = windowHeight - 16; // 8px margin top and bottom
  const thumbPosition = (scrollPercentage / 100) * (maxTrackHeight - thumbHeight);

  return (
    <div
      className="fixed right-2 top-2 bottom-2 w-2 z-[9999] pointer-events-none"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      style={{ pointerEvents: 'auto' }}
    >
      {/* Scrollbar thumb */}
      <div
        className="absolute right-0 rounded-full transition-all duration-200"
        style={{
          top: `${thumbPosition}px`,
          height: `${thumbHeight}px`,
          width: isHovering ? '8px' : '4px',
          backgroundColor: isHovering ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.2)',
          transform: 'translateX(0)',
        }}
      />
    </div>
  );
};
