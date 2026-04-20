import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ShoppingCart, 
  Calculator,
  Package,
  FileText,
  Briefcase,
  Activity,
  Lightbulb,
  ClipboardList,
  ChartBar,
  BookOpen,
  ArrowLeft,
  Clock,
  TrendingUp,
  FileCheck,
  Users,
  Target,
  Shield,
  Building,
  Factory,
  Compass,
  Video,
  Download,
  CheckCircle,
  BarChart3,
  PenTool
} from "lucide-react";
import { Link, useLocation } from "wouter";

import { Cart } from "@/components/Cart";
import { DraftProjects } from "@/components/DraftProjects";
import { EnhancedQuoteRequestModal } from "@/components/EnhancedQuoteRequestModal";
import { QuoteListModal } from "@/components/QuoteListModal";
import { OrderListModal } from "@/components/OrderListModal";
import { AIChat } from "@/components/AIChat";
import { cn } from "@/lib/utils";
import { useHapticFeedback } from "@/hooks/useHapticFeedback";
import type { Order, QuoteRequest } from "@shared/schema";

interface DashboardCard {
  id: string;
  title: string;
  icon: React.ElementType;
  count?: number;
  badge?: string;
  color: string;
  description?: string;
}

export default function Dashboard() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [quoteModalOpen, setQuoteModalOpen] = useState(false);
  const [quoteListModalOpen, setQuoteListModalOpen] = useState(false);
  const [orderListModalOpen, setOrderListModalOpen] = useState(false);
  const [, setLocation] = useLocation();

  // Simple currency formatter
  const formatCurrencyValue = (amount: number, currency: string = 'AED') => {
    return `${amount.toLocaleString()} ${currency}`;
  };

  // Redirect to login if not authenticated (only after auth check completes)
  useEffect(() => {
    if (isLoading) return; // Wait for auth check to finish
    if (!isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        setLocation("/");
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast, setLocation]);

  const { data: orders, isLoading: ordersLoading } = useQuery({
    queryKey: ["/api/orders"],
    retry: false,
    enabled: isAuthenticated,
  });

  const { data: calculations, isLoading: calculationsLoading } = useQuery({
    queryKey: ["/api/calculations"],
    retry: false,
    enabled: isAuthenticated,
  });

  const { data: resources } = useQuery({
    queryKey: ["/api/resources"],
    retry: false,
    staleTime: Infinity,
    enabled: isAuthenticated,
  });

  const { data: quoteRequests } = useQuery({
    queryKey: ["/api/quote-requests"],
    retry: false,
    enabled: isAuthenticated,
  });

  const { data: cartData } = useQuery({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
  });

  const { data: layoutDrawings } = useQuery({
    queryKey: ["/api/layout-drawings"],
    enabled: isAuthenticated,
  });

  const { data: draftProjects } = useQuery({
    queryKey: ["/api/draft-projects"],
    enabled: isAuthenticated,
  });

  // Fetch products for popular products section
  const { data: products } = useQuery({
    queryKey: ["/api/products"],
    retry: false,
    staleTime: Infinity,
    enabled: isAuthenticated,
  });

  // Fetch user activity for recent activity tracking
  const { data: userActivity } = useQuery({
    queryKey: ["/api/activity/recent"],
    queryFn: async () => {
      const response = await fetch("/api/activity/recent?limit=5", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch activity");
      return response.json();
    },
    retry: false,
    enabled: isAuthenticated,
  });

  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics/quotes"],
    enabled: isAuthenticated,
  });

  // 401 errors are now handled globally by queryClient's cache subscriber

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect via useEffect
  }

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

  // Calculate counts for dashboard cards
  const draftProjectsCount = Array.isArray(draftProjects) ? draftProjects.length : 0;
  const cartItemCount = Array.isArray(cartData) ? cartData.length : 0;
  const ordersCount = Array.isArray(orders) ? orders.length : 0;
  const calculationsCount = Array.isArray(calculations) ? calculations.length : 0;
  const quotesCount = Array.isArray(quoteRequests) ? quoteRequests.length : 0;
  const resourcesCount = Array.isArray(resources) ? resources.length : 0;

  const activeOrders = Array.isArray(orders) ? orders.filter((order: Order) => 
    ['pending', 'processing', 'shipped'].includes(order.status)
  ) : [];

  // Define dashboard cards with A-SAFE brand colors - Natural workflow order
  const primaryCards: DashboardCard[] = [
    {
      id: 'start-new-project',
      title: 'Start New Project',
      icon: Target,
      count: 5,
      color: 'bg-white dark:bg-gray-800',
      description: 'Choose how to begin your project'
    },
    {
      id: 'draft-projects',
      title: 'Draft Projects',
      icon: Briefcase,
      count: draftProjectsCount,
      color: 'bg-white dark:bg-gray-800',
      description: 'Saved project layouts and configurations'
    },
    {
      id: 'project-cart',
      title: 'Project Cart',
      icon: ShoppingCart,
      count: cartItemCount,
      color: 'bg-white dark:bg-gray-800',
      description: 'Items ready for quote or order'
    },
    {
      id: 'recent-orders',
      title: 'Recent Orders',
      icon: Activity,
      count: ordersCount,
      color: 'bg-white dark:bg-gray-800',
      description: 'Your order history and status'
    }
  ];

  const secondaryCards: DashboardCard[] = [
    {
      id: 'site-surveys',
      title: 'Site Surveys',
      icon: ClipboardList,
      color: 'bg-white dark:bg-gray-800',
      badge: 'Tool',
      description: 'Conduct site assessments'
    },
    {
      id: 'solution-finder',
      title: 'Solution Finder',
      icon: Lightbulb,
      color: 'bg-white dark:bg-gray-800',
      badge: 'Tool',
      description: 'Find the right safety solutions'
    },
    {
      id: 'analytics',
      title: 'Analytics & Reports',
      icon: ChartBar,
      count: quotesCount,
      color: 'bg-white dark:bg-gray-800',
      description: 'View quotes and performance'
    },
    {
      id: 'resources',
      title: 'Resources Library',
      icon: BookOpen,
      count: resourcesCount,
      color: 'bg-white dark:bg-gray-800',
      badge: 'New!',
      description: 'Documentation and guides'
    }
  ];

  const handleCardClick = (cardId: string) => {
    haptic.select();
    if (expandedCard === cardId) {
      setExpandedCard(null);
    } else {
      setExpandedCard(cardId);
    }
  };

  const renderExpandedContent = (cardId: string) => {
    switch (cardId) {
      case 'draft-projects':
        return <DraftProjects />;
      
      case 'project-cart':
        return <Cart />;
      
      case 'recent-orders':
        return (
          <div className="space-y-6">
            {/* Recent Orders */}
            {Array.isArray(orders) && orders.length > 0 ? (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Order History
                  </h3>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setOrderListModalOpen(true)}
                  >
                    View All ({ordersCount})
                  </Button>
                </div>
                <div className="space-y-3">
                  {orders.slice(0, 5).map((order: any) => (
                    <div key={order.id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold">Order #{order.orderNumber}</p>
                          <p className="text-sm text-gray-600">
                            {formatCurrencyValue(parseFloat(order.totalAmount), order.currency)}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(order.orderDate).toLocaleDateString()}
                          </p>
                        </div>
                        <Badge className={getStatusColor(order.status)}>
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders yet</p>
                <p className="text-sm mt-2">Your order history will appear here</p>
              </div>
            )}
          </div>
        );
      
      case 'start-new-project':
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            <Button asChild className="h-20 flex-col bg-[#FFC72C] text-black hover:bg-[#FFB700] font-semibold">
              <Link href="/site-survey">
                <ClipboardList className="h-6 w-6 mb-2" />
                <span className="text-sm">Site Survey</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-20 flex-col hover:border-[#FFC72C] hover:bg-[#FFC72C]/10">
              <Link href="/calculator">
                <Calculator className="h-6 w-6 mb-2" />
                <span className="text-sm">Impact Calculator</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-20 flex-col hover:border-[#FFC72C] hover:bg-[#FFC72C]/10">
              <Link href="/solution-finder">
                <Lightbulb className="h-6 w-6 mb-2" />
                <span className="text-sm">Solution Finder</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-20 flex-col hover:border-[#FFC72C] hover:bg-[#FFC72C]/10">
              <Link href="/products">
                <Package className="h-6 w-6 mb-2" />
                <span className="text-sm">Browse Products</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-20 flex-col hover:border-[#9b59b6] hover:bg-[#9b59b6]/10 border-[#9b59b6]/30">
              <Link href="/layout-drawings">
                <PenTool className="h-6 w-6 mb-2 text-[#9b59b6]" />
                <span className="text-sm">Layout Drawing</span>
              </Link>
            </Button>
          </div>
        );

      case 'site-surveys':
        setLocation('/site-survey');
        return null;

      case 'solution-finder':
        setLocation('/solution-finder');
        return null;

      case 'analytics':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Quotes & Analytics</h3>
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setQuoteListModalOpen(true)}
                >
                  View All Quotes
                </Button>
                <Button 
                  size="sm"
                  className="bg-[#FFC72C] hover:bg-[#FFB300] text-black"
                  asChild
                >
                  <Link href="/analytics">
                    <BarChart3 className="h-4 w-4 mr-1" />
                    Full Analytics
                  </Link>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold">{quotesCount}</p>
                  <p className="text-sm text-gray-600">Total Quotes</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold">{activeOrders.length}</p>
                  <p className="text-sm text-gray-600">Active Orders</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <p className="text-2xl font-bold">{calculationsCount}</p>
                  <p className="text-sm text-gray-600">Calculations</p>
                </CardContent>
              </Card>
            </div>
          </div>
        );

      case 'resources':
        setLocation('/resources');
        return null;

      default:
        return null;
    }
  };

  // Greeting based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-4 sm:py-6">
      <div className="w-full px-3 sm:px-6 max-w-7xl mx-auto">
        {/* Welcome Section with Quick Stats */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-2" data-testid="welcome-title">
            {getGreeting()}, {(user as any)?.firstName || 'User'}!
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            {activeOrders.length > 0 && (
              <div className="flex items-center gap-1 text-orange-600 font-medium">
                <TrendingUp className="h-4 w-4" />
                {activeOrders.length} active order{activeOrders.length > 1 ? 's' : ''}
              </div>
            )}
          </div>
        </div>


        <AnimatePresence mode="wait">
          {expandedCard ? (
            // Expanded View
            <motion.div
              key="expanded"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="mb-6">
                <CardHeader className="border-b">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      {(() => {
                        const card = [...primaryCards, ...secondaryCards].find(c => c.id === expandedCard);
                        const Icon = card?.icon || Package;
                        return (
                          <>
                            <Icon className="h-5 w-5" />
                            {card?.title}
                          </>
                        );
                      })()}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpandedCard(null)}
                      className="flex items-center gap-2"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Dashboard
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="pt-6">
                  {renderExpandedContent(expandedCard)}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            // Grid View
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Primary Actions */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Primary Actions
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {primaryCards.map((card) => (
                    <motion.div
                      key={card.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Card
                        className={cn(
                          "cursor-pointer transition-all duration-200 border-2 border-gray-200 dark:border-gray-700",
                          "hover:border-[#FFC72C] hover:shadow-lg hover:shadow-[#FFC72C]/20",
                          "min-h-[160px] sm:min-h-[250px] flex flex-col",
                          card.color
                        )}
                        onClick={() => handleCardClick(card.id)}
                        data-testid={`card-${card.id}`}
                      >
                        <CardContent className="p-4 sm:p-6 flex-1 flex items-center justify-center">
                          <div className="flex flex-col items-center text-center space-y-3 w-full">
                            <card.icon className="h-8 w-8 sm:h-10 sm:w-10 text-black dark:text-white" />
                            <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                              {card.title}
                            </h3>
                            {card.count !== undefined && (
                              <div className="text-2xl sm:text-3xl font-bold bg-[#FFC72C] dark:bg-[#FFC72C] text-black dark:text-black rounded-full w-16 h-16 flex items-center justify-center mx-auto">
                                {card.count}
                              </div>
                            )}
                            {card.badge && (
                              <Badge className="bg-[#FFC72C] dark:bg-[#FFC72C] text-black dark:text-black border-0 font-semibold">
                                {card.badge}
                              </Badge>
                            )}
                            <p className="text-xs text-gray-600 dark:text-gray-400 hidden sm:block mt-auto">
                              {card.description}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>


              {/* Sales Activity Overview */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Sales Activity
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  {/* Recent Quote Requests */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-[#FFC72C]" />
                          Recent Quote Requests
                        </span>
                        {Array.isArray(quoteRequests) && quoteRequests.length > 0 && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => setQuoteListModalOpen(true)}
                          >
                            View All
                          </Button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Array.isArray(quoteRequests) && quoteRequests.length > 0 ? (
                        quoteRequests.slice(0, 3).map((quote: any) => (
                          <div key={quote.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{quote.company || 'Customer'}</p>
                              <p className="text-xs text-gray-500">
                                {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : 'N/A'} • {quote.status}
                              </p>
                            </div>
                            <Badge className="bg-[#FFC72C]/20 text-[#FFC72C] dark:bg-[#FFC72C]/20 dark:text-[#FFC72C]">
                              {quote.productNames?.length || 0} products
                            </Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">No recent quote requests</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Recent Impact Calculations */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <Calculator className="h-5 w-5 text-[#FFC72C]" />
                          Recent Calculations
                        </span>
                        {Array.isArray(calculations) && calculations.length > 0 && (
                          <Button 
                            size="sm" 
                            variant="ghost"
                            asChild
                          >
                            <Link href="/calculator">View All</Link>
                          </Button>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Array.isArray(calculations) && calculations.length > 0 ? (
                        calculations.slice(0, 3).map((calc: any) => (
                          <div key={calc.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{calc.vehicleName || 'Vehicle Impact'}</p>
                              <p className="text-xs text-gray-500">
                                {calc.impactEnergy} Joules • {calc.speed} km/h
                              </p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {new Date(calc.createdAt).toLocaleDateString()}
                            </Badge>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">No recent calculations</p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Popular Products & Quick Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Popular Products */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between text-base">
                        <span className="flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-[#FFC72C]" />
                          Popular Products
                        </span>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          asChild
                        >
                          <Link href="/products">Browse All</Link>
                        </Button>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {Array.isArray(products) && products.length > 0 ? (
                        products.slice(0, 3).map((product: any) => (
                          <div key={product.id} className="flex items-center justify-between py-2 border-b last:border-0">
                            <div className="flex-1">
                              <p className="font-medium text-sm">{product.name}</p>
                              <p className="text-xs text-gray-500">
                                {product.impactRating} Joules • {product.category}
                              </p>
                            </div>
                            <Link href={`/products`}>
                              <Button size="sm" variant="ghost">
                                View
                              </Button>
                            </Link>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-gray-500 text-center py-4">Loading products...</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Quick Actions */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Target className="h-5 w-5 text-[#FFC72C]" />
                        Quick Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      <Button 
                        className="w-full justify-start bg-[#FFC72C] hover:bg-[#FFB700] text-black"
                        asChild
                      >
                        <Link href="/calculator">
                          <Calculator className="h-4 w-4 mr-2" />
                          New Impact Calculation
                        </Link>
                      </Button>
                      <Button 
                        className="w-full justify-start"
                        variant="outline"
                        onClick={() => setQuoteModalOpen(true)}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Create Quote Request
                      </Button>
                      <Button 
                        className="w-full justify-start"
                        variant="outline"
                        asChild
                      >
                        <Link href="/site-survey">
                          <ClipboardList className="h-4 w-4 mr-2" />
                          Start Site Survey
                        </Link>
                      </Button>
                      <Button 
                        className="w-full justify-start"
                        variant="outline"
                        asChild
                      >
                        <Link href="/resources">
                          <Download className="h-4 w-4 mr-2" />
                          Download Resources
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Secondary Tools */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-3">
                  Tools & Resources
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {secondaryCards.map((card) => (
                    <motion.div
                      key={card.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <Card
                        className={cn(
                          "cursor-pointer transition-all duration-200 border-2 border-gray-200 dark:border-gray-700",
                          "hover:border-[#FFC72C] hover:shadow-lg hover:shadow-[#FFC72C]/20",
                          "min-h-[160px] sm:min-h-[250px] flex flex-col",
                          card.color
                        )}
                        onClick={() => handleCardClick(card.id)}
                        data-testid={`card-${card.id}`}
                      >
                        <CardContent className="p-4 sm:p-6 flex-1 flex items-center justify-center">
                          <div className="flex flex-col items-center text-center space-y-3 w-full">
                            <card.icon className="h-8 w-8 sm:h-10 sm:w-10 text-black dark:text-white" />
                            <h3 className="font-semibold text-sm sm:text-base text-gray-900 dark:text-white">
                              {card.title}
                            </h3>
                            {card.count !== undefined && (
                              <div className="text-2xl sm:text-3xl font-bold bg-[#FFC72C] dark:bg-[#FFC72C] text-black dark:text-black rounded-full w-16 h-16 flex items-center justify-center mx-auto">
                                {card.count}
                              </div>
                            )}
                            {card.badge && (
                              <Badge className="bg-[#FFC72C] dark:bg-[#FFC72C] text-black dark:text-black border-0 font-semibold">
                                {card.badge}
                              </Badge>
                            )}
                            <p className="text-xs text-gray-600 dark:text-gray-400 hidden sm:block mt-auto">
                              {card.description}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Chat Assistant - Always visible but minimized */}
        <AIChat />
      </div>
      
      {/* Modals */}
      <EnhancedQuoteRequestModal
        isOpen={quoteModalOpen}
        onClose={() => setQuoteModalOpen(false)}
        user={user as any}
      />
      
      <QuoteListModal
        isOpen={quoteListModalOpen}
        onClose={() => setQuoteListModalOpen(false)}
      />

      <OrderListModal
        isOpen={orderListModalOpen}
        onClose={() => setOrderListModalOpen(false)}
      />
    </div>
  );
}