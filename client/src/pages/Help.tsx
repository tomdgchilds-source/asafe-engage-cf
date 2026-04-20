import { useState, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen, Search, Rocket, Calculator, Target, ClipboardCheck, PenTool,
  ShieldCheck, Package, ShoppingCart, FileText, BookMarked, Download,
  History, MessageCircle, Calendar, User, Sparkles, ArrowRight, ChevronRight,
  CheckCircle2, Info, Lightbulb, AlertTriangle,
} from "lucide-react";

/**
 * A-SAFE ENGAGE Help Center
 *
 * One-page, search-friendly guide for new users and the sales team.
 * Content is defined as data (easy to edit / extend) and rendered as
 * collapsible topic cards with a persistent left-side navigation.
 */

type HelpTopic = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  summary: string;
  route?: string;
  sections: {
    heading: string;
    body: string;
    steps?: string[];
    tips?: string[];
    warnings?: string[];
  }[];
};

const HELP_TOPICS: HelpTopic[] = [
  // ─── Quick Start ─────────────────────────────────────────────────
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    summary: "A 5-minute walkthrough for brand-new users.",
    sections: [
      {
        heading: "What is A-SAFE ENGAGE?",
        body:
          "ENGAGE is the A-SAFE sales enablement platform. It lets you calculate impact forces, recommend the right products, build quotes, capture site surveys, and share case studies — all in one place.",
      },
      {
        heading: "Your first session — five steps",
        body: "Follow these in order to get the feel of the app:",
        steps: [
          "Sign in with your A-SAFE email and the password you were given (change it from your Profile afterwards).",
          "Pick your currency (top bar): AED, SAR, USD, GBP, or EUR. Prices update instantly.",
          "Open the Impact Calculator — enter a vehicle weight and speed, hit Calculate, and see which barriers are recommended for the joule rating.",
          "Browse the Product Catalog and add a recommended product to your cart.",
          "Review your cart, pick delivery/installation, and generate an Order Form PDF.",
        ],
        tips: [
          "Use dark mode via the moon icon in the header if you prefer.",
          "The left sidebar remembers which sections you had open.",
          "On mobile, tap the menu icon (top-left) for the same navigation.",
        ],
      },
      {
        heading: "Terminology cheat sheet",
        body:
          "PAS 13 = the industry standard A-SAFE barriers are crash-tested against. MHE = Material Handling Equipment (forklifts, pallet trucks, etc.). Kinetic Energy (KE) = the impact force in joules, calculated as ½ × mass × (velocity × sin angle)².",
      },
    ],
  },

  // ─── Dashboard ───────────────────────────────────────────────────
  {
    id: "dashboard",
    title: "Dashboard",
    icon: Sparkles,
    summary: "Your home screen — quick access to everything you're working on.",
    route: "/dashboard",
    sections: [
      {
        heading: "Primary action cards",
        body:
          "The top row shows Start New Project, Draft Projects (saved work), Project Cart (live quote), and Recent Orders (your history).",
      },
      {
        heading: "Sales activity",
        body:
          "Recent Quote Requests and Recent Calculations appear below so you can jump straight back into work you didn't finish.",
      },
      {
        heading: "How to use it well",
        body: "",
        tips: [
          "Click Start New Project when beginning any customer engagement — it opens the structured workflow.",
          "If you close the browser mid-quote, your cart is saved automatically. Come back and pick up where you left off.",
        ],
      },
    ],
  },

  // ─── Impact Calculator ───────────────────────────────────────────
  {
    id: "impact-calculator",
    title: "Impact Calculator",
    icon: Calculator,
    summary: "PAS 13-compliant kinetic energy calculator with automatic product recommendations.",
    route: "/calculator",
    sections: [
      {
        heading: "What it calculates",
        body:
          "The calculator uses the formula KE = ½m × (v·sin θ)² to work out the impact force (in joules) a barrier will need to absorb.",
      },
      {
        heading: "Step-by-step",
        body: "",
        steps: [
          "Select the Application Area (e.g. Racking, Columns, Pedestrian Walkways, or Other).",
          "Click Select vehicle types and choose one or more MHE types. The heaviest vehicle's weight auto-fills.",
          "Override Vehicle Mass or Load Mass if you have exact numbers — any value is allowed.",
          "Enter Vehicle Speed and pick units (mph / km/h / m/s).",
          "Pick the Impact Angle (90° = perpendicular, 10° = glancing). For aisle-based scenarios, enable PAS 13:2017 mode and enter the aisle width — the calculator will cap the angle based on vehicle/aisle geometry.",
          "Click Calculate Impact Force — results appear with recommended products and their safety margins.",
        ],
        tips: [
          "The heavier the vehicle or faster the speed, the higher the joule rating — and the heavier-duty barrier you'll need.",
          "Products with a positive safety margin (e.g. \"40% safety margin\") exceed the calculated force.",
          "Click a recommended product card to view the full spec or add to cart.",
        ],
      },
      {
        heading: "What the results mean",
        body:
          "A 14,000 J result means the barrier needs to absorb a 3-tonne vehicle at 11 km/h perpendicular. Atlas Double (30,200 J) would have a safety margin of (30,200 − 14,000) / 14,000 ≈ 115%.",
      },
    ],
  },

  // ─── PAS 13 Compliance ───────────────────────────────────────────
  {
    id: "pas13-compliance",
    title: "PAS 13 Compliance Checker",
    icon: ShieldCheck,
    summary: "Quick-check tool for whether a barrier meets PAS 13:2017.",
    route: "/pas13-compliance",
    sections: [
      {
        heading: "When to use it",
        body:
          "Use this after the Impact Calculator when the customer asks \"is this PAS 13 compliant?\". It documents the test energy, the applicable angle cap, and the safety margin for a given barrier + scenario combination.",
      },
      {
        heading: "How the checks work",
        body:
          "The tool applies the PAS 13 section 7.2.4 test angle (capped at 45°) with a 20% safety margin and checks the product's rated joules covers the adjusted energy.",
        tips: [
          "A PAS 13 compliant result still needs correct installation — attach the Installation Guides from Resources.",
          "Export the compliance summary as a PDF to share with procurement teams.",
        ],
      },
    ],
  },

  // ─── Solution Finder ─────────────────────────────────────────────
  {
    id: "solution-finder",
    title: "Solution Finder",
    icon: Target,
    summary: "Industry + workplace-led recommendations without needing the calculator.",
    route: "/solution-finder",
    sections: [
      {
        heading: "When to use it",
        body:
          "When the customer knows their industry and workplace type but hasn't shared vehicle specs yet — the Solution Finder suggests a starting product set based on typical scenarios.",
      },
      {
        heading: "Step-by-step",
        body: "",
        steps: [
          "Choose your industry (Logistics, Manufacturing, Food & Beverage, etc.).",
          "Choose the workplace type (Warehouse, Production Floor, Loading Dock, etc.).",
          "Optionally add vehicles for more targeted suggestions.",
          "Review the recommended products + case studies.",
          "Click through to the full Impact Calculator to fine-tune.",
        ],
      },
    ],
  },

  // ─── Site Survey ─────────────────────────────────────────────────
  {
    id: "site-survey",
    title: "Site Survey",
    icon: ClipboardCheck,
    summary: "Capture site visits area-by-area with photos, risk levels and 3D scans.",
    route: "/site-survey",
    sections: [
      {
        heading: "How site surveys are structured",
        body:
          "A Survey contains Areas of Concern. Each area captures: zone & name, area type, description, current condition, risk level, vehicle/speed/angle inputs, reference photos, and an optional Matterport 3D scan.",
      },
      {
        heading: "Creating a survey",
        body: "",
        steps: [
          "Click New Survey and enter the basic info (title, customer, site location, date).",
          "Add Areas of Concern — one card per distinct zone or trouble spot.",
          "Attach photos by clicking Upload. Each area supports unlimited photos.",
          "Optional: paste a Matterport URL or model ID to embed a full 3D scan — the URL parser handles most Matterport formats.",
          "Enter the impact calculation inputs and click Calculate to get joule ratings and recommended products per area.",
          "Export the full Site Survey PDF — a branded report ready for the customer.",
        ],
        tips: [
          "Editing an area's name, description, or Matterport URL never wipes the impact calculation.",
          "Changing vehicle weight, speed, or angle requires a recalculation (intentional).",
          "All photos are stored on A-SAFE's Cloudflare R2 bucket with KV fallback — reliable even if one storage layer is down.",
        ],
      },
    ],
  },

  // ─── Layout Drawings ─────────────────────────────────────────────
  {
    id: "layout-drawings",
    title: "Layout Drawings",
    icon: PenTool,
    summary: "Upload site plans and draw barrier routes directly on them.",
    route: "/layout-drawings",
    sections: [
      {
        heading: "Purpose",
        body:
          "Use layout drawings to visually plan where barriers go. Useful for quotes that need a spatial plan and for communicating with customers.",
      },
      {
        heading: "How to use",
        body: "",
        steps: [
          "Upload an image of the floor plan or site layout.",
          "Click on the drawing to place a marker. Associate each marker with a product from your cart.",
          "Draw lines to represent barrier runs — the calculated length auto-updates linear-meter products.",
          "Add comments per marker for internal notes.",
          "The drawing plus markups are attached to the current project and included in the Order Form PDF.",
        ],
        warnings: [
          "Only the owner of a drawing can edit or delete its markups (security enforced at the API).",
        ],
      },
    ],
  },

  // ─── Products Catalog ────────────────────────────────────────────
  {
    id: "products",
    title: "Product Catalog",
    icon: Package,
    summary: "Browse all 31 A-SAFE products with filters, variants, and images.",
    route: "/products",
    sections: [
      {
        heading: "Finding products",
        body:
          "Use the search bar for quick lookups. Filter by Category (Traffic Barriers, Bollards, Column Protection, etc.), by impact rating, or by industry application.",
      },
      {
        heading: "Product types you'll see",
        body:
          "Linear-meter products (e.g. iFlex Single Traffic Barrier) are priced per meter. Single-SKU products (Car Stop, Alarm Bar) are fixed size. Variant products (FlexiShield Column Guard has 11 sizes, Slider Plate has 2 OD options, Bollards have height/colour options) let you pick a specific SKU.",
      },
      {
        heading: "Special configurators",
        body: "",
        tips: [
          "FlexiShield Column Guard: pick Standard Sizes (100×100mm to 600×600mm) or Custom Dimensions (auto-calculates spacers for non-standard columns).",
          "iFlex Rail Column Guard: enter column dimensions + number of sides to protect (1-4); the total linear meters and price calculate automatically.",
          "Height Restrictor: custom height × width input; pricing scales with area.",
          "ForkGuard Kerb Barrier: use the Kerb Length Calculator to work out combinations.",
          "FlexiShield Column Guard Spacer Set: sold in pairs, 100mm each — pair up pairs to match non-standard column sizes.",
        ],
      },
    ],
  },

  // ─── Cart & Quoting ──────────────────────────────────────────────
  {
    id: "cart",
    title: "Project Cart",
    icon: ShoppingCart,
    summary: "Build a full quote with discounts, service packages, delivery, and installation.",
    route: "/cart",
    sections: [
      {
        heading: "Adding and editing items",
        body:
          "Click Add to Cart from any product card. Inside the modal you configure: quantity, variant (if applicable), delivery toggle, installation toggle, site reference photos, installation location, and optional notes.",
      },
      {
        heading: "Discount options (reciprocal value)",
        body:
          "Discounts are applied when the customer agrees to give something back: logo usage, case study participation, LinkedIn post, referrals, etc. Each has a fixed percentage — combined discounts stack up to 100%.",
        tips: [
          "The 20% artificial cap was removed — discounts now apply as selected. Review the total before sending.",
          "Service Care Options add a % to the total (Basic is free, Enterprise is +15%).",
        ],
      },
      {
        heading: "Case study references",
        body:
          "Click Select Case Study References to attach up to 5 relevant case studies to the quote. These appear in the generated Order Form PDF.",
      },
      {
        heading: "Generate a quote",
        body:
          "Click Generate Order Form. A branded PDF opens with all items, pricing, customer details, delivery locations, discounts, service packages, and attached case study references. Submit via the Send button — the order notification is routed based on currency (AED → sales@asafe.ae, SAR → sales@asafe.sa).",
      },
    ],
  },

  // ─── Case Studies ────────────────────────────────────────────────
  {
    id: "case-studies",
    title: "Case Studies",
    icon: FileText,
    summary: "16 real A-SAFE case studies from Nissan, BMW, DSV, Heathrow, Coca-Cola and more.",
    route: "/case-studies",
    sections: [
      {
        heading: "Filtering & sharing",
        body:
          "Filter by industry (Automotive, Warehousing, Food & Beverage, Airports, etc.), search by keyword, or pick by content type (document / video). Click View Case Study to open the full page on A-SAFE's website; use the Share dropdown to send via email or WhatsApp with the real URL pre-filled.",
      },
      {
        heading: "Using case studies in quotes",
        body:
          "From the cart, click Select Case Study References to pick up to 5 that match the customer's industry — they auto-embed in the Order Form PDF as social proof.",
      },
    ],
  },

  // ─── Resources ───────────────────────────────────────────────────
  {
    id: "resources",
    title: "Resources Library",
    icon: BookMarked,
    summary: "48 resources: installation videos, datasheets, certificates, industry guides, virtual tours.",
    route: "/resources",
    sections: [
      {
        heading: "What's inside",
        body:
          "26 product installation YouTube videos, 2 curated playlists (PAS 13 series, Discovery videos), 7 technical datasheets, 3 compliance certificates (PAS 13, ISO 9001, ISO 14001), 6 industry application guides, and 2 virtual tours (A-SAFE factory, product space).",
      },
      {
        heading: "Best practices",
        body: "",
        tips: [
          "Send customers the Installation Video link for the exact product they're buying — builds confidence before purchase.",
          "Attach the PAS 13 certificate to procurement-heavy quotes to answer compliance questions upfront.",
          "Use the Virtual Factory Tour as an icebreaker on first meetings.",
        ],
      },
    ],
  },

  // ─── Calculations History ────────────────────────────────────────
  {
    id: "calculations-history",
    title: "Calculations History",
    icon: History,
    summary: "Every impact calculation you've run, saved automatically.",
    route: "/calculations-history",
    sections: [
      {
        heading: "Purpose",
        body:
          "Every time you click Calculate in the Impact Calculator, the inputs and results are saved here. Reopen past calculations to re-run scenarios or link them to new quotes.",
      },
    ],
  },

  // ─── Communication Plan ──────────────────────────────────────────
  {
    id: "communication-plan",
    title: "Communication Plan",
    icon: MessageCircle,
    summary: "Pre-written follow-up messages you can edit and send directly.",
    route: "/communication-plan",
    sections: [
      {
        heading: "How it works",
        body:
          "Pick a template (Follow-up, Site Visit Scheduled, Proposal Sent, Check-in, Won/Lost), customize the placeholders, choose Email or WhatsApp, and click Send — the message opens in your default mail client or WhatsApp Web with everything pre-filled.",
      },
      {
        heading: "Tip",
        body: "",
        tips: [
          "Templates include variables like {{customerName}} and {{productName}} — fill them in before sending.",
          "Recent Activity shows messages you've prepared so nothing falls through the cracks.",
        ],
      },
    ],
  },

  // ─── Installation Timeline ───────────────────────────────────────
  {
    id: "installation-timeline",
    title: "Installation Timeline",
    icon: Calendar,
    summary: "Track where each order is in the pipeline: survey → quote → approval → delivery → install → sign-off.",
    route: "/installation-timeline",
    sections: [
      {
        heading: "Purpose",
        body:
          "See all active projects and their phase breakdown. Use this as a pipeline view to know what needs attention.",
      },
    ],
  },

  // ─── Profile ─────────────────────────────────────────────────────
  {
    id: "profile",
    title: "Your Profile",
    icon: User,
    summary: "Update your details, avatar, and contact info.",
    route: "/profile",
    sections: [
      {
        heading: "What to update on day one",
        body: "",
        steps: [
          "Change your starter password (ask admin for the current rotation).",
          "Upload a profile photo — it appears on the Order Form PDF as the sales rep picture.",
          "Verify your job title, phone number, and office address.",
          "Confirm your region-appropriate email (e.g. @asafe.ae for UAE, @asafe.sa for Saudi).",
        ],
      },
    ],
  },
];

export default function Help() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTopicId, setActiveTopicId] = useState<string>("getting-started");

  const filteredTopics = useMemo(() => {
    if (!searchTerm.trim()) return HELP_TOPICS;
    const q = searchTerm.toLowerCase();
    return HELP_TOPICS.filter((t) =>
      t.title.toLowerCase().includes(q) ||
      t.summary.toLowerCase().includes(q) ||
      t.sections.some((s) =>
        s.heading.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q) ||
        (s.steps || []).some((step) => step.toLowerCase().includes(q)) ||
        (s.tips || []).some((tip) => tip.toLowerCase().includes(q)),
      ),
    );
  }, [searchTerm]);

  const activeTopic = HELP_TOPICS.find((t) => t.id === activeTopicId) || HELP_TOPICS[0];
  const ActiveIcon = activeTopic.icon;

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Hero */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Help Center</h1>
            <Badge variant="secondary" className="ml-2">
              New user friendly
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-3xl">
            Learn how to use every section of A-SAFE ENGAGE. Start with{" "}
            <button
              onClick={() => setActiveTopicId("getting-started")}
              className="text-primary underline underline-offset-2 hover:opacity-80"
            >
              Getting Started
            </button>{" "}
            for a 5-minute walkthrough, or search for a specific topic below.
          </p>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search: calculator, cart, site survey, PAS 13, variants…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            data-testid="help-search"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Topic list */}
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm uppercase tracking-wide text-muted-foreground">
                  Topics ({filteredTopics.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <nav className="flex flex-col gap-1">
                  {filteredTopics.map((topic) => {
                    const Icon = topic.icon;
                    const isActive = topic.id === activeTopicId;
                    return (
                      <button
                        key={topic.id}
                        onClick={() => setActiveTopicId(topic.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                          isActive
                            ? "bg-primary text-primary-foreground font-medium"
                            : "hover:bg-muted text-foreground"
                        }`}
                        data-testid={`help-topic-${topic.id}`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{topic.title}</span>
                        {isActive && <ChevronRight className="h-4 w-4 ml-auto flex-shrink-0" />}
                      </button>
                    );
                  })}
                  {filteredTopics.length === 0 && (
                    <p className="text-sm text-muted-foreground p-2">
                      No topics match "{searchTerm}".
                    </p>
                  )}
                </nav>
              </CardContent>
            </Card>

            {/* Still need help */}
            <Card className="mt-4 bg-primary/10 border-primary/30">
              <CardContent className="p-4">
                <h3 className="font-semibold text-sm mb-1 flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" />
                  Still stuck?
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Reach out for a 1:1 walk-through.
                </p>
                <div className="flex flex-col gap-2">
                  <Link href="/contact">
                    <Button size="sm" variant="secondary" className="w-full justify-start">
                      <MessageCircle className="h-3 w-3 mr-2" />
                      Contact support
                    </Button>
                  </Link>
                  <Link href="/faqs">
                    <Button size="sm" variant="ghost" className="w-full justify-start">
                      <FileText className="h-3 w-3 mr-2" />
                      Browse FAQs
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </aside>

          {/* Content */}
          <main className="min-w-0">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <ActiveIcon className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <CardTitle className="text-2xl">{activeTopic.title}</CardTitle>
                    <CardDescription className="mt-1 text-base">{activeTopic.summary}</CardDescription>
                  </div>
                  {activeTopic.route && (
                    <Link href={activeTopic.route}>
                      <Button size="sm" className="bg-primary text-primary-foreground hover:opacity-90">
                        Open
                        <ArrowRight className="h-3 w-3 ml-2" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                {activeTopic.sections.map((section, idx) => (
                  <section key={idx} className="space-y-3" data-testid={`help-section-${activeTopic.id}-${idx}`}>
                    <h2 className="text-xl font-semibold flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                        {idx + 1}
                      </span>
                      {section.heading}
                    </h2>
                    {section.body && <p className="text-muted-foreground leading-relaxed">{section.body}</p>}

                    {section.steps && section.steps.length > 0 && (
                      <ol className="space-y-2 ml-8 list-decimal marker:text-primary marker:font-semibold">
                        {section.steps.map((step, sIdx) => (
                          <li key={sIdx} className="text-sm leading-relaxed pl-1">
                            {step}
                          </li>
                        ))}
                      </ol>
                    )}

                    {section.tips && section.tips.length > 0 && (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-1">
                          <Lightbulb className="h-4 w-4 text-primary" />
                          Pro tips
                        </h3>
                        <ul className="space-y-1.5">
                          {section.tips.map((tip, tIdx) => (
                            <li key={tIdx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                              <span>{tip}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {section.warnings && section.warnings.length > 0 && (
                      <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 space-y-2">
                        <h3 className="text-sm font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-orange-500" />
                          Watch out
                        </h3>
                        <ul className="space-y-1.5">
                          {section.warnings.map((warn, wIdx) => (
                            <li key={wIdx} className="text-sm text-muted-foreground flex items-start gap-2">
                              <Info className="h-3.5 w-3.5 text-orange-500 mt-0.5 flex-shrink-0" />
                              <span>{warn}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                ))}

                {/* Next topic nav */}
                <div className="border-t pt-6 flex items-center justify-between">
                  {(() => {
                    const idx = HELP_TOPICS.findIndex((t) => t.id === activeTopic.id);
                    const prev = idx > 0 ? HELP_TOPICS[idx - 1] : null;
                    const next = idx < HELP_TOPICS.length - 1 ? HELP_TOPICS[idx + 1] : null;
                    return (
                      <>
                        {prev ? (
                          <button
                            onClick={() => setActiveTopicId(prev.id)}
                            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            <ChevronRight className="h-4 w-4 rotate-180" />
                            <span className="flex flex-col items-start">
                              <span className="text-xs">Previous</span>
                              <span className="font-medium">{prev.title}</span>
                            </span>
                          </button>
                        ) : (
                          <span />
                        )}
                        {next && (
                          <button
                            onClick={() => setActiveTopicId(next.id)}
                            className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1 text-right"
                          >
                            <span className="flex flex-col items-end">
                              <span className="text-xs">Next up</span>
                              <span className="font-medium">{next.title}</span>
                            </span>
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>

            {/* Quick links grid */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Download className="h-5 w-5" />
                  Quick-jump to any section
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {HELP_TOPICS.map((topic) => {
                    const Icon = topic.icon;
                    return (
                      <button
                        key={topic.id}
                        onClick={() => {
                          setActiveTopicId(topic.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="flex items-center gap-2 p-3 rounded-md text-sm text-left border hover:border-primary hover:bg-primary/5 transition-colors"
                      >
                        <Icon className="h-4 w-4 text-primary flex-shrink-0" />
                        <span className="truncate">{topic.title}</span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    </div>
  );
}
