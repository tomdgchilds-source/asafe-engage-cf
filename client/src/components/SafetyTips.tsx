import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  AlertCircle, 
  Info, 
  Shield, 
  AlertTriangle,
  CheckCircle,
  X,
  ThumbsUp,
  ThumbsDown,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface SafetyTip {
  id: string;
  title: string;
  content: string;
  category: string;
  priority: string;
  icon?: string;
  compliance?: any;
}

interface SafetyTipsProps {
  zone?: string;
  productId?: string;
  triggerType?: string;
  category?: string;
}

export function SafetyTips({ zone, productId, triggerType, category }: SafetyTipsProps) {
  const [dismissedTips, setDismissedTips] = useState<string[]>(() => {
    const stored = localStorage.getItem('dismissedSafetyTips');
    return stored ? JSON.parse(stored) : [];
  });
  const [expandedTip, setExpandedTip] = useState<string | null>(null);
  const { toast } = useToast();

  // Fetch safety tips
  const { data: tipsData, isLoading } = useQuery<SafetyTip[]>({
    queryKey: ['/api/safety-tips', { zone, productId, triggerType, category }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (zone) params.append('zone', zone);
      if (productId) params.append('productId', productId);
      if (triggerType) params.append('triggerType', triggerType);
      if (category) params.append('category', category);
      
      const response = await apiRequest(`/api/safety-tips?${params.toString()}`, 'GET');
      // Ensure we always return an array
      return Array.isArray(response) ? response : [];
    },
  });
  
  // Ensure tips is always an array
  const tips = Array.isArray(tipsData) ? tipsData : [];

  // Feedback mutation
  const feedbackMutation = useMutation({
    mutationFn: async ({ tipId, helpful }: { tipId: string; helpful: boolean }) => {
      return apiRequest(`/api/safety-tips/${tipId}/feedback`, 'POST', { helpful });
    },
    onSuccess: (_, { helpful }) => {
      toast({
        title: helpful ? 'Thanks for your feedback!' : 'Feedback recorded',
        description: helpful 
          ? 'We\'re glad this tip was helpful.' 
          : 'We\'ll work on improving our safety guidance.',
      });
    },
  });

  const handleDismiss = (tipId: string) => {
    const newDismissed = [...dismissedTips, tipId];
    setDismissedTips(newDismissed);
    localStorage.setItem('dismissedSafetyTips', JSON.stringify(newDismissed));
  };

  const getIcon = (iconName?: string, priority?: string) => {
    switch (iconName || priority) {
      case 'Shield':
      case 'compliance':
        return <Shield className="h-5 w-5" />;
      case 'AlertCircle':
      case 'critical':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'AlertTriangle':
      case 'high':
        return <AlertTriangle className="h-5 w-5 text-orange-500" />;
      case 'Info':
      case 'medium':
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'destructive';
      case 'high':
        return 'warning';
      case 'medium':
        return 'default';
      case 'low':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const visibleTips = tips.filter(tip => !dismissedTips.includes(tip.id));

  if (isLoading || visibleTips.length === 0) {
    return null;
  }

  // Show only the highest priority tip initially
  const topTip = visibleTips[0];
  const hasMoreTips = visibleTips.length > 1;

  return (
    <div className="space-y-3">
      {/* Main tip notification */}
      <Card className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            {getIcon(topTip.icon, topTip.priority)}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-semibold text-sm">{topTip.title}</h4>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={getPriorityColor(topTip.priority)} className="text-xs">
                      {topTip.priority}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {topTip.category}
                    </Badge>
                    {topTip.compliance && (
                      <Badge variant="secondary" className="text-xs">
                        PAS 13:2017
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDismiss(topTip.id)}
                  className="h-6 w-6 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                {expandedTip === topTip.id || !hasMoreTips 
                  ? topTip.content 
                  : topTip.content.slice(0, 150) + '...'}
              </p>

              <div className="flex items-center gap-2">
                {hasMoreTips && expandedTip !== topTip.id && (
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => setExpandedTip(topTip.id)}
                    className="h-auto p-0 text-xs"
                  >
                    Read more
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Button>
                )}
                
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-xs text-gray-500 mr-2">Was this helpful?</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => feedbackMutation.mutate({ tipId: topTip.id, helpful: true })}
                    className="h-7 px-2"
                  >
                    <ThumbsUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => feedbackMutation.mutate({ tipId: topTip.id, helpful: false })}
                    className="h-7 px-2"
                  >
                    <ThumbsDown className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Additional tips (collapsed by default) */}
      {hasMoreTips && expandedTip === topTip.id && (
        <div className="space-y-2">
          {visibleTips.slice(1).map((tip) => (
            <Card key={tip.id} className="border-gray-200 dark:border-gray-700">
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  {getIcon(tip.icon, tip.priority)}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="font-medium text-xs">{tip.title}</h5>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          {tip.content}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDismiss(tip.id)}
                        className="h-5 w-5 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}