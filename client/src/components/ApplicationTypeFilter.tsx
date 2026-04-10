import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ChevronDown, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

interface ApplicationType {
  id: string;
  name: string;
  category: string;
  description: string;
  iconUrl?: string;
  thumbnailUrl?: string;
  hexColor?: string;
  sortOrder: number;
  isPopular?: boolean;
}

interface ApplicationTypeFilterProps {
  selectedApplicationTypes: string[];
  onApplicationTypesChange: (applicationTypes: string[]) => void;
  compact?: boolean;
}

// Define the 5 most common application areas to always show
const MAIN_APPLICATION_AREAS = [
  'Column Protection',
  'Pedestrian Areas',
  'Loading Bay Protection',
  'Rack Protection',
  'Traffic Segregation'
];

export function ApplicationTypeFilter({ 
  selectedApplicationTypes, 
  onApplicationTypesChange,
  compact = false 
}: ApplicationTypeFilterProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: applicationTypes, isLoading, error } = useQuery<ApplicationType[]>({
    queryKey: ['/api/application-types'],
    queryFn: async () => {
      const response = await fetch('/api/application-types');
      if (!response.ok) throw new Error('Failed to fetch application types');
      return response.json();
    }
  });

  const handleApplicationToggle = (applicationId: string) => {
    if (selectedApplicationTypes.includes(applicationId)) {
      onApplicationTypesChange(selectedApplicationTypes.filter(id => id !== applicationId));
    } else {
      onApplicationTypesChange([...selectedApplicationTypes, applicationId]);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
        <AlertCircle className="w-4 h-4" />
        <span>Failed to load application types</span>
      </div>
    );
  }

  const sortedApplicationTypes = applicationTypes?.sort((a, b) => a.sortOrder - b.sortOrder) || [];
  
  // Separate main applications and others
  const mainApplications = sortedApplicationTypes.filter(a => 
    MAIN_APPLICATION_AREAS.some(mainName => 
      a.name.toLowerCase().includes(mainName.toLowerCase()) ||
      mainName.toLowerCase().includes(a.name.toLowerCase())
    )
  ).slice(0, 5);
  
  const otherApplications = sortedApplicationTypes.filter(a => 
    !mainApplications.some(ma => ma.id === a.id)
  );
  
  // Filter other applications based on search
  const filteredOtherApplications = otherApplications.filter(a =>
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {mainApplications.map((application) => (
          <label
            key={application.id}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Checkbox
              checked={selectedApplicationTypes.includes(application.id)}
              onCheckedChange={() => handleApplicationToggle(application.id)}
              className="data-[state=checked]:bg-[#FFC72C] data-[state=checked]:border-[#FFC72C]"
            />
            <span className="text-sm">{application.name}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Filter by Application Area</h3>
        {selectedApplicationTypes.length > 0 && (
          <Badge variant="secondary" className="ml-2">
            {selectedApplicationTypes.length} selected
          </Badge>
        )}
      </div>
      
      {/* Main application areas - always visible */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {mainApplications.map((application) => {
          const isSelected = selectedApplicationTypes.includes(application.id);
          
          return (
            <Card
              key={application.id}
              className={`
                p-3 cursor-pointer transition-all duration-200
                ${isSelected 
                  ? 'ring-2 ring-[#FFC72C] bg-[#FFC72C]/10 dark:bg-[#FFC72C]/5' 
                  : 'hover:shadow-md hover:scale-105'
                }
              `}
              onClick={() => handleApplicationToggle(application.id)}
              data-testid={`application-filter-${application.id}`}
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={isSelected}
                  className="data-[state=checked]:bg-[#FFC72C] data-[state=checked]:border-[#FFC72C] mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {application.name}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      
      {/* Dropdown for other application areas */}
      {otherApplications.length > 0 && (
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full">
              <ChevronDown className="h-4 w-4 mr-2" />
              More application areas ({otherApplications.length})
              {selectedApplicationTypes.filter(id => 
                otherApplications.some(a => a.id === id)
              ).length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedApplicationTypes.filter(id => 
                    otherApplications.some(a => a.id === id)
                  ).length} selected
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-80 max-h-96 overflow-y-auto">
            <div className="p-2">
              <div className="relative mb-2">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search application areas..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              {filteredOtherApplications.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No application areas found
                </div>
              ) : (
                filteredOtherApplications.map((application) => (
                  <DropdownMenuCheckboxItem
                    key={application.id}
                    checked={selectedApplicationTypes.includes(application.id)}
                    onCheckedChange={() => handleApplicationToggle(application.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <span className="text-sm">{application.name}</span>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      
      {selectedApplicationTypes.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {selectedApplicationTypes.length} area{selectedApplicationTypes.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => onApplicationTypesChange([])}
            className="text-sm text-[#FFC72C] hover:text-[#FFC72C]/80 font-medium"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}