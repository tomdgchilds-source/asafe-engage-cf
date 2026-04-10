import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Target,
  ArrowLeft,
  ClipboardList,
  Calculator,
  Lightbulb,
  Package,
  PenTool
} from "lucide-react";

export default function StartNewProject() {
  // Set page title and meta description
  useEffect(() => {
    document.title = "Start New Project - A-SAFE ENGAGE";
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', 'Choose how to begin your A-SAFE project with our Site Survey, Impact Calculator, Solution Finder, or Browse Products tools.');
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

        {/* 5-Option Grid - Layout Drawing added */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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

          {/* Impact Calculator */}
          <Card className="border-gray-200 dark:border-gray-700 hover:border-[#FFC72C] hover:bg-gray-50 dark:hover:bg-gray-800 transition-all hover:scale-105 cursor-pointer">
            <CardContent className="p-0">
              <Link href="/calculator" data-testid="link-impact-calculator">
                <div className="p-8 flex flex-col items-center text-center h-full">
                  <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
                    <Calculator className="h-10 w-10 text-gray-700 dark:text-gray-300" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Impact Calculator
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Calculate impact forces and get product recommendations
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>

          {/* Solution Finder */}
          <Card className="border-gray-200 dark:border-gray-700 hover:border-[#FFC72C] hover:bg-gray-50 dark:hover:bg-gray-800 transition-all hover:scale-105 cursor-pointer">
            <CardContent className="p-0">
              <Link href="/solution-finder" data-testid="link-solution-finder">
                <div className="p-8 flex flex-col items-center text-center h-full">
                  <div className="mb-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-full">
                    <Lightbulb className="h-10 w-10 text-gray-700 dark:text-gray-300" />
                  </div>
                  <h2 className="text-xl font-semibold mb-2 text-gray-900 dark:text-white">
                    Solution Finder
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Find the perfect safety solution for your needs
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

          {/* Layout Drawing - New 5th option */}
          <Card className="border-gray-200 dark:border-gray-700 hover:border-[#8B5CF6] hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all hover:scale-105 cursor-pointer">
            <CardContent className="p-0">
              <Link href="/layout-drawing" data-testid="link-layout-drawing">
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
        </div>

        {/* Link to Saved Drafts */}
        <div className="mt-10 text-center">
          <Link href="/draft-projects" data-testid="link-saved-drafts">
            <span className="text-sm text-[#FFC72C] hover:text-[#FFB700] underline cursor-pointer">
              View Saved Draft Projects
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}