import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { InfoPopover } from '@/components/ui/info-popover';
import { useToast } from '@/hooks/use-toast';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { User, Building, Phone, Mail, MapPin, Briefcase, Camera, Upload, History, FileText, Calendar, ExternalLink, Eye, Edit3, Video, Clock } from 'lucide-react';
import { ProfileImageUpload } from '@/components/ProfileImageUpload';
import { RecentActivity } from '@/components/RecentActivity';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email address'),
  company: z.string().min(1, 'Company name is required'),
  jobTitle: z.string().optional(),
  department: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function Profile() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const haptic = useHapticFeedback();
  const [profileImage, setProfileImage] = useState<string>('');
  const [isEditExpanded, setIsEditExpanded] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['/api/auth/profile'],
    enabled: !!user,
  });

  const { data: resources } = useQuery({
    queryKey: ['/api/resources'],
    queryFn: async () => {
      const response = await apiRequest('/api/resources', 'GET');
      return response.json();
    },
    enabled: !!user,
  });

  const { data: userOrders } = useQuery({
    queryKey: ['/api/orders'],
    enabled: !!user,
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: (profile as any)?.firstName || '',
      lastName: (profile as any)?.lastName || '',
      email: (profile as any)?.email || '',
      company: (profile as any)?.company || '',
      jobTitle: (profile as any)?.jobTitle || '',
      department: (profile as any)?.department || '',
      phone: (profile as any)?.phone || '',
      address: (profile as any)?.address || '',
      city: (profile as any)?.city || '',
      country: (profile as any)?.country || '',
    },
  });

  // Update form when profile data loads
  React.useEffect(() => {
    if (profile) {
      form.reset({
        firstName: (profile as any).firstName || '',
        lastName: (profile as any).lastName || '',
        email: (profile as any).email || '',
        company: (profile as any).company || '',
        jobTitle: (profile as any).jobTitle || '',
        department: (profile as any).department || '',
        phone: (profile as any).phone || '',
        address: (profile as any).address || '',
        city: (profile as any).city || '',
        country: (profile as any).country || '',
      });
      setProfileImage((profile as any).profileImageUrl || '');
    }
  }, [profile, form]);

  const handleImageUpdate = (imageUrl: string) => {
    setProfileImage(imageUrl);
    // Refresh profile data to get updated image
    queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      
      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update profile');
      }
      
      return response.json();
    },
    onSuccess: () => {
      haptic.save();
      queryClient.invalidateQueries({ queryKey: ['/api/auth/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: 'Profile Updated',
        description: 'Your profile has been successfully updated.',
      });
    },
    onError: (error: any) => {
      haptic.error();
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
        <div className="w-full px-2 sm:px-4">
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-yellow-400 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading profile...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
        <div className="w-full px-2 sm:px-4">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
            <p className="text-gray-600">Please log in to view your profile.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-3 sm:py-6">
      <div className="w-full px-2 sm:px-4">
          <div className="mb-4 sm:mb-6">
            <div className="flex items-center gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">My Profile</h1>
            <InfoPopover 
              content="Manage your personal information and preferences. These details will automatically populate quote request forms."
              iconClassName="h-5 w-5 text-gray-400 hover:text-gray-600 cursor-help"
            />
          </div>
        </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base sm:text-lg">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 sm:h-5 sm:w-5" />
                  Personal Information
                  <InfoPopover 
                    content={isEditExpanded ? 'Update your contact details and company information' : 'Basic profile information'}
                    iconClassName="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help"
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditExpanded(!isEditExpanded)}
                  className="h-8 w-8 p-0"
                  data-testid="button-toggle-edit-profile"
                >
                  <Edit3 className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {isEditExpanded && (
                    <>
                      {/* Profile Picture Section */}
                      <div className="flex flex-col items-center space-y-4">
                        <ProfileImageUpload 
                          currentImage={profileImage}
                          onImageUpdate={handleImageUpdate}
                        />
                        <p className="text-sm text-gray-600">Click the camera icon to upload and crop your profile picture</p>
                      </div>
                    </>
                  )}

                  {/* Basic Information - Always Visible */}
                  <div className="space-y-4">
                    {!isEditExpanded ? (
                      // Compact View - Display only 
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row items-center gap-6 p-6">
                          {profileImage && (
                            <Avatar className="h-50 w-50 flex-shrink-0" style={{ height: '200px', width: '200px' }}>
                              <AvatarImage src={profileImage} alt="Profile" className="object-cover" />
                              <AvatarFallback className="text-6xl">
                                {(profile as any)?.firstName?.[0]}{(profile as any)?.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <div className="text-center sm:text-left">
                            <p className="font-medium text-gray-900 text-xl mb-2" data-testid="text-display-name">
                              {form.watch('firstName')} {form.watch('lastName')}
                            </p>
                            {form.watch('jobTitle') && (
                              <p className="text-gray-600 flex items-center justify-center sm:justify-start gap-2 mb-1" data-testid="text-display-job-title">
                                <Briefcase className="h-4 w-4" />
                                {form.watch('jobTitle')}
                              </p>
                            )}
                            {form.watch('company') && (
                              <p className="text-gray-600 flex items-center justify-center sm:justify-start gap-2" data-testid="text-display-company">
                                <Building className="h-4 w-4" />
                                {form.watch('company')}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Expanded Edit View - Show all fields
                      <>
                        {/* Personal Details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name *</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-first-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name *</FormLabel>
                                <FormControl>
                                  <Input {...field} data-testid="input-last-name" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                Email Address *
                              </FormLabel>
                              <FormControl>
                                <Input {...field} type="email" data-testid="input-email" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="flex items-center gap-2">
                                <Phone className="h-4 w-4" />
                                Phone Number
                              </FormLabel>
                              <FormControl>
                                <Input {...field} type="tel" placeholder="+971 50 123 4567" data-testid="input-phone" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Company Information */}
                        <div className="border-t pt-4 sm:pt-5">
                          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                            <Building className="h-4 w-4 sm:h-5 sm:w-5" />
                            Company Information
                          </h3>
                          
                          <div className="space-y-4">
                            <FormField
                              control={form.control}
                              name="company"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Company Name *</FormLabel>
                                  <FormControl>
                                    <Input {...field} data-testid="input-company" />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="jobTitle"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="flex items-center gap-2">
                                      <Briefcase className="h-4 w-4" />
                                      Job Title
                                    </FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Safety Manager" data-testid="input-job-title" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="department"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Department</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Operations" data-testid="input-department" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Address Information */}
                        <div className="border-t pt-4 sm:pt-5">
                          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                            <MapPin className="h-4 w-4 sm:h-5 sm:w-5" />
                            Address Information
                          </h3>
                          
                          <div className="space-y-4">
                            <FormField
                              control={form.control}
                              name="address"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Address</FormLabel>
                                  <FormControl>
                                    <Textarea 
                                      {...field} 
                                      placeholder="Street address, building number, area..."
                                      rows={3}
                                      data-testid="input-address"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <FormField
                                control={form.control}
                                name="city"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>City</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="Dubai" data-testid="input-city" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={form.control}
                                name="country"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>Country</FormLabel>
                                    <FormControl>
                                      <Input {...field} placeholder="United Arab Emirates" data-testid="input-country" />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex justify-end pt-6">
                          <Button 
                            type="submit" 
                            disabled={updateProfileMutation.isPending}
                            data-testid="button-save-profile"
                          >
                            {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>

          {/* Activity Statistics */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 mt-4 sm:mt-6">
          {/* Recent Activity */}
          <RecentActivity />

          {/* Order Form Submissions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Order Forms
              </CardTitle>
              <CardDescription>
                All your submitted order forms and their status
              </CardDescription>
            </CardHeader>
            <CardContent>
              {Array.isArray(userOrders) && userOrders.length > 0 ? (
                <div className="space-y-3">
                  {userOrders.map((order: any) => (
                    <div key={order.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col xl:flex-row xl:items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <FileText className="h-4 w-4 text-blue-600 flex-shrink-0" />
                            <h4 className="font-medium text-gray-900 truncate">Order #{order.orderNumber}</h4>
                            <span className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ${
                              order.status === 'completed' ? 'bg-green-100 text-green-800' :
                              order.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1).replace('_', ' ')}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Calendar className="h-3 w-3" />
                              <span>{new Date(order.createdAt).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span>Total: {order.currency} {parseFloat(order.totalAmount).toLocaleString()}</span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span>{order.items?.length || 0} items</span>
                            </div>
                          </div>
                          {order.isForUser ? (
                            <p className="text-xs text-blue-600 mt-1">Personal Order</p>
                          ) : (
                            <p className="text-xs text-gray-600 mt-1 truncate">
                              Customer: {order.customerName || 'External Customer'}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/order-form/${order.id}`, '_blank')}
                            className="text-xs w-full sm:w-auto min-w-[80px]"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}/order-form/${order.id}`);
                              toast({
                                title: "Link Copied",
                                description: "Order form link copied to clipboard",
                              });
                            }}
                            className="text-xs w-full sm:w-auto min-w-[80px]"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Share
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium">No Order Forms Yet</p>
                  <p className="text-sm">Create your first order form from the cart to get started</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}