import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  Calendar, 
  Clock, 
  Package, 
  User, 
  Phone, 
  Mail, 
  MapPin,
  Building2,
  FileText,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  ShoppingCart,
  Truck,
  Wrench,
  Trash2,
  X
} from "lucide-react";
import { format } from "date-fns";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { QuoteRequest, QuoteRequestItem, Product } from "@shared/schema";

interface QuoteListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface QuoteItemsProps {
  quoteId: string;
  isExpanded: boolean;
}

function QuoteItems({ quoteId, isExpanded }: QuoteItemsProps) {
  const { formatPrice } = useCurrency();
  const { data: items = [], isLoading } = useQuery<QuoteRequestItem[]>({
    queryKey: [`/api/quote-requests/${quoteId}/items`],
    enabled: isExpanded && !!quoteId,
  });

  // Fetch products for image display
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Helper function to find product by name
  const getProductDetails = (productName: string) => {
    return products.find(p => p.name === productName);
  };

  // Helper function to get product image by name
  const getProductImage = (productName: string): string | null => {
    const product = getProductDetails(productName);
    return product?.imageUrl || null;
  };

  if (!isExpanded) return null;

  if (isLoading) {
    return (
      <div className="mt-4 p-4 border rounded-lg bg-gray-50">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin h-4 w-4 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
          <span className="ml-2 text-sm text-gray-500">Loading items...</span>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mt-4 p-4 border rounded-lg bg-gray-50">
        <p className="text-sm text-gray-500 text-center">No itemized details available for this order form request.</p>
      </div>
    );
  }

  const totalValue = items.reduce((sum, item) => sum + item.totalPrice, 0);

  return (
    <div className="mt-4 p-4 border rounded-lg bg-gray-50">
      <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <ShoppingCart className="h-4 w-4" />
        Order Form Request Items ({items.length})
      </h4>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id} className="bg-white p-3 rounded border">
            <div className="flex items-start gap-3 mb-2">
              {/* Product Thumbnail */}
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border">
                  {getProductImage(item.productName) ? (
                    <img
                      src={getProductImage(item.productName)!}
                      alt={item.productName}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <Package className="h-6 w-6" />
                    </div>
                  )}
                </div>
              </div>

              {/* Product Details */}
              <div className="flex-1 min-w-0">
                <h5 className="font-medium text-sm break-words">{item.productName}</h5>
                <div className="text-xs text-gray-600 mt-1">
                  Quantity: {item.quantity} {item.pricingType === 'per_meter' ? 'meters' : 'items'}
                </div>
              </div>

              {/* Price Information */}
              <div className="text-right flex-shrink-0">
                <div className="font-semibold text-sm">AED {item.totalPrice.toLocaleString()}</div>
                <div className="text-xs text-gray-500">AED {item.unitPrice.toLocaleString()} per {item.pricingType === 'per_meter' ? 'meter' : 'item'}</div>
              </div>
            </div>
            
            {/* Additional details */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-600">
              {item.requiresDelivery && (
                <div className="flex items-center gap-1">
                  <Truck className="h-3 w-3 flex-shrink-0" />
                  <span>Delivery Required</span>
                </div>
              )}
              {item.requiresInstallation && (
                <div className="flex items-center gap-1">
                  <Wrench className="h-3 w-3 flex-shrink-0" />
                  <span>Installation Required</span>
                </div>
              )}
              {item.columnLength && item.columnWidth && (
                <div className="flex items-center gap-1">
                  <Package className="h-3 w-3 flex-shrink-0" />
                  <span>Dimensions: {item.columnLength}mm × {item.columnWidth}mm</span>
                </div>
              )}
              {item.sidesToProtect && (
                <div className="flex items-center gap-1">
                  <Package className="h-3 w-3 flex-shrink-0" />
                  <span>{item.sidesToProtect} sides protection</span>
                </div>
              )}
            </div>
            
            {item.notes && (
              <div className="mt-2 text-xs text-gray-600">
                <span className="font-medium">Notes:</span> 
                <span className="break-words whitespace-pre-wrap ml-1">{item.notes}</span>
              </div>
            )}
          </div>
        ))}
        
        <Separator />
        
        <div className="flex justify-between items-center font-semibold text-sm pt-2">
          <span>Total Quote Value:</span>
          <span className="text-lg">{formatPrice(Math.round(totalValue))}</span>
        </div>
      </div>
    </div>
  );
}

export function QuoteListModal({ isOpen, onClose }: QuoteListModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [expandedQuotes, setExpandedQuotes] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toggleQuoteExpansion = (quoteId: string) => {
    const newExpanded = new Set(expandedQuotes);
    if (newExpanded.has(quoteId)) {
      newExpanded.delete(quoteId);
    } else {
      newExpanded.add(quoteId);
    }
    setExpandedQuotes(newExpanded);
  };

  const { data: quoteRequests = [], isLoading } = useQuery<QuoteRequest[]>({
    queryKey: ["/api/quote-requests"],
    enabled: isOpen,
  });

  // Delete single quote request
  const deleteQuoteMutation = useMutation({
    mutationFn: async (quoteId: string) => {
      return apiRequest(`/api/quote-requests/${quoteId}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests/stats"] });
      toast({
        title: "Quote Request Deleted",
        description: "The quote request has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete quote request",
        variant: "destructive",
      });
    },
  });

  // Clear all quote requests
  const clearAllQuotesMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("/api/quote-requests", "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quote-requests/stats"] });
      toast({
        title: "All Quote Requests Cleared",
        description: "All your quote requests have been successfully deleted.",
      });
      setExpandedQuotes(new Set()); // Reset expanded state
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear quote requests",
        variant: "destructive",
      });
    },
  });

  const handleDeleteQuote = (quoteId: string) => {
    deleteQuoteMutation.mutate(quoteId);
  };

  const handleClearAllQuotes = () => {
    clearAllQuotesMutation.mutate();
  };

  const filteredQuotes = selectedStatus === "all" 
    ? quoteRequests 
    : quoteRequests.filter(quote => quote.status === selectedStatus);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pending Review';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-6xl h-[90vh] flex flex-col overflow-hidden" data-testid="dialog-quote-list">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Order Form Request History
          </DialogTitle>
          <DialogDescription>
            View all your submitted order form requests and their current status
          </DialogDescription>
        </DialogHeader>

        {/* Status Filter and Actions */}
        <div className="flex flex-col gap-3 flex-shrink-0">
          <div className="flex flex-wrap gap-2">
            <Button
              variant={selectedStatus === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("all")}
              data-testid="filter-all"
            >
              All ({quoteRequests.length})
            </Button>
            <Button
              variant={selectedStatus === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("pending")}
              data-testid="filter-pending"
            >
              Pending ({quoteRequests.filter(q => q.status === 'pending').length})
            </Button>
            <Button
              variant={selectedStatus === "in_progress" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("in_progress")}
              data-testid="filter-in-progress"
            >
              In Progress ({quoteRequests.filter(q => q.status === 'in_progress').length})
            </Button>
            <Button
              variant={selectedStatus === "completed" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedStatus("completed")}
              data-testid="filter-completed"
            >
              Completed ({quoteRequests.filter(q => q.status === 'completed').length})
            </Button>
          </div>
          
          {/* Clear All Action */}
          {quoteRequests.length > 0 && (
            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    data-testid="button-clear-all"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All History
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear All Quote Requests?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete all your quote requests from the history.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleClearAllQuotes}
                      disabled={clearAllQuotesMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      {clearAllQuotesMutation.isPending ? "Deleting..." : "Clear All"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
        
        <Separator className="my-4" />

        {/* Quote List */}
        <ScrollArea className="flex-1 pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
              </div>
            ) : filteredQuotes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {selectedStatus === "all" 
                  ? "No order form requests found. Start by adding products to your cart and requesting an order form."
                  : `No ${selectedStatus} order form requests found.`
                }
              </div>
            ) : (
              <div className="space-y-4">
                {filteredQuotes.map((quote) => (
                  <Card key={quote.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            {(quote as any).customOrderNumber ? (
                              <span>Quote: {(quote as any).customOrderNumber}</span>
                            ) : (
                              <span>Quote Request #{quote.id.slice(-8)}</span>
                            )}
                          </CardTitle>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {quote.createdAt ? format(new Date(quote.createdAt), 'MMM dd, yyyy') : 'N/A'}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {quote.createdAt ? format(new Date(quote.createdAt), 'hh:mm a') : 'N/A'}
                            </div>
                          </div>
                        </div>
                        <Badge className={getStatusColor(quote.status)} data-testid={`status-${quote.id}`}>
                          {getStatusLabel(quote.status)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Contact Information */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                        {quote.phoneNumber && (
                          <div className="flex items-start gap-2">
                            <Phone className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <span className="break-words min-w-0">{quote.phoneNumber}</span>
                          </div>
                        )}
                        {quote.email && (
                          <div className="flex items-start gap-2">
                            <Mail className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <span className="break-words min-w-0">{quote.email}</span>
                          </div>
                        )}
                        {quote.company && (
                          <div className="flex items-start gap-2">
                            <Building2 className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <span className="break-words min-w-0">{quote.company}</span>
                          </div>
                        )}
                      </div>

                      {quote.message && (
                        <>
                          <Separator />
                          
                          {/* Message/Notes */}
                          <div className="space-y-2 text-sm">
                            <div className="flex items-start gap-2">
                              <MessageCircle className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                              <div className="min-w-0">
                                <span className="font-medium">Message:</span> 
                                <span className="break-words ml-1 whitespace-pre-wrap">{quote.message}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {/* Request Method and Actions */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2 text-xs">
                            {quote.contactMethod === 'email' ? (
                              <>
                                <Mail className="h-3 w-3 text-blue-600" />
                                <span className="text-blue-600">Email Request</span>
                              </>
                            ) : (
                              <>
                                <MessageCircle className="h-3 w-3 text-green-600" />
                                <span className="text-green-600">WhatsApp Request</span>
                              </>
                            )}
                          </div>
                          
                          {/* Delete Button */}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-auto p-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                                data-testid={`button-delete-${quote.id}`}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Quote Request?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This will permanently delete this quote request.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteQuote(quote.id)}
                                  disabled={deleteQuoteMutation.isPending}
                                  className="bg-red-600 hover:bg-red-700"
                                >
                                  {deleteQuoteMutation.isPending ? "Deleting..." : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleQuoteExpansion(quote.id)}
                          className="h-auto p-1 text-xs"
                          data-testid={`toggle-items-${quote.id}`}
                        >
                          {expandedQuotes.has(quote.id) ? (
                            <>
                              <ChevronUp className="h-3 w-3 mr-1" />
                              Hide Items
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3 w-3 mr-1" />
                              View Items
                            </>
                          )}
                        </Button>
                      </div>
                      
                      {/* Itemized Quote Request Items */}
                      <QuoteItems 
                        quoteId={quote.id} 
                        isExpanded={expandedQuotes.has(quote.id)} 
                      />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
        </ScrollArea>
        
        <div className="flex justify-end pt-4 flex-shrink-0 border-t">
          <Button onClick={onClose} data-testid="button-close">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}