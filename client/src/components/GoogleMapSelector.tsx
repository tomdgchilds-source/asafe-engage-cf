import { useEffect, useRef, useState } from "react";
import { Loader } from "@googlemaps/js-api-loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

interface GoogleMapSelectorProps {
  onLocationSelect: (location: { address: string; lat: number; lng: number }) => void;
  selectedLocation?: { address: string; lat: number; lng: number } | null;
  className?: string;
}

export function GoogleMapSelector({ onLocationSelect, selectedLocation, className }: GoogleMapSelectorProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [geocoder, setGeocoder] = useState<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coordinateInput, setCoordinateInput] = useState("");
  const [addressInput, setAddressInput] = useState("");

  useEffect(() => {
    const initMap = async () => {
      try {
        const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        
        if (!GOOGLE_MAPS_API_KEY) {
          setError("Google Maps is not configured. Use the coordinate input below or contact support to enable map functionality.");
          return;
        }

        const loader = new Loader({
          apiKey: GOOGLE_MAPS_API_KEY,
          version: "weekly",
          libraries: ["places"]
        });

        const google = await loader.load();
        
        if (!mapRef.current) return;

        // Default location (Dubai, UAE)
        const defaultLocation = { lat: 25.2048, lng: 55.2708 };
        
        const mapInstance = new google.maps.Map(mapRef.current, {
          zoom: 11,
          center: selectedLocation || defaultLocation,
          mapTypeId: google.maps.MapTypeId.SATELLITE,
          streetViewControl: false,
          mapTypeControl: true,
          fullscreenControl: false,
        });

        const geocoderInstance = new google.maps.Geocoder();
        setGeocoder(geocoderInstance);

        // Create marker
        const markerInstance = new google.maps.Marker({
          position: selectedLocation || defaultLocation,
          map: mapInstance,
          draggable: true,
          title: "Delivery Location"
        });

        // Handle map clicks
        mapInstance.addListener("click", async (e: any) => {
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            
            markerInstance.setPosition({ lat, lng });
            
            // Geocode the position to get address
            try {
              const response = await geocoderInstance.geocode({ location: { lat, lng } });
              if (response.results[0]) {
                const address = response.results[0].formatted_address;
                onLocationSelect({ address, lat, lng });
              }
            } catch (error) {
              console.error("Geocoding failed:", error);
              onLocationSelect({ address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng });
            }
          }
        });

        // Handle marker drag
        markerInstance.addListener("dragend", async () => {
          const position = markerInstance.getPosition();
          if (position) {
            const lat = position.lat();
            const lng = position.lng();
            
            try {
              const response = await geocoderInstance.geocode({ location: { lat, lng } });
              if (response.results[0]) {
                const address = response.results[0].formatted_address;
                onLocationSelect({ address, lat, lng });
              }
            } catch (error) {
              console.error("Geocoding failed:", error);
              onLocationSelect({ address: `${lat.toFixed(6)}, ${lng.toFixed(6)}`, lat, lng });
            }
          }
        });

        setMap(mapInstance);
        setMarker(markerInstance);
        setIsLoaded(true);

      } catch (error) {
        console.error("Error loading Google Maps:", error);
        setError("Failed to load Google Maps. Use coordinate input below or check your internet connection.");
      }
    };

    initMap();
  }, [onLocationSelect]);

  // Update marker position when selectedLocation changes
  useEffect(() => {
    if (marker && selectedLocation && map) {
      const position = { lat: selectedLocation.lat, lng: selectedLocation.lng };
      marker.setPosition(position);
      map.setCenter(position);
    }
  }, [selectedLocation, marker, map]);

  const handleCoordinateSubmit = () => {
    const coords = coordinateInput.trim();
    if (!coords) return;

    // Parse coordinates in various formats
    let lat: number, lng: number;
    
    // Try comma-separated format: "25.2048, 55.2708"
    if (coords.includes(',')) {
      const [latStr, lngStr] = coords.split(',').map(s => s.trim());
      lat = parseFloat(latStr);
      lng = parseFloat(lngStr);
    } else {
      // Try space-separated format: "25.2048 55.2708"
      const [latStr, lngStr] = coords.split(/\s+/);
      lat = parseFloat(latStr);
      lng = parseFloat(lngStr);
    }

    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      const address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      onLocationSelect({ address, lat, lng });
      setCoordinateInput("");
    } else {
      alert("Please enter valid coordinates (e.g., 25.2048, 55.2708)");
    }
  };

  const handleAddressSubmit = () => {
    const address = addressInput.trim();
    if (!address) return;

    // For address input without coordinates, we'll use Dubai's default coordinates
    // This is better than no location data
    const defaultLat = 25.2048;
    const defaultLng = 55.2708;
    
    onLocationSelect({ 
      address, 
      lat: defaultLat, 
      lng: defaultLng 
    });
    setAddressInput("");
  };

  const commonLocations = [
    { name: "Jebel Ali Free Zone (JAFZA)", address: "Jebel Ali Free Zone, Dubai, UAE", lat: 24.9929, lng: 55.0467 },
    { name: "Dubai Industrial Park", address: "Dubai Industrial Park, Dubai, UAE", lat: 24.8607, lng: 55.1843 },
    { name: "Al Ain Industrial Area", address: "Al Ain Industrial Area, Al Ain, UAE", lat: 24.1581, lng: 55.7861 },
    { name: "Sharjah Industrial Area", address: "Sharjah Industrial Area, Sharjah, UAE", lat: 25.3111, lng: 55.4933 },
    { name: "Abu Dhabi Industrial City", address: "Abu Dhabi Industrial City, Abu Dhabi, UAE", lat: 24.3167, lng: 54.5333 },
    { name: "King Abdullah Economic City", address: "King Abdullah Economic City, Saudi Arabia", lat: 22.4167, lng: 39.1033 },
    { name: "Jubail Industrial City", address: "Jubail Industrial City, Saudi Arabia", lat: 27.0174, lng: 49.6253 },
    { name: "Yanbu Industrial City", address: "Yanbu Industrial City, Saudi Arabia", lat: 24.0889, lng: 38.0617 }
  ];

  const handleCommonLocationSelect = (location: { name: string; address: string; lat: number; lng: number }) => {
    onLocationSelect({
      address: location.address,
      lat: location.lat,
      lng: location.lng
    });
  };

  return (
    <div className={`${className || ""} space-y-4`}>
      {/* Address Input */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">Enter Delivery Address</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Enter delivery address (e.g., Dubai Marina, Building 123)"
            className="flex-1"
            onKeyPress={(e) => e.key === 'Enter' && handleAddressSubmit()}
          />
          <Button onClick={handleAddressSubmit} size="sm" className="bg-blue-600 hover:bg-blue-700">
            Set
          </Button>
        </div>
      </div>

      {/* Common Locations */}
      <div className="space-y-2">
        <span className="text-sm font-medium">Quick Select - Popular Locations</span>
        <div className="grid grid-cols-2 gap-2">
          {commonLocations.map((location) => (
            <Button
              key={location.name}
              variant="outline"
              size="sm"
              onClick={() => handleCommonLocationSelect(location)}
              className="text-xs justify-start"
            >
              {location.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Coordinate input for precise location */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Or Enter Exact Coordinates</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={coordinateInput}
            onChange={(e) => setCoordinateInput(e.target.value)}
            placeholder="25.2048, 55.2708 (lat, lng)"
            className="flex-1"
            onKeyPress={(e) => e.key === 'Enter' && handleCoordinateSubmit()}
          />
          <Button onClick={handleCoordinateSubmit} size="sm" variant="outline">
            Set
          </Button>
        </div>
      </div>

      {/* Google Map (if available) */}
      {!error && (
        <div className="relative">
          <div 
            ref={mapRef} 
            className="w-full h-64 rounded-lg border"
            style={{ minHeight: "250px" }}
          />
          {!isLoaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">Loading interactive map...</p>
            </div>
          )}
          {isLoaded && (
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Click on the map or drag the marker to select delivery location
            </p>
          )}
        </div>
      )}

      {/* Map unavailable notice */}
      {error && (
        <div className="p-3 border rounded-lg bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800 text-center">
            Interactive map temporarily unavailable. Please use address input or coordinate entry above.
          </p>
        </div>
      )}

      {/* Selected Location Display */}
      {selectedLocation && (
        <div className="text-sm bg-green-50 border border-green-200 p-3 rounded">
          <strong className="text-green-800">Selected Delivery Location:</strong><br />
          <span className="text-green-700">{selectedLocation.address}</span>
          <div className="text-xs text-green-600 mt-1">
            Coordinates: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
          </div>
        </div>
      )}
    </div>
  );
}