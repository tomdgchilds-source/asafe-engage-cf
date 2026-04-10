import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ChevronDown, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

interface VehicleType {
  id: string;
  name: string;
  category: string;
  description: string;
  weightMin: string;
  weightMax: string;
  weightTypical: string;
  maxSpeed: number;
  capacityMin: number;
  capacityMax: number;
  iconUrl?: string;
  hexColor?: string;
  sortOrder: number;
  isPopular?: boolean;
}

interface VehicleTypeFilterProps {
  selectedVehicleTypes: string[];
  onVehicleTypesChange: (vehicleTypes: string[]) => void;
  compact?: boolean;
}

// Define the 5 most common vehicle types to always show
const MAIN_VEHICLE_TYPES = [
  'Pedestrians',
  'Manual Pallet Truck',
  'Electric Pallet Truck',
  'Counterbalance Forklift',
  'Heavy Duty Reach Truck'
];

export function VehicleTypeFilter({ 
  selectedVehicleTypes, 
  onVehicleTypesChange,
  compact = false 
}: VehicleTypeFilterProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { data: vehicleTypes, isLoading, error } = useQuery<VehicleType[]>({
    queryKey: ['/api/vehicle-types'],
    queryFn: async () => {
      const response = await fetch('/api/vehicle-types');
      if (!response.ok) throw new Error('Failed to fetch vehicle types');
      return response.json();
    }
  });

  const handleVehicleToggle = (vehicleId: string) => {
    if (selectedVehicleTypes.includes(vehicleId)) {
      onVehicleTypesChange(selectedVehicleTypes.filter(id => id !== vehicleId));
    } else {
      onVehicleTypesChange([...selectedVehicleTypes, vehicleId]);
    }
  };

  const formatWeight = (weight: string) => {
    const weightNum = parseFloat(weight);
    if (weightNum >= 1000) {
      return `${(weightNum / 1000).toFixed(1)}t`;
    }
    return `${weightNum}kg`;
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
        <span>Failed to load vehicle types</span>
      </div>
    );
  }

  // Sort vehicles by weight (lowest to highest)
  const sortedVehicleTypes = vehicleTypes?.sort((a, b) => {
    const weightA = parseFloat(a.weightTypical);
    const weightB = parseFloat(b.weightTypical);
    return weightA - weightB;
  }) || [];
  
  // Separate main vehicles and others
  const mainVehicles = sortedVehicleTypes.filter(v => 
    MAIN_VEHICLE_TYPES.some(mainName => 
      v.name.toLowerCase().includes(mainName.toLowerCase()) ||
      mainName.toLowerCase().includes(v.name.toLowerCase())
    )
  ).slice(0, 5);
  
  const otherVehicles = sortedVehicleTypes.filter(v => 
    !mainVehicles.some(mv => mv.id === v.id)
  );
  
  // Filter other vehicles based on search
  const filteredOtherVehicles = otherVehicles.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {mainVehicles.map((vehicle) => (
          <label
            key={vehicle.id}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Checkbox
              checked={selectedVehicleTypes.includes(vehicle.id)}
              onCheckedChange={() => handleVehicleToggle(vehicle.id)}
              className="data-[state=checked]:bg-[#FFC72C] data-[state=checked]:border-[#FFC72C]"
            />
            <span className="text-sm">{vehicle.name}</span>
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Filter by Vehicle Type</h3>
        {selectedVehicleTypes.length > 0 && (
          <Badge variant="secondary" className="ml-2">
            {selectedVehicleTypes.length} selected
          </Badge>
        )}
      </div>
      
      {/* Main vehicle types - always visible */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {mainVehicles.map((vehicle) => {
          const isSelected = selectedVehicleTypes.includes(vehicle.id);
          
          return (
            <Card
              key={vehicle.id}
              className={`
                p-3 cursor-pointer transition-all duration-200
                ${isSelected 
                  ? 'ring-2 ring-[#FFC72C] bg-[#FFC72C]/10 dark:bg-[#FFC72C]/5' 
                  : 'hover:shadow-md hover:scale-105'
                }
              `}
              onClick={() => handleVehicleToggle(vehicle.id)}
              data-testid={`vehicle-filter-${vehicle.id}`}
            >
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={isSelected}
                  className="data-[state=checked]:bg-[#FFC72C] data-[state=checked]:border-[#FFC72C] mt-0.5"
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight truncate">
                    {vehicle.name}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatWeight(vehicle.weightTypical)}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      
      {/* Dropdown for other vehicles */}
      {otherVehicles.length > 0 && (
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full">
              <ChevronDown className="h-4 w-4 mr-2" />
              More vehicles ({otherVehicles.length})
              {selectedVehicleTypes.filter(id => 
                otherVehicles.some(v => v.id === id)
              ).length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedVehicleTypes.filter(id => 
                    otherVehicles.some(v => v.id === id)
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
                  placeholder="Search vehicles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 h-9"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
            <DropdownMenuSeparator />
            <div className="max-h-64 overflow-y-auto">
              {filteredOtherVehicles.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No vehicles found
                </div>
              ) : (
                filteredOtherVehicles.map((vehicle) => (
                  <DropdownMenuCheckboxItem
                    key={vehicle.id}
                    checked={selectedVehicleTypes.includes(vehicle.id)}
                    onCheckedChange={() => handleVehicleToggle(vehicle.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-sm">{vehicle.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {formatWeight(vehicle.weightTypical)}
                      </span>
                    </div>
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      
      {selectedVehicleTypes.length > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">
            {selectedVehicleTypes.length} vehicle{selectedVehicleTypes.length !== 1 ? 's' : ''} selected
          </span>
          <button
            onClick={() => onVehicleTypesChange([])}
            className="text-sm text-[#FFC72C] hover:text-[#FFC72C]/80 font-medium"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
}