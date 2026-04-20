import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Calendar, Clock, CheckCircle, AlertCircle, Package, 
  Truck, Wrench, FileCheck, User, Building2, MapPin,
  Phone, Mail, ChevronRight, AlertTriangle, PlayCircle,
  PauseCircle, XCircle, Edit, Plus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, addDays, differenceInDays } from "date-fns";
import { Link } from "wouter";

interface InstallationPhase {
  id: string;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'on_hold';
  progress: number;
  assignedTeam?: string;
  notes?: string;
  dependencies?: string[];
  milestones?: Milestone[];
}

interface Milestone {
  id: string;
  name: string;
  date: string;
  completed: boolean;
  description?: string;
}

interface Project {
  id: string;
  customerName: string;
  customerCompany: string;
  projectName: string;
  location: string;
  orderDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
  actualStartDate?: string;
  actualEndDate?: string;
  status: 'planning' | 'active' | 'completed' | 'on_hold';
  phases: InstallationPhase[];
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  totalProgress: number;
}

export default function InstallationTimeline() {
  const { toast } = useToast();
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [viewMode, setViewMode] = useState<'timeline' | 'kanban'>('timeline');

  // Get orders for project data
  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ['/api/orders'],
  });

  // Mock project data (in production, would be from API)
  const projects: Project[] = [
    {
      id: '1',
      customerName: 'John Smith',
      customerCompany: 'ABC Logistics',
      projectName: 'Warehouse Safety Upgrade',
      location: 'Dubai, UAE',
      orderDate: '2024-01-15',
      plannedStartDate: '2024-02-01',
      plannedEndDate: '2024-02-15',
      status: 'active',
      contactPerson: 'John Smith',
      contactPhone: '+971 50 123 4567',
      contactEmail: 'john@abclogistics.com',
      totalProgress: 45,
      phases: [
        {
          id: 'p1',
          name: 'Site Preparation',
          description: 'Clear installation areas and mark positions',
          startDate: '2024-02-01',
          endDate: '2024-02-03',
          status: 'completed',
          progress: 100,
          assignedTeam: 'Team A',
          milestones: [
            { id: 'm1', name: 'Areas cleared', date: '2024-02-01', completed: true },
            { id: 'm2', name: 'Positions marked', date: '2024-02-02', completed: true },
          ]
        },
        {
          id: 'p2',
          name: 'Barrier Installation',
          description: 'Install safety barriers in loading dock area',
          startDate: '2024-02-04',
          endDate: '2024-02-10',
          status: 'in_progress',
          progress: 60,
          assignedTeam: 'Team B',
          dependencies: ['p1'],
          milestones: [
            { id: 'm3', name: 'Dock barriers installed', date: '2024-02-06', completed: true },
            { id: 'm4', name: 'Pedestrian barriers installed', date: '2024-02-08', completed: false },
          ]
        },
        {
          id: 'p3',
          name: 'Testing & Handover',
          description: 'Impact testing and customer handover',
          startDate: '2024-02-11',
          endDate: '2024-02-15',
          status: 'not_started',
          progress: 0,
          assignedTeam: 'Team A',
          dependencies: ['p2'],
        },
      ],
    },
  ];

  // Add real orders as projects
  orders.forEach((order: any) => {
    if (order.status !== 'draft') {
      const plannedStart = new Date(order.createdAt);
      plannedStart.setDate(plannedStart.getDate() + 14); // 2 weeks lead time
      const plannedEnd = new Date(plannedStart);
      plannedEnd.setDate(plannedEnd.getDate() + 7); // 1 week installation

      projects.push({
        id: order.id,
        customerName: order.customerName,
        customerCompany: order.customerCompany || 'Unknown Company',
        projectName: `Order #${order.id.slice(0, 8)}`,
        location: order.deliveryAddress || 'Not specified',
        orderDate: order.createdAt,
        plannedStartDate: plannedStart.toISOString().split('T')[0],
        plannedEndDate: plannedEnd.toISOString().split('T')[0],
        status: order.status === 'completed' ? 'completed' : 'planning',
        contactPerson: order.customerName,
        contactPhone: order.customerPhone || 'Not provided',
        contactEmail: order.customerEmail,
        totalProgress: order.status === 'completed' ? 100 : 0,
        phases: [],
      });
    }
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
      case 'in_progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      case 'active': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
      case 'delayed': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
      case 'on_hold': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
      case 'planning': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return CheckCircle;
      case 'in_progress': 
      case 'active': return PlayCircle;
      case 'delayed': return AlertTriangle;
      case 'on_hold': return PauseCircle;
      case 'not_started':
      case 'planning': return Clock;
      default: return AlertCircle;
    }
  };

  const calculateDaysRemaining = (endDate: string) => {
    const days = differenceInDays(new Date(endDate), new Date());
    if (days < 0) return `${Math.abs(days)} days overdue`;
    if (days === 0) return 'Due today';
    return `${days} days remaining`;
  };

  const TimelineView = ({ project }: { project: Project }) => (
    <div className="space-y-6">
      {/* Project Header */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>{project.projectName}</CardTitle>
              <CardDescription>
                {project.customerCompany} • {project.location}
              </CardDescription>
            </div>
            <Badge className={getStatusColor(project.status)}>
              {project.status.replace('_', ' ').toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-sm text-gray-500">Start Date</p>
              <p className="font-medium">{format(new Date(project.plannedStartDate), 'MMM dd, yyyy')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">End Date</p>
              <p className="font-medium">{format(new Date(project.plannedEndDate), 'MMM dd, yyyy')}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Duration</p>
              <p className="font-medium">{calculateDaysRemaining(project.plannedEndDate)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Overall Progress</p>
              <div className="flex items-center gap-2">
                <Progress value={project.totalProgress} className="flex-1" />
                <span className="text-sm font-medium">{project.totalProgress}%</span>
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div className="flex flex-wrap gap-4 pt-4 border-t">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{project.contactPerson}</span>
            </div>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{project.contactPhone}</span>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span className="text-sm">{project.contactEmail}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Installation Timeline</CardTitle>
          <CardDescription>Track progress of each installation phase</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {project.phases.map((phase, index) => {
              const StatusIcon = getStatusIcon(phase.status);
              return (
                <div key={phase.id} className="flex gap-4 pb-8 last:pb-0">
                  {/* Timeline line */}
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      phase.status === 'completed' ? 'bg-green-500' :
                      phase.status === 'in_progress' ? 'bg-blue-500' :
                      phase.status === 'delayed' ? 'bg-red-500' :
                      'bg-gray-300 dark:bg-gray-600'
                    }`}>
                      <StatusIcon className="h-5 w-5 text-white" />
                    </div>
                    {index < project.phases.length - 1 && (
                      <div className={`absolute top-10 left-5 w-0.5 h-full -translate-x-1/2 ${
                        phase.status === 'completed' ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`} />
                    )}
                  </div>

                  {/* Phase content */}
                  <div className="flex-1">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold">{phase.name}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{phase.description}</p>
                        </div>
                        <Badge className={getStatusColor(phase.status)}>
                          {phase.status.replace('_', ' ')}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                        <div>
                          <p className="text-xs text-gray-500">Start</p>
                          <p className="text-sm font-medium">
                            {format(new Date(phase.startDate), 'MMM dd')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">End</p>
                          <p className="text-sm font-medium">
                            {format(new Date(phase.endDate), 'MMM dd')}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Team</p>
                          <p className="text-sm font-medium">{phase.assignedTeam || 'Unassigned'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">Progress</p>
                          <div className="flex items-center gap-2">
                            <Progress value={phase.progress} className="flex-1 h-2" />
                            <span className="text-sm font-medium">{phase.progress}%</span>
                          </div>
                        </div>
                      </div>

                      {/* Milestones */}
                      {phase.milestones && phase.milestones.length > 0 && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-xs font-medium text-gray-500 mb-2">Milestones</p>
                          <div className="space-y-1">
                            {phase.milestones.map((milestone) => (
                              <div key={milestone.id} className="flex items-center gap-2">
                                {milestone.completed ? (
                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                ) : (
                                  <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                                )}
                                <span className={`text-sm ${milestone.completed ? 'line-through text-gray-400' : ''}`}>
                                  {milestone.name}
                                </span>
                                <span className="text-xs text-gray-400">
                                  ({format(new Date(milestone.date), 'MMM dd')})
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {phase.notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm text-gray-600 dark:text-gray-400">{phase.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const KanbanView = ({ project }: { project: Project }) => {
    const phasesByStatus = {
      not_started: project.phases.filter(p => p.status === 'not_started'),
      in_progress: project.phases.filter(p => p.status === 'in_progress'),
      completed: project.phases.filter(p => p.status === 'completed'),
      delayed: project.phases.filter(p => p.status === 'delayed'),
      on_hold: project.phases.filter(p => p.status === 'on_hold'),
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {Object.entries(phasesByStatus).map(([status, phases]) => (
          <div key={status} className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <h3 className="font-semibold capitalize">{status.replace('_', ' ')}</h3>
              <Badge variant="secondary">{phases.length}</Badge>
            </div>
            <div className="space-y-2">
              {phases.map((phase) => (
                <Card key={phase.id} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="p-3">
                    <h4 className="font-medium text-sm">{phase.name}</h4>
                    <p className="text-xs text-gray-500">
                      {format(new Date(phase.startDate), 'MMM dd')} - {format(new Date(phase.endDate), 'MMM dd')}
                    </p>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <Progress value={phase.progress} className="h-2" />
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500">{phase.assignedTeam || 'Unassigned'}</span>
                      <span className="text-xs font-medium">{phase.progress}%</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-[#FFC72C]">Installation Timeline</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Track and manage installation projects
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/start-new-project">
            <Button variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              New Project
            </Button>
          </Link>
          <Link href="/cart">
            <Button className="bg-[#FFC72C] hover:bg-[#FFB300] text-black">
              <Package className="h-4 w-4 mr-2" />
              View Orders
            </Button>
          </Link>
        </div>
      </div>

      {/* Project Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Project</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Choose a project to view..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(project.status)}>
                        {project.status}
                      </Badge>
                      <span>{project.projectName} - {project.customerCompany}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {selectedProject && (
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
                <TabsList>
                  <TabsTrigger value="timeline">Timeline View</TabsTrigger>
                  <TabsTrigger value="kanban">Kanban View</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Project View */}
      {selectedProject && (() => {
        const project = projects.find(p => p.id === selectedProject);
        if (!project) return null;

        return viewMode === 'timeline' ? (
          <TimelineView project={project} />
        ) : (
          <KanbanView project={project} />
        );
      })()}

      {/* Quick Stats */}
      {!selectedProject && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Active Projects</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-[#FFC72C]">
                {projects.filter(p => p.status === 'active').length}
              </div>
              <p className="text-xs text-gray-500 mt-1">Currently in progress</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Planning</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {projects.filter(p => p.status === 'planning').length}
              </div>
              <p className="text-xs text-gray-500 mt-1">In preparation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {projects.filter(p => p.status === 'completed').length}
              </div>
              <p className="text-xs text-gray-500 mt-1">Successfully finished</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">On Hold</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">
                {projects.filter(p => p.status === 'on_hold').length}
              </div>
              <p className="text-xs text-gray-500 mt-1">Temporarily paused</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}