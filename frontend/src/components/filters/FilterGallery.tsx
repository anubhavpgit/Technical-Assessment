import React, { useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import { Card } from '../common/Card';
import { Input } from '../common/Input';
import { Filter } from '../../types';
import { FILTERS, FILTER_CATEGORIES } from '../../constants/filters';
import { cn } from '../../utils/cn';

interface FilterGalleryProps {
  onFilterSelect: (filter: Filter) => void;
  selectedFilterId?: string;
}

export const FilterGallery: React.FC<FilterGalleryProps> = ({
  onFilterSelect,
  selectedFilterId,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const filteredFilters = FILTERS.filter((filter) => {
    const matchesSearch = filter.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      filter.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || filter.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-notion-accent-purple" />
          <h3 className="text-lg font-semibold text-notion-text-primary">Filter Gallery</h3>
        </div>
        <span className="text-sm text-notion-text-tertiary">
          {filteredFilters.length} {filteredFilters.length === 1 ? 'filter' : 'filters'}
        </span>
      </div>

      {/* Search */}
      <Input
        type="text"
        placeholder="Search filters..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        icon={<Search className="w-4 h-4" />}
      />

      {/* Category Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-notion pb-2">
        {FILTER_CATEGORIES.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategory(category.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-notion text-sm font-medium transition-all duration-200 whitespace-nowrap',
              selectedCategory === category.id
                ? 'bg-notion-accent-blue text-white shadow-notion'
                : 'bg-notion-bg-tertiary text-notion-text-secondary hover:bg-notion-bg-secondary'
            )}
          >
            <span>{category.icon}</span>
            <span>{category.name}</span>
          </button>
        ))}
      </div>

      {/* Filter Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[500px] overflow-y-auto scrollbar-notion pr-2">
        {filteredFilters.map((filter) => (
          <FilterCard
            key={filter.id}
            filter={filter}
            isSelected={filter.id === selectedFilterId}
            onSelect={() => onFilterSelect(filter)}
          />
        ))}
      </div>

      {/* Empty State */}
      {filteredFilters.length === 0 && (
        <div className="text-center py-12">
          <p className="text-notion-text-tertiary">No filters found</p>
          <p className="text-sm text-notion-text-tertiary mt-1">
            Try adjusting your search or category
          </p>
        </div>
      )}
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
        'relative overflow-hidden transition-all duration-200 cursor-pointer group',
        isSelected && 'ring-2 ring-notion-accent-blue shadow-notion-md'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Preview Area */}
      <div className="relative aspect-square bg-gradient-to-br from-notion-bg-secondary to-notion-bg-tertiary flex items-center justify-center overflow-hidden">
        {/* Filter Thumbnail/Icon */}
        <div
          className={cn(
            'text-4xl transition-transform duration-200',
            isHovered && 'scale-110'
          )}
        >
          {filter.thumbnail}
        </div>

        {/* Hover Overlay */}
        {isHovered && (
          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
            <div className="text-white text-xs font-medium px-3 py-1.5 bg-black bg-opacity-50 rounded-notion">
              Apply Filter
            </div>
          </div>
        )}

        {/* Selected Badge */}
        {isSelected && (
          <div className="absolute top-2 right-2 w-5 h-5 bg-notion-accent-blue rounded-full flex items-center justify-center">
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

      {/* Info */}
      <div className="p-3 space-y-1">
        <h4 className="text-sm font-medium text-notion-text-primary truncate">
          {filter.name}
        </h4>
        <p className="text-xs text-notion-text-tertiary text-truncate-2">
          {filter.description}
        </p>
      </div>

      {/* Category Badge */}
      <div className="absolute top-2 left-2">
        <span className="text-xs px-2 py-0.5 bg-white bg-opacity-90 backdrop-blur-sm rounded-notion text-notion-text-secondary font-medium">
          {filter.category}
        </span>
      </div>
    </Card>
  );
};
