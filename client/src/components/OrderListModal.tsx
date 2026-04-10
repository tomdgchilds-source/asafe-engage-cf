import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  FileText, 
  Calendar, 
  Search,
  Eye,
  ExternalLink,
  RefreshCw
} from "lucide-react";
import { Link, useLocation } from "wouter";
import type { Order } from "@shared/schema";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface OrderListModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OrderListModal({ isOpen, onClose }: OrderListModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: isOpen,
  });

  // Mutation to restore order to cart for revision
  const restoreToCartMutation = useMutation({
    mutationFn: async (orderId: string) => {
      return await apiRequest(`/api/orders/${orderId}/restore-to-cart`, 'POST');
    },
    onSuccess: (data: any, orderId) => {
      // Store revision info in session storage
      if (data?.revisionInfo) {
        sessionStorage.setItem('orderRevisionInfo', JSON.stringify(data.revisionInfo));
      }
      
      toast({
        title: "Order loaded for revision",
        description: `Order has been loaded into your cart. You can now modify it and submit as a revision.`,
      });
      
      // Navigate to cart
      onClose();
      setLocation('/cart');
      
      // Invalidate cart query to refresh cart items
      queryClient.invalidateQueries({ queryKey: ['/api/cart'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to load order",
        description: error?.message || "There was an error loading the order for revision.",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'fulfilled':
        return 'bg-green-500 text-white';
      case 'installation_in_progress':
        return 'bg-blue-500 text-white';
      case 'shipped':
        return 'bg-blue-400 text-white';
      case 'submitted_for_review':
      case 'processing':
        return 'bg-yellow-400 text-black';
      case 'pending':
        return 'bg-orange-500 text-white';
      case 'cancelled':
        return 'bg-red-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const formatCurrencyValue = (amount: number, currency: string = 'AED') => {
    return `${amount.toLocaleString()} ${currency}`;
  };

  const filteredOrders = orders.filter(order => {
    const matchesSearch = searchTerm === "" || 
      order.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.customOrderNumber && order.customOrderNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const statusOptions = [
    { value: "all", label: "All Orders" },
    { value: "pending", label: "Pending Signatures" },
    { value: "submitted_for_review", label: "Submitted for Review" },
    { value: "processing", label: "Processing" },
    { value: "shipped", label: "Shipped" },
    { value: "installation_in_progress", label: "Installation in Progress" },
    { value: "fulfilled", label: "Fulfilled" },
    { value: "cancelled", label: "Cancelled" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            All Submitted Order Form Requests
          </DialogTitle>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 py-4 border-b">
          <div className="flex-1">
            <Label htmlFor="search" className="text-sm font-medium">
              Search Orders
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                id="search"
                type="text"
                placeholder="Search by order number, ID, or custom reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-orders"
              />
            </div>
          </div>
          
          <div className="min-w-48">
            <Label htmlFor="status-filter" className="text-sm font-medium">
              Filter by Status
            </Label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400"
              data-testid="select-status-filter"
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Orders List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-500">Loading orders...</div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No orders found
              </h3>
              <p className="text-gray-500">
                {searchTerm || statusFilter !== "all" 
                  ? "Try adjusting your search or filter criteria."
                  : "No order forms have been submitted yet."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => (
                <div 
                  key={order.id} 
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-semibold text-lg text-black">
                          Order #{order.orderNumber}
                        </p>
                        {order.customOrderNumber && (
                          <p className="text-sm text-gray-700 font-medium">
                            A-SAFE Ref: {order.customOrderNumber}
                          </p>
                        )}
                        <p className="text-sm text-gray-600 font-medium">
                          Total Value: {formatCurrencyValue(parseFloat(order.totalAmount), order.currency)}
                        </p>
                      </div>
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          Submitted: {order.orderDate ? new Date(order.orderDate).toLocaleString() : 'N/A'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <FileText className="h-4 w-4" />
                        <span>ID: {order.id.slice(0, 8)}...</span>
                      </div>
                    </div>

                    {/* Items Summary and Revision Info */}
                    <div className="mt-2 text-xs text-gray-600">
                      {Array.isArray(order.items) && order.items.length > 0 && (
                        <span>
                          {order.items.length} item{order.items.length !== 1 ? 's' : ''} • 
                          {order.items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)} total quantity
                        </span>
                      )}
                      {order.revisionCount > 0 && (
                        <span className="ml-2 text-blue-600 font-medium">
                          • Revision #{order.revisionCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/orders/${order.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        View Details
                      </Link>
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => restoreToCartMutation.mutate(order.id)}
                      disabled={restoreToCartMutation.isPending}
                      data-testid={`button-revise-order-${order.id}`}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      {restoreToCartMutation.isPending ? 'Loading...' : 'Revise Order'}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a 
                        href={`/orders/${order.id}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center"
                      >
                        <ExternalLink className="h-4 w-4 mr-1" />
                        Open in New Tab
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <p className="text-sm text-gray-500">
            Showing {filteredOrders.length} of {orders.length} total orders
          </p>
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}