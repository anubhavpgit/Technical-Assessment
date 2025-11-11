import React, { useState } from 'react';
import { Card } from '../common/Card';
import { Filter } from '../../types';
import { FILTERS } from '../../constants/filters';
import { cn } from '../../utils/cn';

interface FilterGalleryProps {
  onFilterSelect: (filter: Filter) => void;
  selectedFilterId?: string;
}

export const FilterGallery: React.FC<FilterGalleryProps> = ({
  onFilterSelect,
  selectedFilterId,
}) => {
  // Show only basic filters in a single row
  const basicFilters = FILTERS.filter(filter =>
    ['grayscale', 'sepia', 'vintage', 'invert'].includes(filter.id)
  );

  return (
    <div className="w-full">
      {/* Single Row of Filters */}
      <div className="flex items-center justify-center gap-3 overflow-x-auto scrollbar-notion pb-2">
        {basicFilters.map((filter) => (
          <FilterCard
            key={filter.id}
            filter={filter}
            isSelected={filter.id === selectedFilterId}
            onSelect={() => onFilterSelect(filter)}
          />
        ))}
      </div>
    </div>
  );
};

interface FilterCardProps {
  filter: Filter;
  isSelected: boolean;
  onSelect: () => void;
}

const FilterCard: React.FC<FilterCardProps> = ({ filter, isSelected, onSelect }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Card
      padding="none"
      hover
      onClick={onSelect}
      className={cn(
        'relative overflow-hidden transition-all duration-200 cursor-pointer group flex-shrink-0',
        isSelected && 'ring-2 ring-notion-accent-blue shadow-notion-md'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Horizontal Layout */}
      <div className="flex items-center gap-3 p-4 min-w-[180px]">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-notion-text-primary truncate">
            {filter.name}
          </h4>
          <p className="text-xs text-notion-text-tertiary truncate">
            {filter.description}
          </p>
        </div>

        {/* Selected Badge */}
        {isSelected && (
          <div className="flex-shrink-0 w-5 h-5 bg-notion-accent-blue rounded-full flex items-center justify-center">
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}
      </div>
    </Card>
  );
};
