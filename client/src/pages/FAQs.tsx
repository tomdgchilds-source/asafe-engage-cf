import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Search, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp,
  Shield,
  Settings,
  Wrench,
  Building,
  TrendingUp,
  Users,
  Zap,
  Smartphone,
  Info,
  Share2,
  Mail,
  MessageCircle,
  FileText,
  Download,
  ExternalLink
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FAQS, FAQ_CATEGORIES, INTERNAL_FAQ_CATEGORIES, type FaqEntry } from "@shared/faqContent";
import { useToast } from "@/hooks/use-toast";
import { InfoPopover } from "@/components/ui/info-popover";
interface CategoryConfig {
  title: string;
  description: string;
  icon: any;
  color: string;
}

const CATEGORY_ICONS: Record<string, CategoryConfig["icon"]> = {
  "product-technology": Zap,
  "safety-performance": Shield,
  "installation-planning": Settings,
  "maintenance-durability": Wrench,
  "applications-industries": Building,
  "flexibility-customization": Users,
  "business-roi": TrendingUp,
  "assessment-support": Info,
  "app-usage-platform": Smartphone,
};

const CATEGORY_COLORS: Record<string, string> = {
  "product-technology": "bg-blue-100 text-blue-800",
  "safety-performance": "bg-green-100 text-green-800",
  "installation-planning": "bg-purple-100 text-purple-800",
  "maintenance-durability": "bg-orange-100 text-orange-800",
  "applications-industries": "bg-indigo-100 text-indigo-800",
  "flexibility-customization": "bg-pink-100 text-pink-800",
  "business-roi": "bg-yellow-100 text-yellow-800",
  "assessment-support": "bg-gray-100 text-gray-800",
  "app-usage-platform": "bg-teal-100 text-teal-800",
};

export default function FAQs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const { toast } = useToast();

  const [onlyExpanded, setOnlyExpanded] = useState(false);
  const categories: Record<string, CategoryConfig> = Object.fromEntries(
    FAQ_CATEGORIES.map((c) => [
      c.key,
      {
        title: c.title,
        description: c.description,
        icon: CATEGORY_ICONS[c.key] ?? HelpCircle,
        color: CATEGORY_COLORS[c.key] ?? "bg-gray-100 text-gray-800",
      },
    ]),
  );

  // Canonical content lives in shared/faqContent.ts so the server-rendered
  // FAQ sheet PDF and this page never drift apart.
  const faqs: readonly FaqEntry[] = FAQS;

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };


  const filteredFAQs = faqs.filter((faq) => {
    const matchesSearch = !searchTerm || 
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = !selectedCategory || faq.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const categorizedFAQs = Object.keys(categories).map(categoryKey => ({
    key: categoryKey,
    config: categories[categoryKey],
    faqs: filteredFAQs.filter(faq => faq.category === categoryKey)
  })).filter(category => category.faqs.length > 0);

  // ─── Branded FAQ sheet (rendered server-side) ─────────────────────────────
  // GET /api/faqs/documents/faq-sheet.pdf?category=&ids=  — `ids` wins over
  // `category`; neither = every customer-facing category. The page mirrors
  // its own filters: expanded-only selection > search results > category.

  const expandedVisibleIds = filteredFAQs
    .filter((faq) => expandedItems.has(faqs.indexOf(faq)))
    .map((faq) => faq.id);
  const useExpandedOnly = onlyExpanded && expandedVisibleIds.length > 0;

  const pdfSelection: { ids?: string[]; category?: string; count: number } = useExpandedOnly
    ? { ids: expandedVisibleIds, count: expandedVisibleIds.length }
    : searchTerm.trim()
      ? { ids: filteredFAQs.map((f) => f.id), count: filteredFAQs.length }
      : selectedCategory
        ? { category: selectedCategory, count: filteredFAQs.length }
        : { count: faqs.filter((f) => !INTERNAL_FAQ_CATEGORIES.includes(f.category)).length };

  const pdfScopeLabel = useExpandedOnly
    ? "you have expanded"
    : searchTerm.trim()
      ? `matching "${searchTerm.trim()}"`
      : selectedCategory
        ? `in ${categories[selectedCategory]?.title ?? selectedCategory}`
        : "across all customer categories";

  const faqSheetUrl = (mode: "inline" | "download"): string => {
    const params = new URLSearchParams();
    if (pdfSelection.ids) params.set("ids", pdfSelection.ids.join(","));
    else if (pdfSelection.category) params.set("category", pdfSelection.category);
    if (mode === "download") params.set("download", "1");
    const qs = params.toString();
    return `/api/faqs/documents/faq-sheet.pdf${qs ? `?${qs}` : ""}`;
  };
  const absoluteFaqSheetUrl = (): string => `${window.location.origin}${faqSheetUrl("inline")}`;

  const triggerDownload = () => {
    const link = document.createElement("a");
    link.href = faqSheetUrl("download");
    link.download = "A-SAFE_FAQs.pdf";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const guardSelection = (): boolean => {
    if (pdfSelection.count > 0) return true;
    toast({
      title: "Nothing to share",
      description: "No questions match the current filters. Clear them and try again.",
      variant: "destructive",
    });
    return false;
  };

  const countLabel = `${pdfSelection.count} ${pdfSelection.count === 1 ? "question" : "questions"}`;

  const handlePDFPreview = () => {
    if (!guardSelection()) return;
    window.open(faqSheetUrl("inline"), "_blank", "noopener");
    setShareDialogOpen(false);
  };

  const handlePDFDownload = () => {
    if (!guardSelection()) return;
    triggerDownload();
    toast({ title: "PDF download started", description: `${countLabel} in the A-SAFE FAQ sheet.` });
    setShareDialogOpen(false);
  };

  const handleEmailShare = () => {
    if (!guardSelection()) return;
    const subject = encodeURIComponent("A-SAFE Frequently Asked Questions");
    const bodyText = encodeURIComponent(
      `Hello,\n\nPlease find the A-SAFE Frequently Asked Questions sheet here:\n${absoluteFaqSheetUrl()}\n\nFor more information, visit www.asafe.com or contact us on +971 4 884 2422.\n\nBest regards,\nA-SAFE Team`,
    );
    triggerDownload();
    window.setTimeout(() => window.open(`mailto:?subject=${subject}&body=${bodyText}`, "_blank"), 500);
    toast({
      title: "PDF downloaded",
      description: "Attach it to the email that opens, or send the link already in the message.",
    });
    setShareDialogOpen(false);
  };

  const handleWhatsAppShare = () => {
    if (!guardSelection()) return;
    const message = encodeURIComponent(
      `Hello! Here are the A-SAFE Frequently Asked Questions (${countLabel}):\n${absoluteFaqSheetUrl()}\n\nFor more information: www.asafe.com`,
    );
    window.open(`https://wa.me/?text=${message}`, "_blank", "noopener");
    setShareDialogOpen(false);
  };


  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <h1 className="text-3xl font-bold text-black" data-testid="faqs-title">
              Frequently Asked Questions
            </h1>
            <InfoPopover
              content="Find answers to common questions about A-SAFE barrier systems, installation, and safety solutions."
              iconClassName="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-pointer"
            />
          </div>
          
          {/* Share Button */}
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
            <DialogTrigger asChild>
              <Button 
                className="bg-[#FFC72C] hover:bg-[#FFB300] text-black font-semibold"
                data-testid="share-faqs-button"
              >
                <Share2 className="h-4 w-4 mr-2" />
                Share FAQs
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="text-xl font-bold">Share FAQs</DialogTitle>
                <DialogDescription>
                  Choose how you'd like to share the A-SAFE FAQs document
                </DialogDescription>
              </DialogHeader>

              {/* What the sheet will contain: mirrors the on-screen filters */}
              <div className="rounded-md border border-gray-200 p-3 text-sm space-y-2" data-testid="share-scope">
                <p className="text-gray-700">
                  Includes <span className="font-semibold">{countLabel}</span> {pdfScopeLabel}
                </p>
                {expandedVisibleIds.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer text-gray-700">
                    <Checkbox
                      checked={onlyExpanded}
                      onCheckedChange={(v) => setOnlyExpanded(v === true)}
                      data-testid="share-only-expanded"
                    />
                    <span>
                      Only the {expandedVisibleIds.length} {expandedVisibleIds.length === 1 ? "question" : "questions"} I've expanded
                    </span>
                  </label>
                )}
              </div>

              <div className="grid gap-4 py-4">
                {/* Preview Option */}
                <Button
                  onClick={handlePDFPreview}
                  variant="outline"
                  className="w-full justify-start hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  data-testid="preview-pdf-button"
                >
                  <ExternalLink className="h-5 w-5 mr-3 text-gray-600" />
                  <div className="text-left">
                    <div className="font-semibold">Preview PDF</div>
                    <div className="text-xs text-gray-500">Open the FAQ sheet in a new tab</div>
                  </div>
                </Button>

                {/* Email Option */}
                <Button
                  onClick={handleEmailShare}
                  variant="outline"
                  className="w-full justify-start hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  data-testid="share-email-button"
                >
                  <Mail className="h-5 w-5 mr-3 text-blue-600" />
                  <div className="text-left">
                    <div className="font-semibold">Share via Email</div>
                    <div className="text-xs text-gray-500">Download the PDF and open an email with the link</div>
                  </div>
                </Button>
                
                {/* WhatsApp Option */}
                <Button
                  onClick={handleWhatsAppShare}
                  variant="outline"
                  className="w-full justify-start hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  data-testid="share-whatsapp-button"
                >
                  <MessageCircle className="h-5 w-5 mr-3 text-green-600" />
                  <div className="text-left">
                    <div className="font-semibold">Share via WhatsApp</div>
                    <div className="text-xs text-gray-500">Send a link to the PDF on WhatsApp</div>
                  </div>
                </Button>
                
                {/* Download Option */}
                <Button
                  onClick={handlePDFDownload}
                  variant="outline"
                  className="w-full justify-start hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                  data-testid="download-pdf-button"
                >
                  <Download className="h-5 w-5 mr-3 text-[#FFC72C]" />
                  <div className="text-left">
                    <div className="font-semibold">Download PDF</div>
                    <div className="text-xs text-gray-500">Save FAQs document to your device</div>
                  </div>
                </Button>
              </div>
              
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div className="text-gray-700 dark:text-gray-300">
                    <p className="font-semibold mb-1">Professional PDF Document</p>
                    <p className="text-xs">A branded A4 sheet rendered by A-SAFE Engage, organised by category, with a link you can share directly.</p>
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Search and Filters */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search FAQs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search questions and answers..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 focus:ring-yellow-400 focus:border-yellow-400"
                  data-testid="search-faqs"
                />
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                }}
                data-testid="clear-filters"
              >
                Clear Filters
              </Button>
            </div>

            {/* Category Filter Badges */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === "" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory("")}
                className={selectedCategory === "" ? "bg-yellow-400 hover:bg-yellow-500" : ""}
                data-testid="category-all"
              >
                All Categories
              </Button>
              {Object.entries(categories).map(([key, config]) => {
                const Icon = config.icon;
                const hasResults = faqs.filter(faq => faq.category === key).some(faq =>
                  !searchTerm || 
                  faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
                  faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
                );
                
                return (
                  <Button
                    key={key}
                    variant={selectedCategory === key ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(key)}
                    disabled={!hasResults}
                    className={`${selectedCategory === key ? "bg-yellow-400 hover:bg-yellow-500" : ""} ${!hasResults ? "opacity-50" : ""}`}
                    data-testid={`category-${key}`}
                  >
                    <Icon className="h-3 w-3 mr-1" />
                    {config.title}
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* FAQ Results Count */}
        <div className="mb-6">
          <p className="text-sm text-gray-600">
            Showing {filteredFAQs.length} {filteredFAQs.length === 1 ? 'question' : 'questions'}
            {searchTerm && ` matching "${searchTerm}"`}
            {selectedCategory && ` in ${categories[selectedCategory].title}`}
          </p>
        </div>

        {/* FAQ Categories */}
        {categorizedFAQs.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <HelpCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800 mb-2">No FAQs Found</h3>
              <p className="text-gray-600 mb-4">
                No questions match your current search. Try different keywords or clear your filters.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");
                  setSelectedCategory("");
                }}
              >
                Show All FAQs
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {categorizedFAQs.map(({ key, config, faqs: categoryFAQs }) => {
              const Icon = config.icon;
              return (
                <div key={key} className="space-y-4">
                  {/* Category Header */}
                  <Card className="border-l-4 border-l-yellow-400">
                    <CardHeader className="pb-3">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div className={`p-2 rounded-lg ${config.color}`}>
                            <Icon className="h-5 w-5" />
                          </div>
                        </div>
                        <div className="flex-1">
                          <h2 className="text-xl font-bold text-black mb-1">
                            {config.title}
                          </h2>
                          <p className="text-sm text-gray-600">
                            {config.description}
                          </p>
                          <Badge className="mt-2 bg-[#FFC72C] dark:bg-[#FFC72C] text-black dark:text-black border-0 font-semibold">
                            {categoryFAQs.length} {categoryFAQs.length === 1 ? 'question' : 'questions'}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>

                  {/* Category FAQs */}
                  <div className="space-y-3 ml-4">
                    {categoryFAQs.map((faq, index) => {
                      const faqIndex = faqs.indexOf(faq);
                      const isExpanded = expandedItems.has(faqIndex);
                      
                      return (
                        <Card key={faqIndex} className="hover:shadow-md transition-shadow">
                          <CardHeader 
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors pb-3"
                            onClick={() => toggleExpanded(faqIndex)}
                            data-testid={`faq-question-${faqIndex}`}
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex-shrink-0 mt-1">
                                <HelpCircle className="h-4 w-4 text-yellow-500" />
                              </div>
                              <div className="flex-1">
                                <h3 className="font-semibold text-black text-left leading-relaxed">
                                  {faq.question}
                                </h3>
                              </div>
                              <div className="flex-shrink-0">
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-gray-500" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-gray-500" />
                                )}
                              </div>
                            </div>
                          </CardHeader>
                          
                          {isExpanded && (
                            <CardContent className="pt-0 pl-10">
                              <div className="border-l-2 border-gray-200 pl-4">
                                <p className="text-gray-700 text-sm leading-relaxed" data-testid={`faq-answer-${faqIndex}`}>
                                  {faq.answer}
                                </p>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Contact CTA */}
        <Card className="mt-8 bg-yellow-50 border-yellow-200">
          <CardContent className="p-6 text-center">
            <HelpCircle className="h-8 w-8 text-yellow-600 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-black mb-2">
              Still have questions?
            </h3>
            <p className="text-gray-600 mb-4">
              Can't find the answer you're looking for? Our experts are here to help with personalized guidance.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button asChild className="bg-yellow-400 hover:bg-yellow-500 text-black">
                <a href="/contact">Contact Our Experts</a>
              </Button>
              <Button variant="outline" asChild>
                <a 
                  href="https://wa.me/971503881285?text=Hello%20A-SAFE%20team%2C%0A%0AI%20have%20a%20question%20about%20A-SAFE%20products%20and%20would%20like%20to%20speak%20with%20an%20expert.%0A%0APlease%20provide%20information%20about%3A%0A%0A%0A%0AThank%20you%20for%20your%20assistance."
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp Support
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}