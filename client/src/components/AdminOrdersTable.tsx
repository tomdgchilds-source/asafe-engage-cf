import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle, Crown, PenTool, Package, Calendar, Clock, User, Truck, Wrench } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string;
  currency: string;
  orderDate: string;
  userId: string;
  items: any[];
  technicalSignature?: any;
  commercialSignature?: any;
  servicePackage?: any;
  discountOptions?: any[];
}

export default function AdminOrdersTable() {
  const [selectedStatus, setSelectedStatus] = useState("all");
  const { toast } = useToast();

  // Fetch admin orders
  const { data: orders, isLoading } = useQuery({
    queryKey: ["/api/admin/orders", selectedStatus],
    queryFn: async () => {
      const response = await apiRequest(`/api/admin/orders?status=${selectedStatus}`, "GET");
      return response as unknown as Order[];
    },
  });

  // Update order status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: string; status: string }) => {
      return apiRequest(`/api/admin/orders/${orderId}/status`, "PUT", { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/orders"] });
      toast({
        title: "Status Updated",
        description: "Order status has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order status",
        variant: "destructive",
      });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200";
      case "submitted_for_review":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "processing":
        return "bg-purple-100 text-purple-800 border-purple-200";
      case "shipped":
        return "bg-green-100 text-green-800 border-green-200";
      case "delivered":
        return "bg-emerald-100 text-emerald-800 border-emerald-200";
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return "Pending";
      case "submitted_for_review":
        return "Awaiting Review";
      case "processing":
        return "Processing";
      case "shipped":
        return "Shipped";
      case "delivered":
        return "Delivered";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  const statusCounts = (orders as Order[] || []).reduce((acc: any, order: Order) => {
    acc[order.status] = (acc[order.status] || 0) + 1;
    return acc;
  }, {});

  const filteredOrders = (orders as Order[]) || [];

  if (isLoading) {
    return <div>Loading orders...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Status Filter Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={selectedStatus === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedStatus("all")}
          data-testid="filter-all-orders"
        >
          All ({filteredOrders.length})
        </Button>
        <Button
          variant={selectedStatus === "submitted_for_review" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedStatus("submitted_for_review")}
          data-testid="filter-submitted"
        >
          Awaiting Review ({statusCounts["submitted_for_review"] || 0})
        </Button>
        <Button
          variant={selectedStatus === "processing" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedStatus("processing")}
          data-testid="filter-processing"
        >
          Processing ({statusCounts["processing"] || 0})
        </Button>
        <Button
          variant={selectedStatus === "shipped" ? "default" : "outline"}
          size="sm"
          onClick={() => setSelectedStatus("shipped")}
          data-testid="filter-shipped"
        >
          Shipped ({statusCounts["shipped"] || 0})
        </Button>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {selectedStatus === "all" 
            ? "No orders found." 
            : `No ${getStatusLabel(selectedStatus)} orders found.`
          }
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order: Order) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-4 w-4" />
                      Order #{order.orderNumber}
                    </CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(order.orderDate).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(order.orderDate).toLocaleTimeString()}
                      </div>
                      <div className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        ID: {order.userId.slice(-8)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={getStatusColor(order.status)} data-testid={`status-${order.id}`}>
                      {getStatusLabel(order.status)}
                    </Badge>
                    <div className="text-right">
                      <p className="font-semibold text-lg">{order.totalAmount} {order.currency}</p>
                      <p className="text-sm text-muted-foreground">{order.items?.length || 0} items</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Signature Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <PenTool className="h-4 w-4" />
                    <span className="text-sm font-medium">Technical Approval:</span>
                    {order.technicalSignature?.signed ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
                    )}
                    <span className={`text-xs ${order.technicalSignature?.signed ? 'text-green-600' : 'text-gray-500'}`}>
                      {order.technicalSignature?.signed ? 'Signed' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4" />
                    <span className="text-sm font-medium">Commercial Approval:</span>
                    {order.commercialSignature?.signed ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <div className="w-4 h-4 border-2 border-gray-300 rounded-full"></div>
                    )}
                    <span className={`text-xs ${order.commercialSignature?.signed ? 'text-green-600' : 'text-gray-500'}`}>
                      {order.commercialSignature?.signed ? 'Signed' : 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Service Package & Discounts */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {order.servicePackage && (
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-blue-600" />
                      <span>Service: Enhanced Care Package</span>
                    </div>
                  )}
                  {order.discountOptions && order.discountOptions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-green-600" />
                      <span>Discounts: {order.discountOptions.length} applied</span>
                    </div>
                  )}
                </div>

                {/* Status Management */}
                {order.status === "submitted_for_review" && (
                  <div className="flex items-center gap-3 pt-3 border-t">
                    <span className="text-sm font-medium">Update Status:</span>
                    <Select
                      value=""
                      onValueChange={(status) => updateStatusMutation.mutate({ orderId: order.id, status })}
                      disabled={updateStatusMutation.isPending}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Select action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="processing">Start Processing</SelectItem>
                        <SelectItem value="cancelled">Cancel Order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {order.status === "processing" && (
                  <div className="flex items-center gap-3 pt-3 border-t">
                    <span className="text-sm font-medium">Update Status:</span>
                    <Select
                      value=""
                      onValueChange={(status) => updateStatusMutation.mutate({ orderId: order.id, status })}
                      disabled={updateStatusMutation.isPending}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Select action" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="shipped">Mark as Shipped</SelectItem>
                        <SelectItem value="cancelled">Cancel Order</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}