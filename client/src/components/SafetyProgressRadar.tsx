import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  Shield, 
  TrendingUp, 
  AlertCircle,
  Target,
  Package,
  Users,
  Truck,
  Settings,
  DoorOpen,
  Layers,
  CheckCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useLocation } from 'wouter';

interface SafetyProgress {
  loadingBaysCoverage: number;
  pedestrianZonesCoverage: number;
  machineryProtectionCoverage: number;
  rackingProtectionCoverage: number;
  columnProtectionCoverage: number;
  vehicleSegregationCoverage: number;
  doorwayProtectionCoverage: number;
  mezzanineProtectionCoverage: number;
  pas13Compliance: boolean;
  totalInvestment: string;
  facilityName?: string;
}

interface SafetyProgressData {
  progress: SafetyProgress;
  recommendations: any[];
  overallScore: number;
}

export function SafetyProgressRadar() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Fetch safety progress
  const { data, isLoading } = useQuery<SafetyProgressData>({
    queryKey: ['/api/safety-progress'],
  });

  // Update progress mutation
  const updateMutation = useMutation({
    mutationFn: async (updates: Partial<SafetyProgress>) => {
      return apiRequest('/api/safety-progress/update', 'POST', updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/safety-progress'] });
      toast({
        title: 'Progress Updated',
        description: 'Your safety progress has been updated successfully.',
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { progress, recommendations, overallScore } = data;

  // Prepare data for radar chart
  const radarData = [
    { zone: 'Loading Bays', coverage: progress.loadingBaysCoverage, fullMark: 100 },
    { zone: 'Pedestrian', coverage: progress.pedestrianZonesCoverage, fullMark: 100 },
    { zone: 'Machinery', coverage: progress.machineryProtectionCoverage, fullMark: 100 },
    { zone: 'Racking', coverage: progress.rackingProtectionCoverage, fullMark: 100 },
    { zone: 'Columns', coverage: progress.columnProtectionCoverage, fullMark: 100 },
    { zone: 'Segregation', coverage: progress.vehicleSegregationCoverage, fullMark: 100 },
    { zone: 'Doorways', coverage: progress.doorwayProtectionCoverage, fullMark: 100 },
    { zone: 'Mezzanines', coverage: progress.mezzanineProtectionCoverage, fullMark: 100 },
  ];

  const getZoneIcon = (zone: string) => {
    switch (zone) {
      case 'Loading Bays': return <Truck className="h-4 w-4" />;
      case 'Pedestrian Zones': return <Users className="h-4 w-4" />;
      case 'Machinery Protection': return <Settings className="h-4 w-4" />;
      case 'Racking Protection': return <Package className="h-4 w-4" />;
      case 'Column Protection': return <Layers className="h-4 w-4" />;
      case 'Vehicle Segregation': return <Shield className="h-4 w-4" />;
      case 'Doorway Protection': return <DoorOpen className="h-4 w-4" />;
      case 'Mezzanine Protection': return <Target className="h-4 w-4" />;
      default: return <Shield className="h-4 w-4" />;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    if (score >= 40) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getCoverageColor = (coverage: number) => {
    if (coverage >= 80) return 'bg-green-500';
    if (coverage >= 60) return 'bg-yellow-500';
    if (coverage >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Overall Score Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Safety Progress Overview
            </span>
            <div className="flex items-center gap-4">
              {progress.pas13Compliance && (
                <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  PAS 13:2017 Compliant
                </Badge>
              )}
              <Badge variant="outline">
                {progress.facilityName || 'Main Facility'}
              </Badge>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Radar Chart */}
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#e5e7eb" />
                  <PolarAngleAxis 
                    dataKey="zone" 
                    className="text-xs"
                    tick={{ fill: '#6b7280' }}
                  />
                  <PolarRadiusAxis 
                    angle={90} 
                    domain={[0, 100]} 
                    tickCount={5}
                    tick={{ fill: '#6b7280' }}
                  />
                  <Radar
                    name="Coverage"
                    dataKey="coverage"
                    stroke="#fbbf24"
                    fill="#fbbf24"
                    fillOpacity={0.6}
                  />
                  <Tooltip />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            {/* Score and Stats */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Overall Safety Score</span>
                  <span className={`text-3xl font-bold ${getScoreColor(overallScore)}`}>
                    {overallScore}%
                  </span>
                </div>
                <Progress value={overallScore} className="h-3" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Total Investment</p>
                  <p className="text-lg font-semibold">
                    AED {parseFloat(progress.totalInvestment).toLocaleString()}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Zones Protected</p>
                  <p className="text-lg font-semibold">
                    {radarData.filter(z => z.coverage >= 50).length} / 8
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  Focus on improving coverage in low-protection zones to enhance overall facility safety.
                </p>
                <Button 
                  onClick={() => setLocation('/impact-calculator')}
                  className="w-full"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Calculate Protection Needs
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zone Coverage Details */}
      <Card>
        <CardHeader>
          <CardTitle>Zone Coverage Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { name: 'Loading Bays', value: progress.loadingBaysCoverage },
              { name: 'Pedestrian Zones', value: progress.pedestrianZonesCoverage },
              { name: 'Machinery Protection', value: progress.machineryProtectionCoverage },
              { name: 'Racking Protection', value: progress.rackingProtectionCoverage },
              { name: 'Column Protection', value: progress.columnProtectionCoverage },
              { name: 'Vehicle Segregation', value: progress.vehicleSegregationCoverage },
              { name: 'Doorway Protection', value: progress.doorwayProtectionCoverage },
              { name: 'Mezzanine Protection', value: progress.mezzanineProtectionCoverage },
            ].map((zone) => (
              <div key={zone.name} className="flex items-center gap-3">
                {getZoneIcon(zone.name)}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{zone.name}</span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {zone.value}%
                    </span>
                  </div>
                  <Progress 
                    value={zone.value} 
                    className={`h-2 ${getCoverageColor(zone.value)}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Improvement Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recommendations.map((rec, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-medium flex items-center gap-2">
                        {getZoneIcon(rec.zone)}
                        {rec.zone}
                      </h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Current: {rec.currentCoverage}% → Target: {rec.targetCoverage}%
                      </p>
                    </div>
                    <Badge variant="outline">
                      <AlertCircle className="h-3 w-3 mr-1" />
                      Priority
                    </Badge>
                  </div>

                  {rec.recommendedProducts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500">Recommended Products:</p>
                      <div className="flex gap-2 flex-wrap">
                        {rec.recommendedProducts.map((product: any) => (
                          <Button
                            key={product.id}
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/products/${product.id}`)}
                            className="text-xs"
                          >
                            {product.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-gray-500">
                      Estimated Investment: AED {rec.estimatedInvestment.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}