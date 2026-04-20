import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, Mail, MessageSquare, Send, Calendar, 
  ClipboardCheck, Calculator, Clock, ArrowRight,
  Building2, User, MapPin, Wrench, HeadphonesIcon,
  CheckCircle, AlertCircle, FileDown, Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { consultativeTemplates, getAllTemplates, workflowStages } from "@/data/consultativeTemplates";

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: any;
  link?: string;
  action?: () => void;
  color: string;
}

export default function CommunicationPlan() {
  const { toast } = useToast();
  const [selectedChannel, setSelectedChannel] = useState<'email' | 'whatsapp'>('email');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customMessage, setCustomMessage] = useState('');
  const [templateVariables, setTemplateVariables] = useState<Record<string, string>>({});
  const [recipientDetails, setRecipientDetails] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
  });

  // Get quote requests and orders for recent activity
  const { data: quoteRequests = [] } = useQuery<any[]>({
    queryKey: ['/api/quote-requests'],
  });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ['/api/orders'],
  });

  // Get all templates
  const templates = getAllTemplates();

  // Quick actions for same-day tasks
  const quickActions: QuickAction[] = [
    {
      id: 'site-survey',
      title: 'Create Site Survey',
      description: 'Build a new safety survey',
      icon: ClipboardCheck,
      link: '/site-survey',
      color: 'bg-blue-500',
    },
    {
      id: 'impact-calc',
      title: 'Impact Calculator',
      description: 'Calculate safety requirements',
      icon: Calculator,
      link: '/impact-calculator',
      color: 'bg-green-500',
    },
    {
      id: 'generate-quote',
      title: 'Generate Quote',
      description: 'Create a new quote',
      icon: FileText,
      link: '/orders',
      color: 'bg-purple-500',
    },
    {
      id: 'send-assessment',
      title: 'Send Assessment',
      description: 'Email site assessment',
      icon: Send,
      action: () => setSelectedTemplate('post_site_visit.site_assessment_delivery'),
      color: 'bg-orange-500',
    },
  ];

  // Recent customer activities
  const recentActivities = [
    ...quoteRequests.slice(0, 3).map((quote: any) => ({
      id: quote.id,
      type: 'quote',
      customer: quote.customerName,
      company: quote.customerCompany,
      action: 'Requested quote',
      date: new Date(quote.createdAt).toLocaleDateString(),
      status: 'pending',
    })),
    ...orders.slice(0, 3).map((order: any) => ({
      id: order.id,
      type: 'order',
      customer: order.customerName,
      company: order.customerCompany,
      action: 'Placed order',
      date: new Date(order.createdAt).toLocaleDateString(),
      status: order.status,
    })),
  ].slice(0, 5);

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      const content = template.template[selectedChannel]?.content || template.template[selectedChannel];
      setCustomMessage(content);
      
      // Extract variables from template
      const variables = content.match(/{{(\w+)}}/g) || [];
      const uniqueVars = Array.from(new Set(variables.map((v: string) => v.replace(/[{}]/g, ''))));
      const defaultVars: Record<string, string> = {};
      uniqueVars.forEach(v => {
        defaultVars[v] = '';
      });
      setTemplateVariables(defaultVars);
    }
  };

  const replaceTemplateVariables = (text: string) => {
    let result = text;
    Object.entries(templateVariables).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || `{{${key}}}`);
    });
    return result;
  };

  const handleSendMessage = () => {
    if (!recipientDetails.email && !recipientDetails.phone) {
      toast({
        title: "Error",
        description: "Please provide either email or phone number",
        variant: "destructive",
      });
      return;
    }

    const finalMessage = replaceTemplateVariables(customMessage);
    const subject = `A-SAFE — ${recipientDetails.name ? `Hi ${recipientDetails.name}` : "Follow-up"}`;

    // Actually open the user's email client or WhatsApp so the message is sent.
    if (selectedChannel === "email" && recipientDetails.email) {
      const url =
        `mailto:${encodeURIComponent(recipientDetails.email)}` +
        `?subject=${encodeURIComponent(subject)}` +
        `&body=${encodeURIComponent(finalMessage)}`;
      window.open(url, "_blank");
    } else if (selectedChannel === "whatsapp" && recipientDetails.phone) {
      const phone = recipientDetails.phone.replace(/[^0-9]/g, "");
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(finalMessage)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      toast({
        title: "Missing Contact",
        description:
          selectedChannel === "email"
            ? "An email address is required to open the email client."
            : "A phone number is required to open WhatsApp.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Opening " + (selectedChannel === "email" ? "email client" : "WhatsApp"),
      description: `Message drafted for ${recipientDetails.name || "recipient"}. Review and send from the opened window.`,
    });

    // Reset form
    setCustomMessage("");
    setRecipientDetails({ name: '', email: '', phone: '', company: '' });
    setTemplateVariables({});
    setSelectedTemplate('');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-[#FFC72C]">Pre-Sales Enablement</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Quick tools for same-day surveys, assessments, and quotes
          </p>
        </div>
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
          <Zap className="h-4 w-4 mr-1" />
          Consultative Advisor Mode
        </Badge>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-[#FFC72C]" />
            Quick Actions
          </CardTitle>
          <CardDescription>Same-day tools for post-meeting follow-up</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <div key={action.id}>
                {action.link ? (
                  <Link href={action.link}>
                    <Button
                      variant="outline"
                      className="w-full h-24 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <div className={`p-2 rounded-lg ${action.color} text-white`}>
                        <action.icon className="h-5 w-5" />
                      </div>
                      <div className="text-center">
                        <div className="font-semibold text-sm">{action.title}</div>
                        <div className="text-xs text-gray-500">{action.description}</div>
                      </div>
                    </Button>
                  </Link>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-24 flex flex-col items-center justify-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800"
                    onClick={action.action}
                  >
                    <div className={`p-2 rounded-lg ${action.color} text-white`}>
                      <action.icon className="h-5 w-5" />
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-sm">{action.title}</div>
                      <div className="text-xs text-gray-500">{action.description}</div>
                    </div>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Message Composer */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Message Composer</CardTitle>
              <CardDescription>Send follow-up messages to customers</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Channel Selection */}
              <Tabs value={selectedChannel} onValueChange={(v) => setSelectedChannel(v as 'email' | 'whatsapp')}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="email">
                    <Mail className="h-4 w-4 mr-2" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger value="whatsapp">
                    <MessageSquare className="h-4 w-4 mr-2" />
                    WhatsApp
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={selectedChannel} className="space-y-4">
                  {/* Template Selection */}
                  <div>
                    <Label>Message Template</Label>
                    <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template..." />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((template) => (
                          <SelectItem key={template.id} value={template.id}>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {template.category}
                              </Badge>
                              <span>{template.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Recipient Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Contact Name</Label>
                      <Input
                        value={recipientDetails.name}
                        onChange={(e) => setRecipientDetails({...recipientDetails, name: e.target.value})}
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <Label>Company</Label>
                      <Input
                        value={recipientDetails.company}
                        onChange={(e) => setRecipientDetails({...recipientDetails, company: e.target.value})}
                        placeholder="ABC Logistics"
                      />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={recipientDetails.email}
                        onChange={(e) => setRecipientDetails({...recipientDetails, email: e.target.value})}
                        placeholder="john@example.com"
                      />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input
                        value={recipientDetails.phone}
                        onChange={(e) => setRecipientDetails({...recipientDetails, phone: e.target.value})}
                        placeholder="+971 50 123 4567"
                      />
                    </div>
                  </div>

                  {/* Template Variables */}
                  {Object.keys(templateVariables).length > 0 && (
                    <div className="space-y-2">
                      <Label>Template Variables</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {Object.keys(templateVariables).map((variable) => (
                          <div key={variable}>
                            <Label className="text-xs text-gray-500">{variable}</Label>
                            <Input
                              value={templateVariables[variable]}
                              onChange={(e) => setTemplateVariables({
                                ...templateVariables,
                                [variable]: e.target.value
                              })}
                              placeholder={`Enter ${variable}`}
                              className="h-8"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Message Content */}
                  <div>
                    <Label>Message Content</Label>
                    <Textarea
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Type your message or select a template..."
                      className="min-h-[200px]"
                    />
                  </div>

                  {/* Send Button */}
                  <Button 
                    onClick={handleSendMessage} 
                    className="w-full bg-[#FFC72C] hover:bg-[#FFB300] text-black"
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Prepare Message
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Workflow Stages */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow Stages</CardTitle>
              <CardDescription>Simplified pre-sales process</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {workflowStages.map((stage, index) => (
                  <div key={stage.id} className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        index === 0 ? 'bg-[#FFC72C] text-black' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                      }`}>
                        {index + 1}
                      </div>
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold">{stage.name}</h4>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{stage.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="h-3 w-3 text-gray-400" />
                        <span className="text-xs text-gray-500">{stage.timing}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {stage.actions.map((action) => (
                          <Badge key={action} variant="secondary" className="text-xs">
                            {action}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {index < workflowStages.length - 1 && (
                      <ArrowRight className="h-4 w-4 text-gray-400 mt-3" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Recent Activities */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent Activities</CardTitle>
              <CardDescription>Latest customer interactions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivities.length > 0 ? (
                  recentActivities.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                      <div className={`p-2 rounded-lg ${
                        activity.type === 'quote' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-green-100 dark:bg-green-900'
                      }`}>
                        {activity.type === 'quote' ? (
                          <FileText className="h-4 w-4 text-blue-600 dark:text-blue-300" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{activity.customer}</p>
                        <p className="text-xs text-gray-500 truncate">{activity.company}</p>
                        <p className="text-xs text-gray-400 mt-1">{activity.action} • {activity.date}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500">No recent activities</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Helpful Resources */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resources</CardTitle>
              <CardDescription>Quick access to tools</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Link href="/products">
                  <Button variant="ghost" className="w-full justify-start">
                    <Building2 className="h-4 w-4 mr-2" />
                    Product Catalog
                  </Button>
                </Link>
                <Link href="/resources">
                  <Button variant="ghost" className="w-full justify-start">
                    <FileDown className="h-4 w-4 mr-2" />
                    Technical Resources
                  </Button>
                </Link>
                <Link href="/case-studies">
                  <Button variant="ghost" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2" />
                    Case Studies
                  </Button>
                </Link>
                <Link href="/admin">
                  <Button variant="ghost" className="w-full justify-start">
                    <Wrench className="h-4 w-4 mr-2" />
                    Admin Panel
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* Support */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Need Help?</CardTitle>
              <CardDescription>Technical support</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <HeadphonesIcon className="h-4 w-4 text-gray-400" />
                  <span>support@asafe-engage.com</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                  <span>+971 4 123 4567</span>
                </div>
                <Button variant="outline" className="w-full mt-3">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Report Issue
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}