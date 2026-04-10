import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { 
  Clock, 
  Package, 
  FileText, 
  Calculator, 
  BookOpen, 
  ShoppingCart,
  Search,
  Filter,
  Eye,
  ArrowRight,
  Calendar,
  TrendingUp
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isYesterday, isThisWeek } from "date-fns";
import { activityService } from "@/services/activityService";
import type { UserActivity } from "@shared/schema";

interface GroupedActivities {
  today: UserActivity[];
  yesterday: UserActivity[];
  thisWeek: UserActivity[];
  older: UserActivity[];
}

export function RecentActivity() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");

  const { data: activities = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/activity/recent'],
    queryFn: () => activityService.getRecentActivity(100),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Group activities by time period
  const groupActivities = (activities: UserActivity[]): GroupedActivities => {
    const grouped: GroupedActivities = {
      today: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };

    activities.forEach(activity => {
      const date = new Date(activity.lastViewedAt);
      if (isToday(date)) {
        grouped.today.push(activity);
      } else if (isYesterday(date)) {
        grouped.yesterday.push(activity);
      } else if (isThisWeek(date, { weekStartsOn: 1 })) {
        grouped.thisWeek.push(activity);
      } else {
        grouped.older.push(activity);
      }
    });

    return grouped;
  };

  // Filter activities
  const filteredActivities = activities.filter((activity: UserActivity) => {
    const matchesSearch = activity.itemTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          activity.itemCategory?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "all" || activity.itemType === selectedType;
    return matchesSearch && matchesType;
  });

  const groupedActivities = groupActivities(filteredActivities);

  // Get icon for item type
  const getItemIcon = (type: string) => {
    switch (type) {
      case 'product': return Package;
      case 'resource': return FileText;
      case 'case_study': return BookOpen;
      case 'calculator': return Calculator;
      case 'order': return ShoppingCart;
      default: return Eye;
    }
  };

  // Get color for item type
  const getItemColor = (type: string) => {
    switch (type) {
      case 'product': return 'text-blue-600 dark:text-blue-400';
      case 'resource': return 'text-green-600 dark:text-green-400';
      case 'case_study': return 'text-purple-600 dark:text-purple-400';
      case 'calculator': return 'text-orange-600 dark:text-orange-400';
      case 'order': return 'text-red-600 dark:text-red-400';
      default: return 'text-gray-600 dark:text-gray-400';
    }
  };

  // Get link for item
  const getItemLink = (activity: UserActivity) => {
    switch (activity.itemType) {
      case 'product': return `/products/${activity.itemId}`;
      case 'resource': return `/resources#${activity.itemId}`;
      case 'case_study': return `/case-studies#${activity.itemId}`;
      case 'calculator': return `/calculator`;
      case 'order': return `/orders/${activity.itemId}`;
      default: return '#';
    }
  };

  // Format timestamp
  const formatTimestamp = (date: string | Date) => {
    const d = new Date(date);
    if (isToday(d)) {
      return `Today at ${format(d, 'h:mm a')}`;
    } else if (isYesterday(d)) {
      return `Yesterday at ${format(d, 'h:mm a')}`;
    } else if (isThisWeek(d, { weekStartsOn: 1 })) {
      return format(d, 'EEEE \'at\' h:mm a');
    } else {
      return format(d, 'MMM d, yyyy \'at\' h:mm a');
    }
  };

  // Render activity item
  const ActivityItem = ({ activity }: { activity: UserActivity }) => {
    const Icon = getItemIcon(activity.itemType);
    const colorClass = getItemColor(activity.itemType);
    const link = getItemLink(activity);

    return (
      <Link href={link}>
        <div className="group flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
          <div className={`mt-1 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 ${colorClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {activity.itemTitle}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {activity.itemCategory && (
                    <Badge variant="secondary" className="text-xs">
                      {activity.itemCategory}
                    </Badge>
                  )}
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDistanceToNow(new Date(activity.lastViewedAt), { addSuffix: true })}
                  </span>
                  {activity.viewCount > 1 && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      • Viewed {activity.viewCount} times
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        </div>
      </Link>
    );
  };

  // Render activity group
  const ActivityGroup = ({ title, activities, icon }: { title: string; activities: UserActivity[]; icon: React.ReactNode }) => {
    if (activities.length === 0) return null;

    return (
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3 px-3">
          {icon}
          <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
            {title}
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            ({activities.length})
          </span>
        </div>
        <div className="space-y-1">
          {activities.map((activity) => (
            <ActivityItem key={`${activity.itemType}-${activity.itemId}-${activity.lastViewedAt}`} activity={activity} />
          ))}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        </div>
        
        {/* Search and Filter */}
        <div className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search activity..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <Tabs value={selectedType} onValueChange={setSelectedType}>
            <TabsList className="grid grid-cols-6 w-full">
              <TabsTrigger value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger value="product" className="text-xs">Products</TabsTrigger>
              <TabsTrigger value="resource" className="text-xs">Resources</TabsTrigger>
              <TabsTrigger value="case_study" className="text-xs">Cases</TabsTrigger>
              <TabsTrigger value="calculator" className="text-xs">Calc</TabsTrigger>
              <TabsTrigger value="order" className="text-xs">Orders</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <ScrollArea className="h-[500px]">
          <div className="p-4">
            {filteredActivities.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {searchTerm || selectedType !== 'all' 
                    ? 'No matching activities found' 
                    : 'No recent activity to display'}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                  Your viewed items will appear here
                </p>
              </div>
            ) : (
              <>
                <ActivityGroup 
                  title="Today" 
                  activities={groupedActivities.today}
                  icon={<Calendar className="h-4 w-4 text-gray-500" />}
                />
                <ActivityGroup 
                  title="Yesterday" 
                  activities={groupedActivities.yesterday}
                  icon={<Clock className="h-4 w-4 text-gray-500" />}
                />
                <ActivityGroup 
                  title="This Week" 
                  activities={groupedActivities.thisWeek}
                  icon={<TrendingUp className="h-4 w-4 text-gray-500" />}
                />
                <ActivityGroup 
                  title="Older" 
                  activities={groupedActivities.older}
                  icon={<Clock className="h-4 w-4 text-gray-500" />}
                />
              </>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}