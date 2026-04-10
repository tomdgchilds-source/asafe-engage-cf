import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Ruler, 
  Users, 
  Truck,
  Building,
  Info,
  FileText,
  Download
} from "lucide-react";

interface ComplianceCheck {
  section: string;
  requirement: string;
  compliant: boolean;
  notes?: string;
}

export function PAS13ComplianceChecker() {
  const [barrierHeight, setBarrierHeight] = useState<string>("");
  const [deflectionZone, setDeflectionZone] = useState<string>("");
  const [applicationType, setApplicationType] = useState<string>("");
  const [pedestrianAccess, setPedestrianAccess] = useState<string>("");
  const [vehicleType, setVehicleType] = useState<string>("");
  const [aisleWidth, setAisleWidth] = useState<string>("");
  const [testMethod, setTestMethod] = useState<string>("");
  const [testJoules, setTestJoules] = useState<string>("");
  
  const [complianceResults, setComplianceResults] = useState<ComplianceCheck[]>([]);
  const [overallCompliant, setOverallCompliant] = useState<boolean | null>(null);

  const checkCompliance = () => {
    const checks: ComplianceCheck[] = [];
    
    // Section 5.1 - Barrier Height Requirements
    if (barrierHeight) {
      const height = parseFloat(barrierHeight);
      const vehicleCheck = vehicleType === "forklift" && height >= 400;
      const pedestrianCheck = pedestrianAccess === "yes" && height >= 1100;
      
      checks.push({
        section: "5.1",
        requirement: "Barrier height appropriate for vehicle type",
        compliant: vehicleCheck || vehicleType !== "forklift",
        notes: vehicleType === "forklift" ? `Minimum 400mm required for forklifts (current: ${height}mm)` : undefined
      });
      
      if (pedestrianAccess === "yes") {
        checks.push({
          section: "5.2",
          requirement: "Hand rail height for pedestrian areas (1100mm)",
          compliant: pedestrianCheck,
          notes: `Current height: ${height}mm, Required: 1100mm minimum`
        });
      }
    }
    
    // Section 5.3 - Deflection Zone Requirements
    if (deflectionZone) {
      const zone = parseFloat(deflectionZone);
      checks.push({
        section: "5.3",
        requirement: "Adequate deflection zone provided",
        compliant: zone >= 200,
        notes: `Deflection zone: ${zone}mm (minimum 200mm recommended)`
      });
    }
    
    // Section 7 - Testing Requirements
    if (testMethod) {
      checks.push({
        section: "7.1",
        requirement: "Appropriate test method used",
        compliant: ["pendulum", "vehicle", "sled"].includes(testMethod),
        notes: `Test method: ${testMethod}`
      });
    }
    
    if (testJoules) {
      const joules = parseFloat(testJoules);
      checks.push({
        section: "7.2",
        requirement: "Impact energy within testable range",
        compliant: joules <= 50000,
        notes: `Test energy: ${joules}J (maximum 50,000J per PAS 13)`
      });
    }
    
    // Section 4 - Aisle Width and Impact Angle
    if (aisleWidth) {
      const width = parseFloat(aisleWidth);
      const vehicleWidth = 1.2; // Typical forklift width
      const maxAngle = Math.atan((width - vehicleWidth) / 2.5) * 180 / Math.PI;
      
      checks.push({
        section: "4.2",
        requirement: "Aisle width allows safe vehicle operation",
        compliant: width >= 3.0,
        notes: `Aisle width: ${width}m, Maximum impact angle: ${maxAngle.toFixed(1)}°`
      });
    }
    
    setComplianceResults(checks);
    setOverallCompliant(checks.length > 0 && checks.every(c => c.compliant));
  };

  const generateReport = () => {
    const reportContent = `
PAS 13:2017 COMPLIANCE REPORT
================================
Generated: ${new Date().toLocaleDateString()}

INSTALLATION DETAILS
-------------------
Application Type: ${applicationType || 'Not specified'}
Vehicle Type: ${vehicleType || 'Not specified'}
Barrier Height: ${barrierHeight || 'Not specified'}mm
Deflection Zone: ${deflectionZone || 'Not specified'}mm
Aisle Width: ${aisleWidth || 'Not specified'}m
Pedestrian Access: ${pedestrianAccess || 'Not specified'}

TEST INFORMATION
---------------
Test Method: ${testMethod || 'Not specified'}
Test Energy: ${testJoules || 'Not specified'}J

COMPLIANCE RESULTS
-----------------
Overall Compliance: ${overallCompliant ? 'COMPLIANT' : overallCompliant === false ? 'NON-COMPLIANT' : 'NOT ASSESSED'}

${complianceResults.map(check => `
Section ${check.section}: ${check.requirement}
Status: ${check.compliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}
${check.notes ? `Notes: ${check.notes}` : ''}
`).join('')}

================================
This report is based on PAS 13:2017 British Standard
Code of practice for safety barriers used in traffic management within workplace environments
    `;
    
    // Create download
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `PAS13_Compliance_Report_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="h-8 w-8 text-[#FFC72C]" />
        <div>
          <h1 className="text-3xl font-bold">PAS 13:2017 Compliance Checker</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Verify your safety barrier installation meets British Standard requirements
          </p>
        </div>
      </div>

      <Alert className="bg-[#FFC72C]/10 dark:bg-[#FFC72C]/20 border-[#FFC72C]/30 dark:border-[#FFC72C]/40">
        <Info className="h-4 w-4 text-[#FFC72C]" />
        <AlertTitle className="text-gray-900 dark:text-white font-semibold">About PAS 13:2017</AlertTitle>
        <AlertDescription className="text-gray-700 dark:text-gray-300">
          PAS 13:2017 is the British Standard code of practice for safety barriers used in traffic 
          management within workplace environments. This tool helps verify compliance with key requirements.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="dimensions" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dimensions">Dimensions</TabsTrigger>
          <TabsTrigger value="application">Application</TabsTrigger>
          <TabsTrigger value="testing">Testing</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>

        <TabsContent value="dimensions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ruler className="h-5 w-5" />
                Barrier Dimensions
              </CardTitle>
              <CardDescription>
                Enter the physical dimensions of your safety barrier installation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="barrier-height">Barrier Height (mm)</Label>
                <Input
                  id="barrier-height"
                  type="number"
                  value={barrierHeight}
                  onChange={(e) => setBarrierHeight(e.target.value)}
                  placeholder="e.g., 400"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Per Section 5.1: Minimum 400mm for vehicle protection
                </p>
              </div>

              <div>
                <Label htmlFor="deflection-zone">Deflection Zone (mm)</Label>
                <Input
                  id="deflection-zone"
                  type="number"
                  value={deflectionZone}
                  onChange={(e) => setDeflectionZone(e.target.value)}
                  placeholder="e.g., 250"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Per Section 5.3: Space for barrier deformation on impact
                </p>
              </div>

              <div>
                <Label htmlFor="aisle-width">Aisle Width (meters)</Label>
                <Input
                  id="aisle-width"
                  type="number"
                  step="0.1"
                  value={aisleWidth}
                  onChange={(e) => setAisleWidth(e.target.value)}
                  placeholder="e.g., 3.5"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Per Figure 17: Used to calculate maximum impact angle
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="application" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building className="h-5 w-5" />
                Application Details
              </CardTitle>
              <CardDescription>
                Specify how the barriers will be used in your facility
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="application-type">Application Type</Label>
                <Select value={applicationType} onValueChange={setApplicationType}>
                  <SelectTrigger id="application-type">
                    <SelectValue placeholder="Select application..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="column-protection">Column Protection</SelectItem>
                    <SelectItem value="pedestrian-walkway">Pedestrian Walkway</SelectItem>
                    <SelectItem value="vehicle-route">Vehicle Route</SelectItem>
                    <SelectItem value="crossing-point">Crossing Point</SelectItem>
                    <SelectItem value="loading-dock">Loading Dock</SelectItem>
                    <SelectItem value="equipment-protection">Equipment Protection</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="pedestrian-access">Pedestrian Access Required?</Label>
                <Select value={pedestrianAccess} onValueChange={setPedestrianAccess}>
                  <SelectTrigger id="pedestrian-access">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes - Pedestrians present</SelectItem>
                    <SelectItem value="no">No - Vehicle only area</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-1">
                  Per Section 5.2: Hand rails required at 1100mm for pedestrians
                </p>
              </div>

              <div>
                <Label htmlFor="vehicle-type">Primary Vehicle Type</Label>
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger id="vehicle-type">
                    <SelectValue placeholder="Select vehicle..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="forklift">Forklift</SelectItem>
                    <SelectItem value="pallet-truck">Pallet Truck</SelectItem>
                    <SelectItem value="reach-truck">Reach Truck</SelectItem>
                    <SelectItem value="tugger">Tugger Train</SelectItem>
                    <SelectItem value="agv">AGV</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Testing & Certification
              </CardTitle>
              <CardDescription>
                Enter test data per PAS 13:2017 Section 7
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="test-method">Test Method</Label>
                <Select value={testMethod} onValueChange={setTestMethod}>
                  <SelectTrigger id="test-method">
                    <SelectValue placeholder="Select test method..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendulum">Pendulum Test (Section 7.2)</SelectItem>
                    <SelectItem value="vehicle">Vehicle Impact Test (Section 7.3)</SelectItem>
                    <SelectItem value="sled">Sled Test (Section 7.4)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="test-joules">Test Impact Energy (Joules)</Label>
                <Input
                  id="test-joules"
                  type="number"
                  value={testJoules}
                  onChange={(e) => setTestJoules(e.target.value)}
                  placeholder="e.g., 12500"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Energy rating achieved in PAS 13 testing
                </p>
              </div>

              <Button 
                onClick={checkCompliance}
                className="w-full bg-[#FFC72C] hover:bg-[#FFB700] text-black font-semibold"
              >
                <Shield className="h-4 w-4 mr-2" />
                Check PAS 13 Compliance
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results" className="space-y-4">
          {complianceResults.length > 0 ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {overallCompliant ? (
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    ) : (
                      <XCircle className="h-6 w-6 text-red-600" />
                    )}
                    Compliance Results
                  </CardTitle>
                  <CardDescription>
                    {overallCompliant 
                      ? "Installation meets PAS 13:2017 requirements"
                      : "Installation does not meet all PAS 13:2017 requirements"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {complianceResults.map((check, index) => (
                    <div key={index} className="p-3 rounded-lg border">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {check.compliant ? (
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            )}
                            <span className="font-medium">Section {check.section}</span>
                            <Badge variant={check.compliant ? "default" : "secondary"}>
                              {check.compliant ? "Compliant" : "Non-Compliant"}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">
                            {check.requirement}
                          </p>
                          {check.notes && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              {check.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  <Button 
                    onClick={generateReport}
                    className="w-full mt-4"
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download Compliance Report
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-500">
                  Complete the assessment fields and click "Check PAS 13 Compliance" to see results
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}