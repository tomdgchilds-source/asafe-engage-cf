import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Target,
  ArrowLeft,
  ClipboardList,
  Calculator,
  Package,
  PenTool,
  Briefcase
} from "lucide-react";

export default function StartNewProject() {
  // Set page title and meta description
  useEffect(() => {
    document.title = "Start New Project - A-SAFE ENGAGE";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Choose how to begin your A-SAFE project: Site Survey, Layout Drawing, or Browse Products.');
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Back to Dashboard Link */}
        <div className="mb-6">
          <Button
            asChild
            variant="ghost"
            className="hover:bg-gray-100 dark:hover:bg-gray-800"
            data-testid="link-back-dashboard"
          >
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Link>
          </Button>
        </div>

        {/* Page Title */}
        <div className="flex items-center justify-center mb-8">
          <Target className="h-8 w-8 mr-3 text-[#FFC72C]" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Start New Project
          </h1>
        </div>

        {/* Subtitle */}
        <div className="text-center mb-10">
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Choose how to begin your project
          </p>
        </div>

        {/* Three primary entry points. The Impact Calculator is a tool, not
            a starting point, so it lives below as a secondary link.
            Solution Finder is parked and has no entry here. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Site Survey - Primary highlighted option */}
          <Card className="border-2 border-[#FFC72C] bg-[#FFC72C]/10 hover:bg-[#FFC72C]/20 transition-all hover:scale-105 cursor-pointer">
            <CardContent className="p-0">
              <Link href="/site-survey" data-testid="link-site-survey">
                <div className="p-8 flex flex-col items-center text-center h-full">
                  <div className="mb-4 p-4 bg-[#FFC72C] rounded-full">
                    <ClipboardList className="h-10 w-10 text-black" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Site Survey
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Document your site requirements and capture project details
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Layout Drawing */}
          <Card className="border-gray-200 dark:border-gray-700 hover:border-[#8B5CF6] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all hover:scale-105 cursor-pointer">
            <CardContent className="p-0">
              <Link href="/layout-drawings" data-testid="link-layout-drawing">
                <div className="p-8 flex flex-col items-center text-center h-full">
                  <div className="mb-4 p-4 bg-purple-100 dark:bg-purple-900/40 rounded-full">
                    <PenTool className="h-10 w-10 text-purple-600 dark:text-purple-400" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Layout Drawing
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Mark up your floor plan with safety barrier placements
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Browse Products */}
          <Card className="border-gray-200 dark:border-gray-700 hover:border-[#FFC72C] hover:bg-gray-50 dark:hover:bg-gray-800 transition-all hover:scale-105 cursor-pointer">
            <CardContent className="p-0">
              <Link href="/products" data-testid="link-browse-products">
                <div className="p-8 flex flex-col items-center text-center h-full">
                  <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
                    <Package className="h-10 w-10 text-gray-700 dark:text-gray-300" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Browse Products
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Explore our complete range of safety barrier solutions
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Secondary: tools and existing work */}
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild variant="outline" className="hover:border-[#FFC72C] hover:bg-[#FFC72C]/10">
            <Link href="/calculator" data-testid="link-impact-calculator">
              <Calculator className="mr-2 h-4 w-4" />
              Impact Calculator (tool)
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/projects" data-testid="link-projects">
              <Briefcase className="mr-2 h-4 w-4" />
              View existing projects
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
