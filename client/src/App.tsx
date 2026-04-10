import { Suspense, lazy } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/Layout";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { useAuth } from "@/hooks/useAuth";
import { useScrollToTop } from "@/hooks/useScrollToTop";
import { MobileOptimizer } from "@/components/MobileOptimizer";
import { MobileLoadingScreen } from "@/components/MobileLoadingScreen";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Critical pages loaded immediately
import Landing from "@/pages/Landing";
import Dashboard from "@/pages/Dashboard";
import { VerificationPage } from "@/pages/VerificationPage";
import { ProfileCompletion } from "@/pages/ProfileCompletion";

// Lazy load non-critical pages for faster initial load
const Products = lazy(() => import("@/pages/Products"));
const Calculator = lazy(() => import("@/pages/Calculator"));
const CaseStudies = lazy(() => import("@/pages/CaseStudies"));
const Resources = lazy(() => import("@/pages/Resources"));
const About = lazy(() => import("@/pages/About"));
const Contact = lazy(() => import("@/pages/Contact"));
const Profile = lazy(() => import("@/pages/Profile"));
const FAQs = lazy(() => import("@/pages/FAQs"));
const Admin = lazy(() => import("@/pages/Admin"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));
const AdminDashboard = lazy(() => import("@/pages/AdminDashboard"));
const Cart = lazy(() => import("@/pages/Cart"));
const CalculationsHistory = lazy(() => import("@/pages/CalculationsHistory"));
const OrderForm = lazy(() => import("@/pages/OrderForm").then(m => ({ default: m.OrderForm })));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const TermsOfService = lazy(() => import("@/pages/TermsOfService"));
const IndustryCaseStudies = lazy(() => import("@/pages/IndustryCaseStudies"));
const SolutionFinder = lazy(() => import("@/pages/SolutionFinder").then(m => ({ default: m.SolutionFinder })));
const StartNewProject = lazy(() => import("@/pages/StartNewProject"));
const SiteSurvey = lazy(() => import("@/pages/SiteSurvey"));
const HapticTestPage = lazy(() => import("@/pages/HapticTestPage"));
const PAS13ComplianceChecker = lazy(() => import("@/pages/PAS13ComplianceChecker").then(m => ({ default: m.PAS13ComplianceChecker })));
const CommunicationPlan = lazy(() => import("@/pages/CommunicationPlan"));
const AnalyticsDashboard = lazy(() => import("@/pages/AnalyticsDashboard"));
const InstallationTimeline = lazy(() => import("@/pages/InstallationTimeline"));
const LayoutDrawing = lazy(() => import("@/pages/LayoutDrawing"));
const NotFound = lazy(() => import("@/pages/not-found"));

// Loading fallback component - use mobile optimized version
const PageLoader = () => <MobileLoadingScreen />;

function Router() {
  const { isAuthenticated, isLoading } = useAuth();
  useScrollToTop(); // Scroll to top on route changes
  
  // If loading, show loader
  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* All routes - authentication is handled inside components */}
        <Route path="/" component={isAuthenticated ? Dashboard : Landing} />
        <Route path="/verify" component={VerificationPage} />
        <Route path="/complete-profile" component={ProfileCompletion} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/calculator" component={Calculator} />
        <Route path="/products" component={Products} />
        <Route path="/products/:id" component={Products} />
        <Route path="/faqs" component={FAQs} />
        <Route path="/industry-case-studies/:industry" component={IndustryCaseStudies} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/login" component={AdminLogin} />
        <Route path="/admin/dashboard" component={AdminDashboard} />
        <Route path="/haptic-test" component={HapticTestPage} />
        <Route path="/privacy-policy" component={PrivacyPolicy} />
        <Route path="/terms-of-service" component={TermsOfService} />
        <Route path="/cart" component={Cart} />
        <Route path="/profile" component={Profile} />
        <Route path="/order-form/:id" component={OrderForm} />
        <Route path="/start-new-project" component={StartNewProject} />
        <Route path="/site-survey" component={SiteSurvey} />
        <Route path="/layout-drawings" component={LayoutDrawing} />
        <Route path="/solution-finder" component={SolutionFinder} />
        <Route path="/calculations-history" component={CalculationsHistory} />
        <Route path="/pas13-compliance" component={PAS13ComplianceChecker} />
        <Route path="/case-studies" component={CaseStudies} />
        <Route path="/resources" component={Resources} />
        <Route path="/about" component={About} />
        <Route path="/contact" component={Contact} />
        <Route path="/communication-plan" component={CommunicationPlan} />
        <Route path="/analytics" component={AnalyticsDashboard} />
        <Route path="/installation-timeline" component={InstallationTimeline} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function AppContent() {
  const { isAuthenticated, isLoading, error } = useAuth();

  // Show loading screen while checking auth
  if (isLoading) {
    return <MobileLoadingScreen />;
  }

  // For non-authenticated users or auth errors, show public routes
  if (!isAuthenticated || error) {
    return <Router />;
  }

  // For authenticated users, wrap with Layout
  return (
    <Layout>
      <Router />
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <CurrencyProvider>
          <TooltipProvider>
            <MobileOptimizer />
            <Toaster />
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </TooltipProvider>
        </CurrencyProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
