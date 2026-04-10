import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, Save, Clock, Calendar, MapPin, Users, 
  Building2, Phone, Mail, AlertTriangle, CheckCircle,
  Clipboard, Camera, Mic, Link as LinkIcon, Plus, X
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { format } from "date-fns";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface MeetingNote {
  id: string;
  meetingDate: string;
  customerName: string;
  customerCompany: string;
  customerEmail?: string;
  customerPhone?: string;
  location: string;
  attendees: string[];
  keyPoints: string[];
  safetyObservations: string[];
  actionItems: string[];
  nextSteps: string;
  linkedSurveyId?: string;
  linkedQuoteId?: string;
  createdAt: string;
  updatedAt: string;
}

interface SafetyObservation {
  area: string;
  risk: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

export default function MeetingNotes() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('new');
  const [isEditing, setIsEditing] = useState(false);
  
  // Form state
  const [meetingData, setMeetingData] = useState({
    customerName: '',
    customerCompany: '',
    customerEmail: '',
    customerPhone: '',
    location: '',
    meetingDate: format(new Date(), 'yyyy-MM-dd'),
    meetingTime: format(new Date(), 'HH:mm'),
  });

  const [attendees, setAttendees] = useState<string[]>(['']);
  const [keyPoints, setKeyPoints] = useState<string[]>(['']);
  const [safetyObservations, setSafetyObservations] = useState<SafetyObservation[]>([
    { area: '', risk: 'medium', description: '', recommendation: '' }
  ]);
  const [actionItems, setActionItems] = useState<string[]>(['']);
  const [nextSteps, setNextSteps] = useState('');
  const [notes, setNotes] = useState('');

  // Get existing surveys for linking
  const { data: surveys = [] } = useQuery<any[]>({
    queryKey: ['/api/site-surveys'],
  });

  // Get recent meeting notes
  const { data: recentNotes = [] } = useQuery<any[]>({
    queryKey: ['/api/meeting-notes'],
  });

  // Add new field to array
  const addField = (setter: any, currentArray: any[]) => {
    if (typeof currentArray[0] === 'object') {
      setter([...currentArray, { area: '', risk: 'medium', description: '', recommendation: '' }]);
    } else {
      setter([...currentArray, '']);
    }
  };

  // Remove field from array
  const removeField = (setter: any, currentArray: any[], index: number) => {
    setter(currentArray.filter((_, i) => i !== index));
  };

  // Update field in array
  const updateField = (setter: any, currentArray: any[], index: number, value: any) => {
    const updated = [...currentArray];
    updated[index] = value;
    setter(updated);
  };

  // Handle save
  const handleSave = () => {
    // Validate required fields
    if (!meetingData.customerName || !meetingData.customerCompany) {
      toast({
        title: "Missing Information",
        description: "Please provide customer name and company",
        variant: "destructive",
      });
      return;
    }

    // Prepare data
    const noteData = {
      ...meetingData,
      attendees: attendees.filter(a => a.trim()),
      keyPoints: keyPoints.filter(k => k.trim()),
      safetyObservations,
      actionItems: actionItems.filter(a => a.trim()),
      nextSteps,
      additionalNotes: notes,
      createdAt: new Date().toISOString(),
    };

    // Save to localStorage for now (would be API call in production)
    const existingNotes = JSON.parse(localStorage.getItem('meetingNotes') || '[]');
    existingNotes.push({
      id: Date.now().toString(),
      ...noteData
    });
    localStorage.setItem('meetingNotes', JSON.stringify(existingNotes));

    toast({
      title: "Meeting Notes Saved",
      description: "Your meeting notes have been saved successfully",
    });

    // Reset form
    resetForm();
  };

  const resetForm = () => {
    setMeetingData({
      customerName: '',
      customerCompany: '',
      customerEmail: '',
      customerPhone: '',
      location: '',
      meetingDate: format(new Date(), 'yyyy-MM-dd'),
      meetingTime: format(new Date(), 'HH:mm'),
    });
    setAttendees(['']);
    setKeyPoints(['']);
    setSafetyObservations([{ area: '', risk: 'medium', description: '', recommendation: '' }]);
    setActionItems(['']);
    setNextSteps('');
    setNotes('');
  };

  // Get risk color
  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'high': return 'text-red-600 bg-red-100 dark:bg-red-900 dark:text-red-300';
      case 'medium': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900 dark:text-yellow-300';
      case 'low': return 'text-green-600 bg-green-100 dark:bg-green-900 dark:text-green-300';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-[#FFC72C]">Meeting Notes</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Capture important details from customer meetings
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/site-survey">
            <Button variant="outline">
              <Clipboard className="h-4 w-4 mr-2" />
              Create Survey
            </Button>
          </Link>
          <Link href="/communication-plan">
            <Button variant="outline">
              <Mail className="h-4 w-4 mr-2" />
              Send Follow-up
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="new">New Meeting</TabsTrigger>
          <TabsTrigger value="recent">Recent Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-6">
          {/* Customer Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Customer Information
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Customer Name *</Label>
                <Input
                  value={meetingData.customerName}
                  onChange={(e) => setMeetingData({...meetingData, customerName: e.target.value})}
                  placeholder="John Smith"
                />
              </div>
              <div>
                <Label>Company *</Label>
                <Input
                  value={meetingData.customerCompany}
                  onChange={(e) => setMeetingData({...meetingData, customerCompany: e.target.value})}
                  placeholder="ABC Logistics"
                />
              </div>
              <div>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={meetingData.customerEmail}
                  onChange={(e) => setMeetingData({...meetingData, customerEmail: e.target.value})}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <Label>Phone</Label>
                <Input
                  value={meetingData.customerPhone}
                  onChange={(e) => setMeetingData({...meetingData, customerPhone: e.target.value})}
                  placeholder="+971 50 123 4567"
                />
              </div>
            </CardContent>
          </Card>

          {/* Meeting Details */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Meeting Details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div>
                <Label>Meeting Date</Label>
                <Input
                  type="date"
                  value={meetingData.meetingDate}
                  onChange={(e) => setMeetingData({...meetingData, meetingDate: e.target.value})}
                />
              </div>
              <div>
                <Label>Meeting Time</Label>
                <Input
                  type="time"
                  value={meetingData.meetingTime}
                  onChange={(e) => setMeetingData({...meetingData, meetingTime: e.target.value})}
                />
              </div>
              <div className="col-span-2">
                <Label>Location</Label>
                <Input
                  value={meetingData.location}
                  onChange={(e) => setMeetingData({...meetingData, location: e.target.value})}
                  placeholder="Customer facility, Dubai"
                />
              </div>
            </CardContent>
          </Card>

          {/* Attendees */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Attendees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {attendees.map((attendee, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={attendee}
                    onChange={(e) => updateField(setAttendees, attendees, index, e.target.value)}
                    placeholder="Name and role"
                  />
                  {attendees.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(setAttendees, attendees, index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addField(setAttendees, attendees)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Attendee
              </Button>
            </CardContent>
          </Card>

          {/* Safety Observations */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Safety Observations
              </CardTitle>
              <CardDescription>Document safety concerns and risks identified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {safetyObservations.map((obs, index) => (
                <div key={index} className="border rounded-lg p-4 space-y-3">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <Label>Area/Zone</Label>
                      <Input
                        value={obs.area}
                        onChange={(e) => updateField(setSafetyObservations, safetyObservations, index, {...obs, area: e.target.value})}
                        placeholder="Loading dock, warehouse entrance..."
                      />
                    </div>
                    <div>
                      <Label>Risk Level</Label>
                      <Select
                        value={obs.risk}
                        onValueChange={(value) => updateField(setSafetyObservations, safetyObservations, index, {...obs, risk: value as any})}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {safetyObservations.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="mt-6"
                        onClick={() => removeField(setSafetyObservations, safetyObservations, index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={obs.description}
                      onChange={(e) => updateField(setSafetyObservations, safetyObservations, index, {...obs, description: e.target.value})}
                      placeholder="Describe the safety concern..."
                      className="h-20"
                    />
                  </div>
                  <div>
                    <Label>Recommendation</Label>
                    <Input
                      value={obs.recommendation}
                      onChange={(e) => updateField(setSafetyObservations, safetyObservations, index, {...obs, recommendation: e.target.value})}
                      placeholder="Suggested safety solution..."
                    />
                  </div>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addField(setSafetyObservations, safetyObservations)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Observation
              </Button>
            </CardContent>
          </Card>

          {/* Key Discussion Points */}
          <Card>
            <CardHeader>
              <CardTitle>Key Discussion Points</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {keyPoints.map((point, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={point}
                    onChange={(e) => updateField(setKeyPoints, keyPoints, index, e.target.value)}
                    placeholder="Important topic discussed..."
                  />
                  {keyPoints.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(setKeyPoints, keyPoints, index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addField(setKeyPoints, keyPoints)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Point
              </Button>
            </CardContent>
          </Card>

          {/* Action Items */}
          <Card>
            <CardHeader>
              <CardTitle>Action Items</CardTitle>
              <CardDescription>Tasks to complete after the meeting</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {actionItems.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={item}
                    onChange={(e) => updateField(setActionItems, actionItems, index, e.target.value)}
                    placeholder="Task to complete..."
                  />
                  {actionItems.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(setActionItems, actionItems, index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => addField(setActionItems, actionItems)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Action
              </Button>
            </CardContent>
          </Card>

          {/* Next Steps & Additional Notes */}
          <Card>
            <CardHeader>
              <CardTitle>Next Steps & Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Next Steps</Label>
                <Textarea
                  value={nextSteps}
                  onChange={(e) => setNextSteps(e.target.value)}
                  placeholder="Outline the next steps in the process..."
                  className="h-20"
                />
              </div>
              <div>
                <Label>Additional Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any other important information..."
                  className="h-32"
                />
              </div>
            </CardContent>
          </Card>

          {/* Save Actions */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetForm}>
              Clear Form
            </Button>
            <Link href="/site-survey">
              <Button variant="outline">
                <Clipboard className="h-4 w-4 mr-2" />
                Create Survey from Notes
              </Button>
            </Link>
            <Button onClick={handleSave} className="bg-[#FFC72C] hover:bg-[#FFB300] text-black">
              <Save className="h-4 w-4 mr-2" />
              Save Meeting Notes
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="recent" className="space-y-4">
          {/* Recent Meeting Notes */}
          {(() => {
            const savedNotes = JSON.parse(localStorage.getItem('meetingNotes') || '[]');
            return savedNotes.length > 0 ? (
              savedNotes.reverse().map((note: any) => (
                <Card key={note.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{note.customerCompany}</CardTitle>
                        <CardDescription>{note.customerName} • {note.meetingDate}</CardDescription>
                      </div>
                      <Badge variant="outline">
                        <MapPin className="h-3 w-3 mr-1" />
                        {note.location || 'No location'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Attendees */}
                    {note.attendees?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Attendees:</p>
                        <div className="flex flex-wrap gap-2">
                          {note.attendees.map((attendee: string, idx: number) => (
                            <Badge key={idx} variant="secondary">
                              <Users className="h-3 w-3 mr-1" />
                              {attendee}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Safety Observations */}
                    {note.safetyObservations?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Safety Observations:</p>
                        <div className="space-y-2">
                          {note.safetyObservations.filter((obs: any) => obs.area).map((obs: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2">
                              <Badge className={getRiskColor(obs.risk)}>
                                {obs.risk}
                              </Badge>
                              <div className="flex-1">
                                <p className="font-medium text-sm">{obs.area}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">{obs.description}</p>
                                {obs.recommendation && (
                                  <p className="text-sm text-[#FFC72C] mt-1">→ {obs.recommendation}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Action Items */}
                    {note.actionItems?.length > 0 && (
                      <div>
                        <p className="text-sm font-medium mb-2">Action Items:</p>
                        <ul className="space-y-1">
                          {note.actionItems.map((item: string, idx: number) => (
                            <li key={idx} className="text-sm flex items-start gap-2">
                              <CheckCircle className="h-4 w-4 text-gray-400 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      <Link href="/site-survey">
                        <Button size="sm" variant="outline">
                          <Clipboard className="h-4 w-4 mr-2" />
                          Create Survey
                        </Button>
                      </Link>
                      <Link href="/communication-plan">
                        <Button size="sm" variant="outline">
                          <Mail className="h-4 w-4 mr-2" />
                          Send Follow-up
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No meeting notes yet</p>
                  <p className="text-sm text-gray-400 mt-1">Create your first meeting notes to see them here</p>
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
}