import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { activityService } from "@/services/activityService";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, Package, Zap, ArrowLeft, ExternalLink, ChevronLeft, Download, ShoppingCart, FileText, Truck, Shield, Info, Camera, Play, Car, SlidersHorizontal, GitCompare, X } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { GroupedProductCard } from "@/components/GroupedProductCard";
import { HeightRestrictorKitCard } from "@/components/HeightRestrictorKitCard";
import { EnhancedQuoteRequestModal } from "@/components/EnhancedQuoteRequestModal";
import { AddToCartModal } from "@/components/AddToCartModal";
import { ProductComparison } from "@/components/ProductComparison";
import { ProductSuitabilityBlock } from "@/components/ProductSuitabilityBlock";
import { ProductMaintenanceBlock } from "@/components/ProductMaintenanceBlock";
import { ProductGroundWorksBlock } from "@/components/ProductGroundWorksBlock";
import { ProductBasePlatesPanel } from "@/components/ProductBasePlatesPanel";
import { ProductInstallVideos } from "@/components/ProductInstallVideos";
import { useAuth } from "../hooks/useAuth";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import { ProductCardSkeleton } from "@/components/ui/skeleton";
import { CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { Product, VehicleType } from "@shared/schema";
import { getPriceDisplay, extractPricingData } from "@shared/pricingUtils";

export default function Products() {
  const params = useParams();
  const productId = params.id;
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");
  const [tempSearchTerm, setTempSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  
  // Advanced filtering states
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);
  const [impactRatingRange, setImpactRatingRange] = useState<[number, number]>([0, 100]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<string>("impact-desc");

  // Check if we're coming from the calculator
  const isFromCalculator = location.includes('?from=calculator');
  
  // Get authenticated user data for quote requests
  const { user } = useAuth();
  const { formatPrice } = useCurrency();
  const haptic = useHapticFeedback();


  // If we have a product ID, fetch individual product, otherwise fetch all products
  const { data: products, isLoading, error } = useQuery({
    queryKey: productId ? ["/api/products", productId] : ["/api/products", selectedCategory, searchTerm],
    queryFn: async () => {
      if (productId) {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) throw new Error('Failed to fetch product');
        return response.json();
      } else {
        const params = new URLSearchParams();
        if (selectedCategory !== 'all') params.append('category', selectedCategory);
        if (searchTerm) params.append('search', searchTerm);
        // Don't append 'grouped=false' to let server group variants automatically
        
        const response = await fetch(`/api/products?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch products');
        return response.json();
      }
    },
    enabled: !productId, // Only run this query when not viewing individual product
  });

  const { data: individualProduct, isLoading: isLoadingProduct, error: productError } = useQuery<Product>({
    queryKey: [`/api/products/${productId}`],
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}`);
      if (!response.ok) throw new Error('Failed to fetch product');
      return response.json();
    },
    enabled: !!productId,
  });

  // Track product view when individual product is loaded
  useEffect(() => {
    if (individualProduct && productId) {
      activityService.recordActivity({
        itemType: 'product',
        itemId: productId,
        itemTitle: individualProduct.name,
        itemCategory: individualProduct.category,
        itemSubcategory: individualProduct.subcategory || undefined,
        itemImage: individualProduct.imageUrl || undefined,
        metadata: {
          impactRating: individualProduct.impactRating,
          price: individualProduct.price
        }
      });
    }
  }, [individualProduct, productId]);

  const categories = [
    { value: "traffic-guardrails", label: "Traffic Barriers" },
    { value: "pedestrian-barriers", label: "Pedestrian Barriers" },
    { value: "rack-protection", label: "Rack Protection" },
    { value: "column-protection", label: "Column Protection" },
    { value: "bollards", label: "Bollards" },
    { value: "vehicle-stops", label: "Vehicle Stops" },
    { value: "gates", label: "Gates & Access Control" },
    { value: "dock-protection", label: "Dock Protection" },
    { value: "height-restrictors", label: "Height Restrictors" },
    { value: "accessories", label: "Accessories" },
  ];
  
  const industries = [
    "Automotive",
    "Warehousing",
    "Manufacturing",
    "Retail",
    "Healthcare",
    "Food & Beverage",
    "Aerospace",
    "Logistics"
  ];
  
  const sortOptions = [
    { value: "impact-desc", label: "Impact Rating (High to Low)" },
    { value: "impact-asc", label: "Impact Rating (Low to High)" },
    { value: "price-asc", label: "Price (Low to High)" },
    { value: "price-desc", label: "Price (High to Low)" },
    { value: "name-asc", label: "Name (A-Z)" },
    { value: "name-desc", label: "Name (Z-A)" }
  ];

  const handleProductDetails = (product: Product) => {
    haptic.select();
    setLocation(`/products/${product.id}`);
  };

  const handleSearch = () => {
    haptic.select();
    setSearchTerm(tempSearchTerm);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  // Function to process products with variants from the server
  const groupProducts = (products: Product[]) => {
    // If products already have variant information from the server, use it
    const grouped: { product: Product; variants?: Product[] }[] = [];
    
    // Check if we're getting pre-grouped products from server
    const isPreGrouped = products.some(p => 'hasVariants' in p && 'productVariants' in p);
    
    // First, handle special cases that need manual grouping regardless of server grouping
    const processedIds = new Set<string>();
    
    // Group Vehicle Stops
    const vehicleStops = products.filter(p => 
      ['Car Stop', 'Coach Stop', 'Truck Stop'].includes(p.name)
    );
    if (vehicleStops.length > 0) {
      const mainProduct = {
        ...vehicleStops[0],
        id: 'vehicle-stops-group',
        name: 'Vehicle Stops',
        description: 'Vehicle stopping systems for cars, coaches, and trucks. Prevents over-travel damage in loading and unloading areas.',
        price: String(Math.min(...vehicleStops.map(v => parseFloat(String(v.price || '0')))))
      };
      grouped.push({
        product: mainProduct,
        variants: vehicleStops.sort((a, b) => {
          const order = ['Car Stop', 'Coach Stop', 'Truck Stop'];
          return order.indexOf(a.name) - order.indexOf(b.name);
        })
      });
      vehicleStops.forEach(v => processedIds.add(v.id));
    }
    
    // Group Slide Gates
    const slideGates = products.filter(p => 
      p.name.includes('Slide Gate')
    );
    if (slideGates.length > 0) {
      const mainProduct = {
        ...slideGates[0],
        id: 'slide-gates-group',
        name: 'iFlex Slide Gates',
        description: 'Slide Gate system for controlled vehicle access. Robust sliding gate system for industrial vehicle access control with manual operation.',
        price: String(Math.min(...slideGates.map(v => parseFloat(String(v.price || '0')))))
      };
      grouped.push({
        product: mainProduct,
        variants: slideGates.sort((a, b) => {
          const getWidth = (name: string) => {
            const match = name.match(/(\d+)mm/);
            return match ? parseInt(match[1]) : 0;
          };
          return getWidth(a.name) - getWidth(b.name);
        })
      });
      slideGates.forEach(v => processedIds.add(v.id));
    }
    
    // Now handle remaining products
    if (isPreGrouped) {
      // Use server-provided grouping for remaining products
      products.forEach(product => {
        if (processedIds.has(product.id)) return; // Skip already processed
        
        const serverProduct = product as any;
        if (serverProduct.hasVariants && serverProduct.productVariants && serverProduct.productVariants.length > 1) {
          grouped.push({
            product: {
              ...product,
              // Ensure we have the min/max prices from server
              price: serverProduct.minPrice || product.price
            },
            variants: serverProduct.productVariants
          });
        } else {
          grouped.push({ product });
        }
      });
    } else {
      // Fallback to manual grouping for remaining products
      const remainingProducts = products.filter(p => !processedIds.has(p.id));
      const manualGrouping = new Map<string, Product[]>();

      remainingProducts.forEach(product => {
        // Group by base name (remove dimensions and specific details)
        const baseName = product.name
          .replace(/\s*–\s*\d{3,4}\s*mm/g, '')
          .replace(/\s*\d{3,4}\s*x\s*\d{3,4}/g, '')
          .replace(/\s*\(\w+\)/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (!manualGrouping.has(baseName)) {
          manualGrouping.set(baseName, []);
        }
        manualGrouping.get(baseName)!.push(product);
      });

      // Convert manual grouping to grouped format
      Array.from(manualGrouping.entries()).forEach(([baseName, groupProducts]) => {
        if (groupProducts.length === 1) {
          grouped.push({ product: groupProducts[0] });
        } else {
          // Sort variants by dimensions then price
          const sortedVariants = groupProducts.sort((a: Product, b: Product) => {
            // Extract dimension for sorting
            const extractDimension = (product: Product): number => {
              const name = product.name;
              
              // Extract numeric dimensions from product name
              // Look for patterns like "1500 mm", "900 x 900", "190 OD", etc.
              const dimensionMatches = [
                name.match(/\u2013\s*(\d{3,4})\s*mm/), // "– 1500 mm" pattern
                name.match(/(\d{3,4})\s*x\s*(\d{3,4})/), // "900 x 900" pattern
                name.match(/(\d{2,3})\s*OD/), // "190 OD" pattern
                name.match(/(\d{3,4})\s*mm/) // "1500mm" pattern
              ];
              
              for (const match of dimensionMatches) {
                if (match) return parseInt(match[1]);
              }
              
              return 9999; // Unknown dimensions go to end
            };
            
            const dimA = extractDimension(a);
            const dimB = extractDimension(b);
            
            if (dimA !== dimB) return dimA - dimB;
            
            // If dimensions are equal, sort by price
            const priceA = parseFloat(String(a.price || '0'));
            const priceB = parseFloat(String(b.price || '0'));
            if (priceA !== priceB) return priceA - priceB;
            
            // Finally, sort by name
            return a.name.localeCompare(b.name);
          });
          
          // Create main product using first variant as base
          const mainProduct = {
            ...sortedVariants[0],
            name: baseName,
            description: groupProducts[0].description || `${baseName} available in multiple configurations.`,
            price: String(Math.min(...groupProducts.map((p: Product) => parseFloat(String(p.price || '0')))))
          };
          
          grouped.push({
            product: mainProduct,
            variants: sortedVariants
          });
        }
      });
    }

    return grouped.sort((a, b) => {
      // Sort by category first, then by name
      const categoryOrder = [
        'traffic-barriers',
        'pedestrian-barriers', 
        'car-park-barriers',
        'rack-protection',
        'column-protection',
        'bollards',
        'gates',
        'wall-protection',
        'vehicle-stops',
        'signage'
      ];
      
      const catA = categoryOrder.indexOf(a.product.category);
      const catB = categoryOrder.indexOf(b.product.category);
      
      if (catA !== catB) {
        return catA - catB;
      }
      
      return a.product.name.localeCompare(b.product.name);
    });
  };

  // Alternative processing for grouped products (simpler approach)
  const processGroupedProducts = (products: Product[]) => {
    const grouped: { product: Product; variants?: Product[] }[] = [];
    const processedIds = new Set<string>();

    products.forEach(product => {
      if (processedIds.has(product.id)) return;
      
      // Vehicle Stops grouping
      if (['Car Stop', 'Coach Stop', 'Truck Stop'].includes(product.name)) {
        const vehicleStops = products.filter(p => ['Car Stop', 'Coach Stop', 'Truck Stop'].includes(p.name));
        
        if (vehicleStops.length > 0) {
          // Create main product card
          const mainProduct = {
            ...vehicleStops[0],
            id: vehicleStops[0].id, // Use the actual product ID instead of custom group ID
            name: 'Vehicle Stops',
            description: 'Vehicle stopping systems for cars, coaches, and trucks. Prevents over-travel damage in loading and unloading areas.',
            price: String(Math.min(...vehicleStops.map(v => parseFloat(String(v.price || '0')))))
          };
          
          grouped.push({ 
            product: mainProduct, 
            variants: vehicleStops.sort((a, b) => {
              const order = ['Car Stop', 'Coach Stop', 'Truck Stop'];
              return order.indexOf(a.name) - order.indexOf(b.name);
            })
          });
          
          vehicleStops.forEach(vs => processedIds.add(vs.id));
        }
      }
      // Group Slide Gates
      else if (product.name.includes('Slide Gate')) {
        const slideGates = products.filter(p => p.name.includes('Slide Gate'));
        
        if (slideGates.length > 0) {
          const mainProduct = {
            ...slideGates[0],
            id: slideGates[0].id,
            name: 'Slide Gates',
            description: 'Slide gate system for controlled vehicle access. Robust sliding gate system for industrial vehicle access control with manual operation.',
            price: String(Math.min(...slideGates.map(v => parseFloat(String(v.price || '0')))))
          };
          
          grouped.push({
            product: mainProduct,
            variants: slideGates.sort((a, b) => {
              const getWidth = (name: string) => {
                const match = name.match(/(\d+)mm/);
                return match ? parseInt(match[1]) : 0;
              };
              return getWidth(a.name) - getWidth(b.name);
            })
          });
          
          slideGates.forEach(sg => processedIds.add(sg.id));
        }
      }
      // Regular product
      else {
        grouped.push({ product });
        processedIds.add(product.id);
      }
    });

    return grouped;
  };

  // If viewing individual product
  if (productId) {
    if (isLoadingProduct) {
      return (
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="container mx-auto px-4 max-w-7xl">
            <div className="text-center py-12">
              <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500">Loading product details...</p>
            </div>
          </div>
        </div>
      );
    }

    if (productError || !individualProduct) {
      return (
        <div className="min-h-screen bg-gray-50 py-8">
          <div className="container mx-auto px-4 max-w-7xl">
            <Card className="max-w-md mx-auto">
              <CardContent className="p-6 text-center">
                <Package className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-black mb-2">Product Not Found</h2>
                <p className="text-gray-600 mb-4">The requested product could not be found.</p>
                <Link href="/products">
                  <Button className="bg-yellow-400 hover:bg-yellow-500 text-black">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Back to Products
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    // Individual Product Detail View
    return (
      <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
        <div className="w-full px-2 sm:px-4 max-w-7xl mx-auto">
          <div className="mb-4 sm:mb-6">
            {isFromCalculator ? (
              <Link href="/calculator">
                <Button variant="outline" className="mb-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Calculator
                </Button>
              </Link>
            ) : (
              <Link href="/products">
                <Button variant="outline" className="mb-4">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Products
                </Button>
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
            {/* Product Image */}
            <div className="space-y-4">
              <Card>
                <CardContent className="p-3 sm:p-6">
                  <img
                    src={individualProduct.imageUrl || ''}
                    alt={individualProduct.name}
                    className="w-full h-48 sm:h-64 md:h-80 lg:h-96 object-contain rounded-lg bg-gray-50"
                    data-testid="product-detail-image"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Product Information */}
            <div className="space-y-4 sm:space-y-6">
              <div>
                <Badge className="bg-yellow-400 text-black mb-2 text-xs sm:text-sm">
                  {individualProduct.category.replace('-', ' ').toUpperCase()}
                </Badge>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-black mb-3 sm:mb-4" data-testid="product-title">
                  {individualProduct.name}
                </h1>
                <p className="text-gray-600 text-sm sm:text-base lg:text-lg mb-4 sm:mb-6">
                  {individualProduct.description}
                </p>
              </div>

              {/* Specifications */}
              <Card>
                <CardHeader>
                  <CardTitle>Specifications</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="font-semibold">Price:</p>
                      <p className="text-green-600 font-bold">
                        {(() => {
                          const pricingData = extractPricingData(individualProduct);
                          const priceDisplay = getPriceDisplay(individualProduct, pricingData, formatPrice);
                          return priceDisplay.displayText;
                        })()}
                      </p>
                    </div>
                    {(individualProduct as any).specifications && typeof (individualProduct as any).specifications === 'object' && 
                      Object.entries((individualProduct as any).specifications as Record<string, any>)
                        .filter(([key, value]) => value !== null && value !== undefined && String(value).trim() !== '')
                        .map(([key, value]) => (
                          <div key={key}>
                            <p className="font-semibold">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</p>
                            <p>{Array.isArray(value) ? value.join(', ') : String(value)}</p>
                          </div>
                        ))
                    }
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-3">
                <AddToCartModal product={individualProduct as any}>
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white flex-1"
                    data-testid="add-to-cart-button"
                    onClick={() => haptic.addToCart()}
                  >
                    Add to Cart
                  </Button>
                </AddToCartModal>

                <Button variant="outline" className="flex-1" data-testid="request-quote" onClick={() => haptic.select()}>
                  <FileText className="h-4 w-4 mr-2" />
                  Request Quote
                </Button>
              </div>
            </div>
          </div>

          {/* Product Suitability spec-sheet block — sourced from
              products.suitability_data (PDF: ASAFE_ProductSuitability PRH-1009).
              Null-tolerant: renders a placeholder for the ~36 unmatched rows. */}
          <div className="mt-6 sm:mt-8">
            <ProductSuitabilityBlock
              data={(individualProduct as any).suitabilityData}
              productName={individualProduct.name}
            />
          </div>

          {/* Product Maintenance accordion — sourced from
              products.maintenance_data (PDF: ASAFE_ProductMaintenance PRH-1001).
              Null-safe: renders nothing for products outside the
              Memaplex/Monoplex/RackGuard/Traffic Gate taxonomy. */}
          <div className="mt-4 sm:mt-6">
            <ProductMaintenanceBlock
              data={(individualProduct as any).maintenanceData}
              productName={individualProduct.name}
            />
          </div>

          {/* Ground Works / installation prerequisites — sourced from
              products.ground_works_data (PDF: ASAFE_GroundWorks PRH-1005).
              Null-safe: renders nothing for products without a PDF entry. */}
          <div className="mt-4 sm:mt-6">
            <ProductGroundWorksBlock
              data={(individualProduct as any).groundWorksData}
              productName={individualProduct.name}
            />
          </div>

          {/* Available Base Plates — compatible plate SKUs joined via
              base_plate_product_compatibility. Hides itself if the product
              has no compatible plates (add-ons, rack accessories). */}
          <div className="mt-6 sm:mt-8">
            <ProductBasePlatesPanel
              productId={individualProduct.id}
              productName={individualProduct.name}
            />
          </div>

          {/* Installation Videos — per-product YouTube install guides
              sourced from A-SAFE's Installation Videos playlist. Backed by
              GET /api/products/:id/install-videos (joined through
              product_resources). Renders thumbnails that open a lightbox
              modal with an autoplayed embed. Family-level matches tagged
              with a "covers this product family" badge. Hides when the
              product has no linked videos. */}
          <div className="mt-6 sm:mt-8">
            <ProductInstallVideos
              productId={individualProduct.id}
              productName={individualProduct.name}
            />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="container mx-auto px-4 max-w-7xl">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-6 text-center">
              <Package className="h-12 w-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-black mb-2">Error Loading Products</h2>
              <p className="text-gray-600">
                Unable to load the product catalog. Please try again later.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
      <div className="w-full px-2 sm:px-4">
        {/* Header */}
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-black mb-2 sm:mb-3" data-testid="products-title">
            A-SAFE Product Catalog
          </h1>
          <p className="text-gray-600 text-sm sm:text-base lg:text-lg max-w-3xl mx-auto px-2">
            Explore our complete range of industrial safety solutions. All products are PAS 13 certified and independently tested by TÜV Nord.
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="mb-4 sm:mb-6">
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="space-y-4">
              {/* Search Bar and Category Filter */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
                {/* Search */}
                <div className="md:col-span-6 xl:col-span-6">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <Input
                      placeholder="Search products..."
                      value={tempSearchTerm}
                      onChange={(e) => setTempSearchTerm(e.target.value)}
                      onKeyPress={handleKeyPress}
                      className="pl-10 h-10 sm:h-11"
                      data-testid="search-input"
                    />
                  </div>
                </div>
                
                {/* Category Filter */}
                <div className="md:col-span-4 xl:col-span-4">
                  <Select value={selectedCategory} onValueChange={(value) => { haptic.select(); setSelectedCategory(value); }}>
                    <SelectTrigger className="h-10 sm:h-11" data-testid="category-filter">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Search Button */}
                <div className="md:col-span-2">
                  <Button 
                    onClick={handleSearch} 
                    className="w-full bg-yellow-400 hover:bg-yellow-500 text-black h-10 sm:h-11"
                    data-testid="search-button"
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Search
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Active filters display */}
            {(searchTerm || selectedCategory !== 'all') && (
              <div className="flex flex-wrap items-center gap-2 mt-4">
                <span className="text-sm text-gray-600">Active filters:</span>
                {searchTerm && (
                  <Badge variant="secondary" className="text-xs">
                    Search: "{searchTerm}"
                    <button
                      onClick={() => { haptic.select(); setSearchTerm(""); }}
                      className="ml-2 hover:text-red-500"
                    >
                      ×
                    </button>
                  </Badge>
                )}
                {selectedCategory !== 'all' && (
                  <Badge variant="secondary" className="text-xs">
                    Category: {categories.find(c => c.value === selectedCategory)?.label}
                    <button
                      onClick={() => { haptic.select(); setSelectedCategory("all"); }}
                      className="ml-2 hover:text-red-500"
                    >
                      ×
                    </button>
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Products Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {[...Array(8)].map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <>
            {(() => {
              // Discover Height Restrictor kit families. A family is any
              // pair of products where one name ends " - Post" and the
              // sibling ends " - Top Rail" with the same family prefix.
              // Installed as 2 posts + 1 top rail per gantry, so we
              // render one kit card per family instead of 2 cards.
              type KitFamily = {
                label: string;
                postProduct: Product;
                topRailProduct: Product;
              };
              const kitFamilies: KitFamily[] = [];
              const kitConstituentIds = new Set<string>();
              const postByPrefix = new Map<string, Product>();
              const railByPrefix = new Map<string, Product>();
              (products as Product[]).forEach((p) => {
                if (p.name.endsWith(" - Post")) {
                  postByPrefix.set(p.name.slice(0, -" - Post".length), p);
                } else if (p.name.endsWith(" - Top Rail")) {
                  railByPrefix.set(p.name.slice(0, -" - Top Rail".length), p);
                }
              });
              postByPrefix.forEach((postProduct, prefix) => {
                const topRailProduct = railByPrefix.get(prefix);
                if (topRailProduct) {
                  kitFamilies.push({ label: prefix, postProduct, topRailProduct });
                  kitConstituentIds.add(postProduct.id);
                  kitConstituentIds.add(topRailProduct.id);
                }
              });

              // Filter out constituents BEFORE grouping so GroupedProductCard
              // doesn't render them as standalone cards.
              const visibleProducts = (products as Product[]).filter(
                (p) => !kitConstituentIds.has(p.id),
              );
              const groupedProducts = groupProducts(visibleProducts);
              const totalCount = kitFamilies.length + groupedProducts.length;

              return (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                      <p className="text-gray-600 text-sm">
                        Showing {totalCount} product{totalCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6" data-testid="products-grid">
                    {kitFamilies.map((kit) => (
                      <div key={`kit-${kit.postProduct.id}`} className="min-w-0">
                        <HeightRestrictorKitCard
                          familyLabel={kit.label}
                          postProduct={kit.postProduct}
                          topRailProduct={kit.topRailProduct}
                          onViewDetails={handleProductDetails}
                        />
                      </div>
                    ))}
                    {groupedProducts.map((item) => {
                      if (item.variants && item.variants.length > 1) {
                        // Check if this is a server-provided grouped product
                        const productData = item.product as any;
                        const hasServerVariants = productData.hasVariants && productData.productVariants;

                        return (
                          <div key={item.product.id} className="min-w-0">
                            <GroupedProductCard
                              product={item.product}
                              variants={hasServerVariants ? productData.productVariants : item.variants}
                              onViewDetails={handleProductDetails}
                            />
                          </div>
                        );
                      } else {
                        return (
                          <div key={item.product.id} className="min-w-0">
                            <ProductCard
                              product={item.product}
                              onViewDetails={handleProductDetails}
                            />
                          </div>
                        );
                      }
                    })}
                  </div>
                </>
              );
            })()}
          </>
        ) : (
          <Card>
            <CardContent className="text-center py-12">
              <Package className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-xl font-bold text-black mb-2">No Products Found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || selectedCategory
                  ? "No products match your current filters. Try adjusting your search criteria."
                  : "No products are currently available. Please check back later."
                }
              </p>
              {(searchTerm || selectedCategory) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    haptic.select();
                    setSearchTerm("");
                    setSelectedCategory("all");
                  }}
                >
                  Clear All Filters
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* PAS 13 Information */}
        <Card className="mt-6 sm:mt-8 bg-card dark:bg-card text-card-foreground">
          <CardContent className="p-4 sm:p-6 lg:p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-xl font-bold mb-4 text-yellow-400">PAS 13 Certified Products</h3>
                <p className="mb-4">
                  All A-SAFE products are tested to the rigorous standards of BSI PAS 13, the global code of practice for testing the impact resilience of workplace safety barriers.
                </p>
                <p className="text-sm text-gray-300">
                  Independent certification by TÜV Nord ensures you can trust the performance ratings when it matters most.
                </p>
              </div>
              <div>
                <h4 className="font-bold mb-4 text-yellow-400">Key Benefits:</h4>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Scientifically tested impact ratings
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    No maintenance required - won't rust or fade
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Memaplex™ material bounces back after impact
                  </li>
                  <li className="flex items-center">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full mr-3"></span>
                    Trusted by global industry leaders
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Enhanced Order Form Request Modal */}
      {selectedProduct && (
        <EnhancedQuoteRequestModal
          isOpen={quoteModalOpen}
          onClose={() => setQuoteModalOpen(false)}
          product={selectedProduct}
          user={user as any}
        />
      )}
    </div>
  );
}