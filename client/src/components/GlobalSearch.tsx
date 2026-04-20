import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { 
  Search, 
  X, 
  Package, 
  FileText, 
  Building, 
  HelpCircle, 
  ShoppingCart,
  Loader2,
  ArrowRight 
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from '@/hooks/useDebounce';
import { useLocation } from 'wouter';

interface SearchResult {
  products: any[];
  resources: any[];
  caseStudies: any[];
  orders: any[];
  faqs: any[];
}

export function GlobalSearch() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [, setLocation] = useLocation();

  // Search query
  const { data: searchResults, isLoading } = useQuery<SearchResult>({
    queryKey: ['/api/search', debouncedSearch, selectedType],
    queryFn: async () => {
      if (!debouncedSearch || debouncedSearch.length < 2) {
        return { products: [], resources: [], caseStudies: [], orders: [], faqs: [] };
      }
      const res = await apiRequest(`/api/search?q=${encodeURIComponent(debouncedSearch)}&type=${selectedType}`, 'GET');
      return await res.json() as SearchResult;
    },
    enabled: debouncedSearch.length >= 2,
  });

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleResultClick = (type: string, item: any) => {
    setIsOpen(false);
    setSearchQuery('');

    switch (type) {
      case 'product':
        setLocation(`/products/${item.id}`);
        break;
      case 'resource':
        window.open(item.fileUrl, '_blank');
        break;
      case 'caseStudy':
        setLocation(`/case-studies/${item.id}`);
        break;
      case 'order':
        setLocation(`/orders/${item.id}`);
        break;
      case 'faq':
        setLocation('/support#faq');
        break;
    }
  };

  const getResultCount = () => {
    if (!searchResults) return 0;
    return (searchResults.products?.length || 0) +
           (searchResults.resources?.length || 0) +
           (searchResults.caseStudies?.length || 0) +
           (searchResults.orders?.length || 0) +
           (searchResults.faqs?.length || 0);
  };

  const searchTypes = [
    { id: 'all', label: 'All', icon: Search },
    { id: 'products', label: 'Products', icon: Package },
    { id: 'resources', label: 'Resources', icon: FileText },
    { id: 'case_studies', label: 'Case Studies', icon: Building },
    { id: 'orders', label: 'Orders', icon: ShoppingCart },
    { id: 'faqs', label: 'FAQs', icon: HelpCircle },
  ];

  return (
    <>
      {/* Search Button */}
      <Button
        variant="outline"
        onClick={() => setIsOpen(true)}
        className="relative w-full max-w-sm justify-start text-left font-normal"
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline-flex flex-1">Search products, resources...</span>
        <span className="sm:hidden">Search</span>
        <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>

      {/* Search Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-3xl p-0">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="sr-only">Search</DialogTitle>
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-gray-400" />
              <Input
                placeholder="Search products, resources, case studies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 border-0 px-0 shadow-none focus-visible:ring-0"
                autoFocus
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery('')}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Search Type Filters */}
            <div className="flex gap-2 mt-3 pb-3 border-b">
              {searchTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Button
                    key={type.id}
                    variant={selectedType === type.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedType(type.id)}
                    className="text-xs"
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {type.label}
                  </Button>
                );
              })}
            </div>
          </DialogHeader>

          {/* Search Results */}
          <div className="max-h-[400px] overflow-y-auto px-4 pb-4">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}

            {!isLoading && searchQuery.length >= 2 && getResultCount() === 0 && (
              <div className="text-center py-8 text-gray-500">
                No results found for "{searchQuery}"
              </div>
            )}

            {!isLoading && searchResults && getResultCount() > 0 && (
              <div className="space-y-4 mt-4">
                {/* Products */}
                {searchResults.products && searchResults.products.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Products
                    </h3>
                    {searchResults.products.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => handleResultClick('product', product)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{product.name}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {product.category} • {product.impactRating}kJ Rating
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Resources */}
                {searchResults.resources && searchResults.resources.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Resources
                    </h3>
                    {searchResults.resources.map((resource) => (
                      <button
                        key={resource.id}
                        onClick={() => handleResultClick('resource', resource)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{resource.title}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {resource.category} • {resource.resourceType}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Case Studies */}
                {searchResults.caseStudies && searchResults.caseStudies.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                      <Building className="h-4 w-4" />
                      Case Studies
                    </h3>
                    {searchResults.caseStudies.map((study) => (
                      <button
                        key={study.id}
                        onClick={() => handleResultClick('caseStudy', study)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{study.title}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {study.industry} • {study.location}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* Orders */}
                {searchResults.orders && searchResults.orders.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                      <ShoppingCart className="h-4 w-4" />
                      Orders
                    </h3>
                    {searchResults.orders.map((order) => (
                      <button
                        key={order.id}
                        onClick={() => handleResultClick('order', order)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Order #{order.orderNumber}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {order.projectName || 'Unnamed Project'} • {order.status}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* FAQs */}
                {searchResults.faqs && searchResults.faqs.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 mb-2 flex items-center gap-2">
                      <HelpCircle className="h-4 w-4" />
                      FAQs
                    </h3>
                    {searchResults.faqs.map((faq) => (
                      <button
                        key={faq.id}
                        onClick={() => handleResultClick('faq', faq)}
                        className="w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors mb-2"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{faq.question}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1">
                              {faq.answer}
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {!searchQuery && (
              <div className="text-center py-8 text-gray-500">
                <p>Start typing to search...</p>
                <p className="text-sm mt-2">
                  Press <kbd className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 rounded">ESC</kbd> to close
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}