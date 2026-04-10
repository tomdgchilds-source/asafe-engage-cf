import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import { InfoPopover } from "@/components/ui/info-popover";
import { useQuery } from "@tanstack/react-query";
import type { Faq } from "@shared/schema";

interface FAQSectionProps {
  selectedCategory?: string;
  onCategoryChange?: (category: string) => void;
}

export function FAQSection({ selectedCategory, onCategoryChange }: FAQSectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const { data: faqs, isLoading } = useQuery({
    queryKey: ["/api/faqs", selectedCategory],
  });

  const toggleExpanded = (faqId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(faqId)) {
      newExpanded.delete(faqId);
    } else {
      newExpanded.add(faqId);
    }
    setExpandedItems(newExpanded);
  };

  const filteredFaqs = faqs?.filter((faq: Faq) =>
    faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
    faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const categories = Array.from(new Set(faqs?.map((faq: Faq) => faq.category).filter(Boolean))) || [];

  if (isLoading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-500 dark:text-gray-400">Loading FAQs...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-2 mb-4">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Frequently Asked Questions</h2>
          <InfoPopover
            content="Find answers to common questions about A-SAFE products and services"
            iconClassName="h-5 w-5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 cursor-pointer"
          />
        </div>
      </div>

      {/* Search and Filters */}
      <div className="mb-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 h-4 w-4" />
          <Input
            placeholder="Search FAQs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 focus:ring-yellow-400 focus:border-yellow-400"
            data-testid="search-faqs"
          />
        </div>

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant={!selectedCategory ? "default" : "outline"}
              size="sm"
              onClick={() => onCategoryChange?.("")}
              className={!selectedCategory ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}
              data-testid="filter-all-categories"
            >
              All Categories
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                size="sm"
                onClick={() => onCategoryChange?.(category)}
                className={selectedCategory === category ? "bg-yellow-400 text-black hover:bg-yellow-500" : ""}
                data-testid={`filter-category-${category}`}
              >
                {category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* FAQ Items */}
      <div className="space-y-4">
        {filteredFaqs.length === 0 ? (
          <Card>
            <CardContent className="text-center py-8">
              <p className="text-gray-500">
                {searchTerm || selectedCategory 
                  ? "No FAQs match your search criteria." 
                  : "No FAQs available at the moment."
                }
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredFaqs.map((faq: Faq) => {
            const isExpanded = expandedItems.has(faq.id);
            return (
              <Card key={faq.id} className="border hover:shadow-md transition-shadow" data-testid={`faq-item-${faq.id}`}>
                <CardContent className="p-0">
                  <Button
                    variant="ghost"
                    className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-800 justify-between h-auto"
                    onClick={() => toggleExpanded(faq.id)}
                    data-testid={`faq-toggle-${faq.id}`}
                  >
                    <div className="flex-1 pr-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-black dark:text-white text-left" data-testid={`faq-question-${faq.id}`}>
                            {faq.question}
                          </h3>
                          {faq.category && (
                            <Badge variant="secondary" className="mt-2 text-xs">
                              {faq.category.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gray-500 shrink-0" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gray-500 shrink-0" />
                    )}
                  </Button>
                  
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t bg-gray-50 dark:bg-gray-800" data-testid={`faq-answer-${faq.id}`}>
                      <div className="pt-4">
                        <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{faq.answer}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Contact Support */}
      <Card className="mt-8 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
        <CardContent className="p-6 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <h3 className="font-bold text-black dark:text-white">Still have questions?</h3>
            <InfoPopover
              content="Our technical support team is here to help with any specific questions about A-SAFE products."
              iconClassName="h-4 w-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 cursor-pointer"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild className="bg-black text-white hover:bg-gray-800">
              <a href="mailto:support@asafe.ae">Email Support</a>
            </Button>
            <Button asChild variant="outline">
              <a href="https://wa.me/971503881285" target="_blank" rel="noopener noreferrer">
                WhatsApp Support
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
