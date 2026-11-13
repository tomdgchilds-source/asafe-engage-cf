import { useState, useEffect, useRef, useCallback } from "react";
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
import { officeContactForRow, officePhoneHref } from "@shared/offices";

export interface GlobalOffice {
  id: string;
  companyName: string;
  officeType: 'office' | 'reseller';
  region: string;
  country: string;
  city: string;
  addressLine1: string;
  addressLine2?: string | null;
  addressLine3?: string | null;
  postalCode?: string | null;
  phone: string;
  email: string;
  imageUrl?: string | null;
  googleMapsUrl?: string | null;
  // decimal columns arrive as strings from the API
  latitude?: number | string | null;
  longitude?: number | string | null;
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

// Map country codes to country names used in the offices data
const countryCodeToName: Record<string, string> = {
  GB: "United Kingdom", BE: "Belgium", DK: "Denmark", FR: "France",
  DE: "Germany", IT: "Italy", NL: "Netherlands", PL: "Poland",
  ES: "Spain", SE: "Sweden", AE: "United Arab Emirates", SA: "Saudi Arabia",
  US: "United States", CA: "Canada", MX: "Mexico", AU: "Australia", JP: "Japan",
};

// Country flag emojis
const getCountryFlag = (country: string) => {
  const flagMap: Record<string, string> = {
    'United Kingdom': '🇬🇧', 'Belgium': '🇧🇪', 'France': '🇫🇷',
    'Germany': '🇩🇪', 'Italy': '🇮🇹', 'Netherlands': '🇳🇱',
    'Spain': '🇪🇸', 'Sweden': '🇸🇪', 'Denmark': '🇩🇰',
    'Poland': '🇵🇱', 'United Arab Emirates': '🇦🇪', 'Saudi Arabia': '🇸🇦',
    'United States': '🇺🇸', 'Canada': '🇨🇦', 'Mexico': '🇲🇽',
    'Australia': '🇦🇺', 'Japan': '🇯🇵',
  };
  return flagMap[country] || '🏢';
};

export function OfficeSelector({
  selectedOffice,
  onOfficeSelect,
  className = "",
  buttonVariant = "outline",
  showContactInfo = false,
  defaultRegion = "Middle East"
}: OfficeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasSetDefault = useRef(false);

  // Fetch all global offices
  const { data: offices, isLoading } = useQuery<GlobalOffice[]>({
    queryKey: ['/api/global-offices'],
    staleTime: 5 * 60 * 1000,
  });

  // Detect visitor's country via Cloudflare geo-IP
  const { data: geoData } = useQuery<{ country: string | null }>({
    queryKey: ['/api/geo'],
    staleTime: Infinity,
  });

  // Set default office once when data loads
  useEffect(() => {
    if (hasSetDefault.current || !offices || offices.length === 0) return;

    let defaultOffice: GlobalOffice | undefined;

    // Try to match visitor's country first. A country can have several
    // offices (UK Ltd / HQ Ltd, York / Plano): open on its default one, and
    // never on the International desk, which is for countries with no office.
    if (geoData?.country) {
      const countryName = countryCodeToName[geoData.country];
      if (countryName) {
        const inCountry = offices.filter(o => o.country === countryName && o.region !== "International");
        defaultOffice = inCountry.find(o => o.isDefault)
          || [...inCountry].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      }
    }

    // Fall back to defaultRegion
    if (!defaultOffice) {
      defaultOffice = offices.find(
        office => office.region === defaultRegion && office.isDefault
      ) || offices.find(office => office.region === defaultRegion) || offices[0];
    }

    if (defaultOffice) {
      hasSetDefault.current = true;
      onOfficeSelect(defaultOffice);
    }
  }, [offices, geoData, defaultRegion, onOfficeSelect]);

  const handleSelect = useCallback((office: GlobalOffice) => {
    setIsOpen(false);
    onOfficeSelect(office);
  }, [onOfficeSelect]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-asafe-yellow border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Loading offices...</span>
      </div>
    );
  }

  if (!offices || offices.length === 0) return null;

  // Group offices by region
  const officesByRegion = offices.reduce((acc, office) => {
    if (!acc[office.region]) {
      acc[office.region] = [];
    }
    acc[office.region].push(office);
    return acc;
  }, {} as Record<string, GlobalOffice[]>);

  const sortedRegions = Object.keys(officesByRegion).sort();

  Object.keys(officesByRegion).forEach(region => {
    officesByRegion[region].sort((a, b) => {
      if (a.officeType !== b.officeType) {
        return a.officeType === 'office' ? -1 : 1;
      }
      return a.sortOrder - b.sortOrder;
    });
  });

  // Legal name, full address, every published phone, email and map link for
  // the selected office: read from the row and its shared/offices.ts record.
  const contact = selectedOffice ? officeContactForRow(selectedOffice) : null;

  return (
    <div className={`space-y-4 ${className}`}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={buttonVariant}
            className="w-full justify-between min-w-[250px]"
          >
            <div className="flex items-center gap-2">
              {selectedOffice?.imageUrl ? (
                <img src={selectedOffice.imageUrl} alt={selectedOffice.country} className="w-5 h-3.5 object-cover rounded-sm" />
              ) : selectedOffice ? (
                <span className="text-base">{getCountryFlag(selectedOffice.country)}</span>
              ) : (
                <MapPin className="h-4 w-4 text-asafe-yellow" />
              )}
              {selectedOffice ? (
                <span className="font-medium truncate">
                  {selectedOffice.companyName} - {selectedOffice.city}
                </span>
              ) : (
                <span>Select Office Location</span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 flex-shrink-0" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          className="w-80 max-h-[400px] overflow-y-auto z-[9999]"
          align="start"
          sideOffset={5}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {sortedRegions.map((region) => (
            <DropdownMenuGroup key={region}>
              <DropdownMenuLabel className="text-asafe-yellow font-semibold">
                {region}
              </DropdownMenuLabel>
              {officesByRegion[region].map((office) => (
                <DropdownMenuItem
                  key={office.id}
                  onSelect={() => handleSelect(office)}
                  className="cursor-pointer p-3"
                >
                  <div className="flex items-start justify-between w-full">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {office.imageUrl ? (
                          <img src={office.imageUrl} alt={office.country} className="w-6 h-4 object-cover rounded-sm flex-shrink-0" />
                        ) : (
                          <span className="text-base">{getCountryFlag(office.country)}</span>
                        )}
                        <span className="font-medium text-sm truncate">
                          {office.companyName}
                        </span>
                        {office.officeType === 'reseller' && (
                          <span className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded flex-shrink-0">
                            Reseller
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground pl-8">
                        {office.city}, {office.country}
                      </div>
                    </div>
                    {selectedOffice?.id === office.id && (
                      <div className="ml-2 flex-shrink-0 mt-1">
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
      {showContactInfo && selectedOffice && contact && (
        <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border" data-testid="office-contact-card">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100" data-testid="office-legal-name">
            {contact.legalName}
          </p>

          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-asafe-yellow mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <address
                className="not-italic text-sm leading-relaxed text-gray-900 dark:text-gray-100"
                data-testid="office-address"
              >
                {contact.addressLines.map((line, i) => (
                  <span key={i} className="block">{line}</span>
                ))}
              </address>
              {contact.addressLinesNative.length > 0 && (
                <p className="text-xs leading-relaxed text-gray-600 dark:text-gray-400 mt-1" data-testid="office-address-native">
                  {contact.addressLinesNative.join(" ")}
                </p>
              )}
              <a
                href={contact.mapsHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 text-xs text-gray-700 dark:text-gray-300 underline hover:text-asafe-yellow transition-colors"
                data-testid="office-maps-link"
              >
                View on Google Maps
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Phone className="h-4 w-4 text-asafe-yellow mt-0.5 flex-shrink-0" />
            <div className="flex flex-col gap-1">
              {contact.phones.map((phone) => (
                <a
                  key={phone.tel}
                  href={officePhoneHref(phone)}
                  className="hover:text-asafe-yellow transition-colors text-sm text-gray-900 dark:text-gray-100"
                  data-testid="office-phone"
                >
                  {phone.display}
                </a>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-asafe-yellow flex-shrink-0" />
            <a
              href={`mailto:${contact.email}`}
              className="hover:text-asafe-yellow transition-colors text-sm break-all text-gray-900 dark:text-gray-100"
              data-testid="office-email"
            >
              {contact.email}
            </a>
          </div>

          {selectedOffice.region === "Middle East" && selectedOffice.country === "United Arab Emirates" && (
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <span className="text-sm font-medium">5.0</span>
                <span className="text-xs text-gray-500">Written Testimonials</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default OfficeSelector;
