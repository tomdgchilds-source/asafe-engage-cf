import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { 
  X, 
  Plus, 
  Shield, 
  Zap, 
  Check,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  FileText,
  TrendingUp,
  Package,
  Info
} from "lucide-react";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@shared/schema";
import { cn } from "@/lib/utils";

interface ProductComparisonProps {
  isOpen: boolean;
  onClose: () => void;
  initialProducts?: Product[];
  onAddToCart?: (product: Product) => void;
  onRequestQuote?: (product: Product) => void;
}

export function ProductComparison({ 
  isOpen, 
  onClose, 
  initialProducts = [],
  onAddToCart,
  onRequestQuote
}: ProductComparisonProps) {
  const [selectedProducts, setSelectedProducts] = useState<Product[]>(initialProducts);
  const [showAllSpecs, setShowAllSpecs] = useState(false);
  const [showProductSelector, setShowProductSelector] = useState(false);
  const { formatPrice } = useCurrency();
  const { toast } = useToast();
  
  // Fetch all products for selection
  const { data: allProducts } = useQuery({
    queryKey: ["/api/products"],
    enabled: showProductSelector,
  });

  const handleAddProduct = (product: Product) => {
    if (selectedProducts.length >= 4) {
      toast({
        variant: "destructive",
        title: "Maximum Products Reached",
        description: "You can compare up to 4 products at a time"
      });
      return;
    }
    
    if (selectedProducts.find(p => p.id === product.id)) {
      toast({
        variant: "destructive",
        title: "Product Already Added",
        description: "This product is already in your comparison"
      });
      return;
    }
    
    setSelectedProducts([...selectedProducts, product]);
    setShowProductSelector(false);
  };

  const handleRemoveProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId));
  };

  const getSpecifications = (product: Product) => {
    try {
      if (typeof product.specifications === 'string') {
        return JSON.parse(product.specifications);
      }
      return product.specifications || {};
    } catch {
      return {};
    }
  };

  const getAllSpecificationKeys = () => {
    const keys = new Set<string>();
    selectedProducts.forEach(product => {
      const specs = getSpecifications(product);
      Object.keys(specs).forEach(key => keys.add(key));
    });
    return Array.from(keys);
  };

  const getComparisonRows = () => {
    const rows = [
      {
        label: "Price",
        getValue: (p: Product) => formatPrice(parseFloat(p.price || '0')),
        highlight: true
      },
      {
        label: "Impact Rating",
        getValue: (p: Product) => p.impactRating ? `${p.impactRating} kJ` : "N/A",
        highlight: true
      },
      {
        label: "Category",
        getValue: (p: Product) => p.category || "N/A"
      },
      {
        label: "Subcategory",
        getValue: (p: Product) => p.subcategory || "N/A"
      },
      {
        label: "Industry",
        getValue: (p: Product) => p.industry || "General"
      },
      {
        label: "Application",
        getValue: (p: Product) => p.application || "N/A"
      }
    ];

    // Add specification rows
    const specKeys = getAllSpecificationKeys();
    const importantSpecs = ['Height', 'Width', 'Length', 'Material', 'Weight', 'Color'];
    
    // Sort specs to show important ones first
    const sortedSpecs = specKeys.sort((a, b) => {
      const aImportant = importantSpecs.includes(a);
      const bImportant = importantSpecs.includes(b);
      if (aImportant && !bImportant) return -1;
      if (!aImportant && bImportant) return 1;
      return a.localeCompare(b);
    });

    const specsToShow = showAllSpecs ? sortedSpecs : sortedSpecs.slice(0, 6);
    
    specsToShow.forEach(key => {
      rows.push({
        label: key,
        getValue: (p: Product) => {
          const specs = getSpecifications(p);
          return specs[key] || "-";
        }
      });
    });

    return rows;
  };

  const getBestValue = (products: Product[], key: string): string | null => {
    if (products.length === 0) return null;
    
    if (key === "Price") {
      const prices = products.map(p => parseFloat(p.price || '0')).filter(p => p > 0);
      if (prices.length === 0) return null;
      const minPrice = Math.min(...prices);
      return products.find(p => parseFloat(p.price || '0') === minPrice)?.id || null;
    }
    
    if (key === "Impact Rating") {
      const ratings = products.map(p => p.impactRating || 0).filter(r => r > 0);
      if (ratings.length === 0) return null;
      const maxRating = Math.max(...ratings);
      return products.find(p => p.impactRating === maxRating)?.id || null;
    }
    
    return null;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle className="text-2xl font-bold">Product Comparison</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[calc(90vh-100px)]">
            <div className="p-6">
              {selectedProducts.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="h-16 w-16 mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Products Selected</h3>
                  <p className="text-gray-600 mb-4">Add products to start comparing</p>
                  <Button onClick={() => setShowProductSelector(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Product
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Product Headers */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div className="hidden lg:block" /> {/* Empty cell for labels column */}
                    {selectedProducts.map(product => (
                      <Card key={product.id} className="relative">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-2 h-6 w-6"
                          onClick={() => handleRemoveProduct(product.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        <CardHeader className="pb-3">
                          {product.imageUrl && (
                            <img 
                              src={product.imageUrl} 
                              alt={product.name}
                              className="w-full h-32 object-contain mb-3"
                            />
                          )}
                          <CardTitle className="text-sm">{product.name}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <Button 
                            className="w-full text-xs"
                            variant="outline"
                            onClick={() => onAddToCart?.(product)}
                          >
                            <ShoppingCart className="h-3 w-3 mr-1" />
                            Add to Cart
                          </Button>
                          <Button 
                            className="w-full text-xs"
                            variant="secondary"
                            onClick={() => onRequestQuote?.(product)}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            Request Quote
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                    {selectedProducts.length < 4 && (
                      <Card className="border-dashed cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                            onClick={() => setShowProductSelector(true)}>
                        <CardContent className="flex flex-col items-center justify-center h-full min-h-[200px]">
                          <Plus className="h-8 w-8 text-gray-400 mb-2" />
                          <span className="text-sm text-gray-600">Add Product</span>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Comparison Table */}
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <tbody>
                        {getComparisonRows().map((row, index) => {
                          const bestProductId = getBestValue(selectedProducts, row.label);
                          return (
                            <tr key={row.label} className={cn(
                              "border-b",
                              index % 2 === 0 ? "bg-gray-50 dark:bg-gray-800/50" : ""
                            )}>
                              <td className="px-4 py-3 font-medium text-sm w-1/5">
                                {row.label}
                                {row.highlight && (
                                  <Badge className="ml-2 text-xs" variant="secondary">Key</Badge>
                                )}
                              </td>
                              {selectedProducts.map(product => {
                                const value = row.getValue(product);
                                const isBest = bestProductId === product.id;
                                return (
                                  <td key={product.id} className={cn(
                                    "px-4 py-3 text-sm",
                                    isBest && "bg-green-50 dark:bg-green-900/20 font-semibold"
                                  )}>
                                    <div className="flex items-center gap-2">
                                      {value}
                                      {isBest && (
                                        <Badge className="text-xs bg-green-500 text-white">
                                          <TrendingUp className="h-3 w-3 mr-1" />
                                          Best
                                        </Badge>
                                      )}
                                    </div>
                                  </td>
                                );
                              })}
                              {Array.from({ length: 4 - selectedProducts.length }).map((_, i) => (
                                <td key={`empty-${i}`} className="px-4 py-3" />
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Show More/Less Specifications */}
                  {getAllSpecificationKeys().length > 6 && (
                    <div className="text-center">
                      <Button
                        variant="outline"
                        onClick={() => setShowAllSpecs(!showAllSpecs)}
                      >
                        {showAllSpecs ? (
                          <>
                            <ChevronUp className="h-4 w-4 mr-2" />
                            Show Less Specifications
                          </>
                        ) : (
                          <>
                            <ChevronDown className="h-4 w-4 mr-2" />
                            Show All Specifications ({getAllSpecificationKeys().length - 6} more)
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Product Selector Dialog */}
      <Dialog open={showProductSelector} onOpenChange={setShowProductSelector}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Select Product to Compare</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
              {allProducts?.map((product: Product) => (
                <Card 
                  key={product.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleAddProduct(product)}
                >
                  <CardHeader className="pb-2">
                    {product.imageUrl && (
                      <img 
                        src={product.imageUrl} 
                        alt={product.name}
                        className="w-full h-24 object-contain mb-2"
                      />
                    )}
                    <CardTitle className="text-sm">{product.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span>Price:</span>
                        <span className="font-semibold">{formatPrice(parseFloat(product.price || '0'))}</span>
                      </div>
                      {product.impactRating && (
                        <div className="flex justify-between">
                          <span>Impact:</span>
                          <span className="font-semibold">{product.impactRating} kJ</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}