export type UserNotification = {
  id: string;
  organization_id: string;
  brand_name: string;
  kind: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
};
export type NotificationInbox = {
  items: UserNotification[];
  unread_count: number;
  has_more: boolean;
};
