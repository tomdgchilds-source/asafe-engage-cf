import { apiRequest } from "@/lib/queryClient";

export interface ActivityData {
  itemType: 'product' | 'resource' | 'case_study' | 'calculator' | 'faq' | 'quote' | 'order';
  itemId: string;
  itemTitle: string;
  itemCategory?: string;
  itemSubcategory?: string;
  itemImage?: string;
  metadata?: any;
}

export const activityService = {
  async recordActivity(data: ActivityData) {
    try {
      const response = await apiRequest('/api/activity/record', 'POST', data);
      return await response.json();
    } catch (error) {
      console.error('Failed to record activity:', error);
      // Don't throw - we don't want activity tracking failures to break the UI
      return null;
    }
  },

  async getRecentActivity(limit: number = 50) {
    try {
      const response = await apiRequest(`/api/activity/recent?limit=${limit}`, 'GET');
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch recent activity:', error);
      return [];
    }
  }
};