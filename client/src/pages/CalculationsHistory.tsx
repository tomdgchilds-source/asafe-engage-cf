import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Calculator,
  ArrowLeft,
  Search,
  Calendar,
  Zap,
  Target,
  Truck,
  Package,
  Clock,
} from "lucide-react";

interface ImpactCalculation {
  id: string;
  vehicleMass: string;
  loadMass: string;
  speed: string;
  speedUnit: string;
  impactAngle: string;
  kineticEnergy: string;
  recommendedProducts?: string[];
  createdAt: string;
}

export default function CalculationsHistory() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: calculations, isLoading, error } = useQuery({
    queryKey: ["/api/calculations"],
  });

  const filteredCalculations = Array.isArray(calculations) ? calculations.filter((calc: ImpactCalculation) => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    const totalMass = (parseFloat(calc.vehicleMass) + parseFloat(calc.loadMass)).toString();
    
    return (
      calc.vehicleMass.includes(searchTerm) ||
      calc.loadMass.includes(searchTerm) ||
      totalMass.includes(searchTerm) ||
      calc.speed.includes(searchTerm) ||
      calc.speedUnit.toLowerCase().includes(searchLower) ||
      calc.kineticEnergy.includes(searchTerm) ||
      new Date(calc.createdAt).toLocaleDateString().includes(searchTerm)
    );
  }) : [];

  const getSpeedDisplay = (speed: string, unit: string) => {
    const speedValue = parseFloat(speed);
    switch (unit) {
      case "kmh":
        return `${speedValue} km/h`;
      case "mph":
        return `${speedValue} mph`;
      case "ms":
        return `${speedValue} m/s`;
      default:
        return `${speedValue} ${unit}`;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-6"></div>
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="p-6 text-center">
            <div className="text-red-600 mb-4">
              <Calculator className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Error Loading Calculations</h3>
            <p className="text-gray-600">
              Unable to load impact calculation history. Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="outline" size="sm" asChild data-testid="button-back-to-dashboard">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold text-black">Impact Calculations History</h1>
          <p className="text-gray-600">
            View all your previous impact calculations and test results
          </p>
        </div>
      </div>

      {/* Search and Stats */}
      <div className="mb-6">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by mass, speed, energy, or date..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              data-testid="input-search-calculations"
            />
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Total: {Array.isArray(calculations) ? calculations.length : 0} calculations
            </span>
            {filteredCalculations && (
              <span>
                Showing: {filteredCalculations.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Calculations List */}
      {!filteredCalculations || filteredCalculations.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <div className="text-gray-400 mb-4">
              <Calculator className="h-16 w-16 mx-auto" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              {searchTerm ? "No calculations found" : "No calculations yet"}
            </h3>
            <p className="text-gray-600 mb-4">
              {searchTerm 
                ? "Try adjusting your search terms to find specific calculations."
                : "Start using the impact calculator to see your calculation history here."
              }
            </p>
            <Button asChild className="bg-yellow-400 text-black hover:bg-yellow-500">
              <Link href="/calculator">
                <Calculator className="h-4 w-4 mr-2" />
                New Calculation
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredCalculations.map((calc: ImpactCalculation) => {
            const totalMass = parseFloat(calc.vehicleMass) + parseFloat(calc.loadMass);
            const kineticEnergyValue = Math.round(parseFloat(calc.kineticEnergy));
            
            return (
              <Card key={calc.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <div className="p-2 bg-purple-500 rounded-full">
                        <Zap className="h-4 w-4 text-white" />
                      </div>
                      {kineticEnergyValue.toLocaleString()} J Kinetic Energy
                    </CardTitle>
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <Clock className="h-3 w-3" />
                      {formatDate(calc.createdAt)}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    {/* Vehicle Mass */}
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                      <div className="p-2 bg-blue-500 rounded-full">
                        <Truck className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase font-medium">Vehicle Mass</p>
                        <p className="text-lg font-bold text-blue-700">
                          {Math.round(parseFloat(calc.vehicleMass)).toLocaleString()} kg
                        </p>
                      </div>
                    </div>

                    {/* Load Mass */}
                    <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
                      <div className="p-2 bg-orange-500 rounded-full">
                        <Package className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase font-medium">Load Mass</p>
                        <p className="text-lg font-bold text-orange-700">
                          {Math.round(parseFloat(calc.loadMass)).toLocaleString()} kg
                        </p>
                      </div>
                    </div>

                    {/* Speed */}
                    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
                      <div className="p-2 bg-green-500 rounded-full">
                        <Target className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase font-medium">Impact Speed</p>
                        <p className="text-lg font-bold text-green-700">
                          {getSpeedDisplay(calc.speed, calc.speedUnit)}
                        </p>
                      </div>
                    </div>

                    {/* Total Mass */}
                    <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
                      <div className="p-2 bg-purple-500 rounded-full">
                        <Calculator className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 uppercase font-medium">Total Mass</p>
                        <p className="text-lg font-bold text-purple-700">
                          {Math.round(totalMass).toLocaleString()} kg
                        </p>
                      </div>
                    </div>
                  </div>

                  <Separator className="my-4" />
                  
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-sm text-gray-600">Impact Angle:</span>
                        <Badge variant="secondary" className="ml-2">
                          {parseFloat(calc.impactAngle)}°
                        </Badge>
                      </div>
                      {calc.recommendedProducts && calc.recommendedProducts.length > 0 && (
                        <div>
                          <span className="text-sm text-gray-600">Recommended Products:</span>
                          <Badge variant="outline" className="ml-2">
                            {calc.recommendedProducts.length} products
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        asChild
                        data-testid={`button-recalculate-${calc.id}`}
                      >
                        <Link 
                          href={`/calculator?vehicleMass=${calc.vehicleMass}&loadMass=${calc.loadMass}&speed=${calc.speed}&speedUnit=${calc.speedUnit}&impactAngle=${calc.impactAngle}`}
                        >
                          <Calculator className="h-3 w-3 mr-2" />
                          Recalculate
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Footer Actions */}
      <div className="mt-8 text-center">
        <Button asChild className="bg-yellow-400 text-black hover:bg-yellow-500">
          <Link href="/calculator">
            <Calculator className="h-4 w-4 mr-2" />
            New Impact Calculation
          </Link>
        </Button>
      </div>
    </div>
  );
}