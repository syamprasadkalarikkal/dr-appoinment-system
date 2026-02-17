'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { 
  subscribeToDoctorNotifications, 
  fetchUnreadNotifications, 
  markNotificationAsRead 
} from '@/lib/notificationService';

export default function Notifications({ isAdmin }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      loadNotifications();
      setupRealTimeListener();
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [isAdmin]);

  const loadNotifications = async () => {
    try {
      const unread = await fetchUnreadNotifications();
      setNotifications(unread);
      setUnreadCount(unread.length);
    } catch (err) {
      console.error('Error loading notifications:', err);
    }
  };

  const setupRealTimeListener = () => {
    try {
      const sub = supabase
        .from('notifications')
        .on('INSERT', (payload) => {
          if (payload.new.type === 'doctor_approval') {
            // Add new notification to the top
            setNotifications(prev => [payload.new, ...prev]);
            setUnreadCount(prev => prev + 1);
            
            // Show a browser notification if available
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('New Doctor Registration', {
                body: `${payload.new.doctor_name} is pending approval`,
                icon: '/doctor-icon.png'
              });
            }
          }
        })
        .subscribe();

      setSubscription(sub);
    } catch (err) {
      console.error('Error setting up real-time listener:', err);
    }
  };

  const handleMarkAsRead = async (notificationId) => {
    try {
      await markNotificationAsRead(notificationId);
      setNotifications(prev => 
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
      for (const id of unreadIds) {
        await markNotificationAsRead(id);
      }
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Error clearing notifications:', err);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="relative">
      {/* Notification Bell Icon */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none"
        aria-label="Notifications"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      {showPanel && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-lg shadow-2xl z-50 max-h-96 overflow-y-auto">
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-800">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({unreadCount} new)
                </span>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>No notifications</p>
            </div>
          ) : (
            <div>
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`border-b border-gray-100 p-4 hover:bg-gray-50 cursor-pointer transition ${
                    !notification.is_read ? 'bg-blue-50' : ''
                  }`}
                  onClick={() => !notification.is_read && handleMarkAsRead(notification.id)}
                >
                  <div className="flex items-start">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800">
                        {notification.title}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {notification.message}
                      </p>
                      <div className="mt-2 flex gap-2 flex-wrap">
                        <span className="inline-block px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                          {notification.doctor_specialization}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(notification.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    {!notification.is_read && (
                      <div className="ml-2 w-3 h-3 bg-blue-600 rounded-full flex-shrink-0 mt-1"></div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
