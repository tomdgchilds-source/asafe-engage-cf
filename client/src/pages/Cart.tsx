import { useState } from "react";
import { Cart } from "@/components/Cart";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Calculator, RotateCcw, FileText, Calendar, Save } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { DraftProjectDialog } from "@/components/DraftProjectDialog";
import { InfoPopover } from "@/components/ui/info-popover";

export default function CartPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [isReportSelectionOpen, setIsReportSelectionOpen] = useState(false);
  const [isDraftDialogOpen, setIsDraftDialogOpen] = useState(false);

  // Fetch user's calculations to get all of them
  const { data: calculations = [] } = useQuery<any[]>({
    queryKey: ["/api/calculations"],
    enabled: !!user,
  });

  // Fetch cart items to know count for draft dialog
  const { data: cartItems = [] } = useQuery<any[]>({
    queryKey: ["/api/cart"],
    enabled: !!user,
  });

  const handleShowReportSelection = () => {
    if (calculations.length === 0) {
      toast({
        title: "No Impact Reports Found", 
        description: "You haven't created any impact calculations yet. Please create one first.",
        variant: "destructive",
      });
      return;
    }
    setIsReportSelectionOpen(true);
  };

  const handleSelectReport = (calculationId: string) => {
    setIsReportSelectionOpen(false);
    // Navigate to calculator with the selected calculation ID as a query parameter
    window.location.href = `/calculator?calculationId=${calculationId}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
      <div className="w-full px-2 sm:px-4">
          <div className="mb-4 sm:mb-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-black mb-1 sm:mb-2 flex items-center">
                  Project Cart
                  <InfoPopover 
                    content="Review your selected safety barrier solutions"
                    iconClassName="h-5 w-5 ml-2 text-gray-400 hover:text-gray-600 cursor-help"
                  />
                </h1>
              </div>
              
              {user ? (
                <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
                  <Link href="/calculator">
                    <Button 
                      variant="outline" 
                      className="flex items-center gap-2 w-full sm:w-auto"
                      data-testid="button-new-calculation"
                    >
                      <Calculator className="h-4 w-4" />
                      New Impact Report
                    </Button>
                  </Link>
                  
                  <Button 
                    onClick={handleShowReportSelection}
                    disabled={calculations.length === 0}
                    className="flex items-center gap-2 bg-yellow-400 text-black hover:bg-yellow-500 w-full sm:w-auto"
                    data-testid="button-reopen-earlier-report"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reopen Past Report
                  </Button>

                  <Button 
                    onClick={() => setIsDraftDialogOpen(true)}
                    disabled={cartItems.length === 0}
                    variant="outline"
                    className="flex items-center gap-2 w-full sm:w-auto"
                    data-testid="button-save-draft"
                  >
                    <Save className="h-4 w-4" />
                    Save as Draft
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <Cart />
        
        {/* Report Selection Modal */}
        <Dialog open={isReportSelectionOpen} onOpenChange={setIsReportSelectionOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Select an Impact Report
            </DialogTitle>
            <DialogDescription>
              Choose from your previous impact calculations to reopen and modify.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {calculations.map((calc: any) => (
              <div
                key={calc.id}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleSelectReport(calc.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold text-black">
                        {Math.round(calc.kineticEnergy).toLocaleString()} J Kinetic Energy
                      </h4>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        calc.riskLevel === 'high' ? 'bg-red-100 text-red-800' :
                        calc.riskLevel === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {calc.riskLevel?.toUpperCase()} RISK
                      </span>
                    </div>
                    {calc.operatingZone && (
                      <p className="text-sm text-blue-700 font-medium mb-1">
                        📍 {calc.operatingZone}
                      </p>
                    )}
                    <p className="text-sm text-gray-600 mb-1">
                      {Math.round(parseFloat(calc.vehicleMass) + parseFloat(calc.loadMass)).toLocaleString()}kg total mass @ {calc.speed} {calc.speedUnit} ({calc.impactAngle}°)
                    </p>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Calendar className="h-3 w-3" />
                      {new Date(calc.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="ml-4"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectReport(calc.id);
                    }}
                  >
                    Select
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

        {/* Draft Project Dialog */}
        <DraftProjectDialog
          open={isDraftDialogOpen}
          onOpenChange={setIsDraftDialogOpen}
          cartItemsCount={cartItems.length}
        />
      </div>
    </div>
  );
}