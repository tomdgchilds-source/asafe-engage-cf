import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, MapPin, Phone, Mail, Star, ExternalLink } from "lucide-react";

export interface GlobalOffice {
  id: string;
  companyName: string;
  officeType: 'office' | 'reseller';
  region: string;
  country: string;
  city: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  postalCode?: string;
  phone: string;
  email: string;
  imageUrl?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface OfficeSelectorProps {
  selectedOffice?: GlobalOffice;
  onOfficeSelect: (office: GlobalOffice) => void;
  className?: string;
  buttonVariant?: "default" | "outline" | "ghost";
  showContactInfo?: boolean;
  defaultRegion?: string;
}

export function OfficeSelector({
  selectedOffice,
  onOfficeSelect,
  className = "",
  buttonVariant = "outline",
  showContactInfo = false,
  defaultRegion = "Middle East"
}: OfficeSelectorProps) {
  const [selectedRegion, setSelectedRegion] = useState<string>(defaultRegion);

  // Fetch all global offices
  const { data: offices, isLoading } = useQuery<GlobalOffice[]>({
    queryKey: ['/api/global-offices'],
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Set default office when data loads
  useEffect(() => {
    if (offices && !selectedOffice) {
      const defaultOffice = offices.find(
        office => office.region === defaultRegion && office.isDefault
      ) || offices.find(office => office.region === defaultRegion) || offices[0];
      
      if (defaultOffice) {
        onOfficeSelect(defaultOffice);
      }
    }
  }, [offices, selectedOffice, onOfficeSelect, defaultRegion]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-asafe-yellow border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading offices...</span>
      </div>
    );
  }

  if (!offices) return null;

  // Group offices by region
  const officesByRegion = offices.reduce((acc, office) => {
    if (!acc[office.region]) {
      acc[office.region] = [];
    }
    acc[office.region].push(office);
    return acc;
  }, {} as Record<string, GlobalOffice[]>);

  // Sort regions and offices
  const sortedRegions = Object.keys(officesByRegion).sort();
  
  Object.keys(officesByRegion).forEach(region => {
    officesByRegion[region].sort((a, b) => {
      if (a.officeType !== b.officeType) {
        return a.officeType === 'office' ? -1 : 1; // Offices first
      }
      return a.sortOrder - b.sortOrder;
    });
  });

  const formatAddress = (office: GlobalOffice) => {
    const parts = [
      office.addressLine1,
      office.addressLine2,
      office.addressLine3,
      office.city,
      office.postalCode
    ].filter(Boolean);
    return parts.join(', ');
  };

  const generateGoogleMapsUrl = (office: GlobalOffice) => {
    const address = formatAddress(office);
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
  };

  // Country flag emojis
  const getCountryFlag = (country: string) => {
    const flagMap: Record<string, string> = {
      'United Kingdom': '🇬🇧',
      'Belgium': '🇧🇪',
      'France': '🇫🇷',
      'Germany': '🇩🇪',
      'Italy': '🇮🇹',
      'Netherlands': '🇳🇱',
      'Spain': '🇪🇸',
      'Sweden': '🇸🇪',
      'Denmark': '🇩🇰',
      'Poland': '🇵🇱',
      'Portugal': '🇵🇹',
      'Switzerland': '🇨🇭',
      'Iceland': '🇮🇸',
      'Slovakia': '🇸🇰',
      'Romania': '🇷🇴',
      'Greece': '🇬🇷',
      'Turkey': '🇹🇷',
      'United Arab Emirates': '🇦🇪',
      'Saudi Arabia': '🇸🇦',
      'United States': '🇺🇸',
      'Canada': '🇨🇦',
      'Mexico': '🇲🇽',
      'Australia': '🇦🇺',
      'Japan': '🇯🇵',
      'South Korea': '🇰🇷',
      'Taiwan': '🇹🇼'
    };
    return flagMap[country] || '🏢';
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant={buttonVariant} 
            className="w-full justify-between min-w-[250px]"
            data-testid="office-selector-trigger"
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-asafe-yellow" />
              {selectedOffice ? (
                <span className="font-medium">
                  {selectedOffice.companyName} - {selectedOffice.city}
                </span>
              ) : (
                <span>Select Office Location</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent 
          className="w-80 max-h-[300px] md:max-h-[400px] overflow-y-auto" 
          align="start"
          alignOffset={0}
          sideOffset={5}
          collisionPadding={20}
          avoidCollisions={true}
          data-testid="office-selector-dropdown"
        >
          {sortedRegions.map((region) => (
            <DropdownMenuGroup key={region}>
              <DropdownMenuLabel className="text-asafe-yellow font-semibold">
                {region}
              </DropdownMenuLabel>
              {officesByRegion[region].map((office) => (
                <DropdownMenuItem
                  key={office.id}
                  onClick={() => onOfficeSelect(office)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-3"
                  data-testid={`office-option-${office.country.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="flex items-start justify-between w-full">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{getCountryFlag(office.country)}</span>
                        <span className="font-medium text-sm">
                          {office.companyName.replace(' (', ' - ').replace(')', '')}
                        </span>
                        {office.officeType === 'reseller' && (
                          <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                            Reseller
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {office.city}, {office.country}
                      </div>
                    </div>
                    {selectedOffice?.id === office.id && (
                      <div className="ml-2 flex-shrink-0">
                        <div className="w-2 h-2 bg-asafe-yellow rounded-full" />
                      </div>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Contact Information Display */}
      {showContactInfo && selectedOffice && (
        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border" data-testid="office-contact-info">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-asafe-yellow mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <a 
                href={selectedOffice.googleMapsUrl || generateGoogleMapsUrl(selectedOffice)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-asafe-yellow transition-colors cursor-pointer group"
                data-testid="office-address-link"
              >
                <p className="text-sm leading-relaxed group-hover:underline text-gray-900 dark:text-gray-100">
                  {formatAddress(selectedOffice)}
                </p>
                <ExternalLink className="h-3 w-3 inline ml-1 opacity-50 group-hover:opacity-100" />
              </a>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-asafe-yellow flex-shrink-0" />
            <a 
              href={`tel:${selectedOffice.phone}`}
              className="hover:text-asafe-yellow transition-colors text-sm text-gray-900 dark:text-gray-100"
              data-testid="office-phone-link"
            >
              {selectedOffice.phone}
            </a>
          </div>

          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-asafe-yellow flex-shrink-0" />
            <a 
              href={`mailto:${selectedOffice.email}`}
              className="hover:text-asafe-yellow transition-colors text-sm break-all text-gray-900 dark:text-gray-100"
              data-testid="office-email-link"
            >
              {selectedOffice.email}
            </a>
          </div>

          {/* Google Maps Rating (for main Middle East office as example) */}
          {selectedOffice.region === "Middle East" && selectedOffice.country === "United Arab Emirates" && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <span className="text-sm font-medium">5.0</span>
                <span className="text-xs text-gray-500">Written Testimonials</span>
              </div>
              <a 
                href="https://maps.app.goo.gl/55wf4FPkAe2NfKDHA?g_st=ipc" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-asafe-yellow hover:underline"
                data-testid="office-maps-rating-link"
              >
                Visit us on Google Maps →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OfficeSelector;