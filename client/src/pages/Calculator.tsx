import { VehicleImpactCalculator } from "@/components/VehicleImpactCalculator";
import { Card, CardContent } from "@/components/ui/card";
import { InfoPopover } from "@/components/ui/info-popover";
import { Calculator as CalculatorIcon, Shield, Zap } from "lucide-react";

export default function Calculator() {
  return (
    <div className="min-h-screen bg-gray-50 py-4 sm:py-8">
      <div className="container mx-auto px-3 sm:px-4 max-w-7xl">
        {/* Hero Section */}
        <div className="text-center mb-6 sm:mb-12">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
            <CalculatorIcon className="h-8 w-8 sm:h-10 sm:w-10 text-black" />
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-4">
            <h1 className="text-2xl sm:text-4xl font-bold text-black text-center" data-testid="calculator-title">
              Vehicle Impact Calculator
            </h1>
            <InfoPopover 
              content="Calculate the kinetic energy of vehicle impacts using the PAS 13 methodology. Get instant product recommendations based on your specific requirements."
              iconClassName="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Calculator Component */}
        <VehicleImpactCalculator />

        {/* Information Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mt-6 sm:mt-12">
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4 sm:p-6 text-center">
              <Shield className="h-8 w-8 sm:h-12 sm:w-12 text-blue-600 mx-auto mb-3 sm:mb-4" />
              <div className="flex items-center justify-center gap-2 mb-2">
                <h3 className="font-bold text-black">PAS 13 Standard</h3>
                <InfoPopover 
                  content="Our calculations follow the globally recognized PAS 13 code of practice for safety barrier testing and certification."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-green-50 border-green-200">
            <CardContent className="p-4 sm:p-6 text-center">
              <Zap className="h-8 w-8 sm:h-12 sm:w-12 text-green-600 mx-auto mb-3 sm:mb-4" />
              <div className="flex items-center justify-center gap-2 mb-2">
                <h3 className="font-bold text-black">Instant Results</h3>
                <InfoPopover 
                  content="Get immediate kinetic energy calculations and safety barrier recommendations tailored to your specific impact scenarios."
                />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-yellow-50 border-yellow-200">
            <CardContent className="p-4 sm:p-6 text-center">
              <CalculatorIcon className="h-8 w-8 sm:h-12 sm:w-12 text-yellow-600 mx-auto mb-3 sm:mb-4" />
              <div className="flex items-center justify-center gap-2 mb-2">
                <h3 className="font-bold text-black">Scientific Accuracy</h3>
                <InfoPopover 
                  content="Calculations are based on proven physics principles and validated against real-world testing data."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* How to Use Guide */}
        <Card className="mt-6 sm:mt-12">
          <CardContent className="p-4 sm:p-8">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-black text-center">How to Use the Calculator</h2>
              <InfoPopover 
                content="Follow these 4 simple steps to calculate kinetic energy and get safety barrier recommendations."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <span className="text-black font-bold text-sm sm:text-base">1</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                  <h4 className="font-semibold text-sm sm:text-base">Vehicle Details</h4>
                  <InfoPopover 
                    content="Enter the vehicle mass and maximum load it will carry during operation."
                    iconClassName="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <span className="text-black font-bold text-sm sm:text-base">2</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                  <h4 className="font-semibold text-sm sm:text-base">Speed & Angle</h4>
                  <InfoPopover 
                    content="Set the maximum operational speed and likely impact angle for your facility."
                    iconClassName="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <span className="text-black font-bold text-sm sm:text-base">3</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                  <h4 className="font-semibold text-sm sm:text-base">Calculate Energy</h4>
                  <InfoPopover 
                    content="Click calculate to get the kinetic energy and risk assessment for your scenario."
                    iconClassName="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                  />
                </div>
              </div>

              <div className="text-center">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-400 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <span className="text-black font-bold text-sm sm:text-base">4</span>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
                  <h4 className="font-semibold text-sm sm:text-base">Choose Products</h4>
                  <InfoPopover 
                    content="Review recommended products that meet or exceed your calculated energy requirements."
                    iconClassName="h-3 w-3 text-gray-400 hover:text-gray-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Safety Note */}
        <Card className="mt-4 sm:mt-8 bg-orange-50 border-orange-200">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
              <Shield className="h-5 w-5 sm:h-6 sm:w-6 text-orange-600 mt-1 flex-shrink-0" />
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-2">
                <h3 className="font-bold text-black text-sm sm:text-base">Safety Recommendation</h3>
                <InfoPopover 
                  content="Always add a safety margin to your calculations. A-SAFE recommends selecting barriers with an impact rating at least 20% higher than your calculated kinetic energy. For critical applications, consider consulting with our safety engineers for a comprehensive site assessment."
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
