import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  TrendingUp, 
  DollarSign, 
  FileText, 
  Clock, 
  Target,
  Calendar,
  ArrowUp,
  ArrowDown,
  Users,
  AlertCircle,
  ChevronRight,
  BarChart3,
  PieChart,
  Activity,
  Bell,
  BellOff
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useCurrency } from "@/contexts/CurrencyContext";

interface QuoteAnalytics {
  totalQuotes: number;
  totalValue: number;
  averageValue: number;
  conversionRate: number;
  timelineData: Array<{
    id: string;
    date: string;
    status: string;
    amount: number;
    customerCompany: string;
    lastUpdated: string;
  }>;
  monthlyData: Array<{
    month: string;
    count: number;
    value: number;
  }>;
  recentQuotes: Array<{
    id: string;
    date: string;
    status: string;
    amount: number;
    customerCompany: string;
  }>;
}

interface QuoteReminder {
  quoteId: string;
  customerCompany: string;
  daysSinceCreation: number;
  stage: string;
  nextAction: string;
  urgency: 'low' | 'medium' | 'high';
  amount: string;
  lastContact: string;
}

export default function AnalyticsDashboard() {
  const { toast } = useToast();
  const { currency, convertPrice, formatPrice } = useCurrency();
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderFrequency, setReminderFrequency] = useState('daily');

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<QuoteAnalytics>({
    queryKey: ['/api/analytics/quotes'],
  });

  // Fetch reminder settings
  const { data: reminderSettings } = useQuery({
    queryKey: ['/api/reminders/settings'],
  });

  // Fetch quote reminders
  const { data: reminders } = useQuery<QuoteReminder[]>({
    queryKey: ['/api/reminders/quotes'],
    enabled: remindersEnabled,
  });

  useEffect(() => {
    if (reminderSettings) {
      setRemindersEnabled(reminderSettings.enabled);
      setReminderFrequency(reminderSettings.frequency);
    }
  }, [reminderSettings]);

  const handleReminderToggle = async (enabled: boolean) => {
    try {
      await apiRequest('/api/reminders/settings', {
        method: 'POST',
        body: JSON.stringify({ enabled, frequency: reminderFrequency }),
      });
      setRemindersEnabled(enabled);
      toast({
        title: enabled ? "Reminders Enabled" : "Reminders Disabled",
        description: enabled ? "You'll receive quote follow-up reminders" : "Quote reminders have been turned off",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update reminder settings",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'sent': return 'bg-blue-100 text-blue-800';
      case 'revised': return 'bg-purple-100 text-purple-800';
      case 'accepted': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'text-red-600';
      case 'medium': return 'text-yellow-600';
      case 'low': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const calculateTrend = (current: number, previous: number) => {
    if (previous === 0) return 0;
    return ((current - previous) / previous) * 100;
  };

  if (analyticsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#FFC72C] mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const currentMonthData = analytics?.monthlyData?.[analytics.monthlyData.length - 1];
  const previousMonthData = analytics?.monthlyData?.[analytics.monthlyData.length - 2];
  const quoteTrend = currentMonthData && previousMonthData 
    ? calculateTrend(currentMonthData.count, previousMonthData.count)
    : 0;
  const valueTrend = currentMonthData && previousMonthData
    ? calculateTrend(currentMonthData.value, previousMonthData.value)
    : 0;

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Quote Analytics</h1>
        <p className="text-muted-foreground">
          Track your quote performance, conversion rates, and follow-up reminders
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <FileText className="h-5 w-5 text-muted-foreground" />
              {quoteTrend !== 0 && (
                <div className={`flex items-center text-sm ${quoteTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {quoteTrend > 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {Math.abs(quoteTrend).toFixed(1)}%
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.totalQuotes || 0}</div>
            <p className="text-sm text-muted-foreground">Total Quotes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              {valueTrend !== 0 && (
                <div className={`flex items-center text-sm ${valueTrend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {valueTrend > 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {Math.abs(valueTrend).toFixed(1)}%
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(convertPrice(analytics?.totalValue || 0))}
            </div>
            <p className="text-sm text-muted-foreground">Total Value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <TrendingUp className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatPrice(convertPrice(analytics?.averageValue || 0))}
            </div>
            <p className="text-sm text-muted-foreground">Average Quote</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <Target className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics?.conversionRate?.toFixed(1) || 0}%</div>
            <p className="text-sm text-muted-foreground">Conversion Rate</p>
            <Progress value={analytics?.conversionRate || 0} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="timeline" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quote Timeline</CardTitle>
              <CardDescription>
                Track the status and history of your quotes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics?.timelineData?.map((quote) => (
                  <div key={quote.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{quote.customerCompany}</span>
                        <Badge className={getStatusColor(quote.status)}>
                          {quote.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(quote.date), 'MMM dd, yyyy')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Updated {format(new Date(quote.lastUpdated), 'MMM dd')}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {formatPrice(convertPrice(quote.amount))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Trends</CardTitle>
              <CardDescription>
                Quote volume and value over the last 6 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {analytics?.monthlyData?.map((month) => (
                  <div key={month.month} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {format(new Date(month.month + '-01'), 'MMMM yyyy')}
                      </span>
                      <div className="flex items-center gap-4 text-sm">
                        <span>{month.count} quotes</span>
                        <span className="font-semibold">
                          {formatPrice(convertPrice(month.value))}
                        </span>
                      </div>
                    </div>
                    <Progress 
                      value={(month.value / Math.max(...(analytics?.monthlyData?.map(m => m.value) || [1]))) * 100} 
                      className="h-2"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reminders" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Follow-up Reminders</CardTitle>
              <CardDescription>
                Quotes requiring follow-up based on your sales workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!remindersEnabled ? (
                <div className="text-center py-8">
                  <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground mb-4">Reminders are currently disabled</p>
                  <Button onClick={() => handleReminderToggle(true)}>
                    Enable Reminders
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {reminders?.map((reminder) => (
                    <div key={reminder.quoteId} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{reminder.customerCompany}</span>
                            <Badge variant="outline">{reminder.stage}</Badge>
                            <AlertCircle className={`h-4 w-4 ${getUrgencyColor(reminder.urgency)}`} />
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {reminder.daysSinceCreation} days since creation
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">
                            {formatPrice(convertPrice(parseFloat(reminder.amount)))}
                          </div>
                        </div>
                      </div>
                      <div className="bg-muted/50 rounded p-3">
                        <p className="text-sm font-medium mb-1">Recommended Action:</p>
                        <p className="text-sm text-muted-foreground">{reminder.nextAction}</p>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <Button size="sm" className="bg-[#FFC72C] hover:bg-[#FFB300] text-black">
                          Send Message
                        </Button>
                        <Button size="sm" variant="outline">
                          View Quote
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Reminder Settings</CardTitle>
              <CardDescription>
                Configure how you receive quote follow-up reminders
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="reminders-enabled">Enable Reminders</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications for quote follow-ups
                  </p>
                </div>
                <Switch
                  id="reminders-enabled"
                  checked={remindersEnabled}
                  onCheckedChange={handleReminderToggle}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Reminder Frequency</Label>
                <div className="grid grid-cols-3 gap-2">
                  {['daily', 'weekly', 'biweekly'].map((freq) => (
                    <Button
                      key={freq}
                      variant={reminderFrequency === freq ? 'default' : 'outline'}
                      onClick={() => setReminderFrequency(freq)}
                      className={reminderFrequency === freq ? 'bg-[#FFC72C] hover:bg-[#FFB300] text-black' : ''}
                    >
                      {freq.charAt(0).toUpperCase() + freq.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Sales Workflow Timeline</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Day 1-2: Initial Contact</span>
                    <Badge variant="outline">Discovery Call</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 3-5: Discovery</span>
                    <Badge variant="outline">Value Proposition</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 6-10: Proposal</span>
                    <Badge variant="outline">Detailed Quote</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 11-15: Negotiation</span>
                    <Badge variant="outline">Special Pricing</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span>Day 16+: Follow-up</span>
                    <Badge variant="outline">Check-in</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}